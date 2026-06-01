/**
 * 带 Fallback 的 LLM 客户端
 *
 * 优先使用 primary 模型，失败时自动切换到 fallback 模型。
 * - 401/403 等认证错误直接失败（不换模型重试，API Key 配置有问题）
 * - 网络超时/限流等可重试错误：先重试 primary，重试完仍失败再换 fallback
 * - Fallback 也失败：整个任务失败
 */

const { getConfig, createTimeoutController } = require('./config')
const { mapError } = require('./error-mapping')
const { retryWithBackoff } = require('./retry')
const { LLMConfigError, LLMAPIError } = require('./exceptions')

// Fetch polyfill for Node.js 16.x 环境
let _fetch = null
try {
  if (typeof fetch !== 'undefined') {
    _fetch = fetch
  } else {
    _fetch = require('node-fetch')
  }
} catch (e) {
  throw new LLMConfigError('无法加载 fetch: 请确保 node-fetch 已安装')
}

/**
 * 单模型客户端（MiniMaxClient 的简化版本，支持任意 baseUrl/model）
 */
class SingleModelClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl
    this.model = options.model
    this.maxRetries = options.maxRetries ?? 3
    this.timeout = options.timeout ?? 30000
    this.retryDelay = options.retryDelay ?? 1000
    this.maxDelay = options.maxDelay ?? 60000
    this.name = options.name || this.model // 用于日志标识

    if (!this.apiKey) throw new LLMConfigError(`${this.name}: API Key 未设置`)
  }

  _formatRequest(params) {
    const messages = []
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt })
    }
    if (params.userPrompt) {
      messages.push({ role: 'user', content: params.userPrompt })
    }
    const finalMessages = params.messages || messages
    return {
      model: this.model,
      messages: finalMessages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2000
    }
  }

  async _call(requestBody, signal) {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`
    console.log(`[${this.name}] Calling: ${url}`)
    console.log(`[${this.name}] Model: ${this.model}`)

    let response
    try {
      response = await _fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal
      })
    } catch (fetchError) {
      console.error(`[${this.name}] Fetch error:`, fetchError.message)
      throw fetchError
    }

    const body = await response.text()

    if (!response.ok) {
      let retryAfter = null
      try {
        const errorData = JSON.parse(body)
        retryAfter = errorData?.retry_after || null
      } catch (_) {}

      const mapped = mapError(new Error(body || `HTTP ${response.status}`), {
        status: response.status,
        body,
        retryAfter
      })
      throw mapped
    }

    // 解析成功响应
    let data
    try {
      data = JSON.parse(body)
    } catch (parseError) {
      throw mapError(parseError, { body })
    }

    if (!data.choices || !data.choices[0]) {
      throw new Error(`无效响应格式: ${JSON.stringify(data).slice(0, 200)}`)
    }

    const choice = data.choices[0]
    return {
      content: choice.message?.content || choice.text || '',
      finishReason: choice.finish_reason || 'stop',
      raw: data
    }
  }

  /**
   * 执行单次调用（无重试，由外层统一处理）
   */
  async callOnce(params) {
    const requestBody = this._formatRequest(params)
    const controller = createTimeoutController(this.timeout)
    return this._call(requestBody, controller.signal)
  }

  /**
   * 执行带重试的调用
   */
  async complete(params) {
    const requestBody = this._formatRequest(params)

    return retryWithBackoff(
      async () => {
        const controller = createTimeoutController(this.timeout)
        return this._call(requestBody, controller.signal)
      },
      {
        maxRetries: this.maxRetries,
        baseDelay: this.retryDelay,
        maxDelay: this.maxDelay,
        onRetry: (attempt, error, delay) => {
          console.warn(`[${this.name}] 重试 ${attempt}/${this.maxRetries}, 等待 ${delay}ms, 错误: ${error.message}`)
        }
      }
    )
  }
}

/**
 * FallbackLLM 客户端
 * @param {Array} modelConfigs - 模型配置数组，按优先级排序
 *   每个元素: { apiKey, baseUrl, model, name, maxRetries, timeout, retryDelay, maxDelay }
 *   第一个为 primary，其余为 fallback
 */
class FallbackLLM {
  constructor(modelConfigs = []) {
    if (modelConfigs.length === 0) {
      throw new LLMConfigError('至少需要配置一个模型')
    }
    this.clients = modelConfigs.map(cfg => new SingleModelClient(cfg))
    this.primaryClient = this.clients[0]
    this.fallbackClients = this.clients.slice(1)
  }

  /**
   * 判断是否为配置错误（换模型也没用）
   */
  _isConfigError(error) {
    // 401/403 认证失败，换模型没用
    if (error.status === 401 || error.status === 403) return true
    // 配置类错误消息
    const msg = error?.message || ''
    if (msg.includes('API key') || msg.includes('api_key') ||
        msg.includes('API_KEY') || msg.includes('密钥') ||
        msg.includes('未设置') || msg.includes('未配置')) {
      return true
    }
    return false
  }

  /**
   * 生成文本
   * @param {Object} params - 调用参数
   * @returns {Promise<{content, finishReason, model}>}
   */
  async complete(params) {
    // 依次尝试每个模型
    for (let i = 0; i < this.clients.length; i++) {
      const client = this.clients[i]
      const label = i === 0 ? 'PRIMARY' : `FALLBACK-${i}`

      console.log(`[FallbackLLM] 尝试模型 [${label}]: ${client.model} @ ${client.baseUrl}`)

      try {
        const result = await client.complete(params)
        result.model = client.model
        console.log(`[FallbackLLM] ✅ [${label}] 成功: ${client.model}`)
        return result
      } catch (error) {
        console.error(`[FallbackLLM] ❌ [${label}] 失败: ${client.model}, 错误: ${error.message}, retryable=${error.retryable}`)

        // 配置错误：直接失败，不换模型
        if (this._isConfigError(error)) {
          console.error(`[FallbackLLM] 配置错误 [${label}]，不换模型重试，直接失败`)
          throw error
        }

        // 不是最后一个模型，换下一个重试
        if (i < this.clients.length - 1) {
          console.log(`[FallbackLLM] → 切换到 fallback 模型`)
          continue
        }

        // 最后一个也失败
        console.error(`[FallbackLLM] 所有模型均失败，最后错误: ${error.message}`)
        throw error
      }
    }

    // 理论上不会到这里
    throw new Error('FallbackLLM: 未找到可用模型')
  }
}

/**
 * 工厂函数：从环境变量构建 FallbackLLM
 *
 * 环境变量格式：
 * - LLM_API_KEY / LLM_BASE_URL / LLM_MODEL: primary 模型配置
 * - LLM_API_KEY_2 / LLM_BASE_URL_2 / LLM_MODEL_2: fallback 模型配置
 * - LLM_TIMEOUT_MS / LLM_MAX_RETRIES 等: 通用重试配置（可被模型专属配置覆盖）
 */
function createFallbackClientFromEnv() {
  const env = process.env

  const defaultTimeout = parseInt(env.LLM_TIMEOUT_MS || '300000', 10)
  const defaultRetries = parseInt(env.LLM_MAX_RETRIES || '10', 10)
  const defaultRetryDelay = parseInt(env.LLM_RETRY_DELAY_MS || '3000', 10)
  const defaultMaxDelay = parseInt(env.LLM_MAX_RETRY_DELAY_MS || '180000', 10)

  // Primary 模型配置（必需）
  if (!env.LLM_API_KEY) throw new LLMConfigError('LLM_API_KEY 环境变量未设置（primary 模型）')

  const configs = []

  // Primary
  configs.push({
    name: 'PRIMARY',
    apiKey: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: env.LLM_MODEL || 'gemma-4-31b-it',
    timeout: parseInt(env.LLM_TIMEOUT_MS || '300000', 10),
    maxRetries: parseInt(env.LLM_MAX_RETRIES || '10', 10),
    retryDelay: parseInt(env.LLM_RETRY_DELAY_MS || '3000', 10),
    maxDelay: parseInt(env.LLM_MAX_RETRY_DELAY_MS || '180000', 10)
  })

  // Fallback（可选，API Key 存在时才添加）
  if (env.LLM_API_KEY_2) {
    configs.push({
      name: 'FALLBACK',
      apiKey: env.LLM_API_KEY_2,
      baseUrl: env.LLM_BASE_URL_2 || 'https://api.deepseek.com',
      model: env.LLM_MODEL_2 || 'deepseek-v4-flash',
      timeout: parseInt(env.LLM_TIMEOUT_MS_2 || env.LLM_TIMEOUT_MS || '300000', 10),
      maxRetries: parseInt(env.LLM_MAX_RETRIES_2 || env.LLM_MAX_RETRIES || '10', 10),
      retryDelay: parseInt(env.LLM_RETRY_DELAY_MS_2 || env.LLM_RETRY_DELAY_MS || '3000', 10),
      maxDelay: parseInt(env.LLM_MAX_RETRY_DELAY_MS_2 || env.LLM_MAX_RETRY_DELAY_MS || '180000', 10)
    })
    console.log('[FallbackLLM] Fallback 模型已配置:', configs[1].model)
  } else {
    console.log('[FallbackLLM] 未配置 Fallback 模型（LLM_API_KEY_2 未设置）')
  }

  return new FallbackLLM(configs)
}

module.exports = {
  FallbackLLM,
  SingleModelClient,
  createFallbackClientFromEnv
}