/**
 * 管理后台代理云函数（集成版）
 * 直接处理所有逻辑，无需调用其他云函数
 */
const cloud = require('wx-server-sdk');

// 初始化CloudBase
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// API网关/Web函数响应格式化
function formatGatewayResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}

// 处理adminLogin
async function handleAdminLogin(data) {
  const { username, password } = data;

  if (!username || !password) {
    return { success: false, error: '账号和密码不能为空' };
  }

  // 查询管理员
  const { data: admins } = await db.collection('admin')
    .where({ username })
    .get();

  if (admins.length === 0) {
    return { success: false, error: '账号或密码错误' };
  }

  const admin = admins[0];

  // 验证密码（base64编码）
  const encodedPassword = Buffer.from(password).toString('base64');
  if (admin.password !== encodedPassword) {
    return { success: false, error: '账号或密码错误' };
  }

  // 生成token（简单base64：username + timestamp）
  const timestamp = Date.now();
  const expiresAt = timestamp + 7 * 24 * 60 * 60 * 1000; // 7天后
  const token = Buffer.from(`${username}:${timestamp}`).toString('base64');

  return {
    success: true,
    data: {
      token,
      expiresAt: new Date(expiresAt).toISOString()
    }
  };
}

// 处理getFeedbackList
async function handleGetFeedbackList(data) {
  const { token, status = 'all', category = 'all', keyword = '', page = 1, pageSize = 20 } = data;

  // 验证token（简单验证）
  if (!token) {
    return { success: false, error: '未授权' };
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [username, timestamp] = decoded.split(':');

    // 检查token是否过期
    if (Date.now() - parseInt(timestamp) > 7 * 24 * 60 * 60 * 1000) {
      return { success: false, error: 'Token已过期' };
    }
  } catch (e) {
    return { success: false, error: 'Token无效' };
  }

  // 构建查询条件
  const where = {};
  if (status !== 'all') {
    where.status = status;
  }
  if (category !== 'all') {
    where.category = category;
  }
  if (keyword) {
    where.content = new RegExp(keyword, 'i');
  }

  // 获取总数
  const countResult = await db.collection('feedback').where(where).count();
  const total = countResult.total;

  // 分页查询
  const { data: list } = await db.collection('feedback')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return {
    success: true,
    data: {
      list,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

// 处理replyFeedback
async function handleReplyFeedback(data) {
  const { token, feedbackId, content } = data;

  // 验证token
  if (!token) {
    return { success: false, error: '未授权' };
  }

  let username;
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [uname, timestamp] = decoded.split(':');
    username = uname;

    // 检查token是否过期
    if (Date.now() - parseInt(timestamp) > 7 * 24 * 60 * 60 * 1000) {
      return { success: false, error: 'Token已过期' };
    }
  } catch (e) {
    return { success: false, error: 'Token无效' };
  }

  if (!feedbackId || !content) {
    return { success: false, error: '参数不完整' };
  }

  // 添加回复
  const replyData = {
    content,
    author: username,
    createdAt: new Date().toISOString()
  };

  await db.collection('feedback').doc(feedbackId).update({
    replies: db.command.push(replyData),
    status: 'replied',
    hasReply: true,
    updatedAt: new Date().toISOString()
  });

  return { success: true };
}

// 主入口函数
exports.main = async (event, context) => {
  console.log('[adminProxy] 收到请求:', { event, context });

  // 检查是否为HTTP服务/API网关调用
  const isHttpCall = event.httpMethod || event.body !== undefined;
  let action, data;

  if (isHttpCall) {
    // HTTP服务调用格式
    try {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      action = body.action;
      data = body.data;
    } catch (e) {
      return formatGatewayResponse(400, { success: false, error: 'Invalid JSON body' });
    }
  } else {
    // 事件调用格式（云函数内部调用）
    action = event.action;
    data = event.data;
  }

  if (!action) {
    return isHttpCall
      ? formatGatewayResponse(400, { success: false, error: 'Missing action parameter' })
      : { success: false, error: 'Missing action parameter' };
  }

  console.log('[adminProxy] 处理请求:', { action, data: { ...data, password: '***' } });

  try {
    let result;

    switch (action) {
      case 'adminLogin':
        result = await handleAdminLogin(data);
        break;

      case 'getFeedbackList':
        result = await handleGetFeedbackList(data);
        break;

      case 'replyFeedback':
        result = await handleReplyFeedback(data);
        break;

      default:
        return isHttpCall
          ? formatGatewayResponse(400, { success: false, error: 'Unknown action' })
          : { success: false, error: '未知的操作' };
    }

    console.log('[adminProxy] 响应:', result);

    return isHttpCall
      ? formatGatewayResponse(200, result)
      : result;

  } catch (e) {
    console.error('[adminProxy] 错误:', e);
    const errorResponse = { success: false, error: e.message || String(e) };

    return isHttpCall
      ? formatGatewayResponse(500, errorResponse)
      : errorResponse;
  }
};
