/**
 * 诊断：查看 geography 题池中的题目内容
 * 返回前 20 条 geography 题目的 content 和 knowledge_point
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();

  const result = await db.collection('ai_question_pool')
    .where({ subject: 'geography' })
    .limit(20)
    .get();

  const questions = (result.data || []).map(q => ({
    id: q._id,
    content: (q.content || q.question || '').substring(0, 60),
    kp_name: q.kp_name || q.knowledge_point || '',
    difficulty: q.difficulty
  }));

  // 统计有多少条内容含数学关键词
  const MATH_KW = /三角形|方程|函数|根式|勾股|因式|不等式|概率|直径|半径|平方|整式|分式|全等|轴对称|相似|锐角|钝角|内角|外角/;
  const mathCount = questions.filter(q => MATH_KW.test(q.content)).length;

  return {
    total_geography: (await db.collection('ai_question_pool').where({ subject: 'geography' }).count()).total,
    sample_count: questions.length,
    math_in_geography: mathCount,
    questions
  };
};
