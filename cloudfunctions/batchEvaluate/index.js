/**
 * 批量难度评估云函数
 * 支持手工触发批量评估和定时任务
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const { evaluate, EVALUATOR_VERSION } = require('../startAssessment/evaluator');

/**
 * 获取待评估题目
 * @param {number} limit - 每批处理数量
 * @param {string} kpId - 可选，按知识点筛选
 * @returns {Promise<Array>} 待评估题目列表
 */
async function getPendingQuestions(limit = 100, kpId = null) {
  const query = {};

  // 筛选待评估的题目：difficulty_ai 为 null 或不存在
  query.difficulty_ai = _.eq(null);

  if (kpId) {
    query.kp_id = kpId;
  }

  const result = await db.collection('question_bank')
    .where(query)
    .limit(limit)
    .get();

  return result.data || [];
}

/**
 * 更新题目评估结果
 * @param {string} id - 题目ID
 * @param {Object} evaluation - 评估结果
 */
async function updateQuestionEvaluation(id, evaluation) {
  await db.collection('question_bank').where({ _id: id }).update({
    data: {
      difficulty: evaluation.level,
      difficulty_score: evaluation.score,
      difficulty_ai: evaluation
    }
  });
}

/**
 * 执行批量评估
 * @param {Object} params - 参数
 * @param {number} params.limit - 每批处理数量
 * @param {string} params.kpId - 按知识点筛选
 * @returns {Promise<Object>} 批量评估结果
 */
async function executeBatchEvaluate(params = {}) {
  const { limit = 100, kpId = null } = params;

  console.log(`[batchEvaluate] 开始批量评估，limit=${limit}, kpId=${kpId || '全部'}`);

  // 获取待评估题目
  const pending = await getPendingQuestions(limit, kpId);
  console.log(`[batchEvaluate] 待评估题目: ${pending.length} 道`);

  if (pending.length === 0) {
    return { success: 0, failed: 0, total: 0, message: '无待评估题目' };
  }

  // 批量处理
  let success = 0, failed = 0;
  const errors = [];

  for (const q of pending) {
    try {
      const evaluation = await evaluate(q);

      if (evaluation) {
        await updateQuestionEvaluation(q._id, evaluation);
        success++;
        console.log(`[batchEvaluate] ✓ 评估成功: ${q._id} -> ${evaluation.level}`);
      } else {
        failed++;
        console.warn(`[batchEvaluate] ✗ 评估失败（返回null）: ${q._id}`);
      }
    } catch (error) {
      failed++;
      errors.push({ id: q._id, error: error.message });
      console.error(`[batchEvaluate] ✗ 评估异常: ${q._id}`, error.message);
    }
  }

  console.log(`[batchEvaluate] 完成: 成功=${success}, 失败=${failed}`);

  return {
    success,
    failed,
    total: pending.length,
    errors: errors.slice(0, 10) // 最多返回10个错误详情
  };
}

// 云函数入口
exports.main = async (event, context) => {
  const params = event.data || event || {};

  // 支持查询参数
  const kpId = params.kpId || params.kp_id || null;
  const limit = parseInt(params.limit) || 100;
  const dryRun = params.dryRun || false;

  console.log(`[batchEvaluate] 调用参数: kpId=${kpId}, limit=${limit}, dryRun=${dryRun}`);

  // 干跑模式：只返回待评估数量，不实际评估
  if (dryRun) {
    const pending = await getPendingQuestions(limit, kpId);
    return {
      success: true,
      dryRun: true,
      pendingCount: pending.length,
      message: `干跑模式：发现 ${pending.length} 道待评估题目`
    };
  }

  try {
    const result = await executeBatchEvaluate({ limit, kpId });
    return { success: true, ...result };
  } catch (error) {
    console.error('[batchEvaluate] 执行失败:', error);
    return { success: false, error: error.message };
  }
};

// 单独导出供定时任务调用
exports.executeBatchEvaluate = executeBatchEvaluate;
exports.getPendingQuestions = getPendingQuestions;