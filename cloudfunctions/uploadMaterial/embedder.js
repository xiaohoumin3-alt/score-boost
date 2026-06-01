/**
 * 向量嵌入模块
 * 主接口：文心一言 ERNIE-Embedding-v1
 * 降级接口：通义千问
 */

const axios = require('axios');

/**
 * 提供商常量
 */
const WENXIN_PROVIDER = 'wenxin';
const QIANWEN_PROVIDER = 'qianwen';

/**
 * 文心一言配置
 */
const WENXIN_CONFIG = {
  tokenUrl: 'https://aip.baidubce.com/oauth/2.0/token',
  embeddingUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/embedding',
  model: 'ERNIE-Embedding-v1'
};

/**
 * 通义千问配置
 */
const QIANWEN_CONFIG = {
  embeddingUrl: 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
  model: 'text-embedding-v2'
};

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  timeout: 10000, // 10秒
  retries: 2, // 重试次数
  retryDelay: 1000, // 重试延迟（毫秒）
  batchSize: 10 // 批处理大小
};

/**
 * 获取文心一言 Access Token
 * @returns {Promise<string>} Access Token
 */
async function getWenxinAccessToken() {
  const apiKey = process.env.WENXIN_API_KEY;
  const secretKey = process.env.WENXIN_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('文心一言 API Key 或 Secret Key 未配置');
  }

  try {
    const response = await axios.post(WENXIN_CONFIG.tokenUrl, null, {
      params: {
        grant_type: 'client_credentials',
        client_id: apiKey,
        client_secret: secretKey
      },
      timeout: DEFAULT_CONFIG.timeout
    });

    return response.data.access_token;
  } catch (error) {
    console.error('获取文心一言 Access Token 失败:', error.message);
    throw error;
  }
}

/**
 * 调用文心一言嵌入接口
 * @param {string} text - 输入文本
 * @param {string} accessToken - Access Token
 * @returns {Promise<number[]>} 嵌入向量
 */
async function callWenxinEmbedding(text, accessToken) {
  try {
    const response = await axios.post(
      `${WENXIN_CONFIG.embeddingUrl}?access_token=${accessToken}`,
      {
        model: WENXIN_CONFIG.model,
        input: [text]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: DEFAULT_CONFIG.timeout
      }
    );

    if (response.data && response.data.embedding && response.data.embedding[0]) {
      return response.data.embedding[0];
    }

    throw new Error('文心一言响应格式错误');
  } catch (error) {
    console.error('文心一言嵌入接口调用失败:', error.message);
    throw error;
  }
}

/**
 * 调用通义千问嵌入接口
 * @param {string} text - 输入文本
 * @returns {Promise<number[]>} 嵌入向量
 */
async function callQianwenEmbedding(text) {
  const apiKey = process.env.QIANWEN_API_KEY;

  if (!apiKey) {
    throw new Error('通义千问 API Key 未配置');
  }

  try {
    const response = await axios.post(
      QIANWEN_CONFIG.embeddingUrl,
      {
        model: QIANWEN_CONFIG.model,
        input: {
          texts: [text]
        },
        parameters: {
          text_type: 'document'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: DEFAULT_CONFIG.timeout
      }
    );

    if (response.data && response.data.output && response.data.output.embeddings) {
      return response.data.output.embeddings[0].embedding;
    }

    throw new Error('通义千问响应格式错误');
  } catch (error) {
    console.error('通义千问嵌入接口调用失败:', error.message);
    throw error;
  }
}

/**
 * 生成单个文本的嵌入向量
 * @param {string} text - 输入文本
 * @param {Object} options - 配置选项
 * @param {string} options.provider - 强制使用的提供商 ('wenxin' | 'qianwen')
 * @param {number} options.timeout - 超时时间（毫秒）
 * @param {number} options.retries - 重试次数
 * @returns {Promise<number[]>} 嵌入向量
 */
async function generateEmbedding(text, options = {}) {
  // 输入验证
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('输入文本不能为空');
  }

  const {
    provider,
    timeout = DEFAULT_CONFIG.timeout,
    retries = DEFAULT_CONFIG.retries
  } = options;

  const trimmedText = text.trim();

  // 如果指定了提供商
  if (provider === QIANWEN_PROVIDER) {
    return await retryOperation(() => callQianwenEmbedding(trimmedText), retries);
  }

  // 默认使用文心一言，失败时降级到通义千问
  try {
    // 获取 Access Token
    const accessToken = await getWenxinAccessToken();

    // 调用文心一言接口
    return await retryOperation(
      () => callWenxinEmbedding(trimmedText, accessToken),
      retries
    );
  } catch (error) {
    console.warn('文心一言调用失败，降级到通义千问:', error.message);

    // 检查是否有通义千问配置
    if (!process.env.QIANWEN_API_KEY) {
      throw new Error('文心一言和通义千问都不可用，请配置 API Key');
    }

    // 降级到通义千问
    return await callQianwenEmbedding(trimmedText);
  }
}

/**
 * 批量生成嵌入向量
 * @param {string[]} texts - 输入文本数组
 * @param {Object} options - 配置选项
 * @param {number} options.batchSize - 批处理大小
 * @param {string} options.provider - 强制使用的提供商
 * @returns {Promise<number[]>} 嵌入向量数组
 */
async function generateBatchEmbeddings(texts, options = {}) {
  // 输入验证
  if (!Array.isArray(texts)) {
    throw new Error('输入必须是数组');
  }

  if (texts.length === 0) {
    return [];
  }

  const {
    batchSize = DEFAULT_CONFIG.batchSize,
    provider
  } = options;

  const results = [];

  // 分批处理
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    // 并行处理当前批次
    const batchResults = await Promise.all(
      batch.map(text =>
        generateEmbedding(text, { provider }).catch(error => {
          console.error(`生成嵌入向量失败: ${text.substring(0, 30)}...`, error.message);
          return null; // 失败时返回 null
        })
      )
    );

    // 过滤掉失败的项
    results.push(...batchResults.filter(r => r !== null));
  }

  return results;
}

/**
 * 重试操作
 * @param {Function} operation - 要重试的操作
 * @param {number} retries - 重试次数
 * @returns {Promise<any>} 操作结果
 */
async function retryOperation(operation, retries) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (i < retries) {
        // 指数退避
        const delay = DEFAULT_CONFIG.retryDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

module.exports = {
  WENXIN_PROVIDER,
  QIANWEN_PROVIDER,
  generateEmbedding,
  generateBatchEmbeddings,
  getWenxinAccessToken,
  callWenxinEmbedding,
  callQianwenEmbedding
};
