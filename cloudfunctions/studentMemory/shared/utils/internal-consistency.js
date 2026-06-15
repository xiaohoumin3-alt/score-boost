/**
 * 内部一致性检查器
 * 检查题目难度单调性：简单题正确率 >= 困难题
 * 验收标准：80%测评通过难度单调性检验
 */

/**
 * 计算通过率
 * @param {Array<{is_correct: boolean|null|undefined}>} attempts - 答题记录
 * @returns {number} 通过率 [0, 1]
 */
function calculatePassRate(attempts) {
  if (!attempts || !Array.isArray(attempts) || attempts.length === 0) {
    return 0;
  }

  const validAttempts = attempts.filter(a => a && typeof a.is_correct === 'boolean');

  if (validAttempts.length === 0) {
    return 0;
  }

  const correctCount = validAttempts.filter(a => a.is_correct).length;
  return correctCount / validAttempts.length;
}

/**
 * 检查难度单调性
 * @param {Array<{difficulty: number, passRate: number}>} difficultyRates - 难度到正确率的映射
 * @returns {Object} 单调性检查结果
 */
function checkMonotonicity(difficultyRates) {
  const violations = [];

  if (!difficultyRates || difficultyRates.length <= 1) {
    return {
      passed: difficultyRates && difficultyRates.length === 1,
      violations
    };
  }

  // 检查相邻难度级别的正确率是否递减或相等
  for (let i = 0; i < difficultyRates.length - 1; i++) {
    const current = difficultyRates[i];
    const next = difficultyRates[i + 1];

    // 简单题正确率应该 >= 困难题
    if (current.passRate < next.passRate) {
      violations.push({
        from: { difficulty: current.difficulty, passRate: current.passRate },
        to: { difficulty: next.difficulty, passRate: next.passRate }
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

/**
 * 计算单个测评的内部一致性
 * @param {Array<{question_id: string, difficulty: number, attempts: Array<{is_correct: boolean}>}>} questions - 题目列表
 * @returns {Object} 内部一致性结果
 */
function calculateInternalConsistency(questions) {
  if (!questions || questions.length === 0) {
    return {
      passRate: 0,
      passed: false,
      totalQuestions: 0,
      questionAnalysis: {}
    };
  }

  const questionAnalysis = {};

  // 按难度分组并计算正确率
  const difficultyMap = {};

  questions.forEach(q => {
    const passRate = calculatePassRate(q.attempts || []);
    questionAnalysis[q.question_id] = {
      difficulty: q.difficulty,
      passRate,
      attemptCount: (q.attempts || []).length
    };

    if (!difficultyMap[q.difficulty]) {
      difficultyMap[q.difficulty] = [];
    }
    difficultyMap[q.difficulty].push(passRate);
  });

  // 计算每个难度级别的平均正确率
  const difficultyRates = Object.entries(difficultyMap)
    .map(([difficulty, rates]) => ({
      difficulty: parseInt(difficulty),
      passRate: rates.reduce((sum, r) => sum + r, 0) / rates.length
    }))
    .sort((a, b) => a.difficulty - b.difficulty);

  // 检查单调性
  const monotonicityResult = checkMonotonicity(difficultyRates);

  return {
    passRate: monotonicityResult.passed ? 1 : 0,
    passed: monotonicityResult.passed,
    totalQuestions: questions.length,
    questionAnalysis,
    monotonicityResult
  };
}

module.exports = {
  calculatePassRate,
  checkMonotonicity,
  calculateInternalConsistency
};
