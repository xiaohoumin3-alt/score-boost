/**
 * 复测一致性计算器
 * 计算同一用户多次测评的分数标准差
 * 验收标准：STD < 8
 */

/**
 * 计算标准差
 * @param {number[]} scores - 分数数组
 * @returns {number} 标准差
 */
function calculateStandardDeviation(scores) {
  if (!scores || scores.length === 0) {
    return 0;
  }

  if (scores.length === 1) {
    return 0;
  }

  const validScores = scores.filter(s => typeof s === 'number' && !isNaN(s));

  if (validScores.length <= 1) {
    return 0;
  }

  // 计算均值
  const mean = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;

  // 计算方差
  const variance = validScores.reduce((sum, score) => {
    return sum + Math.pow(score - mean, 2);
  }, 0) / validScores.length;

  // 返回标准差
  return Math.sqrt(variance);
}

/**
 * 按用户ID分组分数
 * @param {Array<{_openid: string, total_score: number}>} assessments - 测评记录
 * @returns {Object<string, number[]>} 用户ID到分数数组的映射
 */
function groupScoresByUser(assessments) {
  if (!assessments || !Array.isArray(assessments)) {
    return {};
  }

  const grouped = {};

  assessments.forEach(assessment => {
    const userId = assessment._openid;
    const score = assessment.total_score;

    if (userId && typeof score === 'number' && !isNaN(score)) {
      if (!grouped[userId]) {
        grouped[userId] = [];
      }
      grouped[userId].push(score);
    }
  });

  return grouped;
}

/**
 * 计算单个用户的复测标准差
 * @param {number[]} scores - 分数数组
 * @returns {number} 标准差
 */
function calculateRetestSTD(scores) {
  return calculateStandardDeviation(scores);
}

/**
 * 计算整体复测一致性分数
 * @param {Object<string, number[]>} userScores - 用户ID到分数数组的映射
 * @returns {Object} 一致性分析结果
 */
function calculateRetestConsistencyScore(userScores) {
  if (!userScores || Object.keys(userScores).length === 0) {
    return {
      averageSTD: 0,
      userCount: 0,
      passed: false,
      userSTDs: {}
    };
  }

  const userSTDs = {};
  let totalSTD = 0;
  let userCount = 0;

  Object.entries(userScores).forEach(([userId, scores]) => {
    const std = calculateRetestSTD(scores);
    userSTDs[userId] = std;
    totalSTD += std;
    userCount++;
  });

  const averageSTD = userCount > 0 ? totalSTD / userCount : 0;
  const passed = averageSTD < 8;

  return {
    averageSTD,
    userCount,
    passed,
    userSTDs
  };
}

module.exports = {
  calculateRetestSTD,
  calculateRetestConsistencyScore,
  groupScoresByUser
};
