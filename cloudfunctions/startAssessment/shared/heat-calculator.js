/**
 * 热度计算器
 * 基于请求频率和时间衰减计算知识点热度 (0-10)
 * TDD: Red-Green-Refactor
 */

/**
 * 计算热度分数
 * @param {Object} log - kp_request_log 文档
 * @returns {number} 热度分数 0-10
 */
function calculateHeatScore(log) {
  if (!log) return 0;

  const now = Date.now();
  const lastRequest = new Date(log.last_request_at || log.updated_at || now).getTime();
  const daysSinceLastRequest = (now - lastRequest) / (1000 * 60 * 60 * 24);

  // 基础热度：请求次数的对数（避免头部效应）
  const baseScore = Math.log10((log.request_count || 0) + 1) * 3;

  // 时间衰减：最近请求的权重更高
  const timeDecay = Math.max(0.05, 1 - daysSinceLastRequest * 0.03);

  return Math.min(10, Math.max(0, baseScore * timeDecay));
}

/**
 * 更新每日日志
 * @param {Array} dailyLog - 现有的 daily_log 数组
 * @param {string} today - 今天的日期字符串 YYYY-MM-DD
 * @param {string} baseDate - 基准日期（用于计算7天前的cutoff），默认为当前日期
 * @returns {Array} 更新后的 daily_log（最多保留7天）
 */
function updateDailyLog(dailyLog = [], today = null, baseDate = null) {
  const dateStr = today || new Date().toISOString().split('T')[0];

  // 查找今天是否已存在
  const existingIndex = dailyLog.findIndex(entry => entry.date === dateStr);

  if (existingIndex >= 0) {
    dailyLog[existingIndex].count = (dailyLog[existingIndex].count || 0) + 1;
  } else {
    dailyLog.push({ date: dateStr, count: 1 });
  }

  // 只保留最近7天
  const refDate = baseDate ? new Date(baseDate) : new Date();
  const sevenDaysAgo = new Date(refDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

  return dailyLog.filter(entry => entry.date >= cutoffDate);
}

/**
 * 获取热度等级
 * @param {number} heatScore - 热度分数
 * @returns {string} 'high' | 'medium' | 'low'
 */
function getHeatLevel(heatScore) {
  if (heatScore >= 7) return 'high';
  if (heatScore >= 4) return 'medium';
  return 'low';
}

/**
 * 根据热度等级获取目标题池大小
 * @param {string} heatLevel - 热度等级
 * @returns {number} 目标题目数量
 */
function getTargetPoolSize(heatLevel) {
  switch (heatLevel) {
    case 'high': return 20;
    case 'medium': return 5;
    case 'low': return 2;
    default: return 2;
  }
}

module.exports = {
  calculateHeatScore,
  updateDailyLog,
  getHeatLevel,
  getTargetPoolSize
};
