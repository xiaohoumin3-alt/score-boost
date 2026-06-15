/**
 * 点二列相关系数计算器
 * 计算题目区分度：题目得分与总分的相关性
 * 验收标准：90%题目点二列相关 > 0.2
 */

/**
 * 计算点二列相关系数
 * @param {number[]} itemScores - 题目得分数组 (0或1)
 * @param {number[]} totalScores - 总分数组
 * @returns {number} 相关系数 [-1, 1]
 */
function calculatePointBiserialCorrelation(itemScores, totalScores) {
  if (!itemScores || !totalScores ||
      !Array.isArray(itemScores) || !Array.isArray(totalScores) ||
      itemScores.length !== totalScores.length ||
      itemScores.length < 2) {
    return 0;
  }

  const n = itemScores.length;

  // 计算答对和答错组的统计量
  const correctIndices = [];
  const incorrectIndices = [];

  itemScores.forEach((score, i) => {
    if (score === 1) {
      correctIndices.push(i);
    } else if (score === 0) {
      incorrectIndices.push(i);
    }
  });

  // 如果所有人答对或答错，无法计算区分度
  if (correctIndices.length === 0 || incorrectIndices.length === 0) {
    return 0;
  }

  const n1 = correctIndices.length; // 答对人数
  const n0 = incorrectIndices.length; // 答错人数

  // 计算答对组的平均分
  const mean1 = correctIndices.reduce((sum, i) => sum + totalScores[i], 0) / n1;

  // 计算答错组的平均分
  const mean0 = incorrectIndices.reduce((sum, i) => sum + totalScores[i], 0) / n0;

  // 计算总分的标准差
  const totalMean = totalScores.reduce((sum, score) => sum + score, 0) / n;
  const variance = totalScores.reduce((sum, score) => sum + Math.pow(score - totalMean, 2), 0) / n;
  const std = Math.sqrt(variance);

  if (std === 0) {
    return 0;
  }

  // 点二列相关公式
  // rpb = (M1 - M0) / St * sqrt(n1*n0/n^2)
  const correlation = ((mean1 - mean0) / std) * Math.sqrt((n1 * n0) / (n * n));

  // 确保相关系数在[-1, 1]范围内
  return Math.max(-1, Math.min(1, correlation));
}

/**
 * 计算单个题目的区分度
 * @param {Array<{student_id: string, is_correct: boolean, total_score: number}>} attempts - 答题记录
 * @returns {Object} 区分度分析结果
 */
function calculateQuestionDiscrimination(attempts) {
  if (!attempts || attempts.length < 2) {
    return {
      correlation: 0,
      passed: false,
      totalAttempts: 0,
      correctCount: 0
    };
  }

  const validAttempts = attempts.filter(a =>
    a && typeof a.is_correct === 'boolean' && typeof a.total_score === 'number'
  );

  if (validAttempts.length < 2) {
    return {
      correlation: 0,
      passed: false,
      totalAttempts: validAttempts.length,
      correctCount: 0
    };
  }

  const itemScores = validAttempts.map(a => a.is_correct ? 1 : 0);
  const totalScores = validAttempts.map(a => a.total_score);

  const correlation = calculatePointBiserialCorrelation(itemScores, totalScores);
  const correctCount = validAttempts.filter(a => a.is_correct).length;

  return {
    correlation,
    passed: correlation > 0.2,
    totalAttempts: validAttempts.length,
    correctCount
  };
}

/**
 * 评估整体题目质量
 * @param {Array<{question_id: string, attempts: Array<{student_id: string, is_correct: boolean, total_score: number}>}>} questions - 题目列表
 * @returns {Object} 题目质量评估结果
 */
function evaluateQuestionQuality(questions) {
  if (!questions || questions.length === 0) {
    return {
      passRate: 0,
      passed: false,
      totalQuestions: 0,
      questionAnalysis: {}
    };
  }

  const questionAnalysis = {};
  let passedCount = 0;

  questions.forEach(q => {
    const result = calculateQuestionDiscrimination(q.attempts || []);
    questionAnalysis[q.question_id] = result;

    if (result.passed) {
      passedCount++;
    }
  });

  const passRate = passedCount / questions.length;

  return {
    passRate,
    passed: passRate >= 0.9,
    totalQuestions: questions.length,
    questionAnalysis
  };
}

module.exports = {
  calculatePointBiserialCorrelation,
  calculateQuestionDiscrimination,
  evaluateQuestionQuality
};
