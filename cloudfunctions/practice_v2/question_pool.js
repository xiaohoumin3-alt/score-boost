/**
 * question_pool 模块
 * 功能：从 ai_question_pool 查询题目
 * TDD: Red-Green-Refactor
 */

/**
 * 从题池查询题目
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @param {string} difficulty - 难度: 'easy' | 'medium' | 'hard'
 * @param {boolean} verified - 是否验证过的题目
 * @param {string} userId - 用户ID
 * @param {Array} excludeIds - 排除的题目ID
 * @param {number} limit - 返回数量限制
 * @returns {Promise<Array>} 题目列表
 */
async function fetchQuestionsFromPool(db, kpId, difficulty, verified, userId, excludeIds = [], limit = 5) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 获取用户历史
  let historyIds = [];
  try {
    const history = await db.collection('user_question_history')
      .where({ user_id: userId })
      .get();
    historyIds = history.data.map(h => h.question_id);
  } catch (e) {
    // user_question_history 可能不存在，忽略错误
    console.warn('[fetchQuestionsFromPool] Failed to fetch user history:', e.message);
  }

  // 合并排除ID
  const allExcludeIds = [...new Set([...excludeIds, ...historyIds])];

  // 构建查询条件
  const where = {
    kp_id: kpId,
    difficulty: difficulty,
    verified: verified
  };

  // correct_rate 阈值过滤（质量过滤）
  if (verified === false) {
    where.correct_rate = db.command.gt(0.5);
  }

  // 添加排除条件
  if (allExcludeIds.length > 0) {
    where._id = db.command.nin(allExcludeIds);
  }

  // 查询题目
  const result = await db.collection('ai_question_pool')
    .where(where)
    .orderBy('correct_rate', 'desc')
    .limit(limit)
    .get();

  const questions = result.data || [];

  // 更新 last_used_at 并记录用户历史
  for (const q of questions) {
    // 更新最后使用时间
    try {
      await db.collection('ai_question_pool').doc(q._id).update({
        data: { last_used_at: new Date().toISOString() }
      });
    } catch (e) {
      console.warn('[fetchQuestionsFromPool] Failed to update last_used_at:', e.message);
    }

    // 记录用户历史
    try {
      await db.collection('user_question_history').add({
        data: {
          user_id: userId,
          question_id: q._id,
          used_at: new Date().toISOString()
        }
      });
    } catch (e) {
      // user_question_history 可能不存在，忽略错误
      console.warn('[fetchQuestionsFromPool] Failed to record user history:', e.message);
    }
  }

  return questions;
}

module.exports = {
  fetchQuestionsFromPool
};
