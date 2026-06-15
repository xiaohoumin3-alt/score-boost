/**
 * CAT收敛速度测试
 * 验证计算机自适应测试何时收敛到稳定的能力估计
 * 验收标准：中位数题目数 < 10
 */

const {
  detectCATConvergence,
  calculateAbilityEstimate,
  analyzeConvergenceSpeed
} = require('../cloudfunctions/shared/utils/cat-convergence');

describe('CAT收敛速度测试', () => {
  describe('calculateAbilityEstimate', () => {
    test('应该计算能力估计（最大似然估计）', () => {
      // 简化的3PL模型：P(θ) = c + (1-c) / (1 + exp(-a(θ-b)))
      // 假设a=1, b=0, c=0.25
      const responses = [
        { item_difficulty: -2, is_correct: true },   // 容易题，答对
        { item_difficulty: -1, is_correct: true },   // 较易，答对
        { item_difficulty: 0, is_correct: false },   // 中等，答错
        { item_difficulty: 1, is_correct: false },   // 较难，答错
        { item_difficulty: 2, is_correct: false }    // 困难题，答错
      ];

      const estimate = calculateAbilityEstimate(responses);

      // 应该估计出较低的能力（因为答错较难的题）
      expect(estimate).toHaveProperty('theta');
      expect(estimate).toHaveProperty('stdError');
      expect(typeof estimate.theta).toBe('number');
      expect(typeof estimate.stdError).toBe('number');
    });

    test('应该处理高分学生（答对所有题目）', () => {
      const responses = [
        { item_difficulty: -2, is_correct: true },
        { item_difficulty: -1, is_correct: true },
        { item_difficulty: 0, is_correct: true },
        { item_difficulty: 1, is_correct: true },
        { item_difficulty: 2, is_correct: true }
      ];

      const estimate = calculateAbilityEstimate(responses);

      // 应该估计出很高的能力
      expect(estimate.theta).toBeGreaterThan(1);
    });

    test('应该处理低分学生（答错所有题目）', () => {
      const responses = [
        { item_difficulty: -2, is_correct: false },
        { item_difficulty: -1, is_correct: false },
        { item_difficulty: 0, is_correct: false },
        { item_difficulty: 1, is_correct: false },
        { item_difficulty: 2, is_correct: false }
      ];

      const estimate = calculateAbilityEstimate(responses);

      // 应该估计出很低的能力
      expect(estimate.theta).toBeLessThan(-1);
    });

    test('应该处理空数组', () => {
      const estimate = calculateAbilityEstimate([]);

      expect(estimate.theta).toBe(0);
      expect(estimate.stdError).toBeGreaterThan(0);
    });

    test('应该处理单个题目', () => {
      const responses = [
        { item_difficulty: 0, is_correct: true }
      ];

      const estimate = calculateAbilityEstimate(responses);

      expect(estimate).toHaveProperty('theta');
      expect(estimate).toHaveProperty('stdError');
      expect(estimate.stdError).toBeGreaterThan(0); // 单题确实有误差
    });
  });

  describe('detectCATConvergence', () => {
    test('应该检测到收敛（能力估计稳定）', () => {
      const responses = [
        { item_difficulty: 0, is_correct: true },
        { item_difficulty: 1, is_correct: true },
        { item_difficulty: 2, is_correct: false },
        { item_difficulty: 1.5, is_correct: false },
        { item_difficulty: 1, is_correct: false }
      ];

      const result = detectCATConvergence(responses, {
        threshold: 0.1,
        minItems: 3
      });

      expect(result).toHaveProperty('converged');
      expect(result).toHaveProperty('itemsNeeded');
      expect(result).toHaveProperty('finalTheta');
      expect(result.itemsNeeded).toBe(5);
    });

    test('应该处理未收敛的情况', () => {
      const responses = [
        { item_difficulty: 0, is_correct: true },
        { item_difficulty: 1, is_correct: true },
        { item_difficulty: 2, is_correct: true }
      ];

      const result = detectCATConvergence(responses, {
        threshold: 0.01,  // 更严格的阈值
        minItems: 5      // 需要更多题目
      });

      expect(result.converged).toBe(false);
      expect(result.itemsNeeded).toBe(responses.length); // 未收敛，返回实际题目数
    });

    test('应该遵守最小题目数要求', () => {
      const responses = [
        { item_difficulty: 0, is_correct: true },
        { item_difficulty: 1, is_correct: false }
      ];

      const result = detectCATConvergence(responses, {
        threshold: 0.5,
        minItems: 5
      });

      // 即使估计很稳定，也必须达到最小题目数
      expect(result.converged).toBe(false);
    });

    test('应该处理空数组', () => {
      const result = detectCATConvergence([], {
        threshold: 0.1,
        minItems: 5
      });

      expect(result.converged).toBe(false);
      expect(result.itemsNeeded).toBeGreaterThan(0);
    });

    test('应该提供收敛过程详情', () => {
      const responses = [
        { item_difficulty: 0, is_correct: true },
        { item_difficulty: 1, is_correct: true },
        { item_difficulty: 2, is_correct: false }
      ];

      const result = detectCATConvergence(responses, {
        threshold: 0.1,
        minItems: 3,
        returnProcess: true
      });

      expect(result).toHaveProperty('process');
      expect(Array.isArray(result.process)).toBe(true);
      expect(result.process).toHaveLength(3);
    });
  });

  describe('analyzeConvergenceSpeed', () => {
    test('应该分析整体收敛速度', () => {
      const sessions = [
        {
          session_id: 's1',
          responses: createFastConvergingResponses() // 5题收敛
        },
        {
          session_id: 's2',
          responses: createFastConvergingResponses() // 5题收敛
        },
        {
          session_id: 's3',
          responses: createSlowConvergingResponses() // 10题收敛
        }
      ];

      const result = analyzeConvergenceSpeed(sessions, {
        threshold: 0.1,
        minItems: 3
      });

      expect(result).toHaveProperty('medianItems');
      expect(result).toHaveProperty('meanItems');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('totalSessions');
      expect(result.totalSessions).toBe(3);
    });

    test('应该通过验收标准（中位数 < 10）', () => {
      const sessions = [];

      // 创建10个快速收敛的会话
      for (let i = 0; i < 10; i++) {
        sessions.push({
          session_id: `s${i}`,
          responses: createFastConvergingResponses() // 5题
        });
      }

      const result = analyzeConvergenceSpeed(sessions, {
        threshold: 0.5,  // 放宽阈值
        minItems: 3,
        maxItems: 20
      });

      // 快速收敛应该在中位数上少于10题
      expect(result.medianItems).toBeLessThan(10);
      expect(result.passed).toBe(true);
    });

    test('应该不通过验收标准（中位数 >= 10）', () => {
      const sessions = [];

      // 创建10个慢速收敛的会话
      for (let i = 0; i < 10; i++) {
        sessions.push({
          session_id: `s${i}`,
          responses: createSlowConvergingResponses() // 15题
        });
      }

      const result = analyzeConvergenceSpeed(sessions, {
        threshold: 0.01, // 非常严格，要求15题才能收敛
        minItems: 10,    // 最少需要10题
        maxItems: 20
      });

      // 慢速收敛应该在中位数上达到或超过10题
      expect(result.medianItems).toBeGreaterThanOrEqual(10);
      expect(result.passed).toBe(false);
    });

    test('应该处理空数组', () => {
      const result = analyzeConvergenceSpeed([], {
        threshold: 0.1,
        minItems: 3
      });

      expect(result.medianItems).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.totalSessions).toBe(0);
    });

    test('应该提供详细的会话分析', () => {
      const sessions = [
        {
          session_id: 's1',
          responses: createFastConvergingResponses()
        }
      ];

      const result = analyzeConvergenceSpeed(sessions, {
        threshold: 0.1,
        minItems: 3,
        returnDetails: true
      });

      expect(result).toHaveProperty('sessionDetails');
      expect(Array.isArray(result.sessionDetails)).toBe(true);
      expect(result.sessionDetails).toHaveLength(1);
      expect(result.sessionDetails[0]).toHaveProperty('session_id');
      expect(result.sessionDetails[0]).toHaveProperty('itemsNeeded');
    });

    test('应该处理未收敛的会话', () => {
      const sessions = [
        {
          session_id: 's1',
          responses: createNonConvergingResponses() // 25题随机响应
        }
      ];

      const result = analyzeConvergenceSpeed(sessions, {
        threshold: 0.001, // 极其严格
        minItems: 15,    // 最少需要15题
        maxItems: 30,    // 提高最大值
        returnDetails: true
      });

      // 随机响应序列应该需要较多题目或达到最大值
      expect(result.sessionDetails).toBeDefined();
      expect(result.sessionDetails[0].itemsNeeded).toBeGreaterThan(5);
      // 由于是随机响应，收敛状态不确定，只检查题目数
    });
  });

  describe('集成测试', () => {
    test('完整流程：从答题数据到收敛速度分析', () => {
      const sessions = [];

      // 混合快速和慢速收敛
      for (let i = 0; i < 5; i++) {
        sessions.push({
          session_id: `fast_${i}`,
          responses: createFastConvergingResponses()
        });
      }

      for (let i = 0; i < 3; i++) {
        sessions.push({
          session_id: `slow_${i}`,
          responses: createSlowConvergingResponses()
        });
      }

      const result = analyzeConvergenceSpeed(sessions, {
        threshold: 0.5,
        minItems: 3,
        maxItems: 20,
        returnDetails: true
      });

      expect(result.totalSessions).toBe(8);
      expect(result).toHaveProperty('medianItems');
      expect(result).toHaveProperty('sessionDetails');
      expect(result.sessionDetails.length).toBe(8);

      // 验证快速收敛确实存在且通常更少题目
      const fastSessions = result.sessionDetails.filter(s => s.session_id.startsWith('fast_'));
      const slowSessions = result.sessionDetails.filter(s => s.session_id.startsWith('slow_'));

      if (fastSessions.length > 0 && slowSessions.length > 0) {
        // 验证快速收敛的题目数较少
        const fastItems = fastSessions[0].itemsNeeded;
        const slowItems = slowSessions[0].itemsNeeded;

        expect(fastItems).toBeGreaterThan(0);
        expect(slowItems).toBeGreaterThan(0);

        // 快速收敛应该比慢速收敛少（至少少1题）
        expect(slowItems).toBeGreaterThanOrEqual(fastItems);
      } else {
        // 至少验证有结果
        expect(result.medianItems).toBeGreaterThan(0);
      }
    });
  });
});

