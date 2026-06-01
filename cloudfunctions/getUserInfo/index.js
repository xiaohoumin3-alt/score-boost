/**
 * 获取用户信息云函数
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  const db = cloud.database();

  try {
    const { data: users } = await db.collection('users')
      .where({ openid })
      .get();

    if (users.length > 0) {
      const user = users[0];
      return {
        success: true,
        user: {
          openid: user.openid,
          grade: user.grade,
          subject: user.subject,
          vip_status: user.vip_status || 'free',
          points: user.points || 0,
        }
      };
    } else {
      return { success: false, error: '用户不存在' };
    }
  } catch (e) {
    console.error('getUserInfo error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
