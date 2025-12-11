const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = _.aggregate;

/**
 * 站点服务：
 * actions:
 * - list: 站点列表（原 getStationList）
 * - info: 站点详情（原 getStationInfo）
 * - overview: 概览统计（原 getOverviewData）
 */
exports.main = async (event, context) => {
  const action = event.action || 'overview';
  try {
    switch (action) {
      case 'list':
        return await listStations(event);
      case 'info':
        return await getStationInfo(event);
      case 'overview':
        return await getOverview(event);
      default:
        return {
          success: false,
          errorCode: 'INVALID_ACTION',
          error: `未知的 action: ${action}`
        };
    }
  } catch (err) {
    console.error('[stationService] 处理失败:', err);
    return {
      success: false,
      errorCode: err.code || 'UNKNOWN_ERROR',
      error: err.message || '内部错误'
    };
  }
};

async function listStations(event) {
  const { includeStats = true, limit = 100 } = event;

  // 构建字段
  const fields = {
    stationId: true,
    name: true,
    latitude: true,
    longitude: true,
    address: true
  };
  if (includeStats) {
    fields.totalDemand = true;
    fields.avgDemand = true;
    fields.peakHour = true;
    fields.demandLevel = true;
  }

  const res = await db.collection('stations')
    .field(fields)
    .limit(limit)
    .get();

  const stations = res.data.map(station => {
    if (!station.demandLevel && station.totalDemand) {
      station.demandLevel = calculateDemandLevel(station.totalDemand);
    }
    return station;
  });

  return {
    success: true,
    data: {
      stations,
      total: res.data.length,
      timestamp: Date.now()
    }
  };
}

async function getStationInfo(event) {
  const { stationId } = event;
  if (!stationId) {
    return {
      success: false,
      errorCode: 'INVALID_PARAMS',
      message: '缺少 stationId'
    };
  }

  // 查询站点信息
  const stationResult = await db.collection('stations')
    .where({ stationId })
    .get();

  if (stationResult.data.length === 0) {
    return {
      success: false,
      message: '站点不存在'
    };
  }

  const station = stationResult.data[0];

  // 聚合需求统计
  const demandResult = await db.collection('hourly_demands')
    .aggregate()
    .match({ stationId })
    .group({
      _id: null,
      avgDemand: $.avg('$demand'),
      totalDemand: $.sum('$demand'),
      maxDemand: $.max('$demand')
    })
    .end();

  const stats = demandResult.list[0] || {
    avgDemand: 0,
    totalDemand: 0,
    maxDemand: 0
  };

  return {
    success: true,
    data: {
      stationId: station.stationId,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      avgDemand: Math.round(stats.avgDemand * 10) / 10,
      totalDemand: stats.totalDemand,
      maxDemand: stats.maxDemand
    }
  };
}

async function getOverview(event) {
  // 并发执行
  const [stationsCount, demandResult, topStationResult, dateRangeResult] = await Promise.all([
    db.collection('stations').count(),
    db.collection('daily_statistics')
      .aggregate()
      .group({
        _id: null,
        totalDemand: $.sum('$totalDemand'),
        avgDemand: $.avg('$totalDemand')
      })
      .end(),
    db.collection('stations')
      .orderBy('totalDemand', 'desc')
      .limit(1)
      .get(),
    db.collection('daily_statistics')
      .aggregate()
      .group({
        _id: null,
        minDate: $.min('$date'),
        maxDate: $.max('$date'),
        daysCount: $.sum(1)
      })
      .end()
  ]);

  const totalDemand = demandResult.list[0]?.totalDemand || 0;
  const daysCount = dateRangeResult.list[0]?.daysCount || 31;
  const avgDailyDemand = Math.round(totalDemand / daysCount);
  const peakStation = topStationResult.data[0] || null;

  return {
    success: true,
    data: {
      totalStations: stationsCount.total,
      dataDays: daysCount,
      dateRange: {
        start: dateRangeResult.list[0]?.minDate || '2021-05-01',
        end: dateRangeResult.list[0]?.maxDate || '2021-05-31'
      },
      totalDemand,
      avgDailyDemand,
      peakStation: peakStation ? {
        stationId: peakStation.stationId,
        name: peakStation.name,
        totalDemand: peakStation.totalDemand
      } : null,
      timestamp: Date.now()
    }
  };
}

// 需求等级计算（与原逻辑保持一致）
function calculateDemandLevel(totalDemand) {
  if (totalDemand < 50000) return 1;      // 低需求
  if (totalDemand < 100000) return 2;     // 中需求
  if (totalDemand < 150000) return 3;     // 高需求
  return 4;                               // 超高需求
}

