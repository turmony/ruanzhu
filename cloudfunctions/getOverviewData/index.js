// cloudfunctions/getOverviewData/index.js

const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = _.aggregate;

/**
 * 获取首页概览数据
 */
exports.main = async (event, context) => {
  try {
    // 1. 获取站点总数
    const stationsCount = await db.collection('stations').count();
    
    // 2. 获取总需求量和平均需求
    const demandResult = await db.collection('daily_statistics')
      .aggregate()
      .group({
        _id: null,
        totalDemand: $.sum('$totalDemand'),
        avgDemand: $.avg('$totalDemand')
      })
      .end();

    // 3. 获取最高需求站点
    const topStationResult = await db.collection('stations')
      .orderBy('totalDemand', 'desc')
      .limit(1)
      .get();

    // 4. 获取时间范围信息
    const dateRangeResult = await db.collection('daily_statistics')
      .aggregate()
      .group({
        _id: null,
        minDate: $.min('$date'),
        maxDate: $.max('$date'),
        daysCount: $.sum(1)
      })
      .end();

    // 5. 计算统计指标
    const totalDemand = demandResult.list[0]?.totalDemand || 0;
    const avgDailyDemand = Math.round(totalDemand / (dateRangeResult.list[0]?.daysCount || 31));
    const peakStation = topStationResult.data[0] || null;

    // 6. 返回数据
    return {
      success: true,
      data: {
        totalStations: stationsCount.total,
        dataDays: dateRangeResult.list[0]?.daysCount || 31,
        dateRange: {
          start: dateRangeResult.list[0]?.minDate || '2021-05-01',
          end: dateRangeResult.list[0]?.maxDate || '2021-05-31'
        },
        totalDemand: totalDemand,
        avgDailyDemand: avgDailyDemand,
        peakStation: peakStation ? {
          stationId: peakStation.stationId,
          name: peakStation.name,
          totalDemand: peakStation.totalDemand
        } : null,
        timestamp: new Date().getTime()
      }
    };

  } catch (error) {
    console.error('获取概览数据失败:', error);
    return {
      success: false,
      error: error.message || '获取数据失败'
    };
  }
};