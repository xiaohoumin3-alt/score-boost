/**
 * expansion-decision 模块
 * 功能：分析题池短缺情况，决定是否需要扩容
 */

/**
 * 分析题池短缺情况
 * @param {Object} params - 分析参数
 * @param {number} params.demand - 需求题目数量
 * @param {number} params.available - 可用题目数量
 * @param {number} params.available_verified - verified题目数量
 * @param {number} params.available_unverified - unverified题目数量
 * @param {Object} params.kp_gaps - 知识点缺口 { kp_id: { demand, available, heat } }
 * @returns {Object} { shortage_count, affected_kps, available_verified, available_unverified }
 */
function analyzeShortage(params) {
  const demand = params.demand || 0;
  const available = params.available || 0;
  const availableVerified = params.available_verified || 0;
  const availableUnverified = params.available_unverified || 0;
  const kpGaps = params.kp_gaps || {};

  const shortageCount = Math.max(0, demand - available);
  const affectedKps = Object.entries(kpGaps)
    .filter(([_, gap]) => gap.demand > gap.available)
    .map(([kpId, gap]) => ({
      kp_id: kpId,
      demand: gap.demand,
      available: gap.available,
      shortage: gap.demand - gap.available,
      heat: gap.heat || 0
    }));

  return {
    shortage_count: shortageCount,
    affected_kps: affectedKps,
    available_verified: availableVerified,
    available_unverified: availableUnverified
  };
}

/**
 * 决定是否需要扩容
 * @param {Object} shortage - 短缺分析结果
 * @param {Object} recentExpansion - 最近扩容记录 { last_expanded_at }
 * @param {number} threshold - 扩容阈值（短缺数量）
 * @returns {boolean}
 */
function shouldExpand(shortage, recentExpansion = null, threshold = 3) {
  if (!shortage || shortage.shortage_count < threshold) {
    return false;
  }

  // 检查最近是否已扩容（避免重复扩容）
  if (recentExpansion && recentExpansion.last_expanded_at) {
    const expandCooldown = 60 * 60 * 1000; // 1小时冷却时间
    const timeSinceLastExpansion = Date.now() - recentExpansion.last_expanded_at;
    if (timeSinceLastExpansion < expandCooldown) {
      return false;
    }
  }

  return true;
}

/**
 * 计算扩容计划
 * @param {Object} shortage - 短缺分析结果
 * @param {number} countPerKp - 每个知识点生成题目数量
 * @returns {Object} { kp_list, count_per_kp, total_count }
 */
function calculateExpansionPlan(shortage, countPerKp = 3) {
  if (!shortage || shortage.affected_kps.length === 0) {
    return {
      kp_list: [],
      count_per_kp: 0,
      total_count: 0
    };
  }

  // 按热度（heat）和缺口大小排序
  const sortedKps = shortage.affected_kps.sort((a, b) => {
    // 优先考虑缺口大的
    const gapDiff = b.shortage - a.shortage;
    if (gapDiff !== 0) return gapDiff;
    // 其次考虑热度
    return (b.heat || 0) - (a.heat || 0);
  });

  return {
    kp_list: sortedKps,
    count_per_kp: countPerKp,
    total_count: sortedKps.length * countPerKp
  };
}

module.exports = {
  analyzeShortage,
  shouldExpand,
  calculateExpansionPlan
};
