/**
 * LLM 客户端 (OpenAI 兼容格式)
 *
 * 支持 Gemma (Google Generative AI) 等 OpenAI 兼容 API。
 * 包含：
 * - OpenAI 兼容格式的请求
 * - 内置重试和错误映射
 * - 超时控制
 * - AbortController 支持
 */

const { getConfig, createTimeoutController } = require('./config')
const { mapError } = require('./error-mapping')
const { retryWithBackoff } = require('./retry')
const { LLMConfigError } = require('./exceptions')

/**
 * LLM 客户端类
 */
class LLMClient {
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
    this.timeout = options.timeout ?? config.timeout ?? 120000
    this.retryDelay = options.retryDelay ?? config.retryDelay ?? 1000
    this.maxDelay = options.maxDelay ?? config.maxDelay ?? 60000

    if (!this.apiKey) {
      throw new LLMConfigError('LLM API Key 未设置')
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
    let data
    try {
      data = JSON.parse(body)
    } catch (parseError) {
      const error = mapError(parseError, { body })
      throw error
    }

    // OpenAI 兼容格式
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
   * 使用 Node.js https 模块（兼容 Node 16，无 fetch 环境）
   * @param {Object} requestBody - 请求体
   * @param {AbortSignal} signal - 中止信号
   * @returns {Promise<Object>} 解析后的结果
   */
  async _call(requestBody, signal) {
    const https = require('https')
    const http = require('http')
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`
    const urlObj = new URL(url)
    const lib = urlObj.protocol === 'https:' ? https : http

    return new Promise((resolve, reject) => {
      const req = lib.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: this.timeout
      }, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            let retryAfter = null
            try {
              const errorData = JSON.parse(body)
              retryAfter = errorData?.retry_after || null
            } catch (e) {}

            const error = mapError(new Error(body || `HTTP ${res.statusCode}`), {
              status: res.statusCode,
              body,
              retryAfter
            })
            reject(error)
          } else {
            try {
              const result = this._parseResponse({ ok: true, status: res.statusCode }, body)
              resolve(result)
            } catch (e) {
              reject(e)
            }
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })

      if (signal) {
        signal.addEventListener('abort', () => {
          req.destroy()
          reject(new Error('Request aborted'))
        })
      }

      req.write(JSON.stringify(requestBody))
      req.end()
    })
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
          const logMessage = `[LLMClient] 重试 ${attempt}/${this.maxRetries}, 等待 ${delay}ms, 错误: ${error.message}`
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

// 保持向后兼容的别名
const MiniMaxClient = LLMClient

module.exports = {
  LLMClient,
  MiniMaxClient  // 向后兼容
}
