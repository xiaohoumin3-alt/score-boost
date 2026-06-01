/**
 * 任务上下文模块
 *
 * 提供工作流执行期间的任务上下文，包括：
 * - 任务数据
 * - 数据库连接
 * - 步骤间数据传递（state）
 * - 执行元数据
 */

const { STEP_OUTPUT_KEYS } = require('./constants');

/**
 * 创建任务上下文
 * @param {Object} task - 队列任务
 * @param {Object} db - 数据库实例
 * @returns {TaskContext} 任务上下文
 */
function createContext(task, db) {
  const state = new Map();

  return {
    task,
    db,
    state,
    metadata: {
      startTime: Date.now(),
      stepHistory: [],
      currentStep: -1
    },
    /**
     * 安全获取状态数据
     * @param {string} key - 状态键名（建议使用 STEP_OUTPUT_KEYS 常量）
     * @returns {*} 状态值
     * @throws {Error} 当键不存在时抛出明确错误
     */
    getRequired(key) {
      if (!state.has(key)) {
        throw new Error(
          `Required state key "${key}" not found. ` +
          `Available keys: [${Array.from(state.keys()).join(', ')}]`
        );
      }
      return state.get(key);
    }
  };
}

module.exports = {
  createContext,
  STEP_OUTPUT_KEYS
};
