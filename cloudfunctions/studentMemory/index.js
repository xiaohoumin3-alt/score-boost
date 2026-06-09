/**
 * studentMemory 云函数
 * 管理学生记忆（Memory系统）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 知识点→年级/科目映射（用于 kp_id 前缀解析）
const kpGradeSubjectMap = {
  'kp': 'kp',
  'bio': 'bio',
  'geo': 'geo',
  'ch': 'ch',
  'en': 'en',
  'phy': 'phy',
  'chem': 'chem',
  'hist': 'hist',
  'pol': 'pol'
};

// 科目中文→英文映射
const SUBJECT_NAME_MAP = {
  '语文': 'chinese',
  '数学': 'math',
  '英语': 'english',
  '物理': 'physics',
  '化学': 'chemistry',
  '生物': 'biology',
  '历史': 'history',
  '地理': 'geography',
  '政治': 'politics'
};

// 年级中文→数字映射
const GRADE_NAME_MAP = {
  '一年级': '1', '二年级': '2', '三年级': '3',
  '四年级': '4', '五年级': '5', '六年级': '6',
  '七年级': '7', '八年级': '8', '九年级': '9'
};

/**
 * 获取默认记忆模板
 */
function getDefaultMemory(studentId) {
  return {
    student_id: studentId,
    summary: {
      recent_progress: [],
      current_score: 0,
      target_score: 85,
      weak_points: [],
      mastered: [],
      learning_trend: 'stable',
      consecutive_days: 0,
      ai_summary: ''
    },
    profile: {
      grade: '',
      subject: 'math',
      learning_style: 'visual',
      strong_points: [],
      weak_areas: [],
      preferred_difficulty: 'medium',
      avg_time_per_question: 90
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * 获取学生记忆
 */
async function getMemory(studentId) {
  try {
    const result = await db.collection('student_memory')
      .where({ student_id: studentId })
      .get();

    if (result.data && result.data.length > 0) {
      const memory = result.data[0];
      const weakPoints = memory.summary?.weak_points || [];
      if (weakPoints.length > 0) {
        const kpIds = weakPoints.map(wp => wp.kp_id || wp.id).filter(Boolean);
        // 使用 db.command.in 批量查询
        if (kpIds.length > 0) {
          try {
            const kpResult = await db.collection('knowledge_points')
              .where({ kp_id: _.in(kpIds) })
              .limit(kpIds.length)
              .get();
            if (kpResult.data && kpResult.data.length > 0) {
              const kpMap = {};
              kpResult.data.forEach(kp => {
                kpMap[kp.kp_id] = { grade: kp.grade, subject: kp.subject };
              });
              memory._kpInfo = kpMap;
            }
          } catch (e) {
            console.warn('[getMemory] knowledge_points query failed:', e.message);
          }
        }
      }
      return { success: true, data: memory };
    }

    // 新用户：返回默认记忆模板
    return {
      success: true,
      data: getDefaultMemory(studentId)
    };
  } catch (e) {
    console.error('[getMemory] Error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 更新学生记忆
 */
async function updateMemory(studentId, updateData) {
  try {
    const existing = await db.collection('student_memory')
      .where({ student_id: studentId })
      .get();

    const now = new Date().toISOString();

    if (existing.data && existing.data.length > 0) {
      // 更新现有记忆
      await db.collection('student_memory')
        .doc(existing.data[0]._id)
        .update({
          data: {
            ...updateData,
            updated_at: now
          }
        });
    } else {
      // 创建新记忆
      await db.collection('student_memory').add({
        data: {
          student_id: studentId,
          ...getDefaultMemory(studentId),
          ...updateData,
          created_at: now,
          updated_at: now
        }
      });
    }

    return { success: true };
  } catch (e) {
    console.error('[updateMemory] Error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 添加练习进度记录
 */
async function addProgress(studentId, progressData) {
  try {
    const result = await db.collection('student_memory')
      .where({ student_id: studentId })
      .get();

    if (result.data && result.data.length > 0) {
      const memory = result.data[0];
      const currentProgress = memory.summary.recent_progress || [];

      // 添加新进度
      const newProgress = [...currentProgress, {
        date: new Date().toISOString().split('T')[0],
        ...progressData
      }].slice(-20); // 只保留最近20条

      await db.collection('student_memory')
        .doc(memory._id)
        .update({
          data: {
            'summary.recent_progress': newProgress,
            updated_at: new Date().toISOString()
          }
        });

      return { success: true };
    }

    return { success: false, error: 'Memory not found' };
  } catch (e) {
    console.error('[addProgress] Error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 更新薄弱知识点
 */
async function updateWeakPoints(studentId, weakPoints) {
  try {
    const result = await db.collection('student_memory')
      .where({ student_id: studentId })
      .get();

    if (result.data && result.data.length > 0) {
      await db.collection('student_memory')
        .doc(result.data[0]._id)
        .update({
          data: {
            'summary.weak_points': weakPoints,
            updated_at: new Date().toISOString()
          }
        });

      return { success: true };
    }

    return { success: false, error: 'Memory not found' };
  } catch (e) {
    console.error('[updateWeakPoints] Error:', e);
    return { success: false, error: e.message };
  }
}

// 云函数入口
exports.main = async (event, context) => {
  const { action, student_id, data } = event;

  switch (action) {
    case 'get':
      return await getMemory(student_id);
    case 'update':
      return await updateMemory(student_id, data);
    case 'addProgress':
      return await addProgress(student_id, data);
    case 'updateWeakPoints':
      return await updateWeakPoints(student_id, data);
    default:
      return { success: false, error: 'Unknown action' };
  }
};
