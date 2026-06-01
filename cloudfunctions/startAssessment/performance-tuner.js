/**
 * 性能调优模块
 * 功能：根据监控数据调整系统参数
 */

/**
 * 计算最优轮询间隔
 * @param {Object} params - 参数
 * @param {number} params.avg_response_time - 平均响应时间（毫秒）
 * @param {number} params.p95_response_time - P95响应时间（毫秒）
 * @returns {number} 推荐的轮询间隔（毫秒）
 */
function calculateOptimalPollInterval(params = {}) {
  const {
    avg_response_time = 500,
    p95_response_time = 2000
  } = params;

  // 轮询间隔应该大于平均响应时间，小于P95响应时间
  // 取平均值的1.5倍作为安全边界
  const optimalInterval = Math.max(300, Math.min(avg_response_time * 1.5, p95_response_time * 0.8));

  return Math.floor(optimalInterval);
}

/**
 * 计算批量生成最优批次大小
 * @param {Object} params - 参数
 * @param {number} params.avg_generation_time - 平均单题生成时间（毫秒）
 * @param {number} params.target_duration - 目标总时长（毫秒）
 * @returns {number} 推荐的批次大小
 */
function calculateOptimalBatchSize(params = {}) {
  const {
    avg_generation_time = 5000,
    target_duration = 15000
  } = params;

  // 单题时间限制在15秒内，最多3题并行
  const maxSingleTime = target_duration * 0.8;
  const maxQuestions = Math.floor(maxSingleTime / avg_generation_time);

  // 限制在1-5题之间
  return Math.max(1, Math.min(maxQuestions, 5));
}

/**
 * 判断是否需要预热缓存
 * @param {Object} params - 参数
 * @param {number} params.hit_rate - 当前命中率（0-1）
 * @param {number} params.request_count - 总请求数
 * @returns {boolean} 是否需要预热
 */
function shouldPreWarmCache(params = {}) {
  const {
    hit_rate = 0.5,
    request_count = 100
  } = params;

  // 命中率低于60%且请求数大于50时需要预热
  return hit_rate < 0.6 && request_count > 50;
}

/**
 * 计算预热所需题目数量
 * @param {Object} params - 参数
 * @param {number} params.daily_requests - 日均请求数
 * @param {number} params.current_questions - 当前题目数
 * @returns {number} 需要预热的题目数量
 */
function calculatePreWarmQuestions(params = {}) {
  const {
    daily_requests = 1000,
    current_questions = 100
  } = params;

  // 目标：题目数达到日均请求数的20%
  const targetQuestions = Math.ceil(daily_requests * 0.2);
  const needed = Math.max(0, targetQuestions - current_questions);

  return needed;
}

/**
 * 调整扩容阈值
 * @param {Object} params - 参数
 * @param {number} params.current_hit_rate - 当前命中率
 * @param {number} params.current_threshold - 当前阈值
 * @returns {number} 调整后的阈值
 */
function adjustExpansionThreshold(params = {}) {
  const {
    current_hit_rate = 0.8,
    current_threshold = 3
  } = params;

  // 命中率越高，扩容阈值越低（更激进）
  // 命中率越低，扩容阈值越高（更保守）
  if (current_hit_rate > 0.8) {
    // 高命中率，降低阈值
    return Math.max(1, current_threshold - 1);
  } else if (current_hit_rate < 0.5) {
    // 低命中率，提高阈值
    return Math.min(10, current_threshold + 1);
  }

  return current_threshold;
}

/**
 * 计算性能指标
 * @param {Object} params - 参数
 * @param {number} params.total_requests - 总请求数
 * @param {number} params.cache_hits - 缓存命中数
 * @param {number} params.pool_hits - 题池命中数
 * @param {number} params.api_calls - API调用数
 * @returns {Object} 性能指标
 */
function calculatePerformanceMetrics(params = {}) {
  const {
    total_requests = 100,
    cache_hits = 0,
    pool_hits = 0,
    api_calls = 0
  } = params;

  if (total_requests === 0) {
    return {
      total_requests: 0,
      cache_hit_rate: 0,
      pool_hit_rate: 0,
      api_call_rate: 0,
      overall_hit_rate: 0
    };
  }

  const cache_hit_rate = cache_hits / total_requests;
  const pool_hit_rate = pool_hits / total_requests;
  const api_call_rate = api_calls / total_requests;
  const overall_hit_rate = (cache_hits + pool_hits) / total_requests;

  return {
    total_requests,
    cache_hit_rate,
    pool_hit_rate,
    api_call_rate,
    overall_hit_rate
  };
}

/**
 * 生成性能优化建议
 * @param {Object} metrics - 性能指标
 * @returns {Array} 建议列表
 */
function generateOptimizationSuggestions(metrics = {}) {
  const suggestions = [];

  // 分析命中率
  if (metrics.overall_hit_rate < 0.6) {
    suggestions.push({
      priority: 'high',
      type: 'cache',
      message: '整体命中率低于60%，建议增加题池预热'
    });
  } else if (metrics.overall_hit_rate > 0.9) {
    suggestions.push({
      priority: 'low',
      type: 'cache',
      message: '整体命中率超过90%，题池充足'
    });
  }

  // 分析API调用
  if (metrics.api_call_rate > 0.4) {
    suggestions.push({
      priority: 'high',
      type: 'generation',
      message: 'API调用率超过40%，建议增加预生成任务'
    });
  }

  // 分析缓存命中
  if (metrics.cache_hit_rate < metrics.pool_hit_rate) {
    suggestions.push({
      priority: 'medium',
      type: 'cache',
      message: '缓存命中率低于题池，考虑启用Redis缓存'
    });
  }

  return suggestions;
}

module.exports = {
  calculateOptimalPollInterval,
  calculateOptimalBatchSize,
  shouldPreWarmCache,
  calculatePreWarmQuestions,
  adjustExpansionThreshold,
  calculatePerformanceMetrics,
  generateOptimizationSuggestions
};
