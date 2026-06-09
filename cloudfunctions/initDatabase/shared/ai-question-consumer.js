/**
 * AI题目消费者 - 从ai_question_pool获取题目
 * 优先级: verified=true > used_count最小
 */

/**
 * 从候选池中找出最佳匹配
 * 优先级: verified > used_count低
 */
function findBestMatch(pool, kp_id, difficulty) {
  if (!pool || pool.length === 0) {
    return null;
  }

  // 过滤匹配kp_id和difficulty的题目
  const matches = pool.filter(q => q.kp_id === kp_id && q.difficulty === difficulty);
  if (matches.length === 0) {
    return null;
  }

  // 优先选择verified=true的
  const verified = matches.filter(q => q.verified);
  const candidates = verified.length > 0 ? verified : matches;

  // 选择used_count最小的
  candidates.sort((a, b) => a.used_count - b.used_count);

  return candidates[0];
}

/**
 * 消费一道题目
 * @param {Object} collection - 数据库集合
 * @param {string} kp_id - 知识点ID
 * @param {string} difficulty - 难度
 * @returns {Promise<Object|null>} 题目或null
 */
async function consumeQuestion(collection, kp_id, difficulty) {
  // 查询候选题目
  const result = await collection
    .where({
      kp_id,
      difficulty
    })
    .orderBy('verified', 'desc') // verified=true优先
    .orderBy('used_count', 'asc') // used_count低优先
    .limit(10)
    .get();

  if (!result.data || result.data.length === 0) {
    return null;
  }

  // findBestMatch已在查询层面实现，取第一个
  const question = result.data[0];

  // 递增used_count
  const newCount = question.used_count + 1;
  await collection.doc(question._id).update({
    data: {
      used_count: newCount,
      last_used_at: new Date().toISOString()
    }
  });

  return {
    ...question,
    used_count: newCount
  };
}

module.exports = {
  findBestMatch,
  consumeQuestion
};
