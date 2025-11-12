// cloudfunctions/getBasicData/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 云函数：获取基础数据（stations + daily_statistics）
 * 
 * 数据量：
 * - stations: 50条
 * - daily_statistics: 31条
 * 
 * 返回格式：
 * {
 *   success: true,
 *   data: {
 *     stations: [],
 *     dailyStatistics: []
 *   },
 *   statistics: {
 *     stationCount: 50,
 *     dailyCount: 31,
 *     loadTime: 123
 *   }
 * }
 */
exports.main = async (event, context) => {
  const startTime = Date.now();
  
  try {
    console.log('============================================');
    console.log('getBasicData 云函数启动');
    console.log('开始时间:', new Date().toISOString());
    console.log('============================================');
    
    // 并发加载两个集合
    console.log('开始并发加载 stations 和 daily_statistics...');
    const [stations, dailyStats] = await Promise.all([
      loadStations(),
      loadDailyStatistics()
    ]);
    
    const loadTime = Date.now() - startTime;
    
    console.log('============================================');
    console.log('✓ 基础数据加载完成');
    console.log('stations:', stations.length, '条');
    console.log('dailyStats:', dailyStats.length, '条');
    console.log('总耗时:', loadTime, 'ms');
    console.log('============================================');
    
    return {
      success: true,
      data: {
        stations: stations,
        dailyStatistics: dailyStats
      },
      statistics: {
        stationCount: stations.length,
        dailyCount: dailyStats.length,
        loadTime: loadTime
      }
    };
    
  } catch (err) {
    console.error('============================================');
    console.error('✗ 加载基础数据失败');
    console.error('错误信息:', err.message);
    console.error('错误堆栈:', err.stack);
    console.error('============================================');
    
    return {
      success: false,
      error: err.message || '加载基础数据失败',
      errorCode: err.code || 'UNKNOWN_ERROR'
    };
  }
};

/**
 * 加载所有站点数据（50条）
 */
async function loadStations() {
  const collectionName = 'stations';
  try {
    console.log(`[${collectionName}] 开始加载...`);
    const startTime = Date.now();
    
    // 数据量少，直接一次性获取
    const res = await db.collection(collectionName)
      .orderBy('stationId', 'asc')
      .limit(100)
      .get();
    
    const loadTime = Date.now() - startTime;
    console.log(`[${collectionName}] ✓ 加载完成: ${res.data.length}条 (${loadTime}ms)`);
    
    return res.data;
    
  } catch (err) {
    console.error(`[${collectionName}] ✗ 加载失败:`, err.message);
    throw new Error(`加载${collectionName}失败: ${err.message}`);
  }
}

/**
 * 加载每日统计数据（31条）
 */
async function loadDailyStatistics() {
  const collectionName = 'daily_statistics';
  try {
    console.log(`[${collectionName}] 开始加载...`);
    const startTime = Date.now();
    
    // 数据量少，直接一次性获取
    const res = await db.collection(collectionName)
      .orderBy('date', 'asc')
      .limit(100)
      .get();
    
    const loadTime = Date.now() - startTime;
    console.log(`[${collectionName}] ✓ 加载完成: ${res.data.length}条 (${loadTime}ms)`);
    
    return res.data;
    
  } catch (err) {
    console.error(`[${collectionName}] ✗ 加载失败:`, err.message);
    throw new Error(`加载${collectionName}失败: ${err.message}`);
  }
}