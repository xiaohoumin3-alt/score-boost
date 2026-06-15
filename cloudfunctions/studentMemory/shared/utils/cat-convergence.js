/**
 * CAT收敛检测器
 * 检测计算机自适应测试何时收敛到稳定的能力估计
 * 验收标准：中位数题目数 < 10
 */

/**
 * 3PL模型：计算正确概率
 * P(θ) = c + (1-c) / (1 + exp(-a(θ-b)))
 * @param {number} theta - 能力估计
 * @param {number} difficulty - 题目难度 (b)
 * @param {number} discrimination - 题目区分度 (a)，默认1
 * @param {number} guessing - 猜测参数 (c)，默认0.25
 * @returns {number} 正确概率
 */
function threePLModel(theta, difficulty, discrimination = 1, guessing = 0.25) {
  const z = discrimination * (theta - difficulty);
  const probability = guessing + (1 - guessing) / (1 + Math.exp(-z));
  return probability;
}

/**
 * 计算能力估计（使用简化的最大似然估计）
 * @param {Array<{item_difficulty: number, is_correct: boolean}>} responses - 答题记录
 * @returns {Object} 能力估计结果
 */
function calculateAbilityEstimate(responses) {
  if (!responses || responses.length === 0) {
    return {
      theta: 0,
      stdError: 2 // 初始标准误差
    };
  }

  // 使用牛顿迭代法寻找最大似然估计
  let theta = 0;
  const maxIterations = 50;
  const tolerance = 0.001;
  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    let gradient = 0;
    let hessian = 0;

    responses.forEach(response => {
      const { item_difficulty: b, is_correct } = response;
      const a = 1; // 区分度
      const c = 0.25; // 猜测参数

      const P = threePLModel(theta, b, a, c);
      const Q = 1 - P;
      const score = is_correct ? 1 : 0;

      // 对数似然的梯度
      let dLogL = 0;
      if (P > 0.001 && P < 0.999) {
        dLogL = (a * (P - c) * (score - P)) / (P * Q);
      }
      gradient += dLogL;

      // 对数似然的二阶导
      let d2LogL = 0;
      if (P > 0.001 && P < 0.999) {
        d2LogL = -Math.pow(a * (P - c), 2) * (score * (1 - P) / P + (1 - score) * P / Q) / (P * Q);
      }
      hessian += d2LogL;
    });

    // 防止除零
    if (Math.abs(hessian) < 0.0001) {
      // 使用简化的估计方法
      const correctCount = responses.filter(r => r.is_correct).length;
      const proportion = correctCount / responses.length;

      // 将正确率映射到能力值
      if (proportion > 0.8) {
        theta = 2;
      } else if (proportion < 0.2) {
        theta = -2;
      } else {
        theta = (proportion - 0.5) * 4;
      }
      break;
    }

    // 牛顿迭代：theta_new = theta - gradient / hessian
    const delta = gradient / hessian;

    theta -= delta;

    // 检查收敛
    if (Math.abs(delta) < tolerance) {
      converged = true;
      break;
    }

    // 防止theta发散
    if (Math.abs(theta) > 5) {
      theta = Math.sign(theta) * 5;
    }
  }

  // 计算标准误差：SE = 1 / sqrt(-Hessian)
  let information = 0;
  responses.forEach(response => {
    const { item_difficulty: b } = response;
    const a = 1;
    const c = 0.25;

    const P = threePLModel(theta, b, a, c);
    const Q = 1 - P;

    // Fisher信息
    const I = Math.pow(a * (P - c), 2) / (P * Q);
    information += I;
  });

  const stdError = information > 0 ? 1 / Math.sqrt(information) : 2;

  return {
    theta,
    stdError
  };
}

/**
 * 检测CAT收敛
 * @param {Array<{item_difficulty: number, is_correct: boolean}>} responses - 答题记录
 * @param {Object} options - 选项
 * @param {number} options.threshold - 收敛阈值（标准误差或theta变化）
 * @param {number} options.minItems - 最小题目数
 * @param {number} options.maxItems - 最大题目数
 * @param {boolean} options.returnProcess - 是否返回收敛过程
 * @returns {Object} 收敛检测结果
 */
