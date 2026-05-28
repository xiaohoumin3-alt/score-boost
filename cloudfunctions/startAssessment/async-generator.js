/**
 * async-generator 模块
 * 功能：封装异步题目生成逻辑，供 startAssessment 调用
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 最大轮询次数（30秒 @ 500ms间隔）
 */
const MAX_POLLS = 60;

/**
 * 轮询间隔（毫秒）
 */
const POLL_INTERVAL = 500;

/**
 * 启动异步题目生成
 * @param {Object} params - 生成参数
 * @param {string} params.kp_id - 知识点ID
 * @param {string} params.kp_name - 知识点名称
 * @param {string} params.difficulty - 难度
 * @param {number} params.count - 题目数量
 * @returns {Promise<Object>} { success, task_id?, error? }
 */
async function startAsyncGeneration(params) {
  try {
    console.log('[async-generator] Starting async generation:', params);

    const result = await cloud.callFunction({
      name: 'generateQuestions',
      data: {
        kp_id: params.kp_id,
        kp_name: params.kp_name,
        difficulty: params.difficulty || 'medium',
        count: params.count || 3
      }
    });

    if (result.result && result.result.success) {
      return {
        success: true,
        task_id: result.result.task_id
      };
    } else {
      return {
        success: false,
        error: result.result?.error || result.errMsg || 'Generation failed'
      };
    }
  } catch (e) {
    console.error('[async-generator] Error:', e.message);
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * 查询异步生成进度
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} { success, status, questions?, progress?, error? }
 */
async function queryGenerationProgress(taskId) {
  try {
    const result = await cloud.callFunction({
      name: 'queryProgress',
      data: { task_id: taskId }
    });

    if (result.result && result.result.success) {
      return result.result;
    } else {
      return {
        success: false,
        error: result.errMsg || 'Query failed'
      };
    }
  } catch (e) {
    console.error('[async-generator] Query error:', e.message);
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * 轮询等待生成完成（带超时监控）
 * @param {string} taskId - 任务ID
 * @param {Object} options - 选项
 * @param {number} options.maxPolls - 最大轮询次数
 * @param {number} options.pollInterval - 轮询间隔（毫秒）
 * @param {Object} options.db - 数据库实例（用于监控埋点）
 * @returns {Promise<Object>} { success, status, questions?, error? }
 */
async function pollUntilComplete(taskId, options = {}) {
  const {
    maxPolls = MAX_POLLS,
    pollInterval = POLL_INTERVAL,
    db
  } = options;

  let pollCount = 0;
  const startTime = Date.now();

  while (pollCount < maxPolls) {
    pollCount++;

    const result = await queryGenerationProgress(taskId);

    if (result.success) {
      if (result.status === 'completed' || result.status === 'failed') {
        return result;
      }
    }

    // 等待下一次轮询
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // 轮询超时
  const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

  // 记录监控埋点
  if (db) {
    const { logPollTimeout } = require('./monitoring');
    logPollTimeout(db, {
      task_id: taskId,
      poll_count: pollCount,
      elapsed_seconds: elapsedSeconds
    }).catch(() => {});
  }

  return {
    success: false,
    error: 'Poll timeout',
    status: 'timeout'
  };
}

module.exports = {
  startAsyncGeneration,
  queryGenerationProgress,
  pollUntilComplete,
  MAX_POLLS,
  POLL_INTERVAL
};
