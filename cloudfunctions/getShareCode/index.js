/**
 * 生成小程序码云函数
 * 使用 HTTP 请求调用微信 API 生成小程序码
 */

const cloud = require('wx-server-sdk');
const request = require('request-promise');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 缓存 access_token（简化版，生产环境建议使用 Redis）
let cachedAccessToken = null;
let tokenExpireTime = 0;

// 获取 access_token
async function getAccessToken(appId, appSecret) {
  const now = Date.now();

  // 如果 token 未过期，直接返回
  if (cachedAccessToken && now < tokenExpireTime) {
    return cachedAccessToken;
  }

  // 获取新的 access_token
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;

  try {
    const response = await request({
      url: url,
      method: 'GET',
      json: true
    });

    if (response.errcode) {
      throw new Error(`获取 access_token 失败: ${response.errmsg}`);
    }

    // 缓存 token（提前 5 分钟过期）
    cachedAccessToken = response.access_token;
    tokenExpireTime = now + (response.expires_in - 300) * 1000;

    console.log('[getAccessToken] 成功获取 token');
    return cachedAccessToken;
  } catch (e) {
    console.error('[getAccessToken] 错误:', e);
    throw e;
  }
}

// 生成小程序码
async function getWXACode(accessToken, path, width) {
  const url = `https://api.weixin.qq.com/wxa/getwxacode?access_token=${accessToken}`;

  try {
    const response = await request({
      url: url,
      method: 'POST',
      json: true,
      encoding: null, // 重要：返回 Buffer
      body: {
        path: path,
        width: width,
        auto_color: false,
        line_color: { "r": 0, "g": 0, "b": 0 },
        is_hyaline: false
      }
    });

    // 检查是否返回错误
    if (response.errcode) {
      throw new Error(`生成小程序码失败: ${response.errmsg}`);
    }

    return response;
  } catch (e) {
    console.error('[getWXACode] 错误:', e);
    throw e;
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const appId = wxContext.APPID;
  const appSecret = process.env.WX_APPSECRET;

  // path: 小程序页面路径
  // width: 二维码宽度
  const { path = 'pages/parent-assessment/parent-assessment', width = 280 } = event;

  console.log('[getShareCode] 调用参数:', { appId, path, width });

  if (!appSecret) {
    return {
      success: false,
      error: '缺少 AppSecret 配置'
    };
  }

  try {
    // 获取 access_token
    const accessToken = await getAccessToken(appId, appSecret);

    // 生成小程序码
    const buffer = await getWXACode(accessToken, path, width);

    console.log('[getShareCode] 小程序码生成成功，buffer长度:', buffer ? buffer.length : 'undefined');

    if (!buffer || !buffer.length) {
      return {
        success: false,
        error: '生成小程序码失败：返回数据无效'
      };
    }

    // 将 Buffer 转换为 Base64
    const base64 = buffer.toString('base64');

    return {
      success: true,
      data: {
        base64: base64,
        contentType: 'image/png'
      }
    };
  } catch (e) {
    console.error('[getShareCode] 异常:', e.message);

    return {
      success: false,
      error: e.message || '生成小程序码失败'
    };
  }
};
