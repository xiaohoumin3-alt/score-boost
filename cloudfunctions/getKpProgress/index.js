/**
 * 获取学生知识点进度
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 默认进度模板
const DEFAULT_PROGRESS = {
  easy: { consecutive_correct: 0, completed: false },
  medium: { consecutive_correct: 0, completed: false },
  hard: { consecutive_correct: 0, completed: false },
  current_difficulty: 'easy'
};

exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const { student_id, kp_id } = params;

    if (!student_id) {
      return { success: false, error: '缺少 student_id' };
    }

    // 查询进度记录
    const query = kp_id
      ? db.collection('kp_progress').where({ student_id, kp_id })
      : db.collection('kp_progress').where({ student_id });

    const result = await query.get();

    // 没有记录时返回默认值
    if (!result.data || result.data.length === 0) {
      return {
        success: true,
        data: kp_id
          ? { kp_id, ...DEFAULT_PROGRESS }
          : []
      };
    }

    // 有记录时返回
    return {
      success: true,
      data: kp_id ? result.data[0] : result.data
    };

  } catch (e) {
    console.error('getKpProgress error:', e);
    return { success: false, error: e.message || String(e) };
  }
};