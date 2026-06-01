/**
 * generateDailyTask 云函数
 * 生成每日个性化任务（AI原生Phase 2）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 冷启动任务（新用户或无薄弱点数据）
 */
function getColdStartTask() {
  return {
    success: true,
    data: {
      title: '二次根式基础·5分钟',
      reason: '让我们开始今天的练习，巩固基础',
      estimated_time: 5,
      question_count: 3,
      kp_id: 'kp_003',
      kp_name: '二次根式',
      difficulty: 'easy',
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * 选择最紧迫的薄弱点
 * 优先级: 错误次数 > 最近错误 > 难度
 */
function selectMostUrgentWeakPoint(weakPoints) {
  if (!weakPoints || weakPoints.length === 0) {
    return null;
  }

  // 按错误次数排序
  const sorted = [...weakPoints].sort((a, b) => {
    const aCount = a.error_count || 0;
    const bCount = b.error_count || 0;
    return bCount - aCount;
  });

  return sorted[0];
}

/**
 * 生成每日任务
 */
exports.main = async (event, context) => {
  const { student_id } = event.data || event;

  try {
    console.log('[generateDailyTask] Generating for', student_id);

    // 1. 获取学生Memory
    const memoryResult = await cloud.callFunction({
      name: 'studentMemory',
      data: { action: 'get', student_id }
    });

    if (!memoryResult.result || !memoryResult.result.success) {
      console.log('[generateDailyTask] Memory fetch failed, using cold start');
      return getColdStartTask();
    }

    const memory = memoryResult.result.data;

    // 2. 冷启动处理：新用户或无薄弱点
    if (!memory.summary.weak_points || memory.summary.weak_points.length === 0) {
      console.log('[generateDailyTask] No weak points, using cold start');
      return getColdStartTask();
    }

    // 3. 选择最紧迫的薄弱点
    const targetWP = selectMostUrgentWeakPoint(memory.summary.weak_points);

    if (!targetWP) {
      return getColdStartTask();
    }

    // 4. 生成任务卡片
    const errorCount = targetWP.error_count || 1;
    const pattern = targetWP.pattern || '相关题目';

    const task = {
      title: `${targetWP.kp_name}·5分钟`,
      reason: `因为你最近在"${pattern}"上错了${errorCount}次`,
      estimated_time: 5,
      question_count: 3,
      kp_id: targetWP.kp_id,
      kp_name: targetWP.kp_name,
      difficulty: 'easy',  // 从薄弱点开始，用简单题建立信心
      generated_at: new Date().toISOString(),
      target_weak_point: {
        kp_id: targetWP.kp_id,
        kp_name: targetWP.kp_name,
        error_count: errorCount,
        pattern: pattern
      }
    };

    console.log('[generateDailyTask] Task generated:', task.title);

    return { success: true, data: task };

  } catch (e) {
    console.error('[generateDailyTask] Error:', e);
    // 失败时返回默认任务
    return getColdStartTask();
  }
};
