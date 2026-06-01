/**
 * 任务工作流引擎
 *
 * 负责协调执行工作流步骤，提供：
 * - 步骤执行流程控制
 * - 步骤依赖验证
 * - 失败回滚机制
 * - 取消检测支持
 */

const { createContext } = require('./TaskContext');
const { STEP_OUTPUT_KEYS } = require('./constants');

/**
 * 任务工作流引擎
 */
class TaskWorkflow {
  /**
   * @param {Array<WorkflowStep>} steps - 工作流步骤列表
   */
  constructor(steps) {
    this.steps = steps;
  }

  /**
   * 执行工作流
   * @param {Object} task - 队列任务
   * @param {Object} db - 数据库实例
   * @returns {Promise<WorkflowResult>} 执行结果
   */
  async execute(task, db) {
    const ctx = createContext(task, db);
    const completedSteps = [];

    try {
      for (let i = 0; i < this.steps.length; i++) {
        const step = this.steps[i];
        ctx.metadata.currentStep = i;

        // 步骤依赖验证
        this.validateDependencies(step, ctx);

        // 取消检测（步骤执行前）
        if (step.checkCancelled) {
          const cancelled = await this.checkTaskCancelled(db, task._id);
          if (cancelled) {
            return {
              success: false,
              cancelled: true,
              reason: 'Task cancelled by user'
            };
          }
        }

        const result = await step.execute(ctx);

        if (!result.success) {
          // 检查是否是取消操作
          if (result.error && result.error.message === 'TASK_CANCELLED') {
            return {
              success: false,
              cancelled: true,
              reason: 'Task cancelled by user'
            };
          }

          // 根据失败类型决定是否回滚
          if (result.shouldAbort) {
            ctx.error = result.error; // 传递错误给rollback
            await this.rollback(ctx, completedSteps);
            // 每个步骤的rollback方法已负责清理自己的数据，无需额外兜底清理
          }
          return { success: false, error: result.error, stoppedAt: i };
        }

        // 步骤执行成功，不再检查取消（避免竞态条件）
        // 一旦数据已写入，取消状态应被忽略以保证数据一致性

        // 保存步骤输出到上下文（使用约定键名）
        if (result.data !== undefined) {
          for (const [key, value] of Object.entries(result.data)) {
            ctx.state.set(key, value);
          }
        }

        ctx.metadata.stepHistory.push(step.name);
        completedSteps.push(step);
      }

      return { success: true, data: ctx.state };
    } catch (error) {
      // 异常回滚
      ctx.error = error; // 传递错误给rollback
      await this.rollback(ctx, completedSteps);
      return { success: false, error };
    }
  }

  /**
   * 验证步骤依赖
   * @param {WorkflowStep} step - 当前步骤
   * @param {TaskContext} ctx - 任务上下文
   * @throws {Error} 依赖不满足时抛出错误
   */
  validateDependencies(step, ctx) {
    if (!step.dependencies || step.dependencies.length === 0) {
      return;
    }

    for (const depName of step.dependencies) {
      if (!ctx.metadata.stepHistory.includes(depName)) {
        throw new Error(
          `Step "${step.name}" requires "${depName}" to be completed first. ` +
          `Completed steps: [${ctx.metadata.stepHistory.join(', ')}]`
        );
      }

      const dataKey = this.getDataKeyForStep(depName);
      if (!ctx.state.has(dataKey)) {
        throw new Error(
          `Step "${step.name}" dependency "${depName}" has no data in state. ` +
          `Available keys: [${Array.from(ctx.state.keys()).join(', ')}]`
        );
      }
    }
  }

  /**
   * 获取步骤对应的数据键名
   * @param {string} stepName - 步骤名称
   * @returns {string} 数据键名
   */
  getDataKeyForStep(stepName) {
    // 首先尝试从步骤实例获取outputKey
    const step = this.steps.find(s => s.name === stepName);
    if (step && step.outputKey) {
      return step.outputKey;
    }

    // 兼容旧代码：硬编码映射（逐步移除）
    const mapping = {
      'Generate': STEP_OUTPUT_KEYS.QUESTIONS,
      'GenerateStep': STEP_OUTPUT_KEYS.QUESTIONS,
      'SaveQuestions': STEP_OUTPUT_KEYS.QUESTION_IDS,
      'SaveQuestionsStep': STEP_OUTPUT_KEYS.QUESTION_IDS,
      'CreateAssessment': STEP_OUTPUT_KEYS.ASSESSMENT_ID,
      'CreateAssessmentStep': STEP_OUTPUT_KEYS.ASSESSMENT_ID
    };
    return mapping[stepName] || stepName;
  }

  /**
   * 回滚已完成的可回滚步骤
   * @param {TaskContext} ctx - 任务上下文
   * @param {Array<WorkflowStep>} completedSteps - 已完成的步骤
   */
  async rollback(ctx, completedSteps) {
    // 倒序回滚（后进先出）
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const step = completedSteps[i];
      if (step.rollback) {
        try {
          await step.rollback(ctx);
        } catch (e) {
          console.error(`[rollback] Failed for ${step.name}:`, e);
          // 回滚失败继续回滚其他步骤
        }
      }
    }
  }

  /**
   * 检查任务是否被取消
   * @param {Object} db - 数据库实例
   * @param {string} taskId - 任务ID
   * @returns {Promise<boolean>} 是否被取消
   */
  async checkTaskCancelled(db, taskId) {
    try {
      const result = await db.collection('question_queue').doc(taskId).get();
      const task = result.data;
      return !!(task && task.status === 'cancelled');
    } catch (e) {
      return false;
    }
  }
}

module.exports = { TaskWorkflow };
