/**
 * 清理指定任务的部分生成题目（用于事务性回滚）
 * @param {Object} db - 数据库实例
 * @param {string} taskId - 队列任务ID
 */
async function cleanupPartialQuestionsByTask(db, taskId) {
  try {
    // 删除ai_question_pool中关联的未验证题目（通过temp_task_id）
    await db.collection('ai_question_pool')
      .where({ temp_task_id: taskId, verified: false })
      .remove();

    console.log('[cleanup] Partial questions cleaned up for task:', taskId);
  } catch (e) {
    console.error('[cleanupByTask] Error:', e);
  }
}

module.exports = { cleanupPartialQuestionsByTask };
