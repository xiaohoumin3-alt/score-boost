/**
 * questionPoolStats 云函数
 * 功能：统计题库数量和分布 + 调查科目为空的题目
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const stats = {
    total: 0,
    bySubject: {},
    byDifficulty: {},
    byVerification: { verified: 0, unverified: 0 },
    recent: [],
    allSubjects: [],
    emptySubjectDetails: []  // 新增：科目为空的题目详情
  };

  try {
    // 总数
    const totalResult = await db.collection('ai_question_pool').count();
    stats.total = totalResult.total || 0;

    // 按标准科目统计
    const subjects = ['math', 'biology', 'geography'];
    for (const subject of subjects) {
      const result = await db.collection('ai_question_pool').where({ subject }).count();
      stats.bySubject[subject] = result.total || 0;
    }

    // 按难度
    const difficulties = ['easy', 'medium', 'hard'];
    for (const difficulty of difficulties) {
      const result = await db.collection('ai_question_pool').where({ difficulty }).count();
      stats.byDifficulty[difficulty] = result.total || 0;
    }

    // 按验证状态
    const verifiedResult = await db.collection('ai_question_pool').where({ verified: true }).count();
    const unverifiedResult = await db.collection('ai_question_pool').where({ verified: false }).count();
    stats.byVerification.verified = verifiedResult.total || 0;
    stats.byVerification.unverified = unverifiedResult.total || 0;

    // 获取科目为空的题目详情（最近20条）
    const emptySubjectResult = await db.collection('ai_question_pool')
      .where({
        subject: db.command.exists(false)
      })
      .orderBy('created_at', 'desc')
      .limit(20)
      .field({ _id: true, subject: true, difficulty: true, created_at: true, content: true })
      .get();

    stats.emptySubjectDetails = (emptySubjectResult.data || []).map(q => ({
      id: q._id,
      subject: q.subject,
      difficulty: q.difficulty,
      content: q.content ? q.content.substring(0, 30) + '...' : '(empty)',
      created_at: q.created_at
    }));

    // 最近添加的题目
    const recentResult = await db.collection('ai_question_pool')
      .orderBy('created_at', 'desc')
      .limit(5)
      .get();
    stats.recent = (recentResult.data || []).map(q => ({
      id: q._id,
      subject: q.subject,
      difficulty: q.difficulty,
      content: q.content ? q.content.substring(0, 50) + '...' : '',
      created_at: q.created_at
    }));

    // 获取所有唯一的科目值（采样前500条）
    const sampleResult = await db.collection('ai_question_pool')
      .field({ subject: true })
      .limit(500)
      .get();

    const subjectSet = new Set();
    const subjectCounts = {};
    (sampleResult.data || []).forEach(q => {
      const s = q.subject || '(empty)';
      subjectSet.add(s);
      subjectCounts[s] = (subjectCounts[s] || 0) + 1;
    });
    stats.allSubjects = Array.from(subjectSet).sort();
    stats.bySubjectDetailed = subjectCounts;

    return {
      success: true,
      stats
    };

  } catch (e) {
    return {
      success: false,
      error: e.message,
      stats
    };
  }
};
