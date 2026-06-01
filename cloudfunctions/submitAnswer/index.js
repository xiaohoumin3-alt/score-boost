/**
 * 提交答案云函数
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const assessmentId = params.assessment_id;
    const newAnswers = params.answers || [];

    if (!assessmentId) {
      return { success: false, error: 'assessment_id is required' };
    }

    // 获取测评会话
    const db = cloud.database();
    const doc = await db.collection('assessments').where({ assessment_id: assessmentId }).get();

    if (!doc.data || doc.data.length === 0) {
      return { success: false, error: 'Assessment not found' };
    }

    const session = doc.data[0];
    const questions = session.questions || [];

    // 构建题目映射
    const questionMap = {};
    questions.forEach(q => { questionMap[q.id] = q; });

    // 合并已有答案和新答案
    const existingAnswers = session.answers || [];
    const existingAnswerMap = {};
    existingAnswers.forEach(a => { existingAnswerMap[a.question_id || a.questionId] = a; });

    newAnswers.forEach(a => {
      const qid = a.question_id || a.questionId;
      existingAnswerMap[qid] = a;
    });

    const allAnswers = Object.values(existingAnswerMap);

    // 评判所有答案
    const allResults = [];
    let totalCorrect = 0;

    for (const answer of allAnswers) {
      const questionId = answer.question_id || answer.questionId;
      const userAnswer = (answer.answer || '').toUpperCase().trim();

      const question = questionMap[questionId];
      if (!question) continue;

      const correct = (question.correct_answer || '').toUpperCase().trim();
      const isCorrect = userAnswer === correct;

      if (isCorrect) totalCorrect++;

      allResults.push({
        question_id: questionId,
        content: question.content || '',
        user_answer: userAnswer,
        correct_answer: correct,
        is_correct: isCorrect,
        knowledge_point: question.knowledge_point || '',
        knowledge_point_id: question.knowledge_point_id || '',
        difficulty: question.difficulty || '',
      });
    }

    // 计算分数
    const totalQuestions = allResults.length;
    const scorePercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 1000) / 10 : 0;

    // 按知识点统计
    const kpStats = {};
    for (const r of allResults) {
      const kpId = r.knowledge_point_id;
      if (!kpStats[kpId]) {
        kpStats[kpId] = { name: r.knowledge_point, correct: 0, total: 0 };
      }
      kpStats[kpId].total++;
      if (r.is_correct) kpStats[kpId].correct++;
    }

    // 更新会话 - 累计所有答案
    await db.collection('assessments').where({ assessment_id: assessmentId }).update({
      data: {
        status: 'completed',
        answers: allAnswers,
        results: allResults,
        score: {
          total_correct: totalCorrect,
          total_questions: totalQuestions,
          score_percent: scorePercent,
        },
        kp_stats: Object.entries(kpStats).map(([kpId, stats]) => ({
          kp_id: kpId,
          kp_name: stats.name,
          correct: stats.correct,
          total: stats.total,
        })),
        completed_at: new Date().toISOString(),
      }
    });

    // 更新题池中题目的正确率统计
    for (const result of allResults) {
      const questionId = result.question_id;

      // 只更新来自题池的题目（ID格式判断）
      // 题池题目ID格式: pool_verified_*, pool_unverified_*, 或直接是数据库_id
      if (questionId.startsWith('pool_') || !questionId.startsWith('ai_') && !questionId.startsWith('bank_')) {
        try {
          // 获取当前题目统计
          const qDoc = await db.collection('ai_question_pool').doc(questionId).get();
          if (qDoc.data && qDoc.data.length > 0) {
            const q = qDoc.data[0];
            const newUsageCount = (q.usage_count || 0) + 1;
            const currentCorrectRate = q.correct_rate || 0.5;
            const newCorrectRate = result.is_correct
              ? (currentCorrectRate * (q.usage_count || 1) + 1) / newUsageCount
              : (currentCorrectRate * (q.usage_count || 1)) / newUsageCount;

            // 更新统计
            await db.collection('ai_question_pool').doc(questionId).update({
              data: {
                usage_count: newUsageCount,
                correct_rate: Math.round(newCorrectRate * 100) / 100,  // 保留两位小数
                last_used_at: new Date().toISOString()
              }
            });
          }
        } catch (e) {
          // 题目可能不在题池中（如bank题目），忽略错误
          console.log(`[submitAnswer] Question ${questionId} not in pool, skipping stats update`);
        }
      }
    }

    return {
      success: true,
      data: {
        assessment_id: assessmentId,
        results: allResults,
        total_correct: totalCorrect,
        total_questions: totalQuestions,
        score_percent: scorePercent,
        kp_stats: Object.entries(kpStats).map(([kpId, stats]) => ({
          kp_id: kpId,
          kp_name: stats.name,
          correct: stats.correct,
          total: stats.total,
        })),
      }
    };

  } catch (e) {
    console.error('submitAnswer error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
