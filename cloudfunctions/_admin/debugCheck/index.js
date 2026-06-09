const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { action } = event;

  try {
    if (action === 'check_kp_progress') {
      // 检查 kp_progress 数据
      const result = await db.collection('kp_progress')
        .limit(5)
        .get();

      return {
        success: true,
        count: result.data.length,
        data: result.data
      };
    }

    if (action === 'check_knowledge_points') {
      // 检查 knowledge_points 数据
      const result = await db.collection('knowledge_points')
        .field({ kp_id: true, grade: true, subject: true })
        .limit(5)
        .get();

      return {
        success: true,
        count: result.data.length,
        data: result.data
      };
    }

    if (action === 'check_student_memory') {
      // 检查 student_memory 数据
      const result = await db.collection('student_memory')
        .limit(5)
        .get();

      return {
        success: true,
        count: result.data.length,
        data: result.data
      };
    }

    if (action === 'check_pending_reviews') {
      // 检查是否有待复习数据
      const { student_id } = event;
      const now = new Date();

      const result = await db.collection('kp_progress')
        .where({
          student_id: student_id
        })
        .get();

      // 过滤出需要复习的
      const pending = result.data.filter(item => {
        if (!item.next_review_at) return false;
        return new Date(item.next_review_at) <= now;
      });

      return {
        success: true,
        total_count: result.data.length,
        pending_count: pending.length,
        pending_data: pending
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
