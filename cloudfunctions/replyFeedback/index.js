/**
 * 回复反馈云函数（管理员）
 * 功能：管理员回复反馈，更新状态
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { token, feedbackId, content } = event;

  // 校验token
  if (!token) {
    return { success: false, error: '未授权访问' };
  }

  let username;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [uname, timestamp] = decoded.split(':');

    if (!uname || !timestamp) {
      return { success: false, error: '无效的token' };
    }

    // 检查token是否过期（7天）
    const tokenTime = parseInt(timestamp);
    const now = Date.now();
    if (now - tokenTime > 7 * 24 * 60 * 60 * 1000) {
      return { success: false, error: 'token已过期，请重新登录' };
    }

    username = uname;

    // 验证管理员是否存在
    const db = cloud.database();
    const { data: admins } = await db.collection('admin')
      .where({ username })
      .get();

    if (admins.length === 0) {
      return { success: false, error: '管理员不存在' };
    }
  } catch (e) {
    return { success: false, error: 'token验证失败' };
  }

  if (!feedbackId) {
    return { success: false, error: '缺少反馈ID' };
  }

  if (!content || !content.trim()) {
    return { success: false, error: '回复内容不能为空' };
  }

  const db = cloud.database();
  const now = new Date().toISOString();

  try {
    // 获取原反馈数据
    const { data: feedbacks } = await db.collection('feedback')
      .where({ _id: feedbackId })
      .get();

    if (feedbacks.length === 0) {
      return { success: false, error: '反馈不存在' };
    }

    const feedback = feedbacks[0];
    const replies = feedback.replies || [];

    // 添加新回复
    replies.push({
      content: content.trim(),
      isAdmin: true,
      createdAt: now
    });

    // 更新反馈
    await db.collection('feedback').doc(feedbackId).update({
      data: {
        status: 'replied',
        hasReply: true,
        replies: replies,
        repliedAt: now,
        updatedAt: now
      }
    });

    return {
      success: true,
      data: {
        repliedAt: now
      }
    };
  } catch (e) {
    console.error('replyFeedback error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
