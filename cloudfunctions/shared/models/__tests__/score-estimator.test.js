/**
 * 分数估算器测试
 */

const ScoreEstimator = require('../score-estimator');

describe('ScoreEstimator', () => {
  describe('数学估算', () => {
    const estimator = new ScoreEstimator('math');

    test('全对 → 高分', () => {
      const responses = Array(10).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: 1,
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(80);
      expect(result.level).toBe('A');
    });

    test('50% 正确 → 中等分', () => {
      const responses = Array(10).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: i % 2,
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(50);
      expect(result.estimatedScore).toBeLessThanOrEqual(75);
    });

    test('包含 IRT 结果', () => {
      const responses = Array(5).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: 1,
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result).toHaveProperty('theta');
      expect(result).toHaveProperty('se');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('语文估算', () => {
    const estimator = new ScoreEstimator('chinese');

    test('中考分数不超过150分', () => {
      const responses = Array(10).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: 1,
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '7');
      expect(result.examScore).toBeLessThanOrEqual(150);
    });
  });
});
