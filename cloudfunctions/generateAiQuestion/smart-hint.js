/**
 * 智能提示模块
 * Phase 4: Smart Hint
 *
 * 根据学生错误模式生成个性化提示
 */

/**
 * 分析错误模式
 * @param {string} kpName - 知识点名称
 * @param {string} wrongAnswer - 错误答案
 * @param {string} difficulty - 难度
 * @returns {{type: string, confidence: number, reason: string}}
 */
function analyzeErrorPattern(kpName, wrongAnswer, difficulty) {
  // 规则1: 检查是否为粗心错误（接近正确答案）
  const carelessPatterns = [
    { pattern: /√(\d+)\s*=\s*(\d+)/, check: (match) => {
        const num = parseInt(match[1]);
        const answer = parseInt(match[2]);
        const correct = Math.sqrt(num);
        return Math.abs(answer - correct) <= 1 && answer !== correct;
      }},
    { pattern: /^\d+$/, check: (match, kp) => {
        // 简单计算接近正确值
        if (kp.includes('二次根式') && wrongAnswer.length <= 2) return true;
        return false;
      }}
  ];

  for (const { pattern, check } of carelessPatterns) {
    if (pattern.test(wrongAnswer)) {
      const match = wrongAnswer.match(pattern);
      if (check(match, kpName)) {
        return {
          type: 'careless',
          confidence: 0.75,
          reason: '答案接近正确值，可能是粗心错误'
        };
      }
    }
  }

  // 规则2: 检查是否为概念错误（符号使用错误、明显误解）
  if (wrongAnswer.includes('=-') || wrongAnswer.includes('-=') ||
      (kpName.includes('绝对值') && (wrongAnswer.startsWith('-') || wrongAnswer.includes('=-')))) {
    return {
      type: 'concept',
      confidence: 0.85,
      reason: '检测到概念性错误'
    };
  }

  // 绝对值特殊检查：结果为负数
  if (kpName.includes('绝对值') && wrongAnswer.includes('= -')) {
    return {
      type: 'concept',
      confidence: 0.9,
      reason: '绝对值结果为负，概念错误'
    };
  }

  // 规则3: 计算错误（复杂表达式、明显计算问题）
  if (wrongAnswer.includes('+') || wrongAnswer.includes('-') ||
      wrongAnswer.includes('×') || wrongAnswer.includes('÷') ||
      /\d+\.\d+/.test(wrongAnswer)) {
    return {
      type: 'calculation',
      confidence: 0.7,
      reason: '检测到计算过程或中间结果'
    };
  }

  // 默认：无法确定
  return {
    type: 'unknown',
    confidence: 0.3,
    reason: '错误模式不明确'
  };
}

/**
 * 选择提示级别
 * @param {{type: string, confidence: number}} pattern - 错误模式
 * @returns {number} 提示级别 (1-3)
 */
function selectHintLevel(pattern) {
  // 低置信度：使用保守的Level 2
  if (pattern.confidence < 0.5) {
    return 2;
  }

  // 根据错误类型选择提示级别
  switch (pattern.type) {
    case 'careless':
      return 1; // 直接指出问题
    case 'calculation':
      return 2; // 给出步骤框架
    case 'concept':
      return 3; // 引导回顾概念
    default:
      return 2; // 默认Level 2
  }
}

/**
 * 生成提示文本
 * @param {string} kpName - 知识点名称
 * @param {string} wrongAnswer - 错误答案
 * @param {string} errorType - 错误类型
 * @param {number} hintLevel - 提示级别
 * @returns {string} 提示文本
 */
function generateHint(kpName, wrongAnswer, errorType, hintLevel) {
  // Level 1: 直接提示（粗心错误）
  if (hintLevel === 1) {
    if (kpName.includes('二次根式')) {
      const match = wrongAnswer.match(/√(\d+)\s*=\s*(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        const correct = Math.sqrt(num);
        return `你算到了 ${wrongAnswer}，但 √${num} = ${correct}。再检查一下计算？`;
      }
    }
    return `你的答案 "${wrongAnswer}" 很接近了，但有点小问题。再仔细算一遍？`;
  }

  // Level 2: 步骤提示（计算错误）
  if (hintLevel === 2) {
    if (kpName.includes('勾股定理')) {
      return `提示：勾股定理是 a² + b² = c²。首先确定哪条是斜边，然后代入数值计算。`;
    }
    if (kpName.includes('二次根式')) {
      return `步骤提示：1) 识别被开方数 2) 计算平方根 3) 检查结果。按这个步骤试试？`;
    }
    return `解题步骤：首先理解题目，然后按步骤计算，最后检查结果。`;
  }

  // Level 3: 概念提示（概念错误）
  if (hintLevel === 3) {
    if (kpName.includes('绝对值')) {
      return `绝对值的定义：一个数的绝对值是它在数轴上到原点的距离，永远是非负数。| -5 | = 5，不是 -5。`;
    }
    if (kpName.includes('二次根式')) {
      return `二次根式的概念：√a 表示非负的平方根。结果一定是非负数。`;
    }
    return `这个知识点需要回顾一下定义。${kpName}的核心概念是什么？`;
  }

  return '试试从基本概念开始思考？';
}

module.exports = {
  analyzeErrorPattern,
  selectHintLevel,
  generateHint
};
