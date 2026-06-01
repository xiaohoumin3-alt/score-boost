/**
 * LLM 错误映射模块
 *
 * 将各种错误来源（HTTP 状态码、网络错误、解析错误等）
 * 映射为统一的异常类型。
 *
 * @see {LLMConfigError} 配置错误
 * @see {LLMAPIError} API 调用失败
 * @see {LLMParseError} 响应解析失败
 */

const { LLMConfigError, LLMAPIError, LLMParseError } = require('./exceptions')

/**
 * 可重试的 HTTP 状态码
 */
const RETRYABLE_STATUS = [429, 500, 502, 503, 504]

/**
 * 可重试的错误码（网络层）
 */
const RETRYABLE_CODES = ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN']

/**
 * 限流相关的消息关键词
 */
const RATE_LIMIT_KEYWORDS = ['rate limit', 'rate limit exceeded', 'too many requests', 'quota exceeded']

/**
 * 检查消息是否包含限流关键词
 * @param {string} message - 错误消息
 * @returns {boolean}
 */
function isRateLimitMessage(message) {
  if (!message || typeof message !== 'string') return false
  const lowerMessage = message.toLowerCase()
  return RATE_LIMIT_KEYWORDS.some(keyword => lowerMessage.includes(keyword))
}

/**
 * 映射错误为适当的异常类型
 *
 * @param {Error} error - 原始错误
 * @param {Object} context - 额外上下文
 * @param {number|null} context.status - HTTP 状态码
 * @param {string|null} context.body - 响应体
 * @param {number|null} context.retryAfter - 重试等待时间（秒）
 * @returns {LLMConfigError|LLMAPIError|LLMParseError}
 */
function mapError(error, context = {}) {
  const { status = null, body = null, retryAfter = null } = context

  // 1. 检查是否为配置错误（无 API Key）
  const errorMessage = error?.message || String(error)
  if (
    errorMessage.includes('API key') ||
    errorMessage.includes('api_key') ||
    errorMessage.includes('API_KEY') ||
    errorMessage.includes('密钥') ||
    errorMessage.includes('未配置')
  ) {
    return new LLMConfigError(errorMessage)
  }

  // 2. 检查是否为 JSON 解析错误
  if (
    error instanceof SyntaxError ||
    errorMessage.includes('Unexpected token') ||
    errorMessage.includes('JSON.parse')
  ) {
    return new LLMParseError(`响应解析失败: ${errorMessage}`, body)
  }

  // 3. HTTP 401: 认证失败（不可重试）
  if (status === 401) {
    return new LLMAPIError(
      `认证失败，请检查 API Key: ${errorMessage}`,
      401,
      false,
      null
    )
  }

  // 4. HTTP 429: 限流（可重试）
  if (status === 429) {
    return new LLMAPIError(
      `请求频率受限: ${errorMessage}`,
      429,
      true,
      retryAfter || 1
    )
  }

  // 5. 检查消息内容是否含限流关键词
  if (isRateLimitMessage(errorMessage)) {
    return new LLMAPIError(
      `请求频率受限: ${errorMessage}`,
      status || 429,
      true,
      retryAfter || 1
    )
  }

  // 6. 5xx 服务器错误（可重试）
  if (status && status >= 500 && status < 600) {
    return new LLMAPIError(
      `服务器错误 (${status}): ${errorMessage}`,
      status,
      true,
      null
    )
  }

  // 7. 网络错误（可重试）
  if (error?.code && RETRYABLE_CODES.includes(error.code)) {
    return new LLMAPIError(
      `网络错误 (${error.code}): ${errorMessage}`,
      null,
      true,
      null
    )
  }

  // 8. 超时错误（可重试）
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('Request timeout')
  ) {
    return new LLMAPIError(
      `请求超时: ${errorMessage}`,
      null,
      true,
      null
    )
  }

  // 9. 默认为不可重试的 API 错误
  return new LLMAPIError(
    `API 调用失败: ${errorMessage}`,
    status,
    false,
    null
  )
}

module.exports = {
  mapError,
  RETRYABLE_STATUS,
  RETRYABLE_CODES
}
