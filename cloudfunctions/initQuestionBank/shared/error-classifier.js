/**
 * 错误分类器 - 共享模块
 * 导师诊断核心：根据学生答题行为分类错误原因
 * 
 * 错误类型：
 * - careless: 粗心（审题/计算不仔细）→ Level 1提示
 * - concept: 概念错误（理解偏差）→ Level 3提示
 * - calculation: 计算卡壳（步骤跳漏）→ Level 2提示
 * - unknown: 无法分类
 */

const ERROR_TYPES = {
  CARELESS: 'careless',
  CONCEPT: 'concept',
  CALCULATION: 'calculation',
  UNKNOWN: 'unknown'
};

const HINT_LEVELS = {
  careless: 1,   // 直接提示
  concept: 3,    // 概念讲解
  calculation: 2 // 步骤引导
};

/**
 * 错误分类决策树
 * @param {Object} params
 * @param {string} params.kpName - 知识点名称
 * @param {string} params.kpId - 知识点ID
 * @param {string} params.userAnswer - 学生答案
 * @param {string} params.correctAnswer - 正确答案
 * @param {string} params.difficulty - 难度 easy/medium/hard
 * @param {number} params.consecutiveCorrect - 连续正确次数
 * @param {number} params.consecutiveWrong - 连续错误次数
 * @param {number} params.timeSpent - 答题用时（秒）
 * @param {string} params.questionType - 题型 choice/fill/calculation
 * @returns {Object} {error_type, confidence, reason, hint_level, hint_text}
 */
function classifyError(params) {
  const {
    kpName = '',
    kpId = '',
    userAnswer = '',
    correctAnswer = '',
    difficulty = 'medium',
    consecutiveCorrect = 0,
    consecutiveWrong = 0,
    timeSpent = 0,
    questionType = 'choice'
  } = params;

  const uAns = userAnswer.toString().trim().toUpperCase();
  const cAns = correctAnswer.toString().trim().toUpperCase();

  // === 规则1: 粗心检测 ===
  // 1.1 答案格式错误但数值接近（如选了B而不是A）
  if (isFormatError(uAns, cAns)) {
    return {
      error_type: ERROR_TYPES.CARELESS,
      confidence: 0.75,
      reason: '答案接近，可能是粗心选错',
      hint_level: HINT_LEVELS.CARELESS,
      hint_text: '再读一遍题目，你选的是B，正确答案是A。注意选项的字母！'
    };
  }

  // 1.2 正负号错误（简单题尤其明显）
  if (isSignError(uAns, cAns)) {
    return {
      error_type: ERROR_TYPES.CARELESS,
      confidence: 0.70,
      reason: '正负号错误，粗心问题',
      hint_level: HINT_LEVELS.CARELESS,
      hint_text: '注意符号！正确答案前面有负号，你的答案漏了符号。'
    };
  }

  // 1.3 小数点位数错误
  if (isDecimalError(uAns, cAns)) {
    return {
      error_type: ERROR_TYPES.CARELESS,
      confidence: 0.65,
      reason: '小数点位数错误',
      hint_level: HINT_LEVELS.CARELESS,
      hint_text: '检查小数点位置，你的答案小数位数不对。'
    };
  }

  // 1.4 答题时间很短但错了（来不及看题）
  if (timeSpent > 0 && timeSpent < 10 && difficulty === 'easy') {
    return {
      error_type: ERROR_TYPES.CARELESS,
      confidence: 0.60,
      reason: '答题时间极短，可能没仔细审题',
      hint_level: HINT_LEVELS.CARELESS,
      hint_text: '慢慢读题，别急着选答案。题目问的是什么？'
    };
  }

  // === 规则2: 概念错误检测 ===
  // 2.1 概念性符号使用错误
  if (isConceptualSignError(uAns, cAns)) {
    return {
      error_type: ERROR_TYPES.CONCEPT,
      confidence: 0.85,
      reason: '概念性符号错误，理解有偏差',
      hint_level: HINT_LEVELS.CONCEPT,
      hint_text: `这个知识点涉及到概念理解。建议回顾：${kpName}的核心定义是什么？`
    };
  }

  // 2.2 概念混淆（相关概念之间）
  if (isConceptConfusion(uAns, cAns, kpName)) {
    return {
      error_type: ERROR_TYPES.CONCEPT,
      confidence: 0.80,
      reason: '概念混淆',
      hint_level: HINT_LEVELS.CONCEPT,
      hint_text: `容易和相似的概念搞混。${kpName}的定义是？和它相近的概念有什么区别？`
    };
  }

  // 2.3 之前做对过类似的（说明不是完全不会，是混淆了）
  if (consecutiveCorrect >= 2 && !isCorrectAnswer(uAns, cAns)) {
    return {
      error_type: ERROR_TYPES.CONCEPT,
      confidence: 0.75,
      reason: '之前做对过，现在错了，可能是概念理解不牢',
      hint_level: HINT_LEVELS.CONCEPT,
      hint_text: `${kpName}的定义是什么？这次和之前做的有什么区别？`
    };
  }

  // === 规则3: 计算错误检测 ===
  // 3.1 复杂题目（medium/hard）答题时间长但错了
  if (difficulty !== 'easy' && timeSpent > 60 && !isCorrectAnswer(uAns, cAns)) {
    return {
      error_type: ERROR_TYPES.CALCULATION,
      confidence: 0.70,
      reason: '中难题答题时间长但仍做错，可能是计算过程出错',
      hint_level: HINT_LEVELS.CALCULATION,
      hint_text: `这类题需要按步骤计算。${kpName}的解题步骤是什么？从第一步开始重新算。`
    };
  }

  // 3.2 计算过程痕迹（答案中有计算中间值）
  if (hasCalculationTrace(uAns, cAns)) {
    return {
      error_type: ERROR_TYPES.CALCULATION,
      confidence: 0.65,
      reason: '检测到计算过程，结果出错',
      hint_level: HINT_LEVELS.CALCULATION,
      hint_text: '计算过程有误。重新检查每一步的运算，特别是最后一步。'
    };
  }

  // 3.3 连续错误2次以上，可能是计算方法没掌握
  if (consecutiveWrong >= 2) {
    return {
      error_type: ERROR_TYPES.CALCULATION,
      confidence: 0.60,
      reason: '连续错误，计算方法可能没掌握',
      hint_level: HINT_LEVELS.CALCULATION,
      hint_text: `这类题的计算方法需要再练。解题步骤：1) ... 2) ... 3) ...`
    };
  }

  // === 默认：无法分类 ===
  return {
    error_type: ERROR_TYPES.UNKNOWN,
    confidence: 0.30,
    reason: '无法确定错误类型',
    hint_level: 2,
    hint_text: `再想想这个知识点，遇到困难可以回顾一下相关概念。`
  };
}

