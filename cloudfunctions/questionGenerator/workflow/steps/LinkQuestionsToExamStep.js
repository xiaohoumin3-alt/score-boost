/**
 * 关联题目到专属测评步骤
 * Phase 7: 将生成的题目 ID 关联到 user_exams 记录
 */

const { BaseStep } = require('../BaseStep');
const { STEP_OUTPUT_KEYS } = require('../constants');
const { isExclusiveMode } = require('../utils/context-builder');

/**
 * 关联题目到专属测评步骤
 * 只在专属测评模式下执行
 */
class LinkQuestionsToExamStep extends BaseStep {
  constructor() {
    super('LinkQuestionsToExam', {
      checkCancelled: false,  // 不需要取消检测
      dependencies: ['SaveQuestions'],
      outputKey: STEP_OUTPUT_KEYS.EXAM_LINKED
    });
  }

  /**
   * 执行步骤：关联题目到 user_exams
   * @param {TaskContext} ctx - 任务上下文
   * @returns {Promise<StepResult>} 执行结果
   */
  async execute(ctx) {
    const { task, db } = ctx;

    console.log('[LinkQuestionsToExamStep] === START ===');
    console.log('[LinkQuestionsToExamStep] task._id:', task._id);
    console.log('[LinkQuestionsToExamStep] task.mode:', task.mode);

    // 只在专属测评模式下执行
    if (!isExclusiveMode(task)) {
      console.log('[LinkQuestionsToExamStep] Not exclusive mode, skipping');
      return {
        success: true,
        data: {
          [STEP_OUTPUT_KEYS.EXAM_LINKED]: false
        }
      };
    }

    // 检查是否有 exam_id
    const examId = task.exam_id;
    if (!examId) {
      console.warn('[LinkQuestionsToExamStep] No exam_id in task, skipping');
      return {
        success: true,
        data: {
          [STEP_OUTPUT_KEYS.EXAM_LINKED]: false,
          reason: 'No exam_id'
        }
      };
    }

    // 获取题目 IDs
    const questionIds = ctx.state.get(STEP_OUTPUT_KEYS.QUESTION_IDS);
    if (!questionIds || questionIds.length === 0) {
      console.warn('[LinkQuestionsToExamStep] No question IDs to link');
      return {
        success: true,
        data: {
          [STEP_OUTPUT_KEYS.EXAM_LINKED]: false,
          reason: 'No question IDs'
        }
      };
    }

    console.log('[LinkQuestionsToExamStep] Linking', questionIds.length, 'questions to exam:', examId);

    try {
      // 更新 user_exams 记录，添加 question_ids
      await db.collection('user_exams').doc(examId).update({
        data: {
          question_ids: questionIds,
          status: 'ready',  // 题目已就绪
          updated_at: new Date().toISOString()
        }
      });

      console.log('[LinkQuestionsToExamStep] Successfully linked questions to exam:', examId);

      return {
        success: true,
        data: {
          [STEP_OUTPUT_KEYS.EXAM_LINKED]: true,
          exam_id: examId,
          question_count: questionIds.length
        }
      };
    } catch (error) {
      console.error('[LinkQuestionsToExamStep] Failed to link questions:', error);
      // 关联失败不影响主流程，题目已保存
      return {
        success: true,
        data: {
          [STEP_OUTPUT_KEYS.EXAM_LINKED]: false,
          error: error.message
        }
      };
    }
  }
}

module.exports = { LinkQuestionsToExamStep };
