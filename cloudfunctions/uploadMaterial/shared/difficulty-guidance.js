/**
 * 统一难度指导管理
 * 支持学段/学科/模式感知的难度指导
 */

/**
 * 获取学段（primary/junior/unknown）
 * @param {string} grade - 年级
 * @returns {string} 学段
 */
function getGradeBand(grade) {
  const numGrade = parseInt(grade, 10);
  if (numGrade >= 1 && numGrade <= 6) return 'primary';
  if (numGrade >= 7 && numGrade <= 9) return 'junior';
  return 'unknown';
}

/**
 * 获取学段基础指导
 * @param {string} gradeBand - 学段
 * @param {string} difficulty - 难度
 * @returns {string} 指导文本
 */
function getBandGuidance(gradeBand, difficulty) {
  const primaryGuidance = {
    easy: `【小学简单】
- 生活化场景，短句描述
- 一题一个核心知识点
- 计算量小，数字简单
- 选项差异明显`,

    medium: `【小学中等】
- 需要1-2步推理
- 可能涉及简单应用
- 选项有一定迷惑性
- 仍在本年级知识范围内`,

    hard: `【小学困难】
- 需要2-3步推理
- 可能涉及综合应用
- 选项高度相似
- 仍是本年级内容，不超纲`
  };

  const juniorGuidance = {
    easy: `【初中简单】
- 基本概念直接应用
- 单步或两步推理
- 计算适中
- 选项有一个明显正确答案`,

    medium: `【初中中等】
- 需要2-3步推理
- 可能涉及概念辨析
- 章节内综合应用
- 选项有一定迷惑性`,

    hard: `【初中困难】
- 多步推理或抽象理解
- 可能需要逆向思维
- 常见错误干扰项
- 选项高度相似，需仔细辨别`
  };

  const unknownGuidance = {
    easy: `【默认简单】
- 直接套用公式或基本概念
- 单步推理
- 数据简单
- 选项差异明显`,

    medium: `【默认中等】
- 需要适度变形或转换
- 2-3步推理
- 选项有一定迷惑性`,

    hard: `【默认困难】
- 多步推理
- 可能涉及抽象概念
- 选项高度相似`
  };

  const guidance = gradeBand === 'primary' ? primaryGuidance 
    : gradeBand === 'junior' ? juniorGuidance 
    : unknownGuidance;

  return guidance[difficulty] || guidance.medium;
}

/**
 * 获取学科特定规则
 * @param {string} subject - 学科
 * @param {string} gradeBand - 学段
 * @returns {string} 规则文本
 */
function getSubjectRules(subject, gradeBand) {
  const rules = {
    math: gradeBand === 'primary'
      ? `【数学-小学】
- 使用生活化场景
- 避免抽象符号
- 计算量小，数字简单
- 不出现代数式或方程`
      : `【数学-初中】
- 可使用代数符号
- 按年级控制概念范围
- 避免高中内容（如二次根式、勾股定理超纲使用）
- 数学符号使用Unicode（√ 而非 \sqrt）`,

    chinese: gradeBand === 'primary'
      ? `【语文-小学】
- 题干材料简短
- 侧重字词句基础
- 避免成人化文学常识
- 不出现复杂文言文`
      : `【语文-初中】
- 可包含阅读理解
- 文言文基础
- 适当文学常识
- 避免高中深度`,

    english: gradeBand === 'primary'
      ? `【英语-小学】
- 控制词汇量（基础词汇）
- 简单句型
- 不出现高阶从句
- 生活化场景`
      : `【英语-初中】
- 可包含语法辨析
- 适当复杂句型
- 按年级控制难度
- 避免高中语法`,

    physics: `【物理】
- 仅8-9年级
- 强调生活现象
- 注意单位使用
- 概念边界清晰
- 不涉及高中物理`,

    chemistry: `【化学】
- 仅9年级
- 基础化学概念
- 避免高中化学内容
- 实验现象描述`,

    biology: `【生物】
- 按初中综合测评范围
- 基础生命科学
- 避免高中遗传深度
- 生活化实例`,

    geography: `【地理】
- 按初中教材范围
- 中国地理/世界地理基础
- 不涉及高中地理深度`,

    history: `【历史】
- 按初中教材范围
- 基础历史事件
- 不涉及高中历史深度`,

    politics: `【政治】
- 按初中教材范围
- 基础法律/道德知识
- 不涉及高中政治深度`
  };

  return rules[subject] || '';
}

/**
 * 获取模式特定规则
 * @param {string} mode - 模式
 * @returns {string} 规则文本
 */
function getModeRules(mode) {
  const rules = {
    huikao: `【综合测评模式】
- 覆盖该科目全年级知识点
- 综合性强，注重知识串联
- 难度分布：简单40% + 中等40% + 困难20%`,

    practice: `【练习模式】
- 围绕目标知识点生成
- 不扩展到其他章节
- 针对学生薄弱点`,

    parent_assessment: `【亲子测评-家长题】
- 适合家长辅助
- 题目相对简单
- 注重基础概念`,

    child_assessment: `【亲子测评-孩子题】
- 与家长题同知识点/同范围
- 适合学生独立完成
- 难度适中`
  };

  return rules[mode] || '';
}

/**
 * 获取难度指导（统一入口）
 * 支持两种调用方式：
 * 1. 新接口：getDifficultyGuidance({ difficulty, grade, subject, mode })
 * 2. 旧接口：getDifficultyGuidance(difficulty, grade) - 向后兼容
 * @param {Object|string} options - 配置或难度
 * @param {string} [grade] - 年级（旧接口）
 * @returns {string} 指导文本
 */
function getDifficultyGuidance(options, grade) {
  // 兼容旧接口
  let difficulty, subject, mode;
  if (typeof options === 'string') {
    difficulty = options;
    subject = undefined;
    mode = undefined;
    grade = grade;
  } else {
    difficulty = options.difficulty;
    grade = options.grade;
    subject = options.subject;
    mode = options.mode;
  }

  const gradeBand = getGradeBand(grade);
  const base = getBandGuidance(gradeBand, difficulty);
  const subjectRules = getSubjectRules(subject, gradeBand);
  const modeRules = getModeRules(mode);
  
  return [base, subjectRules, modeRules].filter(Boolean).join('\n\n');
}

module.exports = {
  getDifficultyGuidance,
  getGradeBand,
  getBandGuidance,
  getSubjectRules,
  getModeRules
};