function detectCATConvergence(responses, options = {}) {
  const {
    threshold = 0.1,
    minItems = 5,
    maxItems = 50,
    returnProcess = false
  } = options;

  if (!responses || responses.length === 0) {
    return {
      converged: false,
      itemsNeeded: minItems,
      finalTheta: 0,
      process: []
    };
  }

  const process = [];
  let prevTheta = 0;
  let converged = false;
  let itemsNeeded = responses.length;

  for (let i = 1; i <= responses.length; i++) {
    const currentResponses = responses.slice(0, i);
    const estimate = calculateAbilityEstimate(currentResponses);

    const thetaChange = Math.abs(estimate.theta - prevTheta);

    process.push({
      itemCount: i,
      theta: estimate.theta,
      stdError: estimate.stdError,
      thetaChange
    });

    // 检查收敛条件
    if (i >= minItems && (estimate.stdError < threshold || thetaChange < threshold)) {
      converged = true;
      itemsNeeded = i;
      break;
    }

    prevTheta = estimate.theta;
  }

  const finalEstimate = calculateAbilityEstimate(responses);

  const result = {
    converged,
    itemsNeeded,
    finalTheta: finalEstimate.theta,
    finalStdError: finalEstimate.stdError
  };

  if (returnProcess) {
    result.process = process;
  }

  return result;
}

/**
 * 分析收敛速度
 * @param {Array<{session_id: string, responses: Array<{item_difficulty: number, is_correct: boolean}>}>} sessions - CAT会话列表
 * @param {Object} options - 选项
 * @param {number} options.threshold - 收敛阈值
 * @param {number} options.minItems - 最小题目数
 * @param {number} options.maxItems - 最大题目数
 * @param {boolean} options.returnDetails - 是否返回详细分析
 * @returns {Object} 收敛速度分析结果
 */
function analyzeConvergenceSpeed(sessions, options = {}) {
  const {
    threshold = 0.1,
    minItems = 5,
    maxItems = 50,
    returnDetails = false
  } = options;

  if (!sessions || sessions.length === 0) {
    return {
      medianItems: 0,
      meanItems: 0,
      passed: false,
      totalSessions: 0,
      sessionDetails: []
    };
  }

  const itemsNeeded = [];
  const sessionDetails = [];

  sessions.forEach(session => {
    const result = detectCATConvergence(session.responses, {
      threshold,
      minItems,
      maxItems,
      returnProcess: false
    });

    // 如果未收敛，使用最大题目数
    const count = result.converged ? result.itemsNeeded : maxItems;
    itemsNeeded.push(count);

    if (returnDetails) {
      sessionDetails.push({
        session_id: session.session_id,
        itemsNeeded: count,
        converged: result.converged,
        finalTheta: result.finalTheta,
        finalStdError: result.finalStdError
      });
    }
  });

  // 计算统计量
  itemsNeeded.sort((a, b) => a - b);

  const median = calculateMedian(itemsNeeded);
  const mean = itemsNeeded.reduce((sum, val) => sum + val, 0) / itemsNeeded.length;

  const result = {
    medianItems: median,
    meanItems: mean,
    passed: median < 10, // 验收标准
    totalSessions: sessions.length
  };

  if (returnDetails) {
    result.sessionDetails = sessionDetails;
  }

  return result;
}

/**
 * 计算中位数
 * @param {number[]} sortedValues - 排序后的数值数组
 * @returns {number} 中位数
 */
function calculateMedian(sortedValues) {
  if (!sortedValues || sortedValues.length === 0) {
    return 0;
  }

  const mid = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  } else {
    return sortedValues[mid];
  }
}

module.exports = {
  calculateAbilityEstimate,
  detectCATConvergence,
  analyzeConvergenceSpeed
};
