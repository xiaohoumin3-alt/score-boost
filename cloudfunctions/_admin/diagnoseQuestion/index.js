/**
 * 诊断云函数：检查特定题目数据
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  console.log('[diagnoseQuestion] ========== 诊断开始 ==========');

  const results = {
    searched_question: '',
    matches: [],
    total_checked: 0
  };

  try {
    // 查找包含"a<0"、"b<0"、"平方"的题目
    const result = await db.collection('ai_question_pool')
      .where({
        question: db.command.regex('.*a.*b.*平方.*')
      })
      .limit(100)
      .get();

    results.total_checked = result.data.length;

    // 查找包含"a<0"或"a小于0"且包含"平方"的题目
    for (const q of result.data) {
      const text = q.question || '';
      if ((text.includes('a<0') || text.includes('a小于0') || text.includes('a ＜ 0')) &&
          (text.includes('b<0') || text.includes('b小于0') || text.includes('b ＜ 0')) &&
          text.includes('平方')) {
        results.matches.push({
          _id: q._id,
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          verified: q.verified,
          kp_id: q.kp_id,
          source: q.source,
          created_at: q.created_at
        });
      }
    }

    console.log('[diagnoseQuestion] 找到匹配题目数:', results.matches.length);

    if (results.matches.length > 0) {
      results.matches.forEach((m, idx) => {
        console.log(`\n=== 题目 ${idx + 1} ===`);
        console.log('question:', m.question);
        console.log('options:', JSON.stringify(m.options));
        console.log('correct_answer:', m.correct_answer);
        console.log('verified:', m.verified);
      });
    } else {
      console.log('[diagnoseQuestion] 未找到匹配题目');
    }

    console.log('[diagnoseQuestion] ========== 诊断结束 ==========');

    return {
      success: true,
      data: results
    };

  } catch (e) {
    console.error('[diagnoseQuestion] Error:', e);
    return { success: false, error: e.message || String(e) };
  }
};