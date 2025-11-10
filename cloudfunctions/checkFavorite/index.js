// cloudfunctions/checkFavorite/index.js
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { stationId } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    const result = await db.collection('user_favorites')
      .where({
        _openid: OPENID,
        stationId: stationId
      })
      .get();
    
    return {
      success: true,
      isFavorite: result.data.length > 0
    };
  } catch (err) {
    console.error('检查收藏状态失败:', err);
    return {
      success: false,
      isFavorite: false
    };
  }
};
