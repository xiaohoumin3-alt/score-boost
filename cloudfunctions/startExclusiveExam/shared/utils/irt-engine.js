/**
 * IRT (Item Response Theory) Engine
 * 三参数Logistic模型 (3PL) + Fisher信息量
 *
 * 核心功能：
 * 1. 3PL模型：P(θ) = c + (1-c) / (1 + exp(-Da(θ-b)))
 * 2. Fisher信息量：I(θ) = Σ [P'(θ)² / (P(θ)(1-P(θ)))]
 * 3. 能力估计：Newton-Raphson迭代
 * 4. 分数转换：θ ∈ [-4,4] → score ∈ [0,100]
 * 5. 精度转换：SE → accuracy %
 */

// ========== 常量定义 ==========

const D = 1.702;  // 3PL模型缩放因子
const MAX_THETA = 4.0;  // 能力值上限
const MIN_THETA = -4.0; // 能力值下限
const MAX_ITERATIONS = 50;  // Newton-Raphson最大迭代次数
const CONVERGENCE_THRESHOLD = 0.001;  // 收敛阈值

const DIFFICULTY_TO_B = {
  easy: -1,
  medium: 0,
  hard: 1,
  '简单': -1,
  '中等': 0,
  '困难': 1
};

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ========== 3PL模型 ==========

/**
 * 规范化题目IRT参数，兼容题池中的多种字段名。
 *
 * @param {Object} item - 题目对象
 * @returns {Object} IRT参数 {a, b, c}
 */
function normalizeItemParams(item = {}) {
  const rawDifficulty = item.b ?? item.irt_b ?? item.difficulty;
  const mappedDifficulty = typeof rawDifficulty === 'string'
    ? DIFFICULTY_TO_B[rawDifficulty]
    : rawDifficulty;

  return {
    a: clamp(toFiniteNumber(item.a ?? item.irt_a ?? item.discrimination, 1.0), 0.1, 3.0),
    b: clamp(toFiniteNumber(mappedDifficulty, 0.0), MIN_THETA, MAX_THETA),
    c: clamp(toFiniteNumber(item.c ?? item.irt_c ?? item.guessing, 0.25), 0, 0.5)
  };
}

/**
 * 获取题目ID，兼容题池中的多种字段名。
 *
 * @param {Object} item - 题目对象
 * @returns {string|undefined} 题目ID
 */
function getItemId(item = {}) {
  return item.question_id ?? item._id ?? item.pool_id ?? item.item_id;
}

/**
 * 3PL模型：计算正确概率
 *
 * @param {number} theta - 能力值 θ ∈ [-4, 4]
 * @param {Object} item - 题目参数
 * @param {number} item.a - 区分度 (0.5-2.5)
 * @param {number} item.b - 难度 (-3 to 3)
 * @param {number} item.c - 猜测参数 (0-0.5)
 * @returns {number} 正确概率 P ∈ [0, 1]
 */
function threePLModel(theta, item = {}) {
  const { a, b, c } = normalizeItemParams(item);
  const z = D * a * (theta - b);
  const expZ = Math.exp(-z);
  const P = c + (1 - c) / (1 + expZ);
  return Math.max(0, Math.min(1, P));
}

/**
 * 3PL模型导数：dP/dθ
 * 用于Fisher信息量计算
 *
 * @param {number} theta - 能力值
 * @param {Object} item - 题目参数
 * @returns {number} 导数值
 */
function threePLDerivative(theta, item = {}) {
  const { a, b, c } = normalizeItemParams(item);
  const z = D * a * (theta - b);
  const expZ = Math.exp(-z);
  const dP = D * a * (1 - c) * expZ / Math.pow(1 + expZ, 2);
  return dP;
}

/**
 * 批量计算多题的正确概率
 *
 * @param {number} theta - 能力值
 * @param {Array<Object>} items - 题目参数数组
 * @returns {Array<number>} 正确概率数组
 */
function batchCalculateProbabilities(theta, items) {
  return items.map(item => threePLModel(theta, item));
}

// ========== Fisher信息量 ==========

