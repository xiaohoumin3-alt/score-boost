/**
 * fixMissingFields 云函数
 * 修复历史数据：添加 grade, semester 字段
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  try {
    console.log('=== 开始修复缺失字段 ===');

    // 查找 grade 为空的题目
    const emptyGradeResult = await db.collection('ai_question_pool')
      .where({
        grade: _.exists(false)
      })
      .field({ _id: true, subject: true, created_at: true })
      .limit(1000)
      .get();

    const emptyGradeIds = emptyGradeResult.data.map(q => q._id);
    console.log(`找到 ${emptyGradeIds.length} 道缺少 grade 的题目`);

    if (emptyGradeIds.length === 0) {
      return { success: true, updated: 0, message: '没有需要修复的题目' };
    }

    // 批量更新
    let updated = 0;
    const batchSize = 100;

    for (let i = 0; i < emptyGradeIds.length; i += batchSize) {
      const batch = emptyGradeIds.slice(i, i + batchSize);

      for (const id of batch) {
        try {
          await db.collection('ai_question_pool').doc(id).update({
            data: {
              grade: '7',      // 默认七年级
              semester: '下'   // 默认下册
            }
          });
          updated++;
        } catch (e) {
          console.error(`更新失败 ${id}:`, e.message);
        }
      }

      console.log(`已更新 ${updated}/${emptyGradeIds.length}`);
    }

    // 检查修复后状态
    const remainingEmpty = await db.collection('ai_question_pool')
      .where({ grade: _.exists(false) })
      .count();

    return {
      success: true,
      updated,
      remaining: remainingEmpty.total || 0,
      message: `成功修复 ${updated} 道题目，剩余 ${remainingEmpty.total || 0} 道`
    };

  } catch (e) {
    return {
      success: false,
      error: e.message,
      updated: 0
    };
  }
};
