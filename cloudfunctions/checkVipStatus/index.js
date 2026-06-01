/**
 * 检查VIP状态云函数
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

    if (users.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    const user = users[0];
    const vipStatus = user.vip_status || 'free';
    const points = user.points || 0;
    const vipExpireAt = user.vip_expire_at;

    // 检查 VIP 是否有效
    let canUse = true;
    if (vipStatus === 'vip' && vipExpireAt) {
      canUse = new Date(vipExpireAt) > new Date();
    }

    return {
      success: true,
      vip_status: vipStatus,
      points: points,
      can_use: canUse,
    };
  } catch (e) {
    console.error('checkVipStatus error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
