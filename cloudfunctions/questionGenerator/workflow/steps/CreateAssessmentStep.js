/**
 * 创建评估步骤
 *
 * 职责：创建 assessment 记录，支持回滚
 */

const { BaseStep } = require('../BaseStep');
const { STEP_OUTPUT_KEYS } = require('../constants');

/**
 * 生成 UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 创建评估步骤
 */
class CreateAssessmentStep extends BaseStep {
  constructor() {
    super('CreateAssessment', {
      checkCancelled: false,  // 创建评估步骤不需要取消检测（快速操作）
      dependencies: ['SaveQuestions'],
      outputKey: STEP_OUTPUT_KEYS.ASSESSMENT_ID
    });
  }

  /**
   * 执行步骤：创建 assessment 记录
   * @param {TaskContext} ctx - 任务上下文
   * @returns {Promise<StepResult>} 执行结果
   */
  async execute(ctx) {
    const { task, db } = ctx;

    const questionIds = ctx.getRequired(STEP_OUTPUT_KEYS.QUESTION_IDS);

    console.log('[CreateAssessmentStep] === START ===');
    console.log('[CreateAssessmentStep] task._id:', task._id);
    console.log('[CreateAssessmentStep] questionIds count:', questionIds?.length || 0);
    console.log('[CreateAssessmentStep] questionIds:', JSON.stringify(questionIds));

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      console.log('[CreateAssessmentStep] ERROR: No question IDs!');
      return {
        success: false,
        shouldAbort: false,
        error: new Error('No question IDs to link')
      };
    }

    try {
      // 生成 assessment_id
      const assessmentId = generateUUID();
      console.log('[CreateAssessmentStep] Created assessmentId:', assessmentId);

      const result = await db.collection('assessments').add({
        data: {
          assessment_id: assessmentId,  // ✅ 添加 assessment_id 字段
          student_id: task.student_id,
          subject: task.subject,
          grade: task.grade,
          semester: task.semester,
          mode: task.mode,
          question_ids: questionIds,
          status: 'ready',
          created_at: new Date().toISOString()
        }
      });

      console.log('[CreateAssessmentStep] Assessment created, result._id:', result._id);

      return {
        success: true,
        data: {
          [STEP_OUTPUT_KEYS.ASSESSMENT_ID]: assessmentId  // ✅ 返回 assessment_id 而非 _id
        }
      };
    } catch (error) {
      return {
        success: false,
        shouldAbort: true, // 触发回滚 SaveQuestionsStep 保存的题目
        error
      };
    }
  }

  /**
   * 回滚：删除创建的 assessment 记录（使用 assessment_id 精确匹配）
   * @param {TaskContext} ctx - 任务上下文
   */
  async rollback(ctx) {
    const { task, db, state } = ctx;
    const assessmentId = state.get(STEP_OUTPUT_KEYS.ASSESSMENT_ID);

    // 使用 assessment_id 精确匹配，避免误删其他任务的assessment
    await db.collection('assessments')
      .where({
        assessment_id: assessmentId  // ✅ 使用 assessment_id 精确匹配
      })
      .remove();
  }
}

module.exports = { CreateAssessmentStep };
