const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const result = {};
  
  // 查询2年级数学题目
  const math2Res = await db.collection('questions')
    .where({ grade: '2', subject: 'math' })
    .orderBy('created_at', 'desc')
    .limit(5)
    .get();
  
  result.math2 = {
    total: math2Res.data.length,
    questions: math2Res.data.map(q => ({
      id: q._id,
      knowledge_point: q.knowledge_point,
      question_preview: q.question?.substring(0, 60) + '...',
      created_at: q.created_at
    }))
  };
  
  // 统计2年级数学题目总数
  const countRes = await db.collection('questions')
    .where({ grade: '2', subject: 'math' })
    .count();
  result.math2_total = countRes.total;
  
  return result;
};
