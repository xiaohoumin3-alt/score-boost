/**
 * irtParameterUpdate 云函数
 * 批量更新 ai_question_pool 中题目的 IRT 参数
 * 基于积累的 usage_count/correct_count 重新计算
 * 可通过定时触发器定期执行
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { estimateItemParams } = require('./shared/item-bank-builder');

exports.main = async (event) => {
  const db = cloud.database();
  const _ = db.command;
  const batchSize = event.batch_size || 100;

  try {
    // 1. 查询有答题数据的题目
    const questions = [];
    let hasMore = true;
    let lastId = null;

    while (hasMore) {
      const query = { usage_count: _.gt(0) };
      if (lastId) {
        query._id = _.gt(lastId);
      }

      const batch = await db.collection('ai_question_pool')
        .where(query)
        .orderBy('_id', 'asc')
        .limit(batchSize)
        .get();

      if (batch.data && batch.data.length > 0) {
        questions.push(...batch.data);
        lastId = batch.data[batch.data.length - 1]._id;
        hasMore = batch.data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    if (questions.length === 0) {
      return { success: true, data: { updated: 0, message: 'No questions with usage data found' } };
    }

    // 2. 为每道题重新计算 IRT 参数
    let updatedCount = 0;
    const updates = [];

    for (const q of questions) {
      const params = estimateItemParams(q);

      // 只更新数据驱动的参数（有足够答题数据的）
      if (params.source === 'data_driven') {
        updates.push({
          id: q._id,
          irt_a: params.a,
          irt_b: params.b,
          irt_source: params.source,
          irt_updated_at: new Date().toISOString(),
        });
      }
    }

    // 3. 批量更新数据库
    for (const u of updates) {
      try {
        await db.collection('ai_question_pool')
          .doc(u.id)
          .update({
            data: {
              irt_a: u.irt_a,
              irt_b: u.irt_b,
              irt_source: u.irt_source,
              irt_updated_at: u.irt_updated_at,
            }
          });
        updatedCount++;
      } catch (e) {
        console.warn('[irtParameterUpdate] Failed to update:', u.id, e.message);
      }
    }

    return {
      success: true,
      data: {
        totalQuestions: questions.length,
        dataDrivenCount: updates.length,
        updated: updatedCount,
      }
    };

  } catch (e) {
    console.error('[irtParameterUpdate] Error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
