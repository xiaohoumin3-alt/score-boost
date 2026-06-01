/**
 * 更新用户资料云函数
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  const { grade, subject } = event;
  const db = cloud.database();
  const now = new Date().toISOString();

  try {
    const { data: users } = await db.collection('users')
      .where({ openid })
      .get();

    if (users.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    const updateData = { updated_at: now };
    if (grade !== undefined) updateData.grade = grade;
    if (subject !== undefined) updateData.subject = subject;

    await db.collection('users').doc(users[0]._id).update({
      data: updateData
    });

    return { success: true };
  } catch (e) {
    console.error('updateUserProfile error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