// ============ 辅助函数 ============

function isCorrectAnswer(uAns, cAns) {
  return uAns === cAns;
}

/**
 * 格式错误：选了相邻选项（如选了B但答案是A）
 */
function isFormatError(uAns, cAns) {
  const options = ['A', 'B', 'C', 'D', 'E', 'F'];
  const uIdx = options.indexOf(uAns);
  const cIdx = options.indexOf(cAns);
  
  if (uIdx < 0 || cIdx < 0) return false;
  
  // 选了相邻的选项
  return Math.abs(uIdx - cIdx) === 1;
}

/**
 * 正负号错误
 */
function isSignError(uAns, cAns) {
  // 简单数字比较
  const uNum = parseFloat(uAns.replace(/[^0-9.-]/g, ''));
  const cNum = parseFloat(cAns.replace(/[^0-9.-]/g, ''));
  
  if (isNaN(uNum) || isNaN(cNum)) return false;
  
  // 数值接近但符号相反
  return Math.abs(uNum + cNum) < 0.01 && Math.abs(uNum) > 0.01;
}

/**
 * 小数点错误
 */
function isDecimalError(uAns, cAns) {
  const uNum = parseFloat(uAns);
  const cNum = parseFloat(cAns);
  
  if (isNaN(uNum) || isNaN(cNum)) return false;
  if (uNum === 0 || cNum === 0) return false;
  
  // 数值相差10倍或100倍
  const ratio = Math.abs(uNum / cNum);
  return (ratio > 9 && ratio < 11) || (ratio > 99 && ratio < 101) ||
         (ratio > 0.09 && ratio < 0.11) || (ratio > 0.009 && ratio < 0.011);
}

/**
 * 概念性符号错误（如绝对值结果为负）
 */
function isConceptualSignError(uAns, cAns) {
  // 绝对值结果不可能为负
  if (cAns === 'A' || cAns === 'B') return false;
  
  const cNum = parseFloat(cAns.replace(/[^0-9]/g, ''));
  if (isNaN(cNum)) return false;
  
  // 正确答案应该是非负数，但学生给了负数
  if (uAns.startsWith('-') && cNum >= 0) return true;
  
  return false;
}

/**
 * 概念混淆检测（需要结合知识点）
 */
function isConceptConfusion(uAns, cAns, kpName) {
  const kpLower = kpName.toLowerCase();
  
  // 这类需要扩展知识库，简单做几个典型混淆
  if (kpLower.includes('绝对值')) {
    return uAns.startsWith('-');
  }
  if (kpLower.includes('平方根') || kpLower.includes('算术平方根')) {
    return uAns.startsWith('±');
  }
  if (kpLower.includes('鱼') || kpLower.includes('两栖')) {
    // 生物混淆：哺乳类和鱼类等
    return false;
  }
  
  return false;
}

/**
 * 计算过程痕迹
 */
function hasCalculationTrace(uAns, cAns) {
  // 答案中包含计算符号或中间步骤
  const calcSymbols = ['+', '-', '×', '÷', '*', '/', '(', ')', '.', ','];
  let symbolCount = 0;
  for (const s of uAns) {
    if (calcSymbols.includes(s)) symbolCount++;
  }
  return symbolCount >= 2;
}

module.exports = {
  classifyError,
  ERROR_TYPES,
  HINT_LEVELS
};
