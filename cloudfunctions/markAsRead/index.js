/**
 * 标记反馈已读云函数
 * 功能：用户查看反馈详情时，标记hasReply为false
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  const { feedbackId } = event;

  if (!feedbackId) {
    return { success: false, error: '缺少反馈ID' };
  }

  const db = cloud.database();

  try {
    // 先验证该反馈是否属于当前用户
    const { data: feedbacks } = await db.collection('feedback')
      .where({ _id: feedbackId, openid })
      .get();

    if (feedbacks.length === 0) {
      return { success: false, error: '反馈不存在或无权访问' };
    }

    // 更新hasReply为false
    await db.collection('feedback').doc(feedbackId).update({
      data: {
        hasReply: false
      }
    });

    return { success: true };
  } catch (e) {
    console.error('markAsRead error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
