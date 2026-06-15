/**
 * Bootstrap置信区间计算器
 * 通过重采样计算置信区间并验证覆盖率
 * 验收标准：置信区间覆盖率误差 < 5%
 */

/**
 * 生成Bootstrap样本（有放回采样）
 * @param {number[]} data - 原始数据
 * @returns {number[]} Bootstrap样本
 */
function bootstrapSample(data) {
  if (!data || data.length === 0) {
    return [];
  }

  const n = data.length;
  const sample = [];

  for (let i = 0; i < n; i++) {
    const randomIndex = Math.floor(Math.random() * n);
    sample.push(data[randomIndex]);
  }

  return sample;
}

/**
 * 计算样本均值
 * @param {number[]} data - 数据数组
 * @returns {number} 均值
 */
function calculateMean(data) {
  if (!data || data.length === 0) {
    return 0;
  }

  return data.reduce((sum, value) => sum + value, 0) / data.length;
}

/**
 * 计算样本标准差
 * @param {number[]} data - 数据数组
 * @returns {number} 标准差
 */
function calculateStd(data) {
  if (!data || data.length === 0) {
    return 0;
  }

  const mean = calculateMean(data);
  const variance = data.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / data.length;

  return Math.sqrt(variance);
}

/**
 * 计算分位数
 * @param {number[]} sortedData - 排序后的数据
 * @param {number} percentile - 分位数 (0-1)
 * @returns {number} 分位数值
 */
function calculatePercentile(sortedData, percentile) {
  if (!sortedData || sortedData.length === 0) {
    return 0;
  }

  const index = (sortedData.length - 1) * percentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const weight = index - lowerIndex;

  if (upperIndex >= sortedData.length) {
    return sortedData[sortedData.length - 1];
  }

  return sortedData[lowerIndex] * (1 - weight) + sortedData[upperIndex] * weight;
}

/**
 * 计算Bootstrap置信区间
 * @param {number[]} data - 原始数据
 * @param {Object} options - 选项
 * @param {number} options.iterations - Bootstrap迭代次数
 * @param {number} options.confidence - 置信水平 (0-1)
 * @param {boolean} options.returnStats - 是否返回详细统计
 * @returns {Object} 置信区间结果
 */
function calculateBootstrapConfidenceInterval(data, options = {}) {
  const {
    iterations = 1000,
    confidence = 0.95,
    returnStats = false
  } = options;

  if (!data || data.length === 0) {
    const result = { lower: 0, upper: 0, mean: 0 };
    if (returnStats) {
      result.std = 0;
      result.sampleSize = 0;
    }
    return result;
  }

  // 生成Bootstrap样本并计算均值
  const bootstrapMeans = [];
  for (let i = 0; i < iterations; i++) {
    const sample = bootstrapSample(data);
    bootstrapMeans.push(calculateMean(sample));
  }

  // 排序
  bootstrapMeans.sort((a, b) => a - b);

  // 计算分位数
  const alpha = (1 - confidence) / 2;
  const lower = calculatePercentile(bootstrapMeans, alpha);
  const upper = calculatePercentile(bootstrapMeans, 1 - alpha);
  const mean = calculateMean(data);

  const result = {
    lower,
    upper,
    mean
  };

  if (returnStats) {
    result.std = calculateStd(data);
    result.sampleSize = data.length;
    result.bootstrapStd = calculateStd(bootstrapMeans);
  }

  return result;
}

/**
 * 计算置信区间覆盖率
 * @param {Array<{trueMean: number, ciLower: number, ciUpper: number}>} simulations - 模拟结果
 * @param {Object} options - 选项
 * @param {boolean} options.returnDetails - 是否返回未覆盖的详情
 * @returns {Object} 覆盖率结果
 */
function calculateCoverageRate(simulations, options = {}) {
  const {
    returnDetails = false
  } = options;

  if (!simulations || simulations.length === 0) {
    const result = { rate: 0, totalSimulations: 0 };
    if (returnDetails) {
      result.uncoveredCount = 0;
      result.uncoveredDetails = [];
    }
    return result;
  }

  let coveredCount = 0;
  const uncoveredDetails = [];

  simulations.forEach(sim => {
    const { trueMean, ciLower, ciUpper } = sim;

    // 检查真实均值是否在置信区间内
    if (trueMean >= ciLower && trueMean <= ciUpper) {
      coveredCount++;
    } else if (returnDetails) {
      uncoveredDetails.push(sim);
    }
  });

  const result = {
    rate: coveredCount / simulations.length,
    totalSimulations: simulations.length
  };

  if (returnDetails) {
    result.uncoveredCount = simulations.length - coveredCount;
    result.uncoveredDetails = uncoveredDetails;
  }

  return result;
}

module.exports = {
  bootstrapSample,
  calculateBootstrapConfidenceInterval,
  calculateCoverageRate
};
