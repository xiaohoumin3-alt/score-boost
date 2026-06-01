/**
 * recordKpRequest 云函数
 * 记录知识点练习请求 + 自动触发预生成（"润物细无声"核心）
 * TDD: Red-Green-Refactor
 */

const {
  calculateHeatScore,
  updateDailyLog
} = require('../shared/heat-calculator');
const { shouldPreGenerate, createPreGenTask } = require('../shared/pregen-trigger');

/**
 * 处理知识点请求（纯逻辑函数，便于测试）
 * @param {Object} cloud - 云开发SDK实例（或mock对象）
 * @param {string} kpId - 知识点ID
 * @returns {Promise<Object>} 处理结果
 */
async function handleKpRequest(cloud, kpId) {
  if (!kpId) {
    return { success: false, error: 'kp_id is required' };
  }

  const db = cloud.database();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  try {
    const collection = db.collection('kp_request_log');
    const docId = String(kpId);

    const existing = await collection.doc(docId).get();

    let newHeatScore, newRequestCount;

    if (existing.data && existing.data.length > 0) {
      const log = existing.data[0];
      const newDailyLog = updateDailyLog(log.daily_log, today);
      newRequestCount = (log.request_count || 0) + 1;
      newHeatScore = calculateHeatScore({
        request_count: newRequestCount,
        last_request_at: now
      });

      await collection.doc(docId).update({
        data: {
          request_count: newRequestCount,
          last_request_at: now,
          heat_score: newHeatScore,
          daily_log: newDailyLog,
          updated_at: now
        }
      });

    } else {
      newRequestCount = 1;
      newHeatScore = calculateHeatScore({ request_count: 1, last_request_at: now });

      await collection.add({
        data: {
          _id: docId,
          request_count: newRequestCount,
          last_request_at: now,
          heat_score: newHeatScore,
          daily_log: [{ date: today, count: 1 }],
          updated_at: now
        }
      });
    }

    // ===== 自动触发预生成检查 =====
    let autoTriggered = false;
    let triggerReason = null;

    try {
      const poolResult = await db.collection('ai_question_pool')
        .where({ kp_id: kpId, verified: true })
        .count();

      const availableCount = poolResult.total || 0;

      const triggerResult = await shouldPreGenerate(
        kpId,
        { heat_score: newHeatScore, request_count: newRequestCount },
        availableCount
      );

      if (triggerResult.shouldTrigger) {
        const taskResult = await createPreGenTask(db, kpId, triggerResult);

        if (taskResult.created) {
          autoTriggered = true;
          triggerReason = triggerResult.reason;

          // 异步调用 pregenWorker（不等待结果）
          cloud.callFunction({
            name: 'pregenWorker',
            data: { async_mode: true }
          }).catch(e => console.error('[AutoTrigger] Worker call failed:', e));
        }
      }
    } catch (triggerError) {
      // 触发检查失败不影响主流程
      console.error('[AutoTrigger] Check failed:', triggerError.message);
    }
    // ===== 自动触发结束 =====

    return {
      success: true,
      heat_score: newHeatScore,
      request_count: newRequestCount,
      auto_triggered: autoTriggered,
      trigger_reason: triggerReason
    };

  } catch (error) {
    console.error('[handleKpRequest] Error:', error);
    return {
      success: false,
      error: error.message || error.errMsg || 'Unknown error'
    };
  }
}

/**
 * 云函数入口（微信云开发标准格式）
 */
exports.main = async (event, context) => {
  // 在实际环境中使用 wx-server-sdk
  // 这里需要 require 但在测试中会被mock
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    return await handleKpRequest(cloud, event.kp_id || event.data?.kp_id);
  } catch (e) {
    // 测试环境不使用 wx-server-sdk
    const { kp_id } = event.data || event;
    return await handleKpRequest({ database: () => ({}), callFunction: async () => ({}) }, kp_id);
  }
};

// 导出供测试使用
module.exports = { handleKpRequest };
