/**
 * 题目去重工具
 */

async function checkDuplicate(db, questionText, kpId) {
  if (!db || !questionText) return false;

  try {
    const normalizedText = questionText.replace(/\s+/g, '').trim();

    const result = await db.collection('ai_question_pool')
      .where({ kp_id: kpId })
      .limit(50)
      .get();

    if (!result.data || result.data.length === 0) return false;

    for (const record of result.data) {
      const recordText = (record.question || record.content || '').replace(/\s+/g, '').trim();
      if (recordText === normalizedText) return true;
    }

    return false;
  } catch (e) {
    console.error('[dedup] checkDuplicate error:', e.message);
    return false;
  }
}

module.exports = { checkDuplicate };