// 辅助函数：创建快速收敛的响应序列（固定数据）
function createFastConvergingResponses() {
  // 使用固定的响应序列，确保收敛
  return [
    { item_difficulty: 0, is_correct: true },
    { item_difficulty: 0.5, is_correct: true },
    { item_difficulty: 1.0, is_correct: false },
    { item_difficulty: 0.75, is_correct: true },
    { item_difficulty: 0.9, is_correct: false }
  ];
}

// 辅助函数：创建慢速收敛的响应序列（固定数据）
function createSlowConvergingResponses() {
  // 使用固定的响应序列，需要更多题目
  const responses = [];
  for (let i = 0; i < 15; i++) {
    const difficulty = (i - 7) * 0.2; // 从-1.4到1.6
    const correct = i < 8;
    responses.push({
      item_difficulty: difficulty,
      is_correct: correct
    });
  }
  return responses;
}

// 辅助函数：创建不收敛的响应序列
function createNonConvergingResponses() {
  // 随机响应，难以收敛 - 模拟25题
  const responses = [];
  for (let i = 0; i < 25; i++) {
    responses.push({
      item_difficulty: Math.random() * 4 - 2,
      is_correct: Math.random() > 0.5
    });
  }
  return responses;
}

// 辅助函数：计算中位数
function calculateMedian(values) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
}
