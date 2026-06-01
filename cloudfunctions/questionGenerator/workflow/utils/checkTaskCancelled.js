/**
 * 检查任务是否被取消
 * @param {Object} db - 数据库实例
 * @param {string} queueId - 队列任务ID
 * @returns {Promise<boolean>} 是否被取消
 */
async function checkTaskCancelled(db, queueId) {
  try {
    const result = await db.collection('question_queue').doc(queueId).get();
    const task = result.data;
    return !!(task && task.status === 'cancelled');
  } catch (e) {
    return false;
  }
}

module.exports = { checkTaskCancelled };
