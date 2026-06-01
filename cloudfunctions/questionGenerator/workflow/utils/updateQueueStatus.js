/**
 * 更新队列任务状态
 * @param {Object} db - 数据库实例
 * @param {string} queueId - 队列任务ID
 * @param {string} status - 新状态
 * @param {Object} extraFields - 额外字段
 * @returns {Promise<Object>} 更新结果
 */
async function updateQueueStatus(db, queueId, status, extraFields = {}) {
  try {
    const updateData = {
      status,
      updated_at: new Date().toISOString(),
      ...extraFields
    };

    await db.collection('question_queue').doc(queueId).update({
      data: updateData
    });
    console.log(`[updateQueueStatus] Updated ${queueId} to ${status}`);

    return { success: true };
  } catch (e) {
    console.error('[updateQueueStatus] Error:', e);
    return { success: false, error: e.message };
  }
}

module.exports = { updateQueueStatus };
