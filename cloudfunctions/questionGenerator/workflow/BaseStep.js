/**
 * 工作流步骤基类
 *
 * 提供统一的步骤接口和默认实现
 */

class BaseStep {
  /**
   * @param {string} name - 步骤名称
   * @param {Object} options - 步骤选项
   * @param {boolean} options.checkCancelled - 是否检测取消
   * @param {Array<string>} options.dependencies - 依赖的步骤名称列表
   * @param {string} options.outputKey - 输出数据键名
   */
  constructor(name, options = {}) {
    this.name = name;
    this.checkCancelled = options.checkCancelled || false;
    this.dependencies = options.dependencies || [];
    this.outputKey = options.outputKey || null;
  }

  /**
   * 执行步骤（子类必须实现）
   * @param {TaskContext} ctx - 任务上下文
   * @returns {Promise<StepResult>} 执行结果
   * @throws {Error} 如果子类未实现
   */
  async execute(ctx) {
    throw new Error(`Step "${this.name}" must implement execute() method`);
  }

  /**
   * 回滚步骤（子类可选实现）
   * @param {TaskContext} ctx - 任务上下文
   * @returns {Promise<void>}
   */
  async rollback(ctx) {
    // 默认无回滚操作
  }

  /**
   * 获取步骤输出键名
   * @returns {string|null} 输出键名
   */
  getOutputKey() {
    return this.outputKey;
  }
}

module.exports = { BaseStep };