/**
 * 计算单题Fisher信息量
 *
 * 公式：I_i(θ) = [P'(θ)]² / [P(θ)(1-P(θ))]
 *
 * @param {number} theta - 能力值
 * @param {Object} item - 题目参数
 * @returns {number} Fisher信息量
 */
function calculateItemInformation(theta, item) {
  const P = threePLModel(theta, item);
  const dP = threePLDerivative(theta, item);

  // 边界保护：避免除零
  const P_safe = Math.max(0.001, Math.min(0.999, P));
  const info = Math.pow(dP, 2) / (P_safe * (1 - P_safe));

  return info;
}

/**
 * 计算总Fisher信息量（测试信息函数）
 *
 * @param {number} theta - 能力值
 * @param {Array<Object>} items - 题目参数数组
 * @returns {number} 总Fisher信息量
 */
function calculateFisherInformation(theta, items) {
  return items.reduce((sum, item) => sum + calculateItemInformation(theta, item), 0);
}

/**
 * 计算标准误差
 *
 * 公式：SE(θ) = 1 / sqrt(I(θ))
 *
 * @param {number} theta - 能力值
 * @param {Array<Object>} items - 题目参数数组
 * @returns {number} 标准误差
 */
function calculateStandardError(theta, items) {
  const info = calculateFisherInformation(theta, items);
  if (info <= 0) return 1.0;  // 无信息时返回最大误差
  return 1 / Math.sqrt(info);
}

/**
 * 计算95%置信区间
 *
 * @param {number} theta - 能力值
 * @param {number} se - 标准误差
 * @returns {Object} 置信区间
 */
function calculateConfidenceInterval(theta, se) {
  const z = 1.96;  // 95%置信水平
  return {
    lower: theta - z * se,
    upper: theta + z * se,
    margin: z * se
  };
}

/**
 * 判断是否应该继续测评
 *
 * @param {number} currentSE - 当前标准误差
 * @param {number} targetSE - 目标标准误差
 * @param {number} currentQuestions - 当前题数
 * @param {number} maxQuestions - 最大题数
 * @returns {Object} 判断结果
 */
function shouldContinue(currentSE, targetSE, currentQuestions, maxQuestions = 50) {
  if (currentSE <= targetSE) {
    return { shouldContinue: false, reason: 'TARGET_REACHED' };
  }
  if (currentQuestions >= maxQuestions) {
    return { shouldContinue: false, reason: 'MAX_REACHED' };
  }
  return { shouldContinue: true, reason: 'NEED_MORE_INFO' };
}

/**
 * 评估当前精度水平
 *
 * @param {number} se - 标准误差
 * @returns {Object} 精度评估
 */
function assessAccuracy(se) {
  const accuracy = seToAccuracy(se);

  let level, color, recommendation;
  if (se <= 0.2) {
    level = '高精度';
    color = 'green';
    recommendation = '精度已达到优秀水平';
  } else if (se <= 0.3) {
    level = '良好';
    color = 'blue';
    recommendation = '精度达到目标水平';
  } else if (se <= 0.5) {
    level = '中等';
    color = 'orange';
    recommendation = '建议继续答题提升精度';
  } else {
    level = '低精度';
    color = 'red';
    recommendation = '精度不足，强烈建议继续答题';
  }

  return { se, accuracy, level, color, recommendation };
}

// ========== 能力估计 ==========

/**
 * Newton-Raphson迭代估计能力值
 * 使用最大似然估计（MLE）
 *
 * @param {Array<Object>} responses - 答题记录 [{item, is_correct}]
 * @param {number} initialTheta - 初始值（默认0）
 * @returns {Object} 估计结果 {theta, se, converged, iterations}
 */
