/**
 * 生成题目步骤
 *
 * 职责：调用 AI 生成题目
 */

const { BaseStep } = require('../BaseStep');
const { STEP_OUTPUT_KEYS } = require('../constants');

/**
 * 生成题目步骤
 */
class GenerateStep extends BaseStep {
  /**
   * @param {Function} generateAi - AI生成函数
   */
  constructor(generateAi) {
    super('Generate', {
      checkCancelled: true,  // 需要取消检测
      outputKey: STEP_OUTPUT_KEYS.QUESTIONS
    });
    this.generateAi = generateAi;
  }

  /**
   * 执行步骤：调用 AI 生成题目
   * @param {TaskContext} ctx - 任务上下文
   * @returns {Promise<StepResult>} 执行结果
   */
  async execute(ctx) {
    const { task } = ctx;

    console.log('[GenerateStep] === START ===');
    console.log('[GenerateStep] task._id:', task._id);
    console.log('[GenerateStep] task.subject:', task.subject);
    console.log('[GenerateStep] task.num_questions:', task.num_questions);
    console.log('[GenerateStep] task.difficulty_distribution:', JSON.stringify(task.difficulty_distribution));

    try {
      // 调用 generateQuestionsForTask 生成题目
      const { generateQuestionsForTask } = require('../utils/generateQuestions');
      console.log('[GenerateStep] Calling generateQuestionsForTask...');
      const questions = await generateQuestionsForTask(task, this.generateAi, ctx.db);

      console.log('[GenerateStep] generateQuestionsForTask returned, count:', questions?.length || 0);

      if (!Array.isArray(questions) || questions.length === 0) {
        console.log('[GenerateStep] ERROR: No questions generated!');
        console.log('[GenerateStep] questions type:', typeof questions);
        console.log('[GenerateStep] questions value:', JSON.stringify(questions));
        // 标记为失败，触发回滚更新队列状态为 failed
        return {
          success: false,
          error: new Error('No questions generated'),
          shouldAbort: true  // 重要：必须触发回滚，让队列状态更新为 failed
        };
      }

      console.log('[GenerateStep] SUCCESS, returning', questions.length, 'questions');
      return {
        success: true,
        data: {
          [STEP_OUTPUT_KEYS.QUESTIONS]: questions
        }
      };
    } catch (error) {
      if (error.message === 'TASK_CANCELLED') {
        return {
          success: false,
          error,
          shouldAbort: false // 取消操作不需要回滚
        };
      }
      return {
        success: false,
        error,
        shouldAbort: true // AI生成失败需要回滚状态
      };
    }
  }
}

module.exports = { GenerateStep };
