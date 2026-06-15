/**
 * generateMockAssessments 云函数
 * 生成模拟测评数据，为 IRT 模型积累答题记录
 * 模拟不同能力水平学生的答题结果
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 根据学生能力值 θ 和题目参数计算答对概率（2PL 模型）
 */
function probability(theta, a, b) {
  const z = a * (theta - b);
  if (z > 20) return 0.9999;
  if (z < -20) return 0.0001;
  return 1 / (1 + Math.exp(-z));
}

/**
 * 模拟学生答题
 */
function simulateAnswer(theta, question) {
  const a = question.irt_a || 1.0;
  const b = question.irt_b || 0;
  const p = probability(theta, a, b);

  // 基于概率返回布尔结果
  return Math.random() < p;
}

/**
 * 为给定能力值的学生生成一次测评结果
 */
async function generateAssessmentResult(db, theta, subject, grade) {
  const _ = db.command;

  // 随机选取题目（优先选择指定年级，如果没有则选择任何年级）
  let query = { subject: subject || 'math' };
  if (grade) query.grade = String(grade);

  let questions = await db.collection('ai_question_pool')
    .where(query)
    .limit(100)
    .get();

  // 如果指定年级没有题目，则使用任何年级
  if (questions.data.length === 0 && grade) {
    questions = await db.collection('ai_question_pool')
      .where({ subject: subject || 'math' })
      .limit(100)
      .get();
  }

  // 如果指定科目没有题目，则使用任何科目
  if (questions.data.length === 0) {
    questions = await db.collection('ai_question_pool')
      .limit(100)
      .get();
  }

  if (questions.data.length === 0) {
    throw new Error(`没有找到题目`);
  }

  // 选取所有可用题目（如果少于20道）
  const selected = questions.data;

  // 生成答题结果
  const results = selected.map(q => {
    const isCorrect = simulateAnswer(theta, q);
    return {
      question_id: q._id,
      is_correct: isCorrect,
    };
  });

  // 创建模拟测评记录
  const assessmentId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const correctCount = results.filter(r => r.is_correct).length;

  await db.collection('assessments').add({
    data: {
      assessment_id: assessmentId,
      subject: subject || 'math',
      grade: String(grade) || '8',
      status: 'completed',
      source: 'mock',
      theta: theta,
      question_ids: selected.map(q => q._id),
      results: results.map((r, i) => ({
        question_id: r.question_id,
        is_correct: r.isCorrect,
        knowledge_point: selected[i].kp_name,
        knowledge_point_id: selected[i].kp_id,
      })),
      score: {
        total_correct: correctCount,
        total_questions: results.length,
        score_percent: Math.round(correctCount / results.length * 1000) / 10,
      },
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }
  });

  // 更新题目统计
  for (const r of results) {
    const incData = { usage_count: 1 };
    if (r.is_correct) incData.correct_count = 1;

    await db.collection('ai_question_pool')
      .doc(r.question_id)
      .update({
        data: incData
      });
  }

  return {
    assessment_id: assessmentId,
    correct_count: correctCount,
    total_questions: results.length,
    score_percent: Math.round(correctCount / results.length * 1000) / 10,
  };
}

exports.main = async (event) => {
  const { action = 'generate', count = 10, subject = 'math', grade = 8 } = event;
  const db = cloud.database();

  if (action === 'generate') {
    const results = [];

    // 生成不同能力水平的学生测评
    // θ 范围: -2（低能力）到 +2（高能力）
    const thetaLevels = [-2, -1, -0.5, 0, 0.5, 1, 1.5, 2];

    for (let i = 0; i < count; i++) {
      const theta = thetaLevels[i % thetaLevels.length];
      try {
        const result = await generateAssessmentResult(db, theta, subject, grade);
        results.push({ ...result, theta });
        console.log(`[generateMockAssessments] Generated ${i + 1}/${count}: theta=${theta}, score=${result.score_percent}%`);
      } catch (e) {
        console.error(`[generateMockAssessments] Failed ${i + 1}:`, e.message);
        results.push({ error: e.message });
      }
    }

    return {
      success: true,
      data: {
        generated: results.filter(r => !r.error).length,
        failed: results.filter(r => r.error).length,
        results: results,
      }
    };
  }

  return { success: false, error: 'Unknown action' };
};
