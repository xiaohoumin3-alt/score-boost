/**
 * LLM 调用模块 - DeepSeek API 集成
 */

const axios = require('axios');

const DEFAULT_CONFIG = {
  baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
  model: process.env.LLM_MODEL || 'deepseek-chat',
  apiKey: process.env.LLM_API_KEY,
  timeout: parseInt(process.env.LLM_TIMEOUT_MS, 10) || 45000,
  maxRetries: parseInt(process.env.LLM_MAX_RETRIES, 10) || 2,
  retryDelay: parseInt(process.env.LLM_RETRY_DELAY_MS, 10) || 1000
};

/**
 * 调用 LLM 生成 completion
 * @param {string} prompt - 提示词
 * @param {Object} options - 配置选项
 * @param {string} [options.systemPrompt] - 系统提示词
 * @param {number} [options.maxTokens] - 最大输出 token 数
 * @param {number} [options.temperature] - 温度参数
 * @returns {Promise<string>} LLM 输出文本
 */
async function generateCompletion(prompt, options = {}) {
  const {
    systemPrompt = '你是一个有帮助的助手。',
    maxTokens = 2000,
    temperature = 0.7
  } = options;

  if (!DEFAULT_CONFIG.apiKey) {
    throw new Error('LLM_API_KEY 未配置');
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ];

  let lastError;

  for (let attempt = 0; attempt <= DEFAULT_CONFIG.maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${DEFAULT_CONFIG.baseUrl}/v1/chat/completions`,
        {
          model: DEFAULT_CONFIG.model,
          messages,
          max_tokens: maxTokens,
          temperature
        },
        {
          headers: {
            'Authorization': `Bearer ${DEFAULT_CONFIG.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: DEFAULT_CONFIG.timeout
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content;
      }

      throw new Error('LLM 响应格式错误');
    } catch (error) {
      lastError = error;

      if (attempt < DEFAULT_CONFIG.maxRetries) {
        const delay = DEFAULT_CONFIG.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * 调用 LLM 生成 JSON 格式输出
 * @param {string} prompt - 提示词
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 解析后的 JSON 对象
 */
async function generateJSON(prompt, options = {}) {
  const jsonPrompt = `${prompt}\n\n请以纯 JSON 格式返回结果，不要包含 markdown 代码块标记。`;
  const text = await generateCompletion(jsonPrompt, {
    ...options,
    temperature: options.temperature || 0.3
  });

  try {
    return JSON.parse(text.trim());
  } catch {
    // 尝试提取 JSON 内容
    const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error(`LLM 输出不是有效 JSON: ${text.substring(0, 100)}`);
  }
}

module.exports = {
  DEFAULT_CONFIG,
  generateCompletion,
  generateJSON
};
