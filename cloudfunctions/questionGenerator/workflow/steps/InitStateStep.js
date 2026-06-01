/**
 * 初始化状态步骤
 *
 * 职责：更新队列状态为 processing
 */

const { BaseStep } = require('../BaseStep');

/**
 * 初始化状态步骤
 */
class InitStateStep extends BaseStep {
  constructor() {
    super('InitState', {
      checkCancelled: false  // 状态更新步骤不需要取消检测
    });
  }

  /**
   * 执行步骤：更新队列状态为 processing
   * @param {TaskContext} ctx - 任务上下文
   * @returns {Promise<StepResult>} 执行结果
   */
  async execute(ctx) {
    const { task, db } = ctx;

    console.log('[InitStateStep] === START ===');
    console.log('[InitStateStep] task._id:', task._id);

    try {
      // 使用 updateQueueStatus 函数
      const { updateQueueStatus } = require('../utils/updateQueueStatus');
      console.log('[InitStateStep] Calling updateQueueStatus...');
      const result = await updateQueueStatus(db, task._id, 'processing');

      if (!result.success) {
        console.log('[InitStateStep] FAILED:', result.error);
        return {
          success: false,
          error: new Error(result.error || 'Failed to update status'),
          shouldAbort: true // 状态更新失败需要回滚，避免卡在processing状态
        };
      }

      console.log('[InitStateStep] SUCCESS - status updated to processing');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error,
        shouldAbort: true // 异常时需要回滚，避免卡在processing状态
      };
    }
  }

  /**
   * 回滚步骤：将状态更新为 failed
   * @param {TaskContext} ctx - 任务上下文
   * @returns {Promise<void>}
   */
  async rollback(ctx) {
    const { task, db, error } = ctx;
    try {
      const { updateQueueStatus } = require('../utils/updateQueueStatus');
      // 使用实际错误消息，如果没有则使用默认消息
      const errorMessage = error?.message || 'Workflow rolled back';
      await updateQueueStatus(db, task._id, 'failed', {
        error: errorMessage,
        retry_count: (task.retry_count || 0) + 1
      });
      console.log(`[InitStateStep] Rolled back task:${task._id} to failed`);
    } catch (e) {
      console.error(`[InitStateStep] Rollback failed for task:${task._id}:`, e);
    }
  }
}

module.exports = { InitStateStep };
