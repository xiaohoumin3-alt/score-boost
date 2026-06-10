/**
 * 直接查询数据库检查 assessment 3c015116-6c5e-4879-a4c0-ab61dbe7d288
 * 需要在云函数环境中运行
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const assessmentId = '3c015116-6c5e-4879-a4c0-ab61dbe7d288';

  console.log('=== 诊断 assessment:', assessmentId, '===');

  try {
    // 1. 查询 assessment
    const doc = await db.collection('assessments').where({ assessment_id: assessmentId }).get();

    if (!doc.data || doc.data.length === 0) {
      return { error: 'Assessment not found' };
    }

    const session = doc.data[0];

    // 2. 检查 assessment 结构
    const result = {
      assessment: {
        _id: session._id,
        assessment_id: session.assessment_id,
        status: session.status,
        has_questions_embedded: !!(session.questions && session.questions.length > 0),
        questions_count: session.questions?.length || 0,
        has_question_ids: !!(session.question_ids && session.question_ids.length > 0),
        question_ids_count: session.question_ids?.length || 0,
        sample_question_ids: session.question_ids?.slice(0, 3) || [],
      }
    };

    // 3. 如果有 question_ids，查询 ai_question_pool
    if (session.question_ids && session.question_ids.length > 0) {
      const _ = db.command;
      const poolQuery = await db.collection('ai_question_pool')
        .where({ _id: _.in(session.question_ids) })
        .get();

      result.pool_query = {
        found_count: poolQuery.data?.length || 0,
        expected_count: session.question_ids.length,
        match: poolQuery.data?.length === session.question_ids.length ? 'YES' : 'NO'
      };

      if (poolQuery.data && poolQuery.data.length > 0) {
        result.sample_pool_question = {
          _id: poolQuery.data[0]._id,
          content: poolQuery.data[0].content?.substring(0, 50),
          correct_answer: poolQuery.data[0].correct_answer,
          correct_answer_type: typeof poolQuery.data[0].correct_answer
        };
      }
    }

    // 4. 如果有内嵌 questions，检查结构
    if (session.questions && session.questions.length > 0) {
      result.embedded_questions_sample = {
        count: session.questions.length,
        first_question: {
          id: session.questions[0].id,
          content: session.questions[0].content?.substring(0, 50),
          correct_answer: session.questions[0].correct_answer,
          correct_answer_type: typeof session.questions[0].correct_answer
        }
      };
    }

    console.log('=== 诊断结果 ===');
    console.log(JSON.stringify(result, null, 2));

    return { success: true, data: result };

  } catch (e) {
    console.error('诊断错误:', e);
    return { success: false, error: e.message };
  }
};
