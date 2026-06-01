/**
 * queryProgress 云函数
 * 功能：查询异步生成任务进度
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    const { task_id } = event;

    if (!task_id) {
      return {
        success: false,
        error: 'task_id is required'
      };
    }

    const result = await db.collection('generation_tasks').doc(task_id).get();
    const task = result.data;

    if (!task) {
      return {
        success: false,
        error: 'Task not found'
      };
    }

    // 根据任务状态返回相应数据
    const response = {
      success: true,
      task_id: task._id,
      status: task.status
    };

    if (task.status === 'completed') {
      response.questions = task.questions || [];
    } else if (task.status === 'processing') {
      response.progress = task.progress || 0;
      response.total = task.count || 0;
    } else if (task.status === 'failed') {
      response.error = task.error || 'Unknown error';
    }

    return response;

  } catch (e) {
    console.error('[queryProgress] Error:', e.message);
    return {
      success: false,
      error: e.message
    };
  }
};
