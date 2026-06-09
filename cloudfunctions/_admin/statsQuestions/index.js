const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  try {
    // 先获取总数
    const countResult = await db.collection('ai_question_pool').count();
    const total = countResult.total;

    // 统计重复情况（用aggregate，但限制结果数量）
    const aggResult = await db.collection('ai_question_pool')
      .aggregate()
      .group({
        _id: '$question',
        count: $.sum(1)
      })
      .match({
        count: $.gt(1)
      })
      .sort({ count: -1 })
      .limit(10)
      .end();

    // 统计总重复数
    const dupResult = await db.collection('ai_question_pool')
      .aggregate()
      .group({
        _id: '$question',
        count: $.sum(1)
      })
      .match({
        count: $.gt(1)
      })
      .group({
        _id: null,
        totalDuplicates: $.sum('$count'),
        uniqueDuplicates: $.sum(1)
      })
      .end();

    return {
      success: true,
      totalQuestions: total,
      topDuplicates: aggResult.data || [],
      summary: dupResult.data[0] || { totalDuplicates: 0, uniqueDuplicates: 0 }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
