// cloudfunctions/getStationList/index.js

const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 获取站点列表（用于地图展示）
 */
exports.main = async (event, context) => {
  const { 
    includeStats = true,  // 是否包含统计数据
    limit = 100           // 限制返回数量
  } = event;

  try {
    // 构建查询条件
    let query = db.collection('stations');

    // 选择需要返回的字段
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

    // 执行查询
    const result = await query
      .field(fields)
      .limit(limit)
      .get();

    // 计算需求等级（如果数据库中没有）
    const stations = result.data.map(station => {
      if (!station.demandLevel && station.totalDemand) {
        station.demandLevel = calculateDemandLevel(station.totalDemand);
      }
      return station;
    });

    return {
      success: true,
      data: {
        stations: stations,
        total: result.data.length,
        timestamp: new Date().getTime()
      }
    };

  } catch (error) {
    console.error('获取站点列表失败:', error);
    return {
      success: false,
      error: error.message || '获取站点列表失败'
    };
  }
};

/**
 * 计算需求等级
 * @param {number} totalDemand - 总需求量
 * @returns {number} 1-4 表示低、中、高、超高
 */
function calculateDemandLevel(totalDemand) {
  if (totalDemand < 50000) return 1;      // 低需求
  if (totalDemand < 100000) return 2;     // 中需求
  if (totalDemand < 150000) return 3;     // 高需求
  return 4;                                // 超高需求
}