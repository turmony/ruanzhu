// cloudfunctions/getHourlyDemands/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 云函数：分批获取小时需求数据（使用云存储）
 * 
 * 参数：
 * - page: 页码，从0开始（0, 1, 2）
 * 
 * 数据量：
 * - 总数: 37200条
 * - 每页: 12400条（分3次）
 * 
 * 返回格式：
 * {
 *   success: true,
 *   fileID: 'cloud://xxx.json',  // 云存储文件ID
 *   tempFileURL: 'https://xxx',  // 临时下载链接（2小时有效）
 *   page: {
 *     current: 0,
 *     total: 3,
 *     pageSize: 12400,
 *     dataCount: 12400,
 *     isLastPage: false
 *   },
 *   statistics: {
 *     totalCount: 37200,
 *     loadTime: 1234,
 *     uploadTime: 567
 *   }
 * }
 */
exports.main = async (event, context) => {
  const startTime = Date.now();
  
  try {
    // 获取参数
    const page = event.page || 0; // 默认第0页
    const TOTAL_PAGES = 3;        // 总共3页
    const PAGE_SIZE = 12400;      // 每页12400条（37200 / 3）
    
    console.log('============================================');
    console.log('getHourlyDemands 云函数启动（云存储版本）');
    console.log('请求页码:', page);
    console.log('开始时间:', new Date().toISOString());
    console.log('============================================');
    
    // 验证页码
    if (page < 0 || page >= TOTAL_PAGES) {
      throw new Error(`无效的页码: ${page}，有效范围: 0-${TOTAL_PAGES - 1}`);
    }
    
    // 加载当前页数据
    const result = await loadHourlyDemandsPage(page, PAGE_SIZE);
    const loadTime = Date.now() - startTime;
    
    console.log('============================================');
    console.log('✓ 数据加载完成');
    console.log('页码:', page, '/', TOTAL_PAGES - 1);
    console.log('数据量:', result.data.length, '条');
    console.log('加载耗时:', loadTime, 'ms');
    console.log('============================================');
    
    // 上传到云存储
    const uploadStartTime = Date.now();
    const uploadResult = await uploadToCloudStorage(result.data, page);
    const uploadTime = Date.now() - uploadStartTime;
    
    console.log('============================================');
    console.log('✓ 上传云存储完成');
    console.log('文件ID:', uploadResult.fileID);
    console.log('上传耗时:', uploadTime, 'ms');
    console.log('总耗时:', Date.now() - startTime, 'ms');
    console.log('============================================');
    
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
        loadTime: loadTime,
        uploadTime: uploadTime,
        totalTime: Date.now() - startTime
      }
    };
    
  } catch (err) {
    console.error('============================================');
    console.error('✗ 操作失败');
    console.error('错误信息:', err.message);
    console.error('错误堆栈:', err.stack);
    console.error('============================================');
    
    return {
      success: false,
      error: err.message || '操作失败',
      errorCode: err.code || 'UNKNOWN_ERROR'
    };
  }
};

/**
 * 上传数据到云存储
 * @param {Array} data - 要上传的数据
 * @param {number} page - 页码
 * @returns {Object} - { fileID, tempFileURL }
 */
async function uploadToCloudStorage(data, page) {
  try {
    // 文件路径：hourly-demands/page-0.json
    const fileName = `hourly-demands/page-${page}.json`;
    
    // 将数据转为JSON字符串
    const jsonData = JSON.stringify(data);
    const buffer = Buffer.from(jsonData, 'utf-8');
    
    console.log(`[云存储] 准备上传文件: ${fileName}`);
    console.log(`[云存储] 文件大小: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    // 上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: fileName,
      fileContent: buffer,
    });
    
    console.log(`[云存储] 上传成功，fileID: ${uploadResult.fileID}`);
    
    // 获取临时下载链接（2小时有效）
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID],
    });
    
    const tempFileURL = tempUrlResult.fileList[0].tempFileURL;
    console.log(`[云存储] 临时链接: ${tempFileURL}`);
    
    return {
      fileID: uploadResult.fileID,
      tempFileURL: tempFileURL
    };
    
  } catch (err) {
    console.error('[云存储] 上传失败:', err);
    throw new Error(`上传云存储失败: ${err.message}`);
  }
}

/**
 * 加载指定页的小时需求数据
 * @param {number} page - 页码
 * @param {number} pageSize - 每页大小
 */
async function loadHourlyDemandsPage(page, pageSize) {
  const collectionName = 'hourly_demands';
  
  try {
    console.log(`[${collectionName}] 开始加载第${page}页...`);
    const startTime = Date.now();
    
    // 获取总数（仅第一次调用时需要）
    const countResult = await db.collection(collectionName).count();
    const totalCount = countResult.total;
    
    console.log(`[${collectionName}] 总数:`, totalCount);
    console.log(`[${collectionName}] 加载范围: ${page * pageSize} - ${(page + 1) * pageSize}`);
    
    if (totalCount === 0) {
      console.warn(`[${collectionName}] ⚠️ 数据库为空`);
      return { data: [], totalCount: 0 };
    }
    
    // 分批加载当前页的数据
    const MAX_LIMIT = 1000; // 微信云数据库单次查询上限
    const batchTimes = Math.ceil(pageSize / MAX_LIMIT);
    let allData = [];
    
    console.log(`[${collectionName}] 需要分${batchTimes}批加载当前页`);
    
    // 并发加载多个批次（每次5个并发）
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
      
      try {
        const results = await Promise.all(batchPromises);
        
        // 按顺序合并数据
        results.sort((a, b) => a.batchIndex - b.batchIndex);
        results.forEach(result => {
          allData = allData.concat(result.data);
        });
        
        const batchDataCount = results.reduce((sum, r) => sum + r.data.length, 0);
        console.log(`[${collectionName}] 批次${i + 1}-${endBatch}/${batchTimes}: +${batchDataCount}条 (累计${allData.length}条)`);
      } catch (batchErr) {
        console.error(`[${collectionName}] 批次${i + 1}-${endBatch}加载失败:`, batchErr.message);
        throw batchErr;
      }
    }
    
    const loadTime = Date.now() - startTime;
    console.log(`[${collectionName}] ✓ 第${page}页加载完成: ${allData.length}条 (${loadTime}ms)`);
    
    return {
      data: allData,
      totalCount: totalCount
    };
    
  } catch (err) {
    console.error(`[${collectionName}] ✗ 加载失败:`, err.message);
    throw new Error(`加载${collectionName}失败: ${err.message}`);
  }
}