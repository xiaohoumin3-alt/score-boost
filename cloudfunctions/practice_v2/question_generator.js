/**
 * 题目生成器 - 整合题池和AI生成
 * 策略：
 * - Practice: 10% verified + 60% unverified (pool) + 30% AI-generated
 * - Assessment: 100% verified from pool
 *
 * 题池优先，AI生成补足
 */

const { fetchQuestionsFromPool } = require('./question_pool');


/**
 * 混合生成题目 - 题池优先策略
 * @param {Array} plan - 题目计划 [{kp: {kp_id, kp_name, chapter_name}, difficulty}]
 * @param {number} numQuestions - 需要题目数量
 * @param {Function} callAiGenerate - 调用AI生成的函数 (可选，Practice模式需要)
 * @param {Object} options - 选项 { db, userId, mode: 'practice' | 'assessment' }
 * @returns {Promise<Array>} 生成的题目
 *
 * 策略：
 * - Practice: 10% verified + 60% unverified (pool) + 30% AI-generated
 * - Assessment: 100% verified from pool
 */
async function generateQuestions(plan, numQuestions, callAiGenerate, options = {}) {
  const { db, userId, mode = 'practice' } = options;
  const questions = [];

  if (mode === 'assessment') {
    // Assessment模式：100% verified from pool
    console.log('[Generator] Assessment mode: 100% verified from pool');

    // 从题池获取已验证题目
    for (const item of plan) {
      if (questions.length >= numQuestions) break;
      const poolQuestions = await fetchQuestionsFromPool(
        db,
        item.kp.kp_id,
        item.difficulty,
        true,  // verified
        userId,
        questions.map(q => q.id),  // exclude already fetched
        1
      );
      for (const pq of poolQuestions) {
        questions.push({
          id: pq._id,
          type: 'choice',
          content: pq.question,
          options: pq.options || [],
          correct_answer: pq.correct_answer,
          knowledge_point: pq.kp_name,
          knowledge_point_id: pq.kp_id,
          chapter: pq.chapter,
          difficulty: pq.difficulty,
          source: 'pool_verified',
        });
      }
    }
  } else {
    // Practice模式：10% verified + 60% unverified + 30% AI
    console.log('[Generator] Practice mode: 10% verified + 60% unverified + 30% AI');

    const verifiedCount = Math.ceil(numQuestions * 0.1);  // 10%
    const unverifiedCount = Math.ceil(numQuestions * 0.6);  // 60%
    const aiCount = Math.ceil(numQuestions * 0.3);  // 30%

    // 获取已验证题目
    for (const item of plan) {
      if (questions.filter(q => q.source === 'pool_verified').length >= verifiedCount) break;
      const poolQuestions = await fetchQuestionsFromPool(
        db,
        item.kp.kp_id,
        item.difficulty,
        true,  // verified
        userId,
        questions.map(q => q.id),
        Math.min(2, verifiedCount - questions.filter(q => q.source === 'pool_verified').length)
      );
      for (const pq of poolQuestions) {
        questions.push({
          id: pq._id,
          type: 'choice',
          content: pq.question,
          options: pq.options || [],
          correct_answer: pq.correct_answer,
          knowledge_point: pq.kp_name,
          knowledge_point_id: pq.kp_id,
          chapter: pq.chapter,
          difficulty: pq.difficulty,
          source: 'pool_verified',
        });
      }
    }

    // 获取未验证题目
    for (const item of plan) {
      if (questions.filter(q => q.source === 'pool_unverified').length >= unverifiedCount) break;
      const poolQuestions = await fetchQuestionsFromPool(
        db,
        item.kp.kp_id,
        item.difficulty,
        false,  // unverified
        userId,
        questions.map(q => q.id),
        Math.min(3, unverifiedCount - questions.filter(q => q.source === 'pool_unverified').length)
      );
      for (const pq of poolQuestions) {
        questions.push({
          id: pq._id,
          type: 'choice',
          content: pq.question,
          options: pq.options || [],
          correct_answer: pq.correct_answer,
          knowledge_point: pq.kp_name,
          knowledge_point_id: pq.kp_id,
          chapter: pq.chapter,
          difficulty: pq.difficulty,
          source: 'pool_unverified',
        });
      }
    }

    // AI生成补足
    if (callAiGenerate) {
      const aiNeeded = aiCount - questions.filter(q => q.source === 'ai').length;
      for (let i = 0; i < Math.min(aiNeeded, plan.length); i++) {
        const item = plan[i];
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI timeout')), 35000)
          );
          const result = await Promise.race([
            callAiGenerate(item.kp.kp_id, item.kp.kp_name, item.difficulty),
            timeoutPromise
          ]);

          let options;
          if (result.options && result.options.length > 0) {
            if (typeof result.options[0] === 'object' && 'key' in result.options[0]) {
              options = result.options;
            } else {
              options = (result.options || []).map((opt, oidx) => ({
                key: String.fromCharCode(65 + oidx),
                value: typeof opt === 'string' ? opt.replace(/^[A-D]\.\s*/, '') : String(opt)
              }));
            }
          } else {
            options = [];
          }

          questions.push({
            id: result.id || `ai_${Date.now()}_${i}`,
            type: result.type || 'choice',
            content: result.question || result.content,
            options: options,
            correct_answer: result.correct_answer,
            knowledge_point: result.kp_name || item.kp.kp_name,
            knowledge_point_id: result.kp_id || item.kp.kp_id,
            chapter: result.chapter || item.kp.chapter_name,
            difficulty: result.difficulty || item.difficulty,
            source: 'ai',
            image_url: result.image_url || null,
          });
        } catch (e) {
          console.error(`[Generator] AI failed for ${item.kp.kp_id}:`, e.message);
        }
      }
    }
  }

  // 如果还是不够，从题池补足
  while (questions.length < numQuestions && questions.length < plan.length * 2) {
    const item = plan[questions.length % plan.length];
    const poolQuestions = await fetchQuestionsFromPool(
      db,
      item.kp.kp_id,
      item.difficulty,
      true,  // verified
      userId,
      questions.map(q => q.id),
      1
    );
    if (poolQuestions.length > 0) {
      const pq = poolQuestions[0];
      questions.push({
        id: pq._id,
        type: 'choice',
        content: pq.question,
        options: pq.options || [],
        correct_answer: pq.correct_answer,
        knowledge_point: pq.kp_name,
        knowledge_point_id: pq.kp_id,
        chapter: pq.chapter,
        difficulty: pq.difficulty,
        source: 'pool_fallback',
      });
    } else {
      break;
    }
  }

  const stats = {
    verified: questions.filter(q => q.source === 'pool_verified').length,
    unverified: questions.filter(q => q.source === 'pool_unverified').length,
    ai: questions.filter(q => q.source === 'ai').length,
    fallback: questions.filter(q => q.source === 'pool_fallback').length,
  };
  console.log(`[Generator] Generated ${questions.length} questions (stats:`, JSON.stringify(stats), ')');
  return questions;
}

module.exports = {
  generateQuestions
};
