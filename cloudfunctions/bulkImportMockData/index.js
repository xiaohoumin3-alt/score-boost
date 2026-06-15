/**
 * bulkImportMockData 云函数
 * 批量生成并导入模拟测评数据，踏平等待时间
 * 内联数据生成版本 - 无需外部文件
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 科目和年级配置
const SUBJECTS_GRADES = [
  { subject: 'math', grades: [7, 8, 9], count: 20 },
  { subject: 'chinese', grades: [7, 8, 9], count: 15 },
  { subject: 'english', grades: [7, 8, 9], count: 15 },
  { subject: 'physics', grades: [8, 9], count: 15 },
  { subject: 'chemistry', grades: [9], count: 15 },
  { subject: 'biology', grades: [7, 8, 9], count: 10 },
  { subject: 'geography', grades: [7, 8, 9], count: 10 },
  { subject: 'history', grades: [7, 8, 9], count: 10 },
  { subject: 'politics', grades: [7, 8, 9], count: 10 },
];

// 能力水平分布
const THETA_LEVELS = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5];

/**
 * 基于 theta 模拟答题（2PL模型简化版）
 */
function simulateAnswers(theta, questionCount) {
  const results = [];
  for (let i = 0; i < questionCount; i++) {
    const p = 1 / (1 + Math.exp(-theta));
    results.push(Math.random() < p ? 1 : 0);
  }
  return results;
}

/**
 * 生成单条测评记录
 */
function generateAssessment(subject, grade, index, timestamp) {
  const theta = THETA_LEVELS[index % THETA_LEVELS.length];
  const questionCount = 20;
  const answers = simulateAnswers(theta, questionCount);
  const correctCount = answers.filter(a => a === 1).length;

  return {
    assessment_id: `mock_${subject}_${grade}_${timestamp}_${index}`,
    subject: subject,
    grade: String(grade),
    status: 'completed',
    source: 'mock',
    theta: theta,
    question_ids: [],
    results: answers.map((a, idx) => ({
      question_id: `temp_q_${subject}_${grade}_${idx}`,
      is_correct: a === 1,
      knowledge_point: `temp_kp_${subject}_${grade}_${idx}`,
    })),
    score: {
      total_correct: correctCount,
      total_questions: questionCount,
      score_percent: Math.round(correctCount / questionCount * 1000) / 10,
    },
    created_at: new Date(timestamp + index * 1000).toISOString(),
    completed_at: new Date(timestamp + index * 1000 + 60000).toISOString(),
  };
}

/**
 * 批量导入测评记录
 */
async function importAssessments(db, limit = null) {
  let imported = 0;
  let errors = 0;
  const timestamp = Date.now();

  for (const { subject, grades, count } of SUBJECTS_GRADES) {
    for (const grade of grades) {
      for (let i = 0; i < count; i++) {
        if (limit && imported >= limit) break;

        try {
          const record = generateAssessment(subject, grade, i, timestamp);
          await db.collection('assessments').add({ data: record });
          imported++;

          if (imported % 50 === 0) {
            console.log(`[importAssessments] 已导入 ${imported} 条`);
          }
        } catch (e) {
          errors++;
          console.error(`[importAssessments] 失败:`, e.message);
        }
      }
    }
  }

  return { imported, errors };
}

/**
 * 更新题目统计（模拟答题数据）
 */
async function updateQuestionStats(db) {
  const questions = await db.collection('ai_question_pool')
    .limit(1000)
    .get();

  let updated = 0;
  let errors = 0;

  for (const question of questions.data) {
    try {
      const usageCount = Math.floor(Math.random() * 50) + 10;
      const correctRate = 0.5 + (Math.random() - 0.5) * 0.4;

      await db.collection('ai_question_pool')
        .doc(question._id)
        .update({
          data: {
            usage_count: usageCount,
            correct_count: Math.round(usageCount * correctRate),
          }
        });

      updated++;
    } catch (e) {
      errors++;
    }
  }

  return { updated, errors, total: questions.data.length };
}

/**
 * 检查数据状态
 */
async function checkStatus(db) {
  const assessmentCount = await db.collection('assessments')
    .where({ source: 'mock' })
    .count();

  const questionsWithData = await db.collection('ai_question_pool')
    .where({ usage_count: db.command.gt(0) })
    .count();

  const totalQuestions = await db.collection('ai_question_pool').count();

  return {
    mockAssessments: assessmentCount.total || 0,
    questionsWithData: questionsWithData.total || 0,
    totalQuestions: totalQuestions.total || 0,
  };
}

exports.main = async (event) => {
  const { action = 'fullImport', limit = null } = event;
  const db = cloud.database();

  if (action === 'status') {
    const status = await checkStatus(db);
    return { success: true, data: status };
  }

  if (action === 'importAssessments') {
    const result = await importAssessments(db, limit);
    return { success: true, data: result };
  }

  if (action === 'updateQuestionStats') {
    const result = await updateQuestionStats(db);
    return { success: true, data: result };
  }

  if (action === 'fullImport') {
    console.log('[fullImport] 开始批量导入...');

    const assessmentsResult = await importAssessments(db, limit);
    console.log(`[fullImport] 测评记录: ${assessmentsResult.imported}/${assessmentsResult.imported + assessmentsResult.errors}`);

    const statsResult = await updateQuestionStats(db);
    console.log(`[fullImport] 题目统计: ${statsResult.updated}/${statsResult.total}`);

    const finalStatus = await checkStatus(db);

    return {
      success: true,
      data: {
        assessments: assessmentsResult,
        questionStats: statsResult,
        finalStatus: finalStatus,
      },
    };
  }

  return { success: false, error: 'Unknown action' };
};
