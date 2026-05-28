/**
 * batch-expansion 模块
 * 功能：批量扩容机制，一次生成多道题目填充题池
 */

const cloud = require('wx-server-sdk');
const { logBatchApiSuccess, logBatchApiFailure } = require('./monitoring');

/**
 * 批量扩容 - 为每个知识点生成指定数量题目
 * @param {Object} params - 扩容参数
 * @param {Array} params.plan - 扩容计划 [{ kp_id, kp_name, difficulty }]
 * @param {number} params.count_per_kp - 每个知识点生成题目数量
 * @param {string} params.subject - 科目
 * @param {Object} params.db - 数据库实例（可选，用于监控埋点）
 * @returns {Object} { success_count, failed_count, generated_questions, errors }
 */
async function batchExpansion(params) {
  const { plan = [], count_per_kp = 3, subject = 'math', db } = params;
  const startTime = Date.now();

  if (plan.length === 0) {
    return {
      success_count: 0,
      failed_count: 0,
      generated_questions: [],
      errors: ['Empty plan provided']
    };
  }

  const results = await Promise.allSettled(
    plan.map(item => generateQuestionsForKp(item, count_per_kp, subject))
  );

  let successCount = 0;
  let failedCount = 0;
  const generatedQuestions = [];
  const errors = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const kpItem = plan[i];
    const duration = Date.now() - startTime;

    if (result.status === 'fulfilled' && result.value) {
      successCount++;
      const questions = result.value.questions || [];
      generatedQuestions.push(...questions);

      // 记录批量API成功
      if (db) {
        logBatchApiSuccess(db, {
          kp_id: kpItem.kp_id,
          count_requested: count_per_kp,
          count_generated: questions.length,
          duration_ms: duration
        }).catch(() => {});
      }
    } else {
      failedCount++;
      const errorMsg = result.reason?.message || 'Generation failed';
      errors.push(`${kpItem.kp_id || 'unknown'}: ${errorMsg}`);

      // 记录批量API失败
      if (db) {
        logBatchApiFailure(db, {
          kp_id: kpItem.kp_id,
          error_code: 'GENERATION_FAILED',
          error_message: errorMsg
        }).catch(() => {});
      }
    }
  }

  return {
    success_count: successCount,
    failed_count: failedCount,
    generated_questions: generatedQuestions,
    errors
  };
}

/**
 * 为单个知识点生成题目
 * @param {Object} kpItem - 知识点信息 { kp_id, kp_name, difficulty }
 * @param {number} count - 生成数量
 * @param {string} subject - 科目
 * @returns {Promise<Object>} { questions }
 */
async function generateQuestionsForKp(kpItem, count, subject) {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

    const result = await cloud.callFunction({
      name: 'generateQuestions',
      data: {
        kp_id: kpItem.kp_id,
        kp_name: kpItem.kp_name || kpItem.kp_id,
        difficulty: kpItem.difficulty || 'medium',
        count,
        subject
      }
    });

    if (!result.result?.success) {
      throw new Error(result.result?.error || 'Generation failed');
    }

    return {
      questions: result.result.questions || []
    };
  } catch (e) {
    throw e;
  }
}

/**
 * 保存题目到题池
 * @param {Object} db - 数据库实例
 * @param {Array} questions - 生成的题目列表
 * @param {Object} metadata - 扩容元数据
 * @returns {Promise<Object>} { saved_count, errors }
 */
async function saveToPool(db, questions, metadata = {}) {
  const savedCount = { count: 0 };
  const errors = [];

  for (const question of questions) {
    try {
      await db.collection('ai_question_pool').add({
        data: {
          question: question.question || question.content,
          options: question.options || [],
          correct_answer: question.correct_answer,
          kp_id: question.kp_id || metadata.kp_id,
          kp_name: question.kp_name || metadata.kp_name,
          difficulty: question.difficulty || 'medium',
          subject: metadata.subject || 'math',
          verified: false,
          source: 'ai_expansion',
          created_at: new Date().toISOString(),
          expansion_id: metadata.expansion_id
        }
      });
      savedCount.count++;
    } catch (e) {
      errors.push(`Failed to save question: ${e.message}`);
    }
  }

  // 记录扩容历史
  if (metadata.expansion_id) {
    try {
      await db.collection('expansion_history').add({
        data: {
          expansion_id: metadata.expansion_id,
          success_count: savedCount.count,
          failed_count: errors.length,
          kp_list: metadata.kp_list || [],
          created_at: new Date().toISOString()
        }
      }).catch(e => {
        errors.push(`Failed to record history: ${e.message}`);
      });
    } catch (e) {
      errors.push(`Failed to record history: ${e.message}`);
    }
  }

  return {
    saved_count: savedCount.count,
    errors
  };
}

/**
 * 触发扩容 - 完整执行扩容流程
 * @param {Object} params - 扩容参数
 * @param {number} params.demand - 需求题目数量
 * @param {number} params.available - 可用题目数量
 * @param {Object} params.kp_gaps - 知识点缺口
 * @param {string} params.subject - 科目
 * @param {number} params.threshold - 扩容阈值
 * @returns {Promise<Object>} 扩容结果
 */
async function triggerExpansion(params) {
  const { analyzeShortage, shouldExpand, calculateExpansionPlan } = require('./expansion-decision');

  // 1. 分析短缺
  const shortage = analyzeShortage(params);

  // 2. 检查是否需要扩容
  const recentExpansion = params.recent_expansion || null;
  if (!shouldExpand(shortage, recentExpansion, params.threshold)) {
    return {
      expanded: false,
      reason: 'Shortage below threshold or recently expanded',
      shortage
    };
  }

  // 3. 计算扩容计划
  const plan = calculateExpansionPlan(shortage, params.count_per_kp);

  if (plan.kp_list.length === 0) {
    return {
      expanded: false,
      reason: 'No knowledge points need expansion',
      shortage
    };
  }

  // 4. 执行批量扩容
  const expansionResult = await batchExpansion({
    plan: plan.kp_list,
    count_per_kp: plan.count_per_kp,
    subject: params.subject
  });

  // 5. 保存到题池
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();

  const saveResult = await saveToPool(db, expansionResult.generated_questions, {
    expansion_id: `exp_${Date.now()}`,
    subject: params.subject,
    kp_list: plan.kp_list.map(k => k.kp_id)
  });

  return {
    expanded: true,
    expansion_result: expansionResult,
    save_result: saveResult,
    plan
  };
}

module.exports = {
  batchExpansion,
  saveToPool,
  triggerExpansion
};
