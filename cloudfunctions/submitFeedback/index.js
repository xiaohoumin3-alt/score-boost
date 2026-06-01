/**
 * 提交反馈云函数
 * 功能：用户提交反馈，写入feedback集合
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  const { content, contact, category } = event;

  // 校验内容
  if (!content || typeof content !== 'string') {
    return { success: false, error: '反馈内容不能为空' };
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length < 2) {
    return { success: false, error: '反馈内容至少2个字' };
  }

  if (trimmedContent.length > 500) {
    return { success: false, error: '反馈内容不能超过500字' };
  }

  // 校验分类
  const validCategories = ['bug', 'suggestion', 'other'];
  if (!category || !validCategories.includes(category)) {
    return { success: false, error: '请选择反馈分类' };
  }

  const db = cloud.database();
  const now = new Date().toISOString();

  try {
    const result = await db.collection('feedback').add({
      data: {
        openid,
        content: trimmedContent,
        contact: contact || '',
        category,
        status: 'pending',
        hasReply: false,
        replies: [],
        createdAt: now,
        updatedAt: now,
      }
    });

    return {
      success: true,
      data: {
        feedbackId: result._id,
        createdAt: now
      }
    };
  } catch (e) {
    console.error('submitFeedback error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
