/**
 * 分数映射器测试
 */

const ScoreMapper = require('../score-mapper');

describe('ScoreMapper', () => {
  describe('数学 (中考150分)', () => {
    const mapper = new ScoreMapper('math');

    test('全对+难题 → 优秀', () => {
      const result = mapper.estimateScore(10, 10, 0.7, '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(85);
      expect(result.examScore).toBeGreaterThanOrEqual(120);
      expect(result.level).toBe('A');
    });

    test('70%正确+中等 → 及格', () => {
      const result = mapper.estimateScore(7, 10, 0.5, '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(60);
      expect(result.estimatedScore).toBeLessThanOrEqual(75);
      expect(result.level).toBe('C');
    });

    test('40%正确+中等 → 及格或待提高', () => {
      const result = mapper.estimateScore(4, 10, 0.5, '8');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(40);
      expect(result.estimatedScore).toBeLessThanOrEqual(70);
      expect(['C', 'D']).toContain(result.level);
    });

    test('20%正确+中等 → 待提高', () => {
      const result = mapper.estimateScore(2, 10, 0.5, '8');
      expect(result.estimatedScore).toBeLessThanOrEqual(45);
      expect(['D', 'E']).toContain(result.level);
    });

    test('中考分数不超过150分', () => {
      const result = mapper.estimateScore(10, 10, 1.0, '8');
      expect(result.examScore).toBeLessThanOrEqual(150);
    });
  });

  describe('语文 (中考150分)', () => {
    const mapper = new ScoreMapper('chinese');

    test('80%正确 → 良好或优秀', () => {
      const result = mapper.estimateScore(8, 10, 0.6, '7');
      expect(result.estimatedScore).toBeGreaterThanOrEqual(70);
      expect(['A', 'B']).toContain(result.level);
    });
  });

  describe('物理 (中考100分)', () => {
    const mapper = new ScoreMapper('physics');

    test('中考分数不超过100分', () => {
      const result = mapper.estimateScore(10, 10, 1.0, '8');
      expect(result.examScore).toBeLessThanOrEqual(100);
    });
  });

  describe('边界测试', () => {
    const mapper = new ScoreMapper('math');

    test('0题 → 置信度低', () => {
      const result = mapper.estimateScore(0, 0, 0.5, '8');
      expect(result.confidence).toBeLessThanOrEqual(30);
    });

    test('全对 → 置信度高', () => {
      const result = mapper.estimateScore(20, 20, 0.5, '8');
      expect(result.confidence).toBeGreaterThanOrEqual(80);
    });

    test('极端正确率 → 置信度降低', () => {
      const result = mapper.estimateScore(1, 10, 0.5, '8');
      expect(result.confidence).toBeLessThan(70);
    });
  });

  describe('年级修正', () => {
    const mapper = new ScoreMapper('math');

    test('低年级得分偏高', () => {
      const result1 = mapper.estimateScore(7, 10, 0.5, '2');
      const result8 = mapper.estimateScore(7, 10, 0.5, '8');
      expect(result1.estimatedScore).toBeGreaterThan(result8.estimatedScore);
    });
  });

  describe('科目配置', () => {
    test('数学中考满分150', () => {
      const mapper = new ScoreMapper('math');
      expect(mapper.config.examFullScore).toBe(150);
    });

    test('物理中考满分100', () => {
      const mapper = new ScoreMapper('physics');
      expect(mapper.config.examFullScore).toBe(100);
    });

    test('未知科目抛出错误', () => {
      expect(() => new ScoreMapper('unknown')).toThrow('Unknown subject');
    });
  });
});
