// cloudfunctions/getStationInfo/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { stationId } = event;
  
  try {
    // 查询站点基本信息
    const stationResult = await db.collection('stations')
      .where({
        stationId: stationId
      })
      .get();
    
    if (stationResult.data.length === 0) {
      return {
        success: false,
        message: '站点不存在'
      };
    }
    
    const station = stationResult.data[0];
    
    // 查询站点的平均需求量
    const demandResult = await db.collection('hourly_demands')
      .aggregate()
      .match({
        stationId: stationId
      })
      .group({
        _id: null,
        avgDemand: db.command.aggregate.avg('$demand'),
        totalDemand: db.command.aggregate.sum('$demand'),
        maxDemand: db.command.aggregate.max('$demand')
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
  } catch (err) {
    console.error('获取站点信息失败:', err);
    return {
      success: false,
      message: err.message
    };
  }
};
