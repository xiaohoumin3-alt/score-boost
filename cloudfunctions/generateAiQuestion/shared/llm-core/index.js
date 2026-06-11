/**
 * LLM 核心模块统一导出
 *
 * 提供统一的 LLM 调用接口，包含：
 * - 异常类
 * - 错误映射
 * - 重试逻辑
 * - 配置管理
 * - MiniMax 客户端
 * - 响应解析和验证
 */

// 异常类
const {
  LLMError,
  LLMConfigError,
  LLMAPIError,
  LLMParseError
} = require('./exceptions')

// 错误映射
const {
  mapError,
  RETRYABLE_STATUS,
  RETRYABLE_CODES
} = require('./error-mapping')

// 重试逻辑
const {
  retryWithBackoff,
  retryWithBackoffCustom,
  calculateDelay,
  sleep
} = require('./retry')

// 配置管理
const {
  getConfig,
  loadConfig,
  loadFromEnv,
  createTimeoutController
} = require('./config')

// LLM 客户端（OpenAI 兼容格式，支持 DeepSeek、MiniMax 等）
const { MiniMaxClient } = require('./minimax-client')

/**
 * 解析LLM响应
 */
function parseLlmResponse(content) {
  if (!content || typeof content !== 'string') return null;
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : (content.match(/\{[\s\S]*\}/)?.[0] || content);
  try {
    const parsed = JSON.parse(jsonStr);
    return (parsed && Object.keys(parsed).length > 0) ? parsed : null;
  } catch { return null; }
}

/**
 * 验证题目结构
 */
function validateQuestion(q, question_type = 'choice') {
  if (!q || typeof q !== 'object') return false;
  if (!q.question && !q.content) return false;

  if (question_type === 'choice') {
    if (!Array.isArray(q.options) || q.options.length < 2) return false;
    const answer = q.correct_answer;
    if (typeof answer === 'number') {
      if (answer < 0 || answer >= q.options.length) return false;
    } else if (typeof answer === 'string') {
      const upper = answer.toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(upper)) return false;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * 创建 LLM 客户端实例
 *
 * @param {Object} options - 配置选项
 * @param {string} options.apiKey - API 密钥
 * @param {string} options.baseUrl - API 端点
 * @param {string} options.model - 模型名称
 * @param {number} options.maxRetries - 最大重试次数
 * @param {number} options.timeout - 超时时间（毫秒）
 * @param {number} options.retryDelay - 基础重试延迟（毫秒）
 * @returns {MiniMaxClient} LLM 客户端实例
 */
function createLLMClient(options = {}) {
  // 仅在需要默认值时读取配置
  const needsDefaults = !options.apiKey || !options.baseUrl ||
    !options.model || options.maxRetries === undefined ||
    options.timeout === undefined || options.retryDelay === undefined ||
    options.maxDelay === undefined

  const config = needsDefaults ? getConfig() : {}

  return new MiniMaxClient({
    apiKey: options.apiKey || config.apiKey,
    baseUrl: options.baseUrl || config.baseUrl,
    model: options.model || config.model,
    maxRetries: options.maxRetries ?? config.maxRetries,
    timeout: options.timeout ?? config.timeout,
    retryDelay: options.retryDelay ?? config.retryDelay,
    maxDelay: options.maxDelay ?? config.maxDelay,
    logger: options.logger
  })
}

module.exports = {
  // 异常类
  LLMError,
  LLMConfigError,
  LLMAPIError,
  LLMParseError,

  // 错误映射
  mapError,
  RETRYABLE_STATUS,
  RETRYABLE_CODES,

  // 重试逻辑
  retryWithBackoff,
  retryWithBackoffCustom,
  calculateDelay,
  sleep,

  // 配置管理
  getConfig,
  loadConfig,
  loadFromEnv,
  createTimeoutController,

  // MiniMax 客户端
  MiniMaxClient,
  createLLMClient,

  // 响应解析和验证
  parseLlmResponse,
  validateQuestion
}
