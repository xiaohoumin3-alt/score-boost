/**
 * LLM 核心模块统一导出
 *
 * 提供统一的 LLM 调用接口，包含：
 * - 异常类
 * - 错误映射
 * - 重试逻辑
 * - 配置管理
 * - LLM 客户端（支持 OpenAI 兼容 API，包括 DeepSeek、MiniMax 等）
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
  createTimeoutController
} = require('./config')

// LLM 客户端（OpenAI 兼容格式，支持 DeepSeek、MiniMax 等）
const { MiniMaxClient } = require('./minimax-client')

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
  createTimeoutController,

  // MiniMax 客户端
  MiniMaxClient,
  createLLMClient
}
