// cloudfunctions/exportStationData/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { stationId, startDate, endDate } = event;
  
  try {
    // 查询数据
    const result = await db.collection('hourly_demands')
      .where({
        stationId: stationId,
        date: _.gte(startDate).and(_.lte(endDate))
      })
      .orderBy('date', 'asc')
      .orderBy('hour', 'asc')
      .get();
    
    // 生成CSV内容
    let csvContent = 'Date,Hour,Demand\n';
    result.data.forEach(item => {
      csvContent += `${item.date},${item.hour},${item.demand}\n`;
    });
    
    // 上传到云存储
    const fileName = `station_${stationId}_${startDate}_${endDate}.csv`;
    const uploadResult = await cloud.uploadFile({
      cloudPath: `exports/${fileName}`,
      fileContent: Buffer.from(csvContent, 'utf8')
    });
    
    // 获取临时下载链接
    const tempFileResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    });
    
    return {
      success: true,
      fileUrl: tempFileResult.fileList[0].tempFileURL,
      fileName: fileName
    };
  } catch (err) {
    console.error('导出数据失败:', err);
    return {
      success: false,
      message: err.message
    };
  }
};
