/**
 * 诊断 grade 字段分布
 * 检查 ai_question_pool 中题目的年级分布情况
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  console.log('[GRADE_DIAG] Starting grade distribution check...');

  try {
    // 统计各年级题目数量
    const result = await db.collection('ai_question_pool')
      .aggregate()
      .group({
        _id: '$grade',
        count: $.sum(1)
      })
      .sort({ count: -1 })
      .limit(20)
      .end();

    console.log('[GRADE_DIAG] Grade distribution:', JSON.stringify(result.list));

    // 抽样检查：数学科目的年级分布
    const mathSamples = await db.collection('ai_question_pool')
      .where({ subject: 'math' })
      .field({ grade: true, subject: true, kp_name: true, question: true })
      .limit(10)
      .get();

    console.log('[GRADE_DIAG] Math samples:', mathSamples.data.length, 'items');

    // 抽样检查：grade="2" 的数学题目
    const grade2Math = await db.collection('ai_question_pool')
      .where({ subject: 'math', grade: '2' })
      .field({ grade: true, subject: true, kp_name: true, question: true })
      .limit(5)
      .get();

    console.log('[GRADE_DIAG] Grade 2 math count:', grade2Math.data.length);

    return {
      success: true,
      gradeDistribution: result.list || [],
      mathSampleCount: mathSamples.data.length,
      mathSamples: mathSamples.data.map(q => ({
        grade: q.grade,
        subject: q.subject,
        kp_name: q.kp_name,
        question_preview: (q.question || q.content || '').substring(0, 50)
      })),
      grade2MathCount: grade2Math.data.length,
      grade2MathSamples: grade2Math.data.map(q => ({
        grade: q.grade,
        subject: q.subject,
        kp_name: q.kp_name,
        question_preview: (q.question || q.content || '').substring(0, 50)
      }))
    };

  } catch (error) {
    console.error('[GRADE_DIAG] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
