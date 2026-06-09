/**
 * 批量删除题池中重复题目
 * 保留第一个，删除后续重复
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const subjects = ['biology', 'geography', 'math'];
  let totalRemoved = 0;

  for (const subject of subjects) {
    console.log(`[dedup] Processing subject: ${subject}`);

    // 获取该科目所有有question字段的题目
    const { data: questions } = await db.collection('ai_question_pool')
      .where({
        subject: subject,
        question: _.exists(true)
      })
      .field({ question: true })
      .limit(1000)
      .get();

    console.log(`[dedup] Found ${questions.length} questions for ${subject}`);

    // 找出重复题
    const seen = new Map();
    const duplicates = [];

    for (const q of questions) {
      const key = q.question;
      if (!key) continue;

      if (seen.has(key)) {
        duplicates.push(q._id);
      } else {
        seen.set(key, q._id);
      }
    }

    console.log(`[dedup] Found ${duplicates.length} duplicates in ${subject}`);

    // 批量删除重复题（每次最多删除20条，避免超时）
    const batchSize = 20;
    for (let i = 0; i < duplicates.length; i += batchSize) {
      const batch = duplicates.slice(i, i + batchSize);
      for (const id of batch) {
        try {
          await db.collection('ai_question_pool').doc(id).remove();
          totalRemoved++;
        } catch (err) {
          console.error(`[dedup] Failed to remove ${id}:`, err.message);
        }
      }
    }
  }

  return {
    success: true,
    totalRemoved,
    message: `Removed ${totalRemoved} duplicate questions`
  }
}
