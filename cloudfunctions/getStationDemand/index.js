// cloudfunctions/getStationDemand/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { stationId, startDate, endDate } = event;
  
  try {
    // 查询指定日期范围的需求数据
    const result = await db.collection('hourly_demands')
      .where({
        stationId: stationId,
        date: _.gte(startDate).and(_.lte(endDate))
      })
      .orderBy('date', 'asc')
      .orderBy('hour', 'asc')
      .get();
    
    // 格式化数据
    const hourlyData = result.data.map(item => ({
      date: item.date,
      hour: item.hour,
      demand: item.demand
    }));
    
    return {
      success: true,
      data: {
        hourlyData: hourlyData,
        count: hourlyData.length
      }
    };
  } catch (err) {
    console.error('获取需求数据失败:', err);
    return {
      success: false,
      message: err.message
    };
  }
};
