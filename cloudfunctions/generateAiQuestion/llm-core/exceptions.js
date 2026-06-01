/**
 * LLM 调用异常体系
 *
 * 提供三种核心异常类型：
 * - LLMError: 基类
 * - LLMConfigError: 配置错误（缺少 API Key 等）
 * - LLMAPIError: API 调用失败（含状态码、重试信息）
 * - LLMParseError: 响应解析失败
 */

/**
 * LLM 错误基类
 * @class LLMError
 * @extends Error
 */
class LLMError extends Error {
  constructor(message, code = 'LLM_ERROR') {
    super(message)
    this.code = code
    this.name = 'LLMError'
    Error.captureStackTrace?.(this, LLMError)
  }
}

/**
 * 配置错误
 * 缺少必需的配置（如 API Key）、无效配置值等
 * @class LLMConfigError
 * @extends LLMError
 */
class LLMConfigError extends LLMError {
  constructor(message) {
    super(message, 'LLM_CONFIG_ERROR')
    this.name = 'LLMConfigError'
    Error.captureStackTrace?.(this, LLMConfigError)
  }
}

/**
 * API 调用失败
 * HTTP 错误、网络错误、超时等
 * @class LLMAPIError
 * @extends LLMError
 */
class LLMAPIError extends LLMError {
  /**
   * @param {string} message - 错误消息
   * @param {number|null} status - HTTP 状态码
   * @param {boolean} retryable - 是否可重试
   * @param {number|null} retryAfter - 重试等待时间（秒）
   */
  constructor(message, status = null, retryable = false, retryAfter = null) {
    super(message, 'LLM_API_ERROR')
    this.name = 'LLMAPIError'
    this.status = status
    this.retryable = retryable
    this.retryAfter = retryAfter
    Error.captureStackTrace?.(this, LLMAPIError)
  }
}

/**
 * 响应解析失败
 * JSON 解析失败、响应格式错误等
 * @class LLMParseError
 * @extends LLMError
 */
class LLMParseError extends LLMError {
  /**
   * @param {string} message - 错误消息
   * @param {*} rawContent - 原始响应内容（用于调试）
   */
  constructor(message, rawContent = null) {
    super(message, 'LLM_PARSE_ERROR')
    this.name = 'LLMParseError'
    this.rawContent = rawContent
    Error.captureStackTrace?.(this, LLMParseError)
  }
}

module.exports = {
  LLMError,
  LLMConfigError,
  LLMAPIError,
  LLMParseError
}
