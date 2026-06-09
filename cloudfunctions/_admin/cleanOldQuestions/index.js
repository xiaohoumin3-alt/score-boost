/**
 * 清理 ai_question_pool 中没有 grade 字段的旧题目
 * 原因：旧数据缺少 grade 字段，导致年级筛选失效
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  console.log('[CLEAN] Starting cleanup of ai_question_pool...');

  try {
    // 分批次删除，每次最多删除 500 条
    let totalDeleted = 0;
    let hasMore = true;
    let batchCount = 0;

    while (hasMore) {
      batchCount++;

      // 查询一批没有 grade 字段的题目
      const result = await db.collection('ai_question_pool')
        .where(_.or([
          { grade: _.exists(false) },
          { grade: _.eq(null) },
          { grade: _.eq('') }
        ]))
        .limit(500)
        .field({ _id: true, pool_id: true })
        .get();

      const items = result.data || [];
      console.log(`[CLEAN] Batch ${batchCount}: found ${items.length} items to delete`);

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      // 删除这批数据
      const deletePromises = items.map(item => {
        const id = item.pool_id || item._id;
        if (id) {
          return db.collection('ai_question_pool').doc(id).remove()
            .catch(e => console.log(`[CLEAN] Failed to delete ${id}:`, e.message));
        }
        return Promise.resolve();
      });

      await Promise.all(deletePromises);
      totalDeleted += items.length;
      console.log(`[CLEAN] Batch ${batchCount}: deleted ${items.length} items, total: ${totalDeleted}`);

      // 防止无限循环
      if (batchCount > 100) {
        console.log('[CLEAN] Safety limit reached (100 batches)');
        break;
      }
    }

    console.log(`[CLEAN] Cleanup complete. Total deleted: ${totalDeleted}`);

    return {
      success: true,
      totalDeleted,
      message: `已清理 ${totalDeleted} 条无年级数据`
    };

  } catch (error) {
    console.error('[CLEAN] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
