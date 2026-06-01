/**
 * 获取反馈列表云函数（管理员）
 * 功能：分页查询反馈列表，支持筛选和搜索
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { token, status, category, keyword, page = 1, pageSize = 20 } = event;

  // 校验token
  if (!token) {
    return { success: false, error: '未授权访问' };
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [username, timestamp] = decoded.split(':');

    if (!username || !timestamp) {
      return { success: false, error: '无效的token' };
    }

    // 检查token是否过期（7天）
    const tokenTime = parseInt(timestamp);
    const now = Date.now();
    if (now - tokenTime > 7 * 24 * 60 * 60 * 1000) {
      return { success: false, error: 'token已过期，请重新登录' };
    }

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

  const db = cloud.database();
  const _ = db.command;

  try {
    // 构建查询条件
    let query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (keyword) {
      query.content = db.RegExp({
        regexp: keyword,
        options: 'i'
      });
    }

    // 查询总数
    const countResult = await db.collection('feedback').where(query).count();
    const total = countResult.total;

    // 分页查询
    const skip = (page - 1) * pageSize;
    const { data: feedbackList } = await db.collection('feedback')
      .where(query)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    return {
      success: true,
      data: {
        list: feedbackList.map(item => ({
          feedbackId: item._id,
          openid: item.openid,
          content: item.content,
          contact: item.contact,
          category: item.category,
          status: item.status,
          hasReply: item.hasReply,
          repliedAt: item.repliedAt,
          createdAt: item.createdAt,
          replyCount: (item.replies || []).length
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  } catch (e) {
    console.error('getFeedbackList error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
