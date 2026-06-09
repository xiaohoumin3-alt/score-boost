/**
 * 诊断云函数：检查练习模式题池数据
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  console.log('[diagnosePracticePool] ========== 诊断开始 ==========');
  
  const results = {
    total_questions: 0,
    by_kp_id: {},
    by_difficulty: {},
    sample_questions: [],
    query_test: {}
  };
  
  try {
    // 1. 统计题池总题目数
    const totalResult = await db.collection('ai_question_pool').count();
    results.total_questions = totalResult.total || 0;
    console.log('[diagnosePracticePool] 总题目数:', results.total_questions);
    
    // 2. 按知识点统计（去掉有问题的 orderBy）
    const kpResult = await db.collection('ai_question_pool')
      .limit(100)
      .get();
    
    const byKpId = {};
    for (const q of kpResult.data || []) {
      const kpId = q.kp_id || 'unknown';
      if (!byKpId[kpId]) byKpId[kpId] = 0;
      byKpId[kpId]++;
    }
    results.by_kp_id = byKpId;
    console.log('[diagnosePracticePool] 按知识点统计:', byKpId);
    
    // 3. 按难度统计
    const diffResult = await db.collection('ai_question_pool')
      .field({ difficulty: true })
      .get();
    
    const byDifficulty = { easy: 0, medium: 0, hard: 0, unknown: 0 };
    for (const q of diffResult.data || []) {
      const diff = q.difficulty || 'unknown';
      if (byDifficulty[diff] !== undefined) {
        byDifficulty[diff]++;
      } else {
        byDifficulty.unknown++;
      }
    }
    results.by_difficulty = byDifficulty;
    console.log('[diagnosePracticePool] 按难度统计:', byDifficulty);
    
    // 4. 获取样本题目
    const sampleResult = await db.collection('ai_question_pool')
      .limit(3)
      .get();
    
    results.sample_questions = sampleResult.data.map(q => ({
      _id: q._id,
      kp_id: q.kp_id,
      difficulty: q.difficulty,
      verified: q.verified,
      has_question: !!q.question,
      has_options: !!(q.options && q.options.length > 0)
    }));
    console.log('[diagnosePracticePool] 样本题目:', results.sample_questions);
    
    // 5. 测试典型查询（模拟 practice_v2 的查询）
    const testQueries = [
      { kp_id: 'kp2_3', difficulty: 'easy', verified: true },
      { kp_id: 'kp2_3', difficulty: 'easy', verified: false },
      { kp_id: 'kp2_3', difficulty: 'medium', verified: false },
    ];
    
    for (const query of testQueries) {
      const queryResult = await db.collection('ai_question_pool')
        .where(query)
        .count();
      results.query_test[JSON.stringify(query)] = queryResult.total || 0;
      console.log('[diagnosePracticePool] 查询', query, '结果:', queryResult.total);
    }
    
    // 6. 检查是否有题目缺少关键字段
    const incompleteResult = await db.collection('ai_question_pool')
      .where({
        kp_id: db.command.exists(false)
      })
      .count();
    results.missing_kp_id = incompleteResult.total || 0;
    console.log('[diagnosePracticePool] 缺少 kp_id 的题目数:', results.missing_kp_id);
    
    console.log('[diagnosePracticePool] ========== 诊断结束 ==========');
    
    return {
      success: true,
      data: results
    };
    
  } catch (e) {
    console.error('[diagnosePracticePool] Error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