function estimateTheta(responses, initialTheta = 0) {
  // 处理空响应
  if (!responses || responses.length === 0) {
    return {
      theta: 0,
      se: 1.0,
      converged: true,
      iterations: 0
    };
  }

  let theta = initialTheta;
  let converged = false;
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations = i + 1;
    let numerator = 0;
    let denominator = 0;

    for (const { item, is_correct } of responses) {
      const P = threePLModel(theta, item);
      const Q = 1 - P;

      // 边界保护
      const P_safe = Math.max(0.001, Math.min(0.999, P));
      const Q_safe = 1 - P_safe;

      // 计算导数
      const dP = threePLDerivative(theta, item);

      const score = is_correct ? 1 : 0;

      // Newton-Raphson更新
      // 一阶导数（梯度）
      numerator += dP * (score - P_safe) / (P_safe * Q_safe);

      // 二阶导数（Hessian近似）
      // 简化：使用Fisher信息量作为二阶导数近似
      denominator += Math.pow(dP, 2) / (P_safe * Q_safe);
    }

    if (Math.abs(denominator) < 1e-10) {
      // 避免除零，使用小步长
      denominator = 1e-10;
    }

    const delta = numerator / denominator;
    theta = theta + delta;

    // 边界限制
    theta = Math.max(MIN_THETA, Math.min(MAX_THETA, theta));

    // 收敛判断
    if (Math.abs(delta) < CONVERGENCE_THRESHOLD) {
      converged = true;
      break;
    }
  }

  // 计算标准误差
  const items = responses.map(r => r.item);
  const se = calculateStandardError(theta, items);

  return {
    theta,
    se,
    converged,
    iterations
  };
}

// ========== 题目选择 ==========

/**
 * 选择最大Fisher信息量题目
 *
 * @param {number} theta - 当前能力估计
 * @param {Array<Object>} availableItems - 可用题目池
 * @param {Array<string>} usedIds - 已用题目ID
 * @returns {Object} 选中的题目
 */
function selectNextQuestion(theta, availableItems, usedIds = []) {
  // 过滤已用题目
  const unusedItems = availableItems.filter(item => {
    const itemId = getItemId(item);
    return itemId ? !usedIds.includes(itemId) : true;
  });

  if (unusedItems.length === 0) {
    return null;
  }

  // 计算每题信息量
  const itemsWithInfo = unusedItems.map(item => ({
    item,
    information: calculateItemInformation(theta, item)
  }));

  // 按信息量排序
  itemsWithInfo.sort((a, b) => b.information - a.information);

  // 返回最大信息量题目
  return itemsWithInfo[0].item;
}

/**
 * 批量选择题目（用于预生成）
 *
 * @param {number} theta - 目标能力值
 * @param {Array<Object>} itemPool - 题目池
 * @param {number} count - 需要的题目数
 * @returns {Array<Object>} 选中的题目列表
 */
function selectQuestionBatch(theta, itemPool, count) {
  const selected = [];
  const usedIds = [];

  for (let i = 0; i < count && i < itemPool.length; i++) {
    const item = selectNextQuestion(theta, itemPool, usedIds);
    if (item) {
      selected.push(item);
      const itemId = getItemId(item);
      if (itemId) usedIds.push(itemId);
    }
  }

  return selected;
}

/**
 * 估计达到目标精度需要的题目数
 *
 * @param {number} currentSE - 当前标准误差
 * @param {number} targetSE - 目标标准误差
 * @param {number} infoPerQuestion - 每题平均信息量（默认0.2）
 * @returns {number} 预估题目数
 */
function estimateProgress(currentSE, targetSE, infoPerQuestion = 0.2) {
  if (currentSE <= targetSE) return 0;

  const currentInfo = 1 / (currentSE * currentSE);
  const targetInfo = 1 / (targetSE * targetSE);
  const infoGap = targetInfo - currentInfo;

  return Math.ceil(infoGap / infoPerQuestion);
}

// ========== 分数转换 ==========

/**
 * 误差函数（用于正态CDF）
 *
 * @param {number} x - 输入值
 * @returns {number} erf(x)
 */
