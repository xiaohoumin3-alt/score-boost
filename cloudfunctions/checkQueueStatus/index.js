/**
 * checkQueueStatus 云函数
 * 功能：检查question_queue任务状态
 * TDD: Red-Green-Refactor
 */

let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  cloud = null;
}

/**
 * 检查队列任务状态
 * @param {Object} db - 数据库实例
 * @param {string} queueId - 队列任务ID
 * @returns {Promise<Object>} 状态信息
 */
async function checkQueueStatus(db, queueId) {
  try {
    const result = await db.collection('question_queue').doc(queueId).get();
    const task = result.data;

    if (!task) {
      return { found: false };
    }

    return {
      found: true,
      queue_id: task._id,
      status: task.status,
      assessment_id: task.generated_assessment_id,
      error: task.error,
      retry_count: task.retry_count,
      created_at: task.created_at,
      updated_at: task.updated_at
    };
  } catch (e) {
    console.error('[checkQueueStatus] Error:', e);
    return { found: false, error: e.message };
  }
}

/**
 * 格式化API响应
 * @param {Object} statusData - 状态数据
 * @returns {Object} API响应
 */
function formatStatusResponse(statusData) {
  if (!statusData.found) {
    return {
      success: false,
      error: 'Queue task not found or has expired'
    };
  }

  const response = {
    success: true,
    data: {
      status: statusData.status,
      queue_id: statusData.queue_id
    }
  };

  if (statusData.status === 'completed' && statusData.assessment_id) {
    response.data.assessment_id = statusData.assessment_id;
    response.data.message = '题目已生成完成';
  } else if (statusData.status === 'pending') {
    response.data.message = '题目正在排队生成中...';
  } else if (statusData.status === 'processing') {
    response.data.message = '题目正在生成中...';
  } else if (statusData.status === 'failed') {
    response.data.message = '题目生成失败';
    response.data.error = statusData.error;
    response.data.retry_count = statusData.retry_count;
  } else if (statusData.status === 'cancelled') {
    response.data.message = '任务已取消';
  }

  return response;
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { queue_id } = event.data || event;

  if (!queue_id) {
    return {
      success: false,
      error: 'Missing required parameter: queue_id'
    };
  }

  try {
    console.log('=== checkQueueStatus === queue_id:', queue_id);

    const statusData = await checkQueueStatus(db, queue_id);
    return formatStatusResponse(statusData);

  } catch (e) {
    console.error('checkQueueStatus error:', e);
    return {
      success: false,
      error: e.message || String(e)
    };
  }
};

// 导出供测试使用
Object.assign(exports, {
  checkQueueStatus,
  formatStatusResponse
});
