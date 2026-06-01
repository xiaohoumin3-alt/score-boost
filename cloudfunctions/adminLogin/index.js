/**
 * 管理员登录云函数
 * 功能：验证管理员账号密码，生成token
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  // 调试：记录请求信息
  console.log('=== 请求信息 ===');
  console.log('Event:', JSON.stringify(event));
  console.log('Context:', JSON.stringify(context));

  const { username, password } = event;

  if (!username || !password) {
    return { success: false, error: '账号和密码不能为空' };
  }

  const db = cloud.database();

  try {
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
  } catch (e) {
    console.error('adminLogin error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
