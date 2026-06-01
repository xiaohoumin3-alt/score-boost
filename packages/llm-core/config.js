/**
 * LLM 配置管理模块
 *
 * 从环境变量读取配置，提供默认值和验证。
 *
 * 环境变量（支持两种命名方式）：
 * 标准命名：
 * - LLM_PROVIDER: Provider 类型（目前仅支持 minimax）
 * - LLM_API_KEY: API 密钥（必需）
 * - LLM_BASE_URL: API 端点（可选）
 * - LLM_MODEL: 模型名称
 * - LLM_MAX_RETRIES: 最大重试次数
 * - LLM_TIMEOUT_MS: 超时时间（毫秒）
 * - LLM_RETRY_DELAY_MS: 基础重试延迟（毫秒）
 *
 * MiniMax 专用命名（兼容现有配置）：
 * - MINIMAX_API_KEY: API 密钥
 * - MINIMAX_MODEL: 模型名称
 * - MINIMAX_BASE_URL: API 端点（可选）
 */

const { LLMConfigError } = require('./exceptions')

/**
 * 获取配置
 *
 * 优先级：环境变量 > 默认值
 *
 * @returns {Object} 配置对象
 * @throws {LLMConfigError} 缺少必需配置时抛出
 */
function getConfig() {
  // 在微信云函数环境中，从云函数配置读取
  // 在本地测试环境中，从 process.env 读取
  const env = typeof process !== 'undefined' ? process.env : {}

  const config = {
    // Provider 配置（支持两种命名方式）
    provider: env.LLM_PROVIDER || 'minimax',
    apiKey: env.LLM_API_KEY || env.LLM_API_KEY_MINIMAX || env.MINIMAX_API_KEY || '',
    baseUrl: env.LLM_BASE_URL || env.MINIMAX_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1',
    model: env.LLM_MODEL || env.MINIMAX_MODEL || 'mimo-v2-flash',

    // 重试与超时配置
    maxRetries: parseInt(env.LLM_MAX_RETRIES || '3', 10),
    timeout: parseInt(env.LLM_TIMEOUT_MS || '120000', 10),  // 2分钟默认超时（推理模型需要更长时间）
    retryDelay: parseInt(env.LLM_RETRY_DELAY_MS || '1000', 10),
    maxDelay: parseInt(env.LLM_MAX_RETRY_DELAY_MS || '60000', 10)
  }

  // 验证必需的 API Key
  if (!config.apiKey) {
    throw new LLMConfigError('LLM_API_KEY 环境变量未设置')
  }

  // 验证数值配置
  console.log('[Config] Final config timeout:', config.timeout, 'ms')

  if (config.maxRetries < 0 || config.maxRetries > 10) {
    throw new LLMConfigError('LLM_MAX_RETRIES 必须在 0-10 之间')
  }
  if (config.timeout < 1000 || config.timeout > 300000) {
    throw new LLMConfigError('LLM_TIMEOUT_MS 必须在 1000-300000 之间')
  }
  if (config.retryDelay < 100 || config.retryDelay > 10000) {
    throw new LLMConfigError('LLM_RETRY_DELAY_MS 必须在 100-10000 之间')
  }

  return config
}

/**
 * 创建带超时的 AbortController
 *
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {AbortController}
 */
function createTimeoutController(timeout) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  // 在 abort 时清理定时器，避免内存泄漏
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timer)
  })

  return controller
}

module.exports = {
  getConfig,
  createTimeoutController
}
