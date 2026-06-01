/**
 * 队列管理器
 * 用途：支持questionGenerator处理两种队列（用户任务、预生成任务）
 */

/**
 * 获取待处理的队列任务
 * @param {Object} db - 数据库实例
 * @param {number} maxTasks - 最大任务数
 * @param {string} queueType - 队列类型：'question_queue' | 'pregen_queue'
 * @returns {Promise<Array>} 任务列表
 */
async function fetchPendingTasks(db, maxTasks = 3, queueType = 'question_queue') {
  const collection = queueType === 'pregen_queue' ? 'pregen_queue' : 'question_queue';

  try {
    const result = await db.collection(collection)
      .where({ status: 'pending' })
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'asc')
      .limit(maxTasks)
      .get();

    console.log(`[QueueManager] Fetched ${result.data?.length || 0} tasks from ${collection}`);
    return result.data || [];
  } catch (e) {
    console.error(`[QueueManager] Failed to fetch tasks:`, e.message);
    return [];
  }
}

/**
 * 更新任务状态
 * @param {Object} db - 数据库实例
 * @param {string} taskId - 任务ID
 * @param {string} status - 新状态：'pending' | 'processing' | 'completed' | 'failed'
 * @param {Object} updates - 其他更新字段
 * @param {string} queueType - 队列类型
 * @returns {Promise<boolean>} 是否成功
 */
async function updateTaskStatus(db, taskId, status, updates = {}, queueType = 'question_queue') {
  const collection = queueType === 'pregen_queue' ? 'pregen_queue' : 'question_queue';

  try {
    await db.collection(collection).doc(taskId).update({
      status,
      updated_at: new Date().toISOString(),
      ...updates
    });
    console.log(`[QueueManager] Updated task ${taskId} status to ${status}`);
    return true;
  } catch (e) {
    console.error(`[QueueManager] Failed to update task ${taskId}:`, e.message);
    return false;
  }
}

/**
 * 获取任务详情
 * @param {Object} db - 数据库实例
 * @param {string} taskId - 任务ID
 * @param {string} queueType - 队列类型
 * @returns {Promise<Object|null>} 任务详情
 */
async function getTaskById(db, taskId, queueType = 'question_queue') {
  const collection = queueType === 'pregen_queue' ? 'pregen_queue' : 'question_queue';

  try {
    const result = await db.collection(collection).doc(taskId).get();
    return result.data || null;
  } catch (e) {
    console.error(`[QueueManager] Failed to get task ${taskId}:`, e.message);
    return null;
  }
}

/**
 * 创建生成任务记录
 * @param {Object} db - 数据库实例
 * @param {Object} params - 任务参数
 * @returns {Promise<string>} 任务ID
 */
async function createGenerationTask(db, params) {
  const { kp_id, difficulty, question_type = 'choice', source = 'user', source_task_id = null } = params;

  try {
    const result = await db.collection('generation_tasks').add({
      kp_id,
      difficulty,
      question_type,
      source,
      source_task_id,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    console.log(`[QueueManager] Created generation task ${result._id}`);
    return result._id;
  } catch (e) {
    console.error(`[QueueManager] Failed to create generation task:`, e.message);
    throw e;
  }
}

/**
 * 更新生成任务状态
 * @param {Object} db - 数据库实例
 * @param {string} taskId - 任务ID
 * @param {string} status - 状态
 * @param {Object} result - 生成结果
 * @returns {Promise<boolean>}
 */
async function updateGenerationTaskStatus(db, taskId, status, result = {}) {
  try {
    await db.collection('generation_tasks').doc(taskId).update({
      status,
      result,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    });
    return true;
  } catch (e) {
    console.error(`[QueueManager] Failed to update generation task ${taskId}:`, e.message);
    return false;
  }
}

module.exports = {
  fetchPendingTasks,
  updateTaskStatus,
  getTaskById,
  createGenerationTask,
  updateGenerationTaskStatus
};