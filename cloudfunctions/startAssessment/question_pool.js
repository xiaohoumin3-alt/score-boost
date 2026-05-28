/**
 * question_pool 模块
 * 功能：从 ai_question_pool 查询题目
 * 优化版：批量查询，减少网络开销
 */

const { logPoolHit, logPoolMiss } = require('./monitoring');

/**
 * 批量查询题目（优化网络开销）
 * @param {Object} db - 数据库实例
 * @param {Array} kpIds - 知识点ID列表
 * @param {string} difficulty - 难度: 'easy' | 'medium' | 'hard' (可选，不传则不过滤)
 * @param {boolean} verified - 是否验证过的题目
 * @param {Array} excludeIds - 排除的题目ID
 * @returns {Promise<Object>} { kp_id -> questions } 映射
 */
async function fetchQuestionsBatch(db, kpIds, difficulty, verified, excludeIds = []) {
  const startTime = Date.now();

  if (!kpIds || kpIds.length === 0) return {};

  // 构建查询条件
  const where = {
    kp_id: db.command.in(kpIds),
    verified: verified
  };

  // 如果指定了难度，才添加难度过滤
  if (difficulty) {
    where.difficulty = difficulty;
  }

  if (excludeIds.length > 0) {
    where._id = db.command.nin(excludeIds);
  }

  try {
    // 一次查询获取所有知识点的题目
    const result = await db.collection('ai_question_pool')
      .where(where)
      .orderBy('correct_rate', 'desc')
      .limit(kpIds.length * 2) // 每个知识点最多2条
      .get();

    // 按知识点分组
    const grouped = {};
    for (const q of (result.data || [])) {
      if (!grouped[q.kp_id]) grouped[q.kp_id] = [];
      if (grouped[q.kp_id].length < 1) {
        grouped[q.kp_id].push(q);
      }
    }

    // 记录监控：批量查询统计
    const responseTime = Date.now() - startTime;
    const totalQuestions = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);

    if (totalQuestions > 0) {
      // 记录每个知识点的命中情况
      for (const kpId of kpIds) {
        const questions = grouped[kpId] || [];
        if (questions.length > 0) {
          logPoolHit(db, {
            kp_id: kpId,
            difficulty: difficulty || 'mixed',
            cache_type: 'database',
            response_time_ms: responseTime
          }).catch(() => {});
        } else {
          logPoolMiss(db, {
            kp_id: kpId,
            difficulty: difficulty || 'mixed',
            reason: 'no_questions'
          }).catch(() => {});
        }
      }
    }

    return grouped;
  } catch (e) {
    console.error('[question_pool] 批量查询失败:', e.message);

    // 记录所有知识点未命中
    for (const kpId of kpIds) {
      logPoolMiss(db, {
        kp_id: kpId,
        difficulty: difficulty || 'mixed',
        reason: 'query_error'
      }).catch(() => {});
    }

    return {};
  }
}

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
  const startTime = Date.now();

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
  if (excludeIds.length > 0) {
    where._id = db.command.nin(excludeIds);
  }

  // 查询题目（只做核心查询，移除副作用操作以避免超时）
  try {
    const result = await db.collection('ai_question_pool')
      .where(where)
      .orderBy('correct_rate', 'desc')
      .limit(limit)
      .get();

    const questions = result.data || [];
    const responseTime = Date.now() - startTime;

    // 记录监控埋点
    if (questions.length > 0) {
      logPoolHit(db, {
        kp_id: kpId,
        difficulty,
        cache_type: 'database',
        response_time_ms: responseTime
      }).catch(() => {});
    } else {
      logPoolMiss(db, {
        kp_id: kpId,
        difficulty,
        reason: 'no_questions'
      }).catch(() => {});
    }

    return questions;
  } catch (e) {
    console.error('[question_pool] 查询失败:', e.message);

    // 记录查询失败
    logPoolMiss(db, {
      kp_id: kpId,
      difficulty,
      reason: 'query_error'
    }).catch(() => {});

    return [];
  }
}

module.exports = {
  fetchQuestionsFromPool,
  fetchQuestionsBatch
};
