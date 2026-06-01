/**
 * 登录云函数
 * 功能：微信登录，upsert 用户记录
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
  const now = new Date().toISOString();

  try {
    // 查询用户是否存在
    const { data: existingUsers } = await db.collection('users')
      .where({ openid })
      .get();

    if (existingUsers.length > 0) {
      // 用户存在，更新登录时间
      const user = existingUsers[0];
      await db.collection('users').doc(user._id).update({
        data: {
          updated_at: now,
        }
      });
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
      // 新用户创建
      const newUser = {
        openid,
        grade: null,
        subject: null,
        vip_status: 'free',
        vip_expire_at: null,
        points: 0,
        created_at: now,
        updated_at: now,
      };

      await db.collection('users').add({
        data: newUser
      });

      return {
        success: true,
        user: {
          openid: newUser.openid,
          grade: newUser.grade,
          subject: newUser.subject,
          vip_status: newUser.vip_status,
          points: newUser.points,
        }
      };
    }
  } catch (e) {
    console.error('login error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
