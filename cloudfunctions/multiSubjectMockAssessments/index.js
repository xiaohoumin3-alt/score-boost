/**
 * multiSubjectMockAssessments 云函数
 * 为多科目生成模拟测评数据，扩展 IRT 数据积累
 * 覆盖：语数英 + 理化生 + 史地政
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
  return Math.random() < p;
}

/**
 * 科目配置：每个科目的目标年级
 */
const SUBJECT_GRADES = {
  math: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  chinese: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  english: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  physics: [8, 9],
  chemistry: [9],
  biology: [7, 8, 9],
  geography: [7, 8, 9],
  history: [7, 8, 9],
  politics: [7, 8, 9],
};

/**
 * 能力水平分布：θ 范围
 */
const THETA_LEVELS = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5];

/**
 * 为给定科目和年级生成测评结果
 */
async function generateAssessmentResult(db, theta, subject, grade) {
  const _ = db.command;

  // 查询题目（优先指定年级）
  let query = { subject: subject };
  if (grade) query.grade = String(grade);

  let questions = await db.collection('ai_question_pool')
    .where(query)
    .limit(100)
    .get();

  // 如果指定年级没有题目，使用任何年级
  if (questions.data.length === 0 && grade) {
    questions = await db.collection('ai_question_pool')
      .where({ subject: subject })
      .limit(100)
      .get();
  }

  if (questions.data.length === 0) {
    return { error: `No questions found for ${subject}` };
  }

  // 生成答题结果
  const results = questions.data.map(q => {
    const isCorrect = simulateAnswer(theta, q);
    return {
      question_id: q._id,
      is_correct: isCorrect,
    };
  });

  const correctCount = results.filter(r => r.is_correct).length;

  // 创建测评记录
  const assessmentId = `mock_${subject}_${grade}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.collection('assessments').add({
    data: {
      assessment_id: assessmentId,
      subject: subject,
      grade: String(grade || '8'),
      status: 'completed',
      source: 'mock',
      theta: theta,
      question_ids: questions.data.map(q => q._id),
      results: results.map((r, i) => ({
        question_id: r.question_id,
        is_correct: r.is_correct,
        knowledge_point: questions.data[i].kp_name,
        knowledge_point_id: questions.data[i].kp_id,
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
    subject: subject,
    grade: grade,
    correct_count: correctCount,
    total_questions: results.length,
    score_percent: Math.round(correctCount / results.length * 1000) / 10,
  };
}

exports.main = async (event) => {
  const { action = 'generate', subjects, count = 5 } = event;
  const db = cloud.database();

  if (action === 'checkCoverage') {
    // 检查各科目题目数量
    const stats = {};
    for (const subject of Object.keys(SUBJECT_GRADES)) {
      const count = await db.collection('ai_question_pool')
        .where({ subject: subject })
        .count();
      stats[subject] = count.total || 0;
    }
    return {
      success: true,
      data: { stats }
    };
  }

  if (action === 'generate') {
    const targetSubjects = subjects || Object.keys(SUBJECT_GRADES);
    const results = [];
    let totalGenerated = 0;
    let totalFailed = 0;

    for (const subject of targetSubjects) {
      const grades = SUBJECT_GRADES[subject] || [8];
      for (const grade of grades) {
        for (let i = 0; i < count; i++) {
          // 随机选择能力水平
          const theta = THETA_LEVELS[Math.floor(Math.random() * THETA_LEVELS.length)];

          try {
            const result = await generateAssessmentResult(db, theta, subject, grade);
            if (!result.error) {
              totalGenerated++;
              results.push({ ...result, theta });
            } else {
              totalFailed++;
              results.push({ error: result.error, subject, grade });
            }
          } catch (e) {
            totalFailed++;
            results.push({ error: e.message, subject, grade });
          }
        }
      }
    }

    return {
      success: true,
      data: {
        generated: totalGenerated,
        failed: totalFailed,
        results: results.slice(0, 100), // 限制返回结果数量
      }
    };
  }

  if (action === 'generateBySubject') {
    // 按科目生成（用于针对性扩展）
    const { subject, grade = 8, thetaLevels = THETA_LEVELS } = event;
    const results = [];

    for (let i = 0; i < count; i++) {
      const theta = thetaLevels[i % thetaLevels.length];
      try {
        const result = await generateAssessmentResult(db, theta, subject, grade);
        if (!result.error) {
          results.push({ ...result, theta });
        }
      } catch (e) {
        results.push({ error: e.message, subject, grade });
      }
    }

    return {
      success: true,
      data: {
        subject,
        grade,
        generated: results.filter(r => !r.error).length,
        results,
      }
    };
  }

  return { success: false, error: 'Unknown action' };
};
