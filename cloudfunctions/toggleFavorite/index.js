// cloudfunctions/toggleFavorite/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { stationId, action } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    if (action === 'add') {
      // 添加收藏
      const checkResult = await db.collection('user_favorites')
        .where({
          _openid: OPENID,
          stationId: stationId
        })
        .get();
      
      if (checkResult.data.length > 0) {
        return {
          success: true,
          message: '已经收藏过了'
        };
      }
      
      await db.collection('user_favorites').add({
        data: {
          stationId: stationId,
          createTime: db.serverDate()
        }
      });
      
      return {
        success: true,
        message: '收藏成功'
      };
    } else if (action === 'remove') {
      // 取消收藏
      await db.collection('user_favorites')
        .where({
          _openid: OPENID,
          stationId: stationId
        })
        .remove();
      
      return {
        success: true,
        message: '取消收藏成功'
      };
    }
    
    return {
      success: false,
      message: '未知操作'
    };
  } catch (err) {
    console.error('收藏操作失败:', err);
    return {
      success: false,
      message: err.message
    };
  }
};
