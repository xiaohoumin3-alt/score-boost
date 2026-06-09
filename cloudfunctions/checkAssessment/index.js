/**
 * 调试云函数：检查 assessment 原始数据
 */

exports.main = async (event, context) => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();

  try {
    const { assessment_id } = event;

    const result = await db.collection('assessments')
      .where({ assessment_id })
      .get();

    if (!result.data || result.data.length === 0) {
      return { success: false, error: 'Assessment not found' };
    }

    const assessment = result.data[0];

    console.log('=== Assessment Raw Data ===');
    console.log('assessment_id:', assessment.assessment_id);
    console.log('question_ids:', assessment.question_ids);
    console.log('questions:', assessment.questions);
    console.log('status:', assessment.status);

    return {
      success: true,
      data: {
        assessment_id: assessment.assessment_id,
        question_ids: assessment.question_ids || [],
        question_ids_count: assessment.question_ids?.length || 0,
        questions: assessment.questions || [],
        questions_count: assessment.questions?.length || 0,
        status: assessment.status,
        raw: assessment
      }
    };
  } catch (e) {
    console.error('Error:', e);
    return { success: false, error: e.message };
  }
};
