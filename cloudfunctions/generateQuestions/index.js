/**
 * generateQuestions 云函数
 * 功能：异步生成题目，返回task_id供客户端轮询
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 异步生成题目（不阻塞响应）
 * @param {string} taskId - 任务ID
 * @param {Object} params - 生成参数
 */
async function generateQuestionsAsync(taskId, params) {
  const { kp_id, kp_name, difficulty, count } = params;
  const db = cloud.database();

  try {
    console.log(`[GenerateAsync] START task:${taskId} kp:${kp_id} count:${count}`);

    // 调用generateAiQuestion云函数
    const result = await cloud.callFunction({
      name: 'generateAiQuestion',
      data: {
        kp_id,
        kp_name,
        difficulty,
        count,
        skip_image: true
      }
    });

    if (result.result && result.result.success) {
      // 兼容两种格式：result.questions（数组）或 result.data.questions（混合模式）或 result.data（单个对象）
      let questions = result.result.questions || [];
      if (result.result.data) {
        if (Array.isArray(result.result.data)) {
          questions = result.result.data;
        } else if (result.result.data.questions) {
          questions = result.result.data.questions;
        } else if (result.result.data.question) {
          // 单个题目转为数组
          questions = [result.result.data];
        }
      }

      // 更新任务进度
      await db.collection('generation_tasks').doc(taskId).update({
        status: 'completed',
        progress: questions.length,
        questions
      });

      console.log(`[GenerateAsync] COMPLETED task:${taskId} questions:${questions.length}`);
    } else {
      throw new Error(result.errMsg || 'Generate failed');
    }
  } catch (e) {
    console.error(`[GenerateAsync] FAILED task:${taskId}:`, e.message);

    await db.collection('generation_tasks').doc(taskId).update({
      status: 'failed',
      error: e.message
    });
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    const { kp_id, kp_name, difficulty = 'medium', count = 3 } = event;

    // 创建任务记录
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.collection('generation_tasks').add({
      _id: taskId,
      kp_id,
      kp_name,
      difficulty,
      count,
      status: 'processing',
      progress: 0,
      questions: [],
      created_at: new Date()
    });

    console.log(`[GenerateQuestions] Created task:${taskId}`);

    // 异步生成（不阻塞响应）
    generateQuestionsAsync(taskId, { kp_id, kp_name, difficulty, count });

    // 立即返回任务ID
    return {
      success: true,
      task_id: taskId
    };

  } catch (e) {
    console.error('[GenerateQuestions] Error:', e.message);
    return {
      success: false,
      error: e.message
    };
  }
};

// 导出供测试使用
exports.generateQuestionsAsync = generateQuestionsAsync;
