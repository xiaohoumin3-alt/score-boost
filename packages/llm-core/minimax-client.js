/**
 * MiniMax LLM 客户端
 *
 * 实现对 MiniMax API 的调用，包含：
 * - OpenAI 兼容格式的请求
 * - 内置重试和错误映射
 * - 超时控制
 * - AbortController 支持
 * - Fetch polyfill 支持
 */

const { getConfig, createTimeoutController } = require('./config')
const { mapError } = require('./error-mapping')
const { retryWithBackoff } = require('./retry')
const { LLMConfigError } = require('./exceptions')

// Fetch polyfill for Node.js 16.x 环境
let _fetch = null
try {
  if (typeof fetch !== 'undefined') {
    _fetch = fetch  // Node 18+ 原生 fetch
  } else {
    _fetch = require('node-fetch')  // Node 16.x 需要 node-fetch
  }
} catch (e) {
  throw new LLMConfigError('无法加载 fetch: 请确保 node-fetch 已安装（npm install node-fetch）')
}

/**
 * MiniMax 客户端类
 */
class MiniMaxClient {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.apiKey - API 密钥
   * @param {string} options.baseUrl - API 端点
   * @param {string} options.model - 模型名称
   * @param {number} options.maxRetries - 最大重试次数
   * @param {number} options.timeout - 超时时间（毫秒）
   * @param {number} options.retryDelay - 基础重试延迟（毫秒）
   * @param {number} options.maxDelay - 最大重试延迟（毫秒）
   * @param {Object} options.logger - 可选的日志对象
   */
  constructor(options = {}) {
    // 配置日志记录器
    this.logger = options.logger || null

    // 仅在必需参数缺失时调用 getConfig
    // 必需参数：apiKey, baseUrl, model
    const needsDefaults = !options.apiKey || !options.baseUrl || !options.model

    let config
    if (needsDefaults) {
      try {
        config = getConfig()
      } catch (error) {
        // 如果环境变量未配置，使用空对象（测试环境可能需要）
        config = {}
      }
    } else {
      config = {}
    }

    this.apiKey = options.apiKey || config.apiKey
    this.baseUrl = options.baseUrl || config.baseUrl
    this.model = options.model || config.model
    this.maxRetries = options.maxRetries ?? config.maxRetries ?? 3
    this.timeout = options.timeout ?? config.timeout ?? 30000
    this.retryDelay = options.retryDelay ?? config.retryDelay ?? 1000
    this.maxDelay = options.maxDelay ?? config.maxDelay ?? 60000

    if (!this.apiKey) {
      throw new LLMConfigError('MiniMax API Key 未设置')
    }
  }

  /**
   * 将参数转换为 OpenAI 格式
   * @param {Object} params - 调用参数
   * @returns {Object} OpenAI 格式的请求体
   */
  _formatRequest(params) {
    const { systemPrompt, userPrompt, temperature, maxTokens, ...rest } = params

    // 构建 messages 数组
    const messages = []
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      })
    }
    if (userPrompt) {
      messages.push({
        role: 'user',
        content: userPrompt
      })
    }

    // 如果直接传了 messages，使用它
    const finalMessages = params.messages || messages

    return {
      model: this.model,
      messages: finalMessages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 2000,
      ...rest
    }
  }

  /**
   * 解析响应
   * @param {Object} response - fetch 响应对象
   * @param {string} body - 响应体文本
   * @returns {Object} 解析后的结果
   */
  _parseResponse(response, body) {
    console.log('[MiniMaxClient] Raw response status:', response.status);
    console.log('[MiniMaxClient] Raw response body (first 500 chars):', body.substring(0, 500));

    let data
    try {
      data = JSON.parse(body)
    } catch (parseError) {
      const error = mapError(parseError, { body })
      throw error
    }

    console.log('[MiniMaxClient] Parsed data keys:', Object.keys(data));
    console.log('[MiniMaxClient] Parsed data sample:', JSON.stringify(data).slice(0, 300));

    // MiniMax 兼容 OpenAI 格式
    if (!data.choices || !data.choices[0]) {
      throw new Error(`无效的响应格式: ${JSON.stringify(data).slice(0, 200)}`)
    }

    const choice = data.choices[0]
    const content = choice.message?.content || choice.text || ''

    // 处理 usage 信息
    const usage = data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens ||
        (data.usage.prompt_tokens + data.usage.completion_tokens)
    } : undefined

    return {
      content,
      finishReason: choice.finish_reason || 'stop',
      usage,
      raw: data
    }
  }

  /**
   * 执行单次 API 调用
   * @param {Object} requestBody - 请求体
   * @param {AbortSignal} signal - 中止信号
   * @returns {Promise<Object>} 解析后的结果
   */
  async _call(requestBody, signal) {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`

    const response = await _fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal
    })

    const body = await response.text()

    // 处理非 200 响应
    if (!response.ok) {
      // 尝试解析错误响应获取 retry-after
      let retryAfter = null
      try {
        const errorData = JSON.parse(body)
        retryAfter = errorData?.retry_after || null
      } catch (parseError) {
        // JSON 解析失败，记录但不影响后续处理
        // retryAfter 保持为 null，将使用默认退避策略
        if (this.logger && this.logger.debug) {
          this.logger.debug(`[MiniMaxClient] 错误响应解析失败: ${parseError.message}`)
        }
      }

      const error = mapError(new Error(body || `HTTP ${response.status}`), {
        status: response.status,
        body,
        retryAfter
      })
      throw error
    }

    return this._parseResponse(response, body)
  }

  /**
   * 完成文本生成（带重试）
   *
   * @param {Object} params - 调用参数
   * @param {string} params.systemPrompt - 系统提示词
   * @param {string} params.userPrompt - 用户提示词
   * @param {Array} params.messages - 消息数组（OpenAI 格式，与 systemPrompt/userPrompt 二选一）
   * @param {number} params.temperature - 温度参数（0-1）
   * @param {number} params.maxTokens - 最大 token 数
   * @returns {Promise<Object>} { content, finishReason, usage? }
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
          // 使用配置的日志记录器，默认为 console.warn
          const logMessage = `[MiniMaxClient] 重试 ${attempt}/${this.maxRetries}, 等待 ${delay}ms, 错误: ${error.message}`
          if (this.logger && typeof this.logger.warn === 'function') {
            this.logger.warn(logMessage)
          } else {
            console.warn(logMessage)
          }
        }
      }
    )
  }
}

module.exports = {
  MiniMaxClient
}
