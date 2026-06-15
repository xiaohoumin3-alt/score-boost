/**
 * IRT 模型测试
 */

const IRTModel = require('../irt-model');

describe('IRTModel', () => {
  let model;

  beforeEach(() => {
    model = new IRTModel();
    // 加载测试题目库
    model.loadItemBank([
      { item_id: 'q1', discrimination: 1.2, difficulty: -1.0 },
      { item_id: 'q2', discrimination: 1.0, difficulty: 0.0 },
      { item_id: 'q3', discrimination: 1.5, difficulty: 1.0 },
      { item_id: 'q4', discrimination: 0.8, difficulty: -0.5 },
      { item_id: 'q5', discrimination: 1.3, difficulty: 0.5 },
    ]);
  });

  describe('probability', () => {
    test('θ = b 时概率为 0.5', () => {
      const p = model.probability(0, 1, 0);
      expect(p).toBeCloseTo(0.5, 2);
    });

    test('θ >> b 时概率接近 1', () => {
      const p = model.probability(3, 1, 0);
      expect(p).toBeGreaterThan(0.9);
    });

    test('θ << b 时概率接近 0', () => {
      const p = model.probability(-3, 1, 0);
      expect(p).toBeLessThan(0.1);
    });
  });

  describe('estimateAbility', () => {
    test('全对 → 高 θ', () => {
      const responses = [
        { item_id: 'q1', correct: 1 },
        { item_id: 'q2', correct: 1 },
        { item_id: 'q3', correct: 1 },
      ];
      const result = model.estimateAbility(responses);
      expect(result.theta).toBeGreaterThan(1);
    });

    test('全错 → 低 θ', () => {
      const responses = [
        { item_id: 'q1', correct: 0 },
        { item_id: 'q2', correct: 0 },
        { item_id: 'q3', correct: 0 },
      ];
      const result = model.estimateAbility(responses);
      expect(result.theta).toBeLessThan(-1);
    });

    test('50% 正确 → θ 接近 0', () => {
      const responses = [
        { item_id: 'q1', correct: 1 },
        { item_id: 'q2', correct: 0 },
        { item_id: 'q3', correct: 1 },
        { item_id: 'q4', correct: 0 },
      ];
      const result = model.estimateAbility(responses);
      expect(Math.abs(result.theta)).toBeLessThan(1);
    });

    test('空响应 → θ = 0', () => {
      const result = model.estimateAbility([]);
      expect(result.theta).toBe(0);
    });
  });

  describe('getInitialTheta', () => {
    test('前 5 题用正确率推算', () => {
      const responses = [
        { item_id: 'q1', correct: 1 },
        { item_id: 'q2', correct: 1 },
      ];
      const theta = model.getInitialTheta(responses);
      expect(typeof theta).toBe('number');
    });

    test('5 题后用 IRT 估计', () => {
      const responses = Array(6).fill(null).map((_, i) => ({
        item_id: `q${(i % 5) + 1}`,
        correct: i % 2,
      }));
      const theta = model.getInitialTheta(responses);
      expect(typeof theta).toBe('number');
    });
  });

  describe('模拟验证', () => {
    test('优等生应估计出高 θ', () => {
      // 模拟优等生：答对难题，答错简单题
      const responses = [
        { item_id: 'q1', correct: 1 },  // 简单题对
        { item_id: 'q2', correct: 1 },  // 中等题对
        { item_id: 'q3', correct: 1 },  // 难题对
        { item_id: 'q4', correct: 1 },  // 简单题对
        { item_id: 'q5', correct: 1 },  // 中等偏难题对
      ];
      const result = model.estimateAbility(responses);
      expect(result.theta).toBeGreaterThan(1.5);
    });

    test('学困生应估计出低 θ', () => {
      // 模拟学困生：答错简单题
      const responses = [
        { item_id: 'q1', correct: 0 },
        { item_id: 'q2', correct: 0 },
        { item_id: 'q3', correct: 0 },
        { item_id: 'q4', correct: 0 },
        { item_id: 'q5', correct: 0 },
      ];
      const result = model.estimateAbility(responses);
      expect(result.theta).toBeLessThan(-1);
    });
  });
});
