/**
 * fixEmptySubjects 云函数
 * 功能：将科目为空的题目更新为 biology
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  try {
    console.log('=== 开始修复科目为空的题目 ===');

    // 查找科目为空的题目
    const emptyResult = await db.collection('ai_question_pool')
      .where({
        subject: _.exists(false)
      })
      .field({ _id: true, created_at: true })
      .limit(1000)
      .get();

    const emptyIds = emptyResult.data.map(q => q._id);
    console.log(`找到 ${emptyIds.length} 道科目为空的题目`);

    if (emptyIds.length === 0) {
      return { success: true, updated: 0, message: '没有需要修复的题目' };
    }

    // 批量更新（每次100条）
    let updated = 0;
    const batchSize = 100;

    for (let i = 0; i < emptyIds.length; i += batchSize) {
      const batch = emptyIds.slice(i, i + batchSize);

      for (const id of batch) {
        try {
          await db.collection('ai_question_pool').doc(id).update({
            data: { subject: 'biology' }
          });
          updated++;
        } catch (e) {
          console.error(`更新失败 ${id}:`, e.message);
        }
      }

      console.log(`已更新 ${updated}/${emptyIds.length}`);
    }

    return {
      success: true,
      updated,
      message: `成功修复 ${updated} 道题目`
    };

  } catch (e) {
    return {
      success: false,
      error: e.message,
      updated: 0
    };
  }
};
