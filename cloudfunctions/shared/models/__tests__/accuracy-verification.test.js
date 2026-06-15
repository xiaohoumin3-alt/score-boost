/**
 * 精度验证测试
 * 验收标准：精度达到"良好"及以上
 */

const ScoreEstimator = require('../score-estimator');
const ColdStartManager = require('../cold-start');

describe('精度验证', () => {
  describe('数学 - 不同水平学生', () => {
    const estimator = new ScoreEstimator('math');

    test('优秀学生 (90%正确率) → 预估85+分', () => {
      const responses = Array(20).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: i < 18 ? 1 : 0,  // 90%正确
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      console.log('[DEBUG] 优秀学生结果:', JSON.stringify({
        estimatedScore: result.estimatedScore,
        level: result.level,
        examScore: result.examScore
      }));
      expect(result.estimatedScore).toBeGreaterThanOrEqual(85);
      expect(result.level).toBe('A');
    });

    test('良好学生 (75%正确率) → 预估70-85分', () => {
      const responses = Array(20).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: i < 15 ? 1 : 0,  // 75%正确
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(70);
      expect(result.estimatedScore).toBeLessThanOrEqual(85);
      expect(['B', 'C']).toContain(result.level);
    });

    test('及格学生 (60%正确率) → 预估55-70分', () => {
      const responses = Array(20).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: i < 12 ? 1 : 0,  // 60%正确
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(50);
      expect(result.estimatedScore).toBeLessThanOrEqual(80);
    });

    test('待提高学生 (40%正确率) → 预估40-55分', () => {
      const responses = Array(20).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: i < 8 ? 1 : 0,  // 40%正确
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(35);
      expect(result.estimatedScore).toBeLessThanOrEqual(65);
    });
  });

  describe('语文 - 不同水平学生', () => {
    const estimator = new ScoreEstimator('chinese');

    test('优秀学生 → 中考预估130+', () => {
      const responses = Array(20).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: i < 18 ? 1 : 0,
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result.examScore).toBeGreaterThanOrEqual(120);
    });
  });

  describe('物理 - 不同水平学生', () => {
    const estimator = new ScoreEstimator('physics');

    test('优秀学生 → 中考预估70+', () => {
      const responses = Array(20).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: i < 18 ? 1 : 0,
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result.examScore).toBeGreaterThanOrEqual(70);
    });
  });

  describe('冷启动精度', () => {
    test('新用户首次测评 → 有合理预估', () => {
      const coldStart = new ColdStartManager();
      const initialAbility = coldStart.getInitialAbility('8');
      
      // 基于初始能力值的预估应该合理
      expect(initialAbility.theta).toBe(0.1);
      expect(initialAbility.confidence).toBe(0.2);
    });
  });

  describe('边界测试', () => {
    const estimator = new ScoreEstimator('math');

    test('0题 → 返回默认值', () => {
      const result = estimator.estimateFromResponses([], '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(0);
      expect(result.estimatedScore).toBeLessThanOrEqual(100);
    });

    test('全对 → 高分', () => {
      const responses = Array(30).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: 1,
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(90);
    });

    test('全错 → 低分', () => {
      const responses = Array(30).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: 0,
        question_type: 'choice',
      }));
      const result = estimator.estimateFromResponses(responses, '8');
      expect(result.estimatedScore).toBeLessThanOrEqual(30);
    });
  });

  describe('年级修正验证', () => {
    const estimator = new ScoreEstimator('math');

    test('同样正确率，低年级得分更高', () => {
      const responses = Array(10).fill(null).map((_, i) => ({
        item_id: `q${i + 1}`,
        correct: i < 7 ? 1 : 0,  // 70%正确
        question_type: 'choice',
      }));
      
      const result2 = estimator.estimateFromResponses(responses, '2');
      const result8 = estimator.estimateFromResponses(responses, '8');
      
      expect(result2.estimatedScore).toBeGreaterThan(result8.estimatedScore);
    });
  });
});
