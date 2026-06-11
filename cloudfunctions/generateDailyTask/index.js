/**
 * generateDailyTask 云函数
 * 生成每日个性化任务（AI原生Phase 2）
 */

const cloud = require('wx-server-sdk');
const { success, error } = require('./shared/response-helper');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const wxContext = cloud.getWXContext();
const db = cloud.database();

/**
 * 冷启动任务（新用户或无薄弱点数据）
 * 导出用于测试
 */
function getColdStartTask(subject, grade) {
  // Dynamically pick a knowledge point based on grade/subject
  const subjectNames = {
    math: '数学', biology: '生物', geography: '地理',
    chinese: '语文', english: '英语', physics: '物理',
    chemistry: '化学', history: '历史', politics: '政治'
  };

  const gradeDefaults = {
    '1': { math: { name: '100以内加减法', id: 'math_g1_add_sub' } },
    '2': { math: { name: '乘法口诀', id: 'math_g2_mul' } },
    '3': { math: { name: '除法初步', id: 'math_g3_div' } },
    '4': { math: { name: '四则运算', id: 'math_g4_arith' } },
    '5': { math: { name: '小数运算', id: 'math_g5_decimal' } },
    '6': { math: { name: '分数运算', id: 'math_g6_fraction' } },
    '7': { math: { name: '有理数', id: 'math_g7_rational' } },
    '8': { math: { name: '一次函数', id: 'math_g8_linear_func' } },
    '9': { math: { name: '二次根式', id: 'math_g9_radical' } },
  };

  const subjectText = subjectNames[subject] || '数学';
  const normalizedGrade = String(grade || '').replace(/[^0-9]/g, '') || '1';
  const gradeInfo = gradeDefaults[normalizedGrade];
  const kpInfo = (gradeInfo && gradeInfo[subject || 'math']) || { name: '基础练习', id: 'kp_default' };

  return {
    success: true,
    data: {
      action: 'start_assessment',  // 冷启动需先测评
      title: `${kpInfo.name}·5分钟`,
      reason: `让我们开始今天的${subjectText}练习，巩固基础`,
      estimated_time: 5,
      question_count: 3,
      kp_id: kpInfo.id,
      kp_name: kpInfo.name,
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
  const rawData = event.data || event;
  let { subject, grade } = rawData;

  // 科目映射：中文 -> 英文
  const subjectMap = {
    '语文': 'chinese', '数学': 'math', '英语': 'english',
    '物理': 'physics', '化学': 'chemistry', '生物': 'biology',
    '历史': 'history', '地理': 'geography', '政治': 'politics'
  };
  if (subjectMap[subject]) subject = subjectMap[subject];

  // 年级映射：中文 -> 数字
  const gradeMap = {
    '一年级': '1', '二年级': '2', '三年级': '3',
    '四年级': '4', '五年级': '5', '六年级': '6',
    '七年级': '7', '八年级': '8', '九年级': '9'
  };
  if (gradeMap[grade]) grade = gradeMap[grade];

  const student_id = (event.data || event).student_id || wxContext.OPENID;

  // 科目-年级兼容性验证（防止二年级选择化学等无效组合）
  const SUBJECT_GRADE_MATRIX = {
    'math': { min: 1, max: 9 },
    'chinese': { min: 1, max: 9 },
    'english': { min: 1, max: 6 },
    'biology': { min: 7, max: 8 },
    'geography': { min: 7, max: 8 },
    'history': { min: 7, max: 9 },
    'politics': { min: 7, max: 9 },
    'physics': { min: 8, max: 9 },
    'chemistry': { min: 9, max: 9 }
  };
  const subjectTextMap = {
    'math': '数学', 'chinese': '语文', 'english': '英语',
    'biology': '生物', 'geography': '地理', 'history': '历史',
    'politics': '政治', 'physics': '物理', 'chemistry': '化学'
  };
  const gradeNum = parseInt(grade, 10);
  const validRange = SUBJECT_GRADE_MATRIX[subject];
  if (!validRange || isNaN(gradeNum) || gradeNum < validRange.min || gradeNum > validRange.max) {
    const subjectName = subjectTextMap[subject] || subject;
    if (validRange) {
      return {
        success: false,
        error: `${subjectName}仅适用于${validRange.min}-${validRange.max}年级，当前选择${gradeNum}年级`
      };
    } else {
      return {
        success: false,
        error: `不支持的科目：${subjectName}`
      };
    }
  }

  try {
    console.log('[generateDailyTask] Generating for', student_id);

    // 1. 获取学生Memory
    const memoryResult = await cloud.callFunction({
      name: 'studentMemory',
      data: { action: 'get', student_id, subject, grade }
    });

    if (!memoryResult.result || !memoryResult.result.success) {
      console.log('[generateDailyTask] Memory fetch failed, using cold start');
      return getColdStartTask(subject, grade);
    }

    const memory = memoryResult.result.data;

    // 2. 冷启动处理：新用户或无薄弱点
    if (!memory.summary.weak_points || memory.summary.weak_points.length === 0) {
      console.log('[generateDailyTask] No weak points, using cold start');
      return getColdStartTask(subject, grade);
    }

    // 3. 选择最紧迫的薄弱点
    const targetWP = selectMostUrgentWeakPoint(memory.summary.weak_points);

    if (!targetWP) {
      return getColdStartTask(subject, grade);
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
    return getColdStartTask(subject, grade);
  }
};

// 导出测试用函数
exports.getColdStartTask = getColdStartTask;
