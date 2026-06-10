/**
 * 提交答案云函数
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { formatQuestionForApi, normalizeAnswer } = require('./shared/question-normalizer');
const { success, error } = require('./shared/response-helper');

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  try {
    const params = event.data || event || {};
    const assessmentId = params.assessment_id;
    const newAnswers = params.answers || [];

    if (!assessmentId) {
      return { success: false, error: 'assessment_id is required' };
    }

    console.log('[submitAnswer] ========== 诊断日志开始 ==========');
    console.log('[submitAnswer] assessmentId:', assessmentId);
    console.log('[submitAnswer] newAnswers:', JSON.stringify(newAnswers));

    const db = cloud.database();
    const doc = await db.collection('assessments').where({ assessment_id: assessmentId }).get();

    if (!doc.data || doc.data.length === 0) {
      console.log('[submitAnswer] Assessment not found!');
      return { success: false, error: 'Assessment not found' };
    }

    const session = doc.data[0];
    let questions = session.questions || [];

    // 回退：从 question_ids 引用加载（questionGenerator 队列路径创建的）
    if (questions.length === 0 && session.question_ids && session.question_ids.length > 0) {
      console.log('[submitAnswer] No embedded questions, loading from question_ids:', session.question_ids.length);
      const _ = db.command;
      const poolQuery = await db.collection('ai_question_pool')
        .where({ _id: _.in(session.question_ids) })
        .get();
      questions = poolQuery.data || [];
    }

    console.log('[submitAnswer] Session questions count:', questions.length);
    console.log('[submitAnswer] Session has question_ids:', !!(session.question_ids && session.question_ids.length > 0));
    console.log('[submitAnswer] question_ids count:', session.question_ids?.length || 0);

    // 诊断：打印第一个题目的结构
    if (questions.length > 0) {
      console.log('[submitAnswer] First question sample:', JSON.stringify({
        id: questions[0].id,
        _id: questions[0]._id,
        content: questions[0].content?.substring(0, 30),
        has_correct_answer: 'correct_answer' in questions[0]
      }));
    }

    // 构建题目映射
    const questionMap = {};
    (questions || []).forEach(q => {
      const key = q.id || q._id;
      questionMap[key] = q;
    });

    console.log('[submitAnswer] questionMap keys:', Object.keys(questionMap).slice(0, 5));
    console.log('[submitAnswer] questionMap size:', Object.keys(questionMap).length);

    // 合并已有答案和新答案
    const existingAnswers = session.answers || [];
    const existingAnswerMap = {};
    existingAnswers.forEach(a => { existingAnswerMap[a.question_id || a.questionId] = a; });

    newAnswers.forEach(a => {
      const qid = a.question_id || a.questionId;
      existingAnswerMap[qid] = a;
    });

    const allAnswers = Object.values(existingAnswerMap);
    console.log('[submitAnswer] Total answers after merge:', allAnswers.length);
    console.log('[submitAnswer] Answer question_ids:', allAnswers.map(a => a.question_id || a.questionId));

    // 判分
    let totalCorrect = 0;
    const allResults = [];

    console.log('[submitAnswer] Starting grading loop...');

    for (const answer of allAnswers) {
      const questionId = answer.question_id || answer.questionId;
      if (!questionId) continue;

      let userAnswer = String(answer.answer || answer.selected || answer.user_answer || '').trim().toUpperCase();

      const question = questionMap[questionId];
      if (!question) {
        console.log('[submitAnswer] Question not found in questionMap:', questionId);
        console.log('[submitAnswer] Available keys:', Object.keys(questionMap));
        continue;
      }

      // 用 normalizeAnswer 统一正确答案格式
      const correct = normalizeAnswer(question.correct_answer);
      const isCorrect = userAnswer === correct;

      console.log('[submitAnswer] Question:', questionId);
      console.log('[submitAnswer]   correct_answer (raw):', question.correct_answer, `(type: ${typeof question.correct_answer})`);
      console.log('[submitAnswer]   correct_answer (normalized):', correct);
      console.log('[submitAnswer]   userAnswer:', userAnswer, `(type: ${typeof userAnswer})`);
      console.log('[submitAnswer]   isCorrect:', isCorrect);

      if (isCorrect) totalCorrect++;

      allResults.push({
        question_id: questionId,
        content: question.content || question.question || '',
        user_answer: userAnswer,
        correct_answer: correct,
        is_correct: isCorrect,
        knowledge_point: question.knowledge_point || question.kp_name || '',
        knowledge_point_id: question.knowledge_point_id || question.kp_id || '',
        difficulty: question.difficulty || '',
      });
    }

    // 计算分数
    const totalQuestions = allResults.length;
    const scorePercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 1000) / 10 : 0;

    console.log('[submitAnswer] ========== 判分结果 ==========');
    console.log('[submitAnswer] totalCorrect:', totalCorrect);
    console.log('[submitAnswer] totalQuestions:', totalQuestions);
    console.log('[submitAnswer] scorePercent:', scorePercent);
    console.log('[submitAnswer] ========== 诊断日志结束 ==========');

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

    // 更新会话
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
