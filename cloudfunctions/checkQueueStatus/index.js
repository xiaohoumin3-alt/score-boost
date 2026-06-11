/**
 * checkQueueStatus 云函数
 * 功能：检查question_queue任务状态，支持返回题目数据
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
      type: task.type || 'default',
      status: task.status,
      assessment_id: task.assessment_id || task.generated_assessment_id,  // 支持 parent_assessment 和默认流程
      question_ids: task.question_ids,
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
 * 获取题目列表
 * @param {Object} db - 数据库实例
 * @param {Array<string>} questionIds - 题目ID列表
 * @returns {Promise<Array>} 题目列表
 */
async function fetchQuestions(db, questionIds) {
  if (!questionIds || questionIds.length === 0) {
    return [];
  }

  try {
    const result = await db.collection('ai_question_pool')
      .where({
        _id: db.command.in(questionIds)
      })
      .get();

    return (result.data || []).map(q => ({
      id: q._id,
      content: q.content || q.question,
      options: q.options || [],
      correct_answer: q.correct_answer,
      knowledge_point: q.knowledge_point || q.kp_name || '未知',
      difficulty: q.difficulty || 'medium'
    }));
  } catch (e) {
    console.error('[fetchQuestions] Error:', e);
    return [];
  }
}

/**
 * 格式化API响应
 * @param {Object} statusData - 状态数据
 * @param {Array} questions - 题目列表（可选）
 * @param {string} assessmentId - 评估ID（可选）
 * @param {Object} db - 数据库实例（可选，用于更新记录）
 * @returns {Promise<Object>} API响应
 */
async function formatStatusResponse(statusData, questions = [], assessmentId = undefined, db = undefined) {
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
      queue_id: statusData.queue_id,
      type: statusData.type
    }
  };

  if (statusData.status === 'completed') {
    if (statusData.type === 'parent_assessment' && questions.length > 0) {
      // 亲子测评：返回题目并更新数据库记录
      response.data.questions = questions;
      response.data.message = '题目已生成';

      // 更新 parent_assessments 集合中的 parent_questions 字段
      if (db && assessmentId && questions.length > 0) {
        try {
          console.log('[formatStatusResponse] Updating parent_assessments for assessmentId:', assessmentId);

          const assessmentResult = await db.collection('parent_assessments')
            .where({ assessment_id: assessmentId })
            .get();

          if (assessmentResult.data && assessmentResult.data.length > 0) {
            const assessment = assessmentResult.data[0];
            await db.collection('parent_assessments').doc(assessment._id).update({
              data: {
                status: 'parent_pending',
                parent_questions: questions,
                updated_at: new Date().toISOString()
              }
            });
            console.log('[formatStatusResponse] Updated parent_questions successfully, count:', questions.length);
          } else {
            console.warn('[formatStatusResponse] No assessment found for assessmentId:', assessmentId);
          }
        } catch (e) {
          console.error('[formatStatusResponse] Failed to update parent_assessments:', e);
          // 不影响返回，继续执行
        }
      }
    } else if (statusData.assessment_id) {
      // 默认流程：返回 assessment_id
      response.data.assessment_id = statusData.assessment_id;
      response.data.message = '题目已生成完成';
    }
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

    // 如果任务完成且有 question_ids，获取题目详情
    let questions = [];
    if (statusData.found && statusData.status === 'completed' && statusData.type === 'parent_assessment' && statusData.question_ids) {
      questions = await fetchQuestions(db, statusData.question_ids);
      console.log('[checkQueueStatus] Fetched', questions.length, 'questions for parent_assessment');
    }

    return await formatStatusResponse(statusData, questions, statusData.assessment_id, db);

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
  fetchQuestions,
  formatStatusResponse
});
