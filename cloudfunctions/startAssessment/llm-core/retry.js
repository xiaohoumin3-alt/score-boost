/**
 * LLM 重试逻辑模块
 *
 * 实现指数退避重试策略，仅对可重试的错误进行重试。
 *
 * 默认配置：
 * - baseDelay: 1000ms（基础延迟）
 * - maxDelay: 60000ms（最大延迟）
 * - maxRetries: 3（最大重试次数）
 */

/**
 * 计算退避延迟时间（指数退避）
 *
 * @param {number} attempt - 当前尝试次数（从 0 开始）
 * @param {number} baseDelay - 基础延迟（毫秒）
 * @param {number} maxDelay - 最大延迟（毫秒）
 * @returns {number} 延迟时间（毫秒）
 */
function calculateDelay(attempt, baseDelay, maxDelay) {
  const delay = baseDelay * Math.pow(2, attempt)
  return Math.min(delay, maxDelay)
}

/**
 * 等待指定时间
 *
 * @param {number} ms - 等待时间（毫秒）
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带重试的异步函数执行
 *
 * @param {Function} fn - 要执行的异步函数
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数（默认 3）
 * @param {number} options.baseDelay - 基础延迟（默认 1000ms）
 * @param {number} options.maxDelay - 最大延迟（默认 60000ms）
 * @param {Function} options.onRetry - 重试回调函数 (attempt, error) => void
 * @returns {Promise<*>} 函数执行结果
 * @throws {Error} 最后一次尝试的错误
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 60000,
    onRetry = null
  } = options

  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // 检查是否可重试
      const isRetryable = error?.retryable === true

      if (!isRetryable || attempt === maxRetries) {
        // 不可重试或已达最大重试次数，抛出错误
        throw error
      }

      // 计算延迟时间
      const delay = calculateDelay(attempt, baseDelay, maxDelay)

      // 如果有 retryAfter，使用它
      const actualDelay = error.retryAfter
        ? Math.min(error.retryAfter * 1000, maxDelay)
        : delay

      // 执行重试回调
      if (typeof onRetry === 'function') {
        onRetry(attempt + 1, error, actualDelay)
      }

      // 等待后重试
      await sleep(actualDelay)
    }
  }

  // 理论上不会到达这里，但为了类型安全
  throw lastError
}

/**
 * 带重试的异步函数执行（带自定义判断逻辑）
 *
 * @param {Function} fn - 要执行的异步函数
 * @param {Function} shouldRetry - 判断是否应该重试的函数 (error) => boolean
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数（默认 3）
 * @param {number} options.baseDelay - 基础延迟（默认 1000ms）
 * @param {number} options.maxDelay - 最大延迟（默认 60000ms）
 * @param {Function} options.onRetry - 重试回调函数
 * @returns {Promise<*>} 函数执行结果
 */
async function retryWithBackoffCustom(fn, shouldRetry, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 60000,
    onRetry = null
  } = options

  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // 使用自定义判断逻辑
      const canRetry = typeof shouldRetry === 'function' ? shouldRetry(error) : false

      if (!canRetry || attempt === maxRetries) {
        throw error
      }

      const delay = calculateDelay(attempt, baseDelay, maxDelay)

      if (typeof onRetry === 'function') {
        onRetry(attempt + 1, error, delay)
      }

      await sleep(delay)
    }
  }

  throw lastError
}

module.exports = {
  retryWithBackoff,
  retryWithBackoffCustom,
  calculateDelay,
  sleep
}
