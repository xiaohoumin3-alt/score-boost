/**
 * manualTriggerQueue 云函数
 * 功能：手动触发 questionGenerator 处理队列
 * 用途：诊断和手动处理卡住的任务
 */

let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  cloud = null;
}

/**
 * 云函数入口 - 手动触发队列处理
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const startTime = Date.now();

  try {
    console.log('=== manualTriggerQueue === started at', new Date().toISOString());

    // 1. 检查待处理任务数量
    const pendingCount = await db.collection('question_queue')
      .where({ status: 'pending' })
      .count();

    console.log('[manualTriggerQueue] Pending tasks count:', pendingCount.total || 0);

    // 2. 获取目标任务状态
    const TARGET_QUEUE_ID = '669eebf36a17092800eea1aa0a8c721b';
    const targetTask = await db.collection('question_queue').doc(TARGET_QUEUE_ID).get();

    if (targetTask.data) {
      console.log('[manualTriggerQueue] Target task status:', targetTask.data.status);

      // 如果任务是 pending 状态，提高优先级
      if (targetTask.data.status === 'pending') {
        console.log('[manualTriggerQueue] Boosting target task priority to 999');
        await db.collection('question_queue').doc(TARGET_QUEUE_ID).update({
          data: {
            priority: 999,
            updated_at: new Date()
          }
        });
      }
    } else {
      console.log('[manualTriggerQueue] Target task not found');
    }

    // 3. 调用 questionGenerator 处理队列
    console.log('[manualTriggerQueue] Calling questionGenerator...');
    const triggerResult = await cloud.callFunction({
      name: 'questionGenerator',
      data: { manualTrigger: true }
    });

    const duration = Date.now() - startTime;
    console.log('[manualTriggerQueue] Completed in', duration, 'ms');

    return {
      success: true,
      pending_count: pendingCount.total || 0,
      target_status: targetTask.data?.status || 'not_found',
      duration: duration,
      trigger_result: triggerResult
    };

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error('[manualTriggerQueue] Error after', duration, 'ms:', e);

    return {
      success: false,
      error: e.message || String(e),
      duration: duration
    };
  }
};
