/**
 * 工作流结果类型定义
 *
 * 定义步骤执行结果和工作流执行结果的类型结构
 */

/**
 * @typedef {Object} StepResult
 * @property {boolean} success - 步骤是否成功
 * @property {*} [data] - 步骤输出数据
 * @property {Error} [error] - 错误对象
 * @property {boolean} [shouldAbort] - 是否触发回滚
 *
 * shouldAbort 业务语义：
 * | 场景 | shouldAbort | 原因 |
 * |------|-------------|------|
 * | 数据保存失败 | true | 回滚已完成的可回滚步骤 |
 * | AI生成失败 | true | 回滚状态更新（如processing状态） |
 * | 用户主动取消 | false | 数据由清理流程处理 |
 * | 数据验证失败 | false | 未产生副作用 |
 * | 任务超时 | false | 由清理流程处理 |
 */

/**
 * @typedef {Object} WorkflowResult
 * @property {boolean} success - 工作流是否成功
 * @property {*} [data] - 工作流输出数据（成功时）
 * @property {Error} [error] - 错误对象（失败时）
 * @property {number} [stoppedAt] - 停止的步骤索引（失败时）
 * @property {boolean} [cancelled] - 是否被取消（取消时）
 * @property {string} [reason] - 取消原因（取消时）
 */

module.exports = {
  // 类型定义仅供文档参考，JavaScript 运行时不检查
};
