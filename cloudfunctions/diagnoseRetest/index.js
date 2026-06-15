const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const { subject, grade } = event;

  // 1. 查最近 completed 的 assessment
  const all = await db.collection('assessments')
    .where({ openid, status: 'completed' })
    .orderBy('created_at', 'desc')
    .limit(5)
    .get();

  // 2. 测试 retest 查询条件
  const gradeMap = { '一年级': '1', '二年级': '2', '三年级': '3', '四年级': '4', '五年级': '5', '六年级': '6', '七年级': '7', '八年级': '8', '九年级': '9' };
  const dbGrade = gradeMap[grade] || String(grade);

  const matchByNum = await db.collection('assessments')
    .where({ openid, status: 'completed', subject, grade: dbGrade })
    .limit(1).get();

  const matchByChinese = await db.collection('assessments')
    .where({ openid, status: 'completed', subject, grade })
    .limit(1).get();

  return {
    recentAssessments: all.data.map(a => ({
      assessment_id: a.assessment_id,
      subject: a.subject,
      grade: a.grade,
      gradeType: typeof a.grade,
      status: a.status,
      created_at: a.created_at
    })),
    queryGrade: dbGrade,
    matchByNumGrade: matchByNum.data.length,
    matchByChineseGrade: matchByChinese.data.length,
    gradeFormat: all.data.length > 0 ? typeof all.data[0].grade : 'no data',
    gradeSample: all.data.length > 0 ? all.data[0].grade : null
  };
};
