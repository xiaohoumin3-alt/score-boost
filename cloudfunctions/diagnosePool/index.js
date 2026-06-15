const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const results = {};

  // 1. 搜索超纲关键词
  const keywords = ['根号', '平方根', '勾股定理', '二次根式', '√', '方程', '代数'];
  results.superGradeKeywords = {};

  for (const kw of keywords) {
    try {
      const res = await db.collection('ai_question_pool')
        .where({
          subject: 'math',
          content: db.RegExp({ regexp: kw, options: 'i' })
        })
        .limit(5)
        .get();

      if (res.data.length > 0) {
        results.superGradeKeywords[kw] = res.data.map(q => ({
          _id: q._id,
          grade: q.grade,
          difficulty: q.difficulty,
          content: (q.content || q.question || '').substring(0, 100),
          kp_name: q.kp_name
        }));
      }
    } catch (e) {
      results.superGradeKeywords[kw] = `Error: ${e.message}`;
    }
  }

  // 2. 检查 grade=1 的题目
  try {
    const grade1 = await db.collection('ai_question_pool')
      .where({ subject: 'math', grade: '1' })
      .limit(10)
      .get();
    results.grade1Sample = grade1.data.map(q => ({
      _id: q._id,
      grade: q.grade,
      difficulty: q.difficulty,
      content: (q.content || q.question || '').substring(0, 100)
    }));
  } catch (e) {
    results.grade1Sample = `Error: ${e.message}`;
  }

  // 3. 检查 grade 字段分布
  try {
    const allMath = await db.collection('ai_question_pool')
      .where({ subject: 'math' })
      .limit(100)
      .get();
    
    const gradeDistribution = {};
    for (const q of allMath.data) {
      const g = q.grade || 'MISSING';
      gradeDistribution[g] = (gradeDistribution[g] || 0) + 1;
    }
    results.gradeDistribution = gradeDistribution;
    
    // 检查没有 grade 的题目
    const noGrade = allMath.data.filter(q => !q.grade);
    if (noGrade.length > 0) {
      results.noGradeQuestions = noGrade.map(q => ({
        _id: q._id,
        content: (q.content || q.question || '').substring(0, 100)
      }));
    }
  } catch (e) {
    results.gradeDistribution = `Error: ${e.message}`;
  }

  return results;
};