function erf(x) {
  // Abramowitz and Stegun 近似
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * 标准正态分布累积函数
 *
 * @param {number} x - 输入值
 * @returns {number} CDF(x)
 */
function normalCDF(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * 能力值转换为分数
 * θ ∈ [-4, 4] → score ∈ [0, 100]
 *
 * @param {number} theta - 能力值
 * @param {number} minScore - 最小分数（默认0）
 * @param {number} maxScore - 最大分数（默认100）
 * @returns {number} 分数
 */
function thetaToScore(theta, minScore = 0, maxScore = 100) {
  const percentile = normalCDF(theta) * 100;
  const score = minScore + (percentile / 100) * (maxScore - minScore);
  return Math.round(score * 10) / 10;  // 保留1位小数
}

/**
 * 分数转换为能力值（逆变换）
 *
 * @param {number} score - 分数
 * @param {number} minScore - 最小分数
 * @param {number} maxScore - 最大分数
 * @returns {number} 能力值
 */
function scoreToTheta(score, minScore = 0, maxScore = 100) {
  if (maxScore === minScore) return 0;

  const p = Math.max(0.001, Math.min(0.999, (score - minScore) / (maxScore - minScore)));
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q;
  let r;
  let theta;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    theta = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    theta = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
            (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    theta = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  return Math.max(MIN_THETA, Math.min(MAX_THETA, theta));
}

/**
 * 获取分数等级解释
 *
 * @param {number} percentile - 百分位 [0, 100]
 * @returns {string} 等级解释
 */
function getInterpretation(percentile) {
  if (percentile >= 95) return '优秀';
  if (percentile >= 85) return '良好';
  if (percentile >= 70) return '中等偏上';
  if (percentile >= 50) return '中等';
  if (percentile >= 30) return '中等偏下';
  if (percentile >= 15) return '待提高';
  return '需要加强';
}

// ========== 精度转换 ==========

/**
 * 标准误差转换为精度百分比
 *
 * @param {number} se - 标准误差
 * @param {number} maxSE - 最大标准误差（默认1.0）
 * @returns {number} 精度百分比 [0, 1]
 */
function seToAccuracy(se, maxSE = 1.0) {
  const accuracy = 1 - se / maxSE;
  return Math.max(0, Math.min(1, accuracy));
}

/**
 * 精度百分比转换为标准误差
 *
 * @param {number} accuracy - 精度百分比 [0, 1]
 * @param {number} maxSE - 最大标准误差
 * @returns {number} 标准误差
 */
function accuracyToSE(accuracy, maxSE = 1.0) {
  const se = (1 - accuracy) * maxSE;
  return Math.max(0, Math.min(maxSE, se));
}

/**
 * 估算达到目标精度需要的题目数
 *
 * @param {number} currentSE - 当前标准误差
 * @param {number} targetSE - 目标标准误差
 * @param {number} infoPerQuestion - 每题平均信息量（默认0.2）
 * @returns {number} 所需题目数
 */
function estimateQuestionsNeeded(currentSE, targetSE, infoPerQuestion = 0.2) {
  if (currentSE <= targetSE) return 0;

  const currentInfo = 1 / (currentSE * currentSE);
  const targetInfo = 1 / (targetSE * targetSE);
  const infoGap = targetInfo - currentInfo;

  return Math.max(1, Math.ceil(infoGap / infoPerQuestion));
}

/**
 * 计算当前进度信息
 *
 * @param {number} currentSE - 当前标准误差
 * @param {number} targetSE - 目标标准误差
 * @param {number} currentQuestions - 当前题数
 * @returns {Object} 进度信息
 */
function calculateProgress(currentSE, targetSE, currentQuestions) {
  const currentAccuracy = seToAccuracy(currentSE);
  const targetAccuracy = seToAccuracy(targetSE);
  const questionsNeeded = estimateQuestionsNeeded(currentSE, targetSE);

  return {
    currentSE,
    targetSE,
    currentAccuracy,
    targetAccuracy,
    currentQuestions,
    estimatedTotal: currentQuestions + questionsNeeded,
    questionsNeeded,
    progressRatio: currentQuestions / (currentQuestions + questionsNeeded)
  };
}

/**
 * 生成扩展建议
 *
 * @param {Object} progress - 进度信息
 * @returns {Object} 扩展建议
 */
function generateRecommendation(progress) {
  const shouldExtend = progress.questionsNeeded > 0;
  const avgTimePerQuestion = 60;  // 假设每题60秒

  return {
    should_extend: shouldExtend,
    reason: shouldExtend
      ? `继续答题 ${progress.questionsNeeded} 道，可提升精度至 ${Math.round(progress.targetAccuracy * 100)}%`
      : '当前精度已达到目标水平',
    estimated_questions: progress.questionsNeeded,
    estimated_time: progress.questionsNeeded * avgTimePerQuestion,
    current_info: 1 / (progress.currentSE * progress.currentSE),
    target_info: 1 / (progress.targetSE * progress.targetSE)
  };
}

/**
 * 准备精度仪表盘数据
 *
 * @param {Object} progress - 进度信息
 * @returns {Object} 仪表盘数据
 */
function prepareAccuracyMeterData(progress) {
  const { currentAccuracy, targetAccuracy, progressRatio } = progress;

  return {
    current: Math.round(currentAccuracy * 100),
    target: Math.round(targetAccuracy * 100),
    progress: Math.min(100, Math.round(progressRatio * 100)),
    color: getProgressColor(currentAccuracy),
    status: currentAccuracy >= targetAccuracy ? '已达标' : '进行中'
  };
}

/**
 * 获取进度颜色
 *
 * @param {number} accuracy - 精度百分比 [0, 1]
 * @returns {string} 颜色值
 */
function getProgressColor(accuracy) {
  if (accuracy >= 0.7) return '#52c41a';  // green
  if (accuracy >= 0.5) return '#1890ff';  // blue
  if (accuracy >= 0.3) return '#faad14';  // orange
  return '#f5222d';                      // red
}

// ========== 完整流程示例 ==========

/**
 * 完整能力评估流程
 *
 * @param {Array<Object>} responses - 答题记录
 * @param {number} targetSE - 目标标准误差
 * @returns {Object} 完整评估结果
 */
function assessAbility(responses, targetSE = 0.3) {
  // 1. 估计能力值
  const { theta, se, converged } = estimateTheta(responses);

  // 2. 计算置信区间
  const confidenceInterval = calculateConfidenceInterval(theta, se);

  // 3. 转换为分数
  const score = thetaToScore(theta);
  const percentile = normalCDF(theta) * 100;
  const interpretation = getInterpretation(percentile);

  // 4. 评估精度
  const accuracyInfo = assessAccuracy(se);

  // 5. 生成建议
  const items = responses.map(r => r.item);
  const questionsNeeded = estimateQuestionsNeeded(se, targetSE);
  const recommendation = {
    should_extend: se > targetSE,
    reason: accuracyInfo.recommendation,
    estimated_questions: questionsNeeded,
    estimated_time: questionsNeeded * 60,
    current_info: calculateFisherInformation(theta, items),
    target_info: 1 / (targetSE * targetSE)
  };

  return {
    theta,
    se,
    score,
    percentile,
    interpretation,
    confidence_interval: confidenceInterval,
    accuracy: accuracyInfo,
    recommendation,
    converged
  };
}

// ========== 导出 ==========

module.exports = {
  // 辅助函数
  normalizeItemParams,
  getItemId,

  // 3PL模型
  threePLModel,
  threePLDerivative,
  batchCalculateProbabilities,

  // Fisher信息量
  calculateItemInformation,
  calculateFisherInformation,
  calculateStandardError,
  calculateConfidenceInterval,
  shouldContinue,
  assessAccuracy,

  // 能力估计
  estimateTheta,

  // 题目选择
  selectNextQuestion,
  selectQuestionBatch,
  estimateProgress,

  // 分数转换
  thetaToScore,
  scoreToTheta,
  getInterpretation,

  // 精度转换
  seToAccuracy,
  accuracyToSE,
  estimateQuestionsNeeded,
  calculateProgress,
  generateRecommendation,
  prepareAccuracyMeterData,
  getProgressColor,

  // 完整流程
  assessAbility,

  // 常量
  D,
  MAX_THETA,
  MIN_THETA,
  MAX_ITERATIONS,
  CONVERGENCE_THRESHOLD
};
