/**
 * queue_manager 模块
 * 功能：管理question_queue的创建、查询和状态判断
 */

/**
 * 判断是否应该使用队列模式
 * @param {number} poolQuestionCount - 题池已有题目数
 * @param {number} totalNeeded - 需要的题目总数
 * @returns {boolean} 是否使用队列模式
 */
function shouldUseQueueMode(poolQuestionCount, totalNeeded) {
  // 题目数量大于10且题池不足时使用队列模式
  return totalNeeded > 10 && poolQuestionCount < totalNeeded;
}

/**
 * 检查学生是否有活跃的队列任务
 * @param {Object} db - 数据库实例
 * @param {string} studentId - 学生ID
 * @returns {Promise<Object>} 队列状态
 */
async function checkQueueForStudent(db, studentId) {
  try {
    // 查询学生的活跃任务（pending或processing状态）
    const result = await db.collection('question_queue')
      .where({
        student_id: studentId,
        status: db.command.in(['pending', 'processing', 'completed'])
      })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();

    if (result.data.length === 0) {
      return { found: false };
    }

    const task = result.data[0];

    // 检查 processing 任务是否超时（超过5分钟视为卡死）
    if (task.status === 'processing') {
      const taskAge = Date.now() - new Date(task.created_at).getTime();
      const STUCK_THRESHOLD = 5 * 60 * 1000; // 5分钟

      if (taskAge > STUCK_THRESHOLD) {
        console.log(`[checkQueueForStudent] Processing task stuck for ${Math.floor(taskAge / 1000)}s, ignoring`);
        return { found: false }; // 返回未找到，让调用方创建新任务
      }
    }

    return {
      found: true,
      queue_id: task._id,
      status: task.status,
      assessment_id: task.generated_assessment_id,
      created_at: task.created_at
    };
  } catch (e) {
    console.error('[checkQueueForStudent] Error:', e);
    return { found: false, error: e.message };
  }
}

/**
 * 创建队列任务
 * @param {Object} db - 数据库实例
 * @param {Object} taskData - 任务数据
 * @returns {Promise<Object>} 创建结果
 */
async function createQueueTask(db, taskData) {
  try {
    console.log('[createQueueTask] === DIAGNOSTIC LOG START ===');
    console.log('[createQueueTask] taskData:', JSON.stringify(taskData));
    console.log('[createQueueTask] taskData.subject:', taskData.subject, `(type: ${typeof taskData.subject})`);
    console.log('[createQueueTask] === END DIAGNOSTIC LOG ===`);

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const data = {
      ...taskData,
      status: 'pending',
      priority: 1,
      retry_count: 0,
      created_at: now,
      updated_at: now,
      expires_at: expiresAt
    };

    const result = await db.collection('question_queue').add({
      data: data
    });

    console.log('[createQueueTask] Created queue task:', result._id || result.id);
    return {
      success: true,
      queue_id: result._id || result.id
    };
  } catch (e) {
    console.error('[createQueueTask] Error:', e);
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * 取消学生现有的活跃任务
 * @param {Object} db - 数据库实例
 * @param {string} studentId - 学生ID
 * @returns {Promise<Object>} 取消结果
 */
async function cancelActiveTasks(db, studentId) {
  try {
    // 查询活跃任务
    const result = await db.collection('question_queue')
      .where({
        student_id: studentId,
        status: db.command.in(['pending', 'processing'])
      })
      .get();

    if (result.data.length === 0) {
      return { success: true, cancelled: 0 };
    }

    // 批量更新为cancelled状态
    for (const task of result.data) {
      await db.collection('question_queue').doc(task._id).update({
        data: {
          status: 'cancelled',
          updated_at: new Date().toISOString()
        }
      });
    }

    return { success: true, cancelled: result.data.length };
  } catch (e) {
    console.error('[cancelActiveTasks] Error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 格式化队列响应
 * @param {string} queueId - 队列ID
 * @param {string} status - 状态
 * @param {string} assessmentId - 评估ID（completed时）
 * @returns {Object} 格式化的响应
 */
function formatQueuedResponse(queueId, status, assessmentId = null) {
  if (status === 'completed' && assessmentId) {
    return {
      success: true,
      data: {
        status: 'ready',
        assessment_id: assessmentId,
        message: '题目已生成完成'
      }
    };
  }

  return {
    success: true,
    data: {
      status: 'queued',
      queue_id: queueId,
      queue_status: status,
      message: status === 'pending'
        ? '题目正在生成中，请稍候...'
        : '题目正在准备中，请稍候...'
    }
  };
}

module.exports = {
  shouldUseQueueMode,
  checkQueueForStudent,
  createQueueTask,
  cancelActiveTasks,
  formatQueuedResponse
};
