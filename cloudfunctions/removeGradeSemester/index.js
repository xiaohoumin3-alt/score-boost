/**
 * removeGradeSemester 云函数
 * 清理 ai_question_pool 中的冗余 grade/semester 字段
 *
 * 执行方式：tcb functions deploy removeGradeSemester
 * 然后在云开发控制台调用
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    console.log('=== 开始清理 grade/semester 字段 ===');

    // 统计当前有这些字段的记录数
    const hasGrade = await db.collection('ai_question_pool')
      .where({ grade: db.command.exists(true) })
      .count();

    const hasSemester = await db.collection('ai_question_pool')
      .where({ semester: db.command.exists(true) })
      .count();

    console.log(`有 grade 字段的记录: ${hasGrade.total || 0}`);
    console.log(`有 semester 字段的记录: ${hasSemester.total || 0}`);

    // 微信云数据库不支持直接删除字段
    // 需要逐条更新，使用 unset 删除字段
    // 注意：云数据库的 update 使用 .unset() 方法

    const batchSize = 100;
    let totalUpdated = 0;

    // 分批处理有 grade 字段的记录
    let hasMore = true;
    let skip = 0;

    while (hasMore) {
      const batch = await db.collection('ai_question_pool')
        .where({ grade: db.command.exists(true) })
        .limit(batchSize)
        .skip(skip)
        .field({ _id: true })
        .get();

      if (batch.data.length === 0) {
        hasMore = false;
        break;
      }

      for (const record of batch.data) {
        try {
          // 使用 update + data 删除字段
          await db.collection('ai_question_pool').doc(record._id).update({
            data: {
              grade: db.command.remove(),
              semester: db.command.remove()
            }
          });
          totalUpdated++;
        } catch (e) {
          console.error(`删除字段失败 ${record._id}:`, e.message);
        }
      }

      skip += batchSize;
      console.log(`已处理 ${totalUpdated}/${hasGrade.total || 0}`);
    }

    // 验证清理结果
    const remainingGrade = await db.collection('ai_question_pool')
      .where({ grade: db.command.exists(true) })
      .count();

    const remainingSemester = await db.collection('ai_question_pool')
      .where({ semester: db.command.exists(true) })
      .count();

    return {
      success: true,
      updated: totalUpdated,
      remaining: {
        grade: remainingGrade.total || 0,
        semester: remainingSemester.total || 0
      },
      message: `成功清理 ${totalUpdated} 条记录的 grade/semester 字段`
    };

  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
};
