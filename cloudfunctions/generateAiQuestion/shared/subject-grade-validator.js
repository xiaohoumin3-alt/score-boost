/**
 * 科目-年级兼容性验证器
 * 防止无效组合（如二年级化学）
 */

/**
 * 科目-年级兼容性矩阵
 * 定义每个科目支持的年级范围
 */
const SUBJECT_GRADE_MATRIX = {
  'math': { min: 1, max: 9 },
  'chinese': { min: 1, max: 9 },
  'english': { min: 1, max: 9 },
  'biology': { min: 7, max: 8 },
  'geography': { min: 7, max: 8 },
  'history': { min: 7, max: 9 },
  'politics': { min: 7, max: 9 },
  'physics': { min: 8, max: 9 },
  'chemistry': { min: 9, max: 9 }
};

/**
 * 科目名称映射（中文/英文）
 */
const SUBJECT_NAME_MAP = {
  'math': '数学',
  'chinese': '语文',
  'english': '英语',
  'biology': '生物',
  'geography': '地理',
  'history': '历史',
  'politics': '政治',
  'physics': '物理',
  'chemistry': '化学'
};

/**
 * 年级映射（中文/数字）
 */
const GRADE_MAP = {
  '一年级': '1', '二年级': '2', '三年级': '3',
  '四年级': '4', '五年级': '5', '六年级': '6',
  '七年级': '7', '八年级': '8', '九年级': '9'
};

/**
 * 验证科目-年级组合是否兼容
 * @param {string} subject - 科目代码（math/chinese/english等）
 * @param {string|number} grade - 年级（1-9或中文年级）
 * @returns {Object} {valid: boolean, error?: string}
 */
function validateSubjectGrade(subject, grade) {
  // 规范化年级
  const gradeNum = normalizeGrade(grade);
  if (gradeNum === null) {
    return {
      valid: false,
      error: `无效的年级: ${grade}`
    };
  }

  // 获取科目范围
  const validRange = SUBJECT_GRADE_MATRIX[subject];
  if (!validRange) {
    const subjectName = SUBJECT_NAME_MAP[subject] || subject;
    return {
      valid: false,
      error: `不支持的科目: ${subjectName}`
    };
  }

  // 验证年级范围
  if (gradeNum < validRange.min || gradeNum > validRange.max) {
    const subjectName = SUBJECT_NAME_MAP[subject] || subject;
    return {
      valid: false,
      error: `${subjectName}仅适用于${validRange.min}-${validRange.max}年级，当前选择${gradeNum}年级`
    };
  }

  return { valid: true };
}

/**
 * 规范化年级为数字
 * @param {string|number} grade - 年级
 * @returns {number|null} 1-9的数字，或null表示无效
 */
function normalizeGrade(grade) {
  if (typeof grade === 'number') {
    return (grade >= 1 && grade <= 9) ? grade : null;
  }

  // 中文转数字
  if (typeof grade === 'string') {
    const normalized = GRADE_MAP[grade] || grade;
    const num = parseInt(normalized, 10);
    return (num >= 1 && num <= 9) ? num : null;
  }

  return null;
}

/**
 * 获取科目支持的年级范围
 * @param {string} subject - 科目代码
 * @returns {Object|null} {min, max} 或 null
 */
function getGradeRange(subject) {
  return SUBJECT_GRADE_MATRIX[subject] || null;
}

/**
 * 获取所有支持的科目列表
 * @returns {string[]} 科目代码数组
 */
function getSupportedSubjects() {
  return Object.keys(SUBJECT_GRADE_MATRIX);
}

/**
 * 检查科目是否支持指定年级
 * @param {string} subject - 科目代码
 * @param {string|number} grade - 年级
 * @returns {boolean}
 */
function isSubjectAvailableForGrade(subject, grade) {
  const result = validateSubjectGrade(subject, grade);
  return result.valid;
}

module.exports = {
  validateSubjectGrade,
  normalizeGrade,
  getGradeRange,
  getSupportedSubjects,
  isSubjectAvailableForGrade,
  SUBJECT_GRADE_MATRIX,
  SUBJECT_NAME_MAP,
  GRADE_MAP
};
