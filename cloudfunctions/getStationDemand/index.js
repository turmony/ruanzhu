// cloudfunctions/getStationDemand/index.js
// 方案2：分页查询版本（适用于超大数据量）
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { stationId, startDate, endDate } = event;
  
  console.log('========== 云函数调用 ==========');
  console.log('接收参数:', { stationId, startDate, endDate });
  
  try {
    const MAX_LIMIT = 100;  // 每次最多查询100条
    let allData = [];
    
    // 第一步：获取总数
    const countResult = await db.collection('hourly_demands')
      .where({
        stationId: stationId,
        date: _.gte(startDate).and(_.lte(endDate))
      })
      .count();
    
    const total = countResult.total;
    console.log('数据总量:', total, '条');
    
    // 如果没有数据，直接返回
    if (total === 0) {
      console.log('⚠️ 没有找到数据');
      console.log('==================================');
      return {
        success: true,
        data: {
          hourlyData: [],
          count: 0
        }
      };
    }
    
    // 第二步：分批获取数据
    const batchTimes = Math.ceil(total / MAX_LIMIT);
    console.log('需要分', batchTimes, '批查询');
    
    for (let i = 0; i < batchTimes; i++) {
      const result = await db.collection('hourly_demands')
        .where({
          stationId: stationId,
          date: _.gte(startDate).and(_.lte(endDate))
        })
        .orderBy('date', 'asc')
        .orderBy('hour', 'asc')
        .skip(i * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get();
      
      allData = allData.concat(result.data);
      console.log(`第 ${i + 1}/${batchTimes} 批:`, result.data.length, '条');
    }
    
    // 格式化数据
    const hourlyData = allData.map(item => ({
      date: item.date,
      hour: item.hour,
      demand: item.demand
    }));
    
    console.log('查询完成，共', hourlyData.length, '条数据');
    
    // 统计日期范围
    if (hourlyData.length > 0) {
      const dates = [...new Set(hourlyData.map(item => item.date))].sort();
      console.log('包含日期:', dates.length, '天');
      console.log('日期范围:', dates[0], '至', dates[dates.length - 1]);
    }
    
    console.log('==================================');
    
    return {
      success: true,
      data: {
        hourlyData: hourlyData,
        count: hourlyData.length
      }
    };
    
  } catch (err) {
    console.error('获取需求数据失败:', err);
    console.log('错误详情:', err.message);
    console.log('==================================');
    
    return {
      success: false,
      message: err.message,
      error: err
    };
  }
};