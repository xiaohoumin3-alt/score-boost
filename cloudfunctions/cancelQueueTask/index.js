const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  const { queue_id } = event;

  if (!queue_id) {
    return { success: false, error: '缺少 queue_id' };
  }

  try {
    // 更新队列任务状态为 cancelled
    await db.collection('question_queue').doc(queue_id).update({
      data: {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        cancelled_by: 'user'
      }
    });

    console.log(`[cancelQueueTask] Task ${queue_id} cancelled`);
    return { success: true };
  } catch (e) {
    console.error('[cancelQueueTask] Error:', e);
    return { success: false, error: e.message };
  }
};
