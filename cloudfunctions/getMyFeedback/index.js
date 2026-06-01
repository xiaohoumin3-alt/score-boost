/**
 * 获取我的反馈列表云函数
 * 功能：查询当前用户的反馈列表，按时间倒序返回
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
  const _ = db.command;

  try {
    const { data: feedbackList } = await db.collection('feedback')
      .where({ openid })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return {
      success: true,
      data: {
        list: feedbackList.map(item => ({
          feedbackId: item._id,
          content: item.content,
          category: item.category,
          status: item.status,
          hasReply: item.hasReply || false,
          repliedAt: item.repliedAt || null,
          createdAt: item.createdAt,
          replyCount: (item.replies || []).length
        }))
      }
    };
  } catch (e) {
    console.error('getMyFeedback error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
