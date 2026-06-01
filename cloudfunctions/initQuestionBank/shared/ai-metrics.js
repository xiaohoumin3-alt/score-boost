/**
 * AI题目系统监控指标
 */

/**
 * 计算AI题目命中率
 * @param {Object} stats - 统计数据
 * @returns {number} 命中率 0-1
 */
function calculateHitRate(stats) {
  const { total_requests, ai_hits } = stats;
  if (!total_requests || total_requests === 0) {
    return 0;
  }
  return ai_hits / total_requests;
}

/**
 * 计算预生成触发率
 * @param {Object} stats - 统计数据
 * @returns {number} 触发率 0-1
 */
function calculatePregenTriggerRate(stats) {
  const { total_requests, pregen_triggers } = stats;
  if (!total_requests || total_requests === 0) {
    return 0;
  }
  return pregen_triggers / total_requests;
}

/**
 * 计算题目验证率
 * @param {Array} pool - AI题目池
 * @returns {number} 验证率 0-1
 */
function calculateVerificationRate(pool) {
  if (!pool || pool.length === 0) {
    return 0;
  }

  const verified = pool.filter(q => q.verified).length;
  return verified / pool.length;
}

/**
 * 获取系统整体指标
 * @param {Object} requestStats - 请求统计
 * @param {Array} questionPool - AI题目池
 * @returns {Object} 系统指标
 */
function getSystemMetrics(requestStats, questionPool) {
  const hitRate = calculateHitRate(requestStats);
  const triggerRate = calculatePregenTriggerRate(requestStats);
  const verificationRate = calculateVerificationRate(questionPool);

  // 健康状态判断
  let healthStatus = 'unknown';
  if (hitRate >= 0.7 && verificationRate >= 0.5) {
    healthStatus = 'healthy';
  } else if (hitRate >= 0.3 && verificationRate >= 0.2) {
    healthStatus = 'warning';
  } else {
    healthStatus = 'unhealthy';
  }

  return {
    hit_rate: hitRate,
    pregen_trigger_rate: triggerRate,
    verification_rate: verificationRate,
    total_pool_size: questionPool ? questionPool.length : 0,
    health_status: healthStatus,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  calculateHitRate,
  calculatePregenTriggerRate,
  calculateVerificationRate,
  getSystemMetrics
};
