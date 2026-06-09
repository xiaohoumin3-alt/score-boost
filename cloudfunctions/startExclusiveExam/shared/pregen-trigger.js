/**
 * 预生成触发器
 * 判断是否需要为某知识点预生成题目
 * 核心功能："润物细无声"的自动触发机制
 */

const { getHeatLevel, getTargetPoolSize } = require('./heat-calculator');

/**
 * 判断是否应该触发预生成
 * @param {string} kpId - 知识点ID
 * @param {Object} requestLog - kp_request_log 文档
 * @param {number} availableCount - 当前可用题目数量
 * @returns {Object} { shouldTrigger: boolean, priority: number, targetCount: number, reason: string }
 */
function shouldPreGenerate(kpId, requestLog, availableCount) {
  if (!requestLog) {
    // 无请求记录，仅在题池完全耗尽时保底生成
    return {
      shouldTrigger: availableCount < 2,
      priority: 1,
      targetCount: 2,
      reason: 'no_log_but_empty',
      heatLevel: 'low',
      heatScore: 0
    };
  }

  const heatScore = requestLog.heat_score || 0;
  const heatLevel = getHeatLevel(heatScore);
  const targetCount = getTargetPoolSize(heatLevel);

  // 触发条件 (OR关系):
  // 1. 热度高(>=7) 且 题池不足(<20)
  // 2. 热度中(>=4) 且 题池耗尽(<5)
  // 3. 低热知识点至少保底2题

  const condition1 = heatScore >= 7 && availableCount < targetCount;
  const condition2 = heatScore >= 4 && availableCount < 5;
  const condition3 = availableCount < 2;

  const shouldTrigger = condition1 || condition2 || condition3;

  let reason = 'none';
  if (condition1) reason = 'high_heat_insufficient';
  else if (condition2) reason = 'medium_heat_depleted';
  else if (condition3) reason = 'low_pool_minimum';

  return {
    shouldTrigger,
    priority: heatScore,
    targetCount,
    reason,
    heatLevel,
    heatScore
  };
}

/**
 * 创建预生成任务
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @param {Object} triggerResult - shouldPreGenerate 的返回值
 */
async function createPreGenTask(db, kpId, triggerResult) {
  const { priority, targetCount, reason } = triggerResult;

  try {
    // 检查是否已有 pending/processing 的任务
    const existing = await db.collection('pregen_queue')
      .where({
        kp_id: kpId,
        status: 'pending'
      })
      .get();

    if (existing.data && existing.data.length > 0) {
      return { created: false, reason: 'already_queued' };
    }

    await db.collection('pregen_queue').add({
      data: {
        kp_id: kpId,
        priority: priority,
        target_count: targetCount,
        status: 'pending',
        reason: reason,
        created_at: new Date().toISOString(),
        processed_at: null,
        completed_at: null,
        generated_count: 0
      }
    });

    return { created: true };
  } catch (error) {
    console.error('[createPreGenTask] Error:', error);
    return { created: false, error: error.message };
  }
}

module.exports = {
  shouldPreGenerate,
  createPreGenTask
};
