const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action } = event;

  try {
    if (action === 'fix_kp_progress_student_id') {
      // 修复 kp_progress 的 student_id
      const { test_student_id } = event;

      // 1. 先查询所有 student_id 为 null 的记录
      const nullRecords = await db.collection('kp_progress')
        .where({
          student_id: _.or(_.eq(null), _.eq(''))
        })
        .get();

      console.log(`找到 ${nullRecords.data.length} 条 student_id 为空的记录`);

      if (nullRecords.data.length === 0) {
        return {
          success: true,
          message: '没有需要修复的记录',
          count: 0
        };
      }

      // 2. 批量更新（每条单独更新）
      let updateCount = 0;
      const errors = [];

      for (const record of nullRecords.data) {
        try {
          await db.collection('kp_progress').doc(record._id).update({
            data: {
              student_id: test_student_id
            }
          });
          updateCount++;
        } catch (e) {
          errors.push({
            id: record._id,
            error: e.message
          });
        }
      }

      return {
        success: true,
        updateCount,
        total: nullRecords.data.length,
        errors: errors.slice(0, 10)  // 只返回前10个错误
      };
    }

    if (action === 'add_next_review_dates') {
      // 为 kp_progress 添加 next_review_at 字段
      const { test_student_id } = event;

      const records = await db.collection('kp_progress')
        .where({
          student_id: test_student_id,
          next_review_at: _.or(_.eq(null), _.eq(''))
        })
        .get();

      console.log(`找到 ${records.data.length} 条需要添加复习时间的记录`);

      let updateCount = 0;
      const now = new Date();

      for (const record of records.data) {
        try {
          // 设置复习时间为当前时间（使其立即显示为待复习）
          await db.collection('kp_progress').doc(record._id).update({
            data: {
              next_review_at: now.toISOString()
            }
          });
          updateCount++;
        } catch (e) {
          console.error(`更新失败 ${record._id}:`, e.message);
        }
      }

      return {
        success: true,
        updateCount,
        total: records.data.length
      };
    }

    if (action === 'create_student_memory_collection') {
      // 创建 student_memory 集合（通过插入一条测试记录）
      try {
        await db.collection('student_memory').add({
          data: {
            student_id: '_test_record_',
            created_at: new Date().toISOString(),
            test: true
          }
        });

        // 立即删除测试记录
        const testRecords = await db.collection('student_memory')
          .where({ student_id: '_test_record_' })
          .get();

        if (testRecords.data.length > 0) {
          await db.collection('student_memory').doc(testRecords.data[0]._id).remove();
        }

        return {
          success: true,
          message: 'student_memory 集合已创建'
        };
      } catch (e) {
        return {
          success: false,
          error: e.message
        };
      }
    }

    if (action === 'check_status') {
      // 检查当前状态
      const kpProgressCount = (await db.collection('kp_progress').count()).total;
      const knowledgePointsCount = (await db.collection('knowledge_points').count()).total;

      // 检查 student_memory 是否存在
      let studentMemoryExists = false;
      let studentMemoryCount = 0;
      try {
        studentMemoryCount = (await db.collection('student_memory').count()).total;
        studentMemoryExists = true;
      } catch (e) {
        // 集合不存在
      }

      // 检查 kp_progress 中 student_id 为空的记录数
      const nullStudentIdRecords = await db.collection('kp_progress')
        .where({
          student_id: _.or(_.eq(null), _.eq(''))
        })
        .count();

      // 检查 kp_progress 中缺少 next_review_at 的记录数
      const nullNextReviewRecords = await db.collection('kp_progress')
        .where({
          next_review_at: _.or(_.eq(null), _.eq(''))
        })
        .count();

      return {
        success: true,
        status: {
          kp_progress_total: kpProgressCount,
          knowledge_points_total: knowledgePointsCount,
          student_memory_exists: studentMemoryExists,
          student_memory_count: studentMemoryCount,
          null_student_id_count: nullStudentIdRecords.total,
          null_next_review_count: nullNextReviewRecords.total
        }
      };
    }

    return {
      success: false,
      error: 'Unknown action'
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      stack: e.stack
    };
  }
};
