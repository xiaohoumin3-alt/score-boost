/**
 * LLM 配置管理模块
 *
 * 支持数据库配置缓存和环境变量回退。
 *
 * 环境变量：
 * - LLM_API_KEY: API 密钥（数据库不可用时必需）
 * - LLM_BASE_URL: API 端点
 * - LLM_MODEL: 模型名称
 * - LLM_MAX_RETRIES: 最大重试次数
 * - LLM_TIMEOUT_MS: 超时时间（毫秒）
 * - LLM_RETRY_DELAY_MS: 基础重试延迟（毫秒）
 */

const { LLMConfigError } = require('./exceptions')

let cachedConfig = null
let cacheTimestamp = 0

/**
 * 预加载配置到缓存
 *
 * @param {Object} db - 数据库实例
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 * @returns {Promise<Object>} 配置对象
 */
async function loadConfig(db, forceRefresh = false) {
  if (!forceRefresh && cachedConfig && cacheTimestamp > 0) {
    console.log('[Config] Using cached config')
    return cachedConfig
  }

  try {
    const { getConfig: getDbConfig } = require('../llm-config-db')
    const dbConfig = await getDbConfig(db)

    cachedConfig = {
      apiKey: dbConfig.apiKey,
      baseUrl: dbConfig.baseUrl,
      model: dbConfig.model,
      maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '2', 10),
      timeout: parseInt(process.env.LLM_TIMEOUT_MS || '45000', 10),
      retryDelay: parseInt(process.env.LLM_RETRY_DELAY_MS || '1000', 10),
      maxDelay: parseInt(process.env.LLM_MAX_RETRY_DELAY_MS || '10000', 10),
      _source: 'database',
      providerId: dbConfig.providerId,
      _providerId: dbConfig.providerId
    }
    cacheTimestamp = Date.now()

    console.log('[Config] Loaded from DB:', cachedConfig._providerId)
    return cachedConfig
  } catch (e) {
    console.log('[Config] DB load failed, using env:', e.message)
    return loadFromEnv(false)
  }
}

/**
 * 从环境变量加载配置并写入缓存
 *
 * @param {boolean} shouldValidate - 是否验证 API Key 必填
 * @returns {Object} 配置对象
 */
function loadFromEnv(shouldValidate = true) {
  const env = typeof process !== 'undefined' ? process.env : {}

  cachedConfig = {
    apiKey: env.LLM_API_KEY || '',
    baseUrl: env.LLM_BASE_URL || 'https://api.deepseek.com',
    model: env.LLM_MODEL || 'deepseek-chat',
    maxRetries: parseInt(env.LLM_MAX_RETRIES || '2', 10),
    timeout: parseInt(env.LLM_TIMEOUT_MS || '45000', 10),
    retryDelay: parseInt(env.LLM_RETRY_DELAY_MS || '1000', 10),
    maxDelay: parseInt(env.LLM_MAX_RETRY_DELAY_MS || '10000', 10),
    _source: 'env'
  }
  cacheTimestamp = Date.now()

  validateConfig(cachedConfig, shouldValidate)

  return cachedConfig
}

/**
 * 获取配置
 *
 * 优先级：缓存 > 环境变量 > 默认值
 *
 * @returns {Object} 配置对象
 * @throws {LLMConfigError} 缺少必需配置时抛出
 */
function getConfig() {
  if (cachedConfig && cacheTimestamp > 0) {
    validateConfig(cachedConfig, true)
    return cachedConfig
  }

  return loadFromEnv(true)
}

/**
 * 验证配置合法性
 *
 * @param {Object} config - 配置对象
 * @param {boolean} shouldValidateApiKey - 是否验证 API Key 必填
 */
function validateConfig(config, shouldValidateApiKey) {
  if (shouldValidateApiKey && !config.apiKey) {
    throw new LLMConfigError('LLM_API_KEY not configured')
  }

  if (config.maxRetries < 0 || config.maxRetries > 10) {
    throw new LLMConfigError('LLM_MAX_RETRIES 必须在 0-10 之间')
  }
  if (config.timeout < 1000 || config.timeout > 300000) {
    throw new LLMConfigError('LLM_TIMEOUT_MS 必须在 1000-300000 之间')
  }
  if (config.retryDelay < 100 || config.retryDelay > 10000) {
    throw new LLMConfigError('LLM_RETRY_DELAY_MS 必须在 100-10000 之间')
  }
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

  controller.signal.addEventListener('abort', () => {
    clearTimeout(timer)
  })

  return controller
}

module.exports = {
  getConfig,
  loadConfig,
  loadFromEnv,
  createTimeoutController
}
