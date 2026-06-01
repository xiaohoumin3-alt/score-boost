/**
 * 练习云函数
 */

// 测试环境不使用 wx-server-sdk
let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  // 测试环境，cloud 将在测试中传入
  cloud = null;
}

const { generateQuestions } = require('./question_bank');
const { loadKnowledgeTree, generateQuestionPlan } = require('./knowledge_tree');

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const kpId = params.knowledge_point_id || params.kpId;
    const weakPoints = params.weak_points || [];
    const numQuestions = parseInt(params.num_questions || params.numQuestions || 5);
    const grade = String(params.grade || '8');
    const subject = params.subject || 'math';

    const sessionId = generateUUID();

    // 决定练习的知识点了
    let plan = [];
    if (weakPoints && weakPoints.length > 0) {
      // 根据诊断薄弱点练习 - 每个知识点生成 numQuestions 道题
      for (const wp of weakPoints) {
        for (let i = 0; i < numQuestions; i++) {
          plan.push({
            kp: { kp_id: wp.kp_id || wp.id, kp_name: wp.kp_name || wp.name, chapter_name: wp.chapter || '' },
            difficulty: 'medium',
          });
        }
      }
    } else if (kpId) {
      // 指定单一知识点 - 生成该知识点的多道练习题
      const kpName = params.kp_name || params.kpName || '';
      const chapter = params.chapter || '';
      for (let i = 0; i < numQuestions; i++) {
        plan.push({ kp: { kp_id: kpId, kp_name: kpName, chapter_name: chapter }, difficulty: 'medium' });
      }
    } else {
      // 随机选择知识点
      const tree = loadKnowledgeTree(subject, grade, '下');
      plan = generateQuestionPlan(tree, numQuestions);
    }

    // 生成题目
    const questions = generateQuestions(plan, numQuestions);

    // 保存练习会话
    const db = cloud.database();
    await db.collection('practices').add({
      data: {
        session_id: sessionId,
        questions: questions,
        status: 'in_progress',
        answers: [],
        created_at: new Date().toISOString(),
      }
    });

    return {
      success: true,
      data: {
        session_id: sessionId,
        questions: questions.map(q => ({
          id: q.id,
          type: q.type,
          content: q.content,
          options: q.options,
          correct_answer: q.correct_answer,
          knowledge_point: q.knowledge_point,
          knowledge_point_id: q.knowledge_point_id,
          difficulty: q.difficulty,
        })),
      }
    };

  } catch (e) {
    console.error('practice error:', e);
    return { success: false, error: e.message || String(e) };
  }
};

/**
 * 集成AI题目消费的题目获取
 * @param {Object} params - 参数
 * @param {string} params.kp_id - 知识点ID
 * @param {string} params.difficulty - 难度
 * @param {number} params.num_questions - 题目数量
 * @returns {Promise<Object>} { questions: [], triggeredPregen: boolean }
 */
async function getQuestionsWithAiFallback(params) {
  const { consumeQuestion } = require('../shared/ai-question-consumer');
  const { shouldTriggerPregen } = require('../shared/pregen-trigger');

  const { kp_id, difficulty, num_questions } = params;
  const questions = [];
  let triggeredPregen = false;

  for (let i = 0; i < num_questions; i++) {
    // 尝试从AI题目池消费
    const aiQuestion = await consumeQuestion(
      cloud ? cloud.database().collection('ai_question_pool') : null,
      kp_id,
      difficulty
    );

    if (aiQuestion) {
      questions.push({
        ...aiQuestion,
        source: 'ai'
      });
    } else {
      // 无AI题目可用，检查是否需要触发预生成
      if (shouldTriggerPregen(kp_id, difficulty)) {
        triggeredPregen = true;
        // TODO: 触发预生成云函数
      }
    }
  }

  return { questions, triggeredPregen };
}

// 导出供测试使用
module.exports = {
  getQuestionsWithAiFallback
};