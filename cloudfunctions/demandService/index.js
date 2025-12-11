const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = _.aggregate;

/**
 * 统一的需求数据服务
 * actions:
 * - byStation: 单站点按日期范围分页查询（原 getStationDemand）
 * - allPaged: 全量小时需求分页并上传云存储（原 getHourlyDemands）
 * - export: 导出单站点 CSV（原 exportStationData）
 */
exports.main = async (event, context) => {
  const action = event.action || 'allPaged';

  try {
    switch (action) {
      case 'byStation':
        return await queryStationDemand(event);
      case 'allPaged':
        return await loadHourlyDemandsAll(event);
      case 'export':
        return await exportStationData(event);
      default:
        return {
          success: false,
          errorCode: 'INVALID_ACTION',
          error: `未知的 action: ${action}`
        };
    }
  } catch (err) {
    console.error('[demandService] 处理失败:', err);
    return {
      success: false,
      errorCode: err.code || 'UNKNOWN_ERROR',
      error: err.message || '内部错误'
    };
  }
};

/**
 * 按站点查询需求（分页取全量）
 */
async function queryStationDemand(event) {
  const { stationId, startDate, endDate } = event;

  if (!stationId || !startDate || !endDate) {
    return {
      success: false,
      errorCode: 'INVALID_PARAMS',
      error: '缺少必要参数 stationId/startDate/endDate'
    };
  }

  const MAX_LIMIT = 100; // 云数据库单次上限
  let allData = [];

  // 先统计总数
  const countResult = await db.collection('hourly_demands')
    .where({
      stationId,
      date: _.gte(startDate).and(_.lte(endDate))
    })
    .count();

  const total = countResult.total;
  if (total === 0) {
    return {
      success: true,
      data: {
        hourlyData: [],
        count: 0
      }
    };
  }

  const batchTimes = Math.ceil(total / MAX_LIMIT);

  for (let i = 0; i < batchTimes; i++) {
    const res = await db.collection('hourly_demands')
      .where({
        stationId,
        date: _.gte(startDate).and(_.lte(endDate))
      })
      .orderBy('date', 'asc')
      .orderBy('hour', 'asc')
      .skip(i * MAX_LIMIT)
      .limit(MAX_LIMIT)
      .get();

    allData = allData.concat(res.data);
  }

  const hourlyData = allData.map(item => ({
    date: item.date,
    hour: item.hour,
    demand: item.demand
  }));

  return {
    success: true,
    data: {
      hourlyData,
      count: hourlyData.length
    }
  };
}

/**
 * 全量分页并上传云存储
 * 兼容原 getHourlyDemands 返回结构
 */
async function loadHourlyDemandsAll(event) {
  const startTime = Date.now();
  const page = event.page || 0; // 默认第0页
  const TOTAL_PAGES = 3;
  const PAGE_SIZE = 12400;

  if (page < 0 || page >= TOTAL_PAGES) {
    throw new Error(`无效的页码: ${page}，有效范围: 0-${TOTAL_PAGES - 1}`);
  }

  const result = await loadHourlyDemandsPage(page, PAGE_SIZE);
  const loadTime = Date.now() - startTime;

  const uploadStartTime = Date.now();
  const uploadResult = await uploadToCloudStorage(result.data, page);
  const uploadTime = Date.now() - uploadStartTime;

  return {
    success: true,
    fileID: uploadResult.fileID,
    tempFileURL: uploadResult.tempFileURL,
    page: {
      current: page,
      total: TOTAL_PAGES,
      pageSize: PAGE_SIZE,
      dataCount: result.data.length,
      isLastPage: page === TOTAL_PAGES - 1
    },
    statistics: {
      totalCount: result.totalCount,
      loadTime,
      uploadTime,
      totalTime: Date.now() - startTime
    }
  };
}

async function uploadToCloudStorage(data, page) {
  const fileName = `hourly-demands/page-${page}.json`;
  const jsonData = JSON.stringify(data);
  const buffer = Buffer.from(jsonData, 'utf-8');

  const uploadResult = await cloud.uploadFile({
    cloudPath: fileName,
    fileContent: buffer
  });

  const tempUrlResult = await cloud.getTempFileURL({
    fileList: [uploadResult.fileID]
  });

  return {
    fileID: uploadResult.fileID,
    tempFileURL: tempUrlResult.fileList[0].tempFileURL
  };
}

async function loadHourlyDemandsPage(page, pageSize) {
  const collectionName = 'hourly_demands';
  const countResult = await db.collection(collectionName).count();
  const totalCount = countResult.total;

  if (totalCount === 0) {
    return { data: [], totalCount: 0 };
  }

  const MAX_LIMIT = 1000;
  const batchTimes = Math.ceil(pageSize / MAX_LIMIT);
  let allData = [];

  const CONCURRENT_BATCHES = 5;
  for (let i = 0; i < batchTimes; i += CONCURRENT_BATCHES) {
    const batchPromises = [];
    const endBatch = Math.min(i + CONCURRENT_BATCHES, batchTimes);

    for (let j = i; j < endBatch; j++) {
      const skip = page * pageSize + j * MAX_LIMIT;
      const limit = Math.min(MAX_LIMIT, pageSize - j * MAX_LIMIT);

      batchPromises.push(
        db.collection(collectionName)
          .skip(skip)
          .limit(limit)
          .get()
          .then(res => ({
            batchIndex: j,
            data: res.data
          }))
      );
    }

    const results = await Promise.all(batchPromises);
    results.sort((a, b) => a.batchIndex - b.batchIndex);
    results.forEach(result => {
      allData = allData.concat(result.data);
    });
  }

  return {
    data: allData,
    totalCount
  };
}

/**
 * 导出单站点 CSV
 */
async function exportStationData(event) {
  const { stationId, startDate, endDate } = event;

  if (!stationId || !startDate || !endDate) {
    return {
      success: false,
      errorCode: 'INVALID_PARAMS',
      message: '缺少 stationId/startDate/endDate'
    };
  }

  // 复用分页查询，避免截断
  const queryRes = await queryStationDemand({ stationId, startDate, endDate });
  if (!queryRes.success) {
    return queryRes;
  }

  const hourlyData = queryRes.data.hourlyData;
  let csvContent = 'Date,Hour,Demand\n';
  hourlyData.forEach(item => {
    csvContent += `${item.date},${item.hour},${item.demand}\n`;
  });

  const fileName = `station_${stationId}_${startDate}_${endDate}.csv`;
  const uploadResult = await cloud.uploadFile({
    cloudPath: `exports/${fileName}`,
    fileContent: Buffer.from(csvContent, 'utf8')
  });

  const tempFileResult = await cloud.getTempFileURL({
    fileList: [uploadResult.fileID]
  });

  return {
    success: true,
    fileUrl: tempFileResult.fileList[0].tempFileURL,
    fileName
  };
}

