/**
 * 清理云函数：增量删除重复题目
 * 每次只处理200条题目，避免超时
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();

  // 参数
  const skipQuestions = event.skipQuestions || 0;
  const questionBatchSize = 200;  // 减少到200条，确保在15秒内完成

  console.log('[cleanupDuplicates] skipQuestions:', skipQuestions, 'batchSize:', questionBatchSize);

  const results = {
    questions_scanned: 0,
    duplicates_found: 0,
    duplicates_deleted: 0,
    next_skip_questions: skipQuestions,
    has_more: true
  };

  try {
    // 查询一批题目
    const batch = await db.collection('ai_question_pool')
      .field({ question: true })
      .skip(skipQuestions)
      .limit(questionBatchSize)
      .get();

    const questions = batch.data || [];
    results.questions_scanned = questions.length;
    console.log('[cleanupDuplicates] 查到', questions.length, '条题目');

    if (questions.length === 0) {
      results.has_more = false;
      return { success: true, data: results };
    }

    // 统计重复题目
    const questionCount = new Map();
    for (const q of questions) {
      if (q.question) {
        questionCount.set(q.question, (questionCount.get(q.question) || 0) + 1);
      }
    }

    // 处理重复题目
    for (const [question, count] of questionCount.entries()) {
      if (count > 1) {
        results.duplicates_found++;
        try {
          const details = await db.collection('ai_question_pool')
            .where({ question: question })
            .field({ _id: true, verified: true, created_at: true })
            .get();

          if (details.data && details.data.length > 1) {
            details.data.sort((a, b) => {
              if (a.verified && !b.verified) return -1;
              if (!a.verified && b.verified) return 1;
              return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            });

            const deleteIds = details.data.slice(1).map(d => d._id);
            for (const deleteId of deleteIds) {
              await db.collection('ai_question_pool').doc(deleteId).remove();
              results.duplicates_deleted++;
            }
          }
        } catch (e) {
          console.error('[cleanupDuplicates] 处理失败:', e.message);
        }
      }
    }

    results.next_skip_questions = skipQuestions + questionBatchSize;
    results.has_more = questions.length >= questionBatchSize;

    console.log('[cleanupDuplicates] 扫描:', results.questions_scanned, '删除:', results.duplicates_deleted);

    return { success: true, data: results };

  } catch (e) {
    console.error('[cleanupDuplicates] Error:', e);
    return { success: false, error: e.message || String(e) };
  }
};