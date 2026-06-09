/**
 * 诊断云函数：检查 assessment 的 question_ids 字段
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();

  console.log('[diagnose] ========== 诊断 assessment.question_ids ==========');

  try {
    // 获取最近的一个评估记录
    const assessmentResult = await db.collection('assessments')
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();

    if (!assessmentResult.data || assessmentResult.data.length === 0) {
      return { success: false, error: 'No assessments found' };
    }

    const assessment = assessmentResult.data[0];
    console.log('[diagnose] Assessment ID:', assessment.assessment_id);

    // 检查 question_ids
    const questionIds = assessment.question_ids || [];
    const questions = assessment.questions || [];

    console.log('[diagnose] question_ids count:', questionIds.length);
    console.log('[diagnose] questions count:', questions.length);
    console.log('[diagnose] question_ids sample:', questionIds.slice(0, 3));

    // 如果有 question_ids 但没有 questions，尝试从题池加载
    let poolQuestions = [];
    if (questionIds.length > 0 && questions.length === 0) {
      console.log('[diagnose] Has question_ids but no questions, loading from pool...');

      try {
        const poolResult = await db.collection('ai_question_pool')
          .where({
            _id: db.command.in(questionIds.slice(0, 10))  // 只取前10个
          })
          .get();

        poolQuestions = poolResult.data || [];
        console.log('[diagnose] Pool returned:', poolQuestions.length, 'questions');

        // 检查第一个题目的 correct_answer 格式
        if (poolQuestions.length > 0) {
          const firstQ = poolQuestions[0];
          console.log('[diagnose] First pool question correct_answer:', firstQ.correct_answer, 'type:', typeof firstQ.correct_answer);
        }
      } catch (e) {
        console.error('[diagnose] Pool query failed:', e.message);
      }
    }

    return {
      success: true,
      data: {
        assessment_id: assessment.assessment_id,
        question_ids_count: questionIds.length,
        questions_count: questions.length,
        question_ids_sample: questionIds.slice(0, 5),
        pool_questions_count: poolQuestions.length,
        pool_question_sample: poolQuestions.length > 0 ? {
          id: poolQuestions[0]._id,
          correct_answer: poolQuestions[0].correct_answer,
          type: typeof poolQuestions[0].correct_answer
        } : null
      }
    };

  } catch (e) {
    console.error('[diagnose] Error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
