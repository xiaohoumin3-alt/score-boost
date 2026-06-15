/**
 * 复测一致性测试
 * 验证同一用户多次测评的分数标准差是否符合验收标准
 * 验收标准：STD < 8
 */

const {
  calculateRetestSTD,
  calculateRetestConsistencyScore,
  groupScoresByUser
} = require('../cloudfunctions/shared/utils/retest-calculator');

describe('复测一致性计算', () => {
  describe('groupScoresByUser', () => {
    test('应该按用户ID分组分数', () => {
      const assessments = [
        { _openid: 'user1', total_score: 85 },
        { _openid: 'user2', total_score: 90 },
        { _openid: 'user1', total_score: 88 },
        { _openid: 'user2', total_score: 92 }
      ];

      const grouped = groupScoresByUser(assessments);

      expect(grouped).toEqual({
        'user1': [85, 88],
        'user2': [90, 92]
      });
    });

    test('应该处理空数组', () => {
      expect(groupScoresByUser([])).toEqual({});
    });

    test('应该处理单个测评', () => {
      const assessments = [
        { _openid: 'user1', total_score: 85 }
      ];

      const grouped = groupScoresByUser(assessments);

      expect(grouped).toEqual({
        'user1': [85]
      });
    });

    test('应该忽略无效的分数', () => {
      const assessments = [
        { _openid: 'user1', total_score: 85 },
        { _openid: 'user1', total_score: null },
        { _openid: 'user1', total_score: 90 },
        { _openid: 'user1', total_score: undefined }
      ];

      const grouped = groupScoresByUser(assessments);

      expect(grouped).toEqual({
        'user1': [85, 90]
      });
    });
  });

  describe('calculateRetestSTD', () => {
    test('应该计算标准差', () => {
      const scores = [80, 85, 90, 85, 80];
      const std = calculateRetestSTD(scores);

      // 手动计算：均值=84, 方差=((80-84)²+(85-84)²+(90-84)²+(85-84)²+(80-84)²)/5 = (16+1+36+1+16)/5 = 14, 标准差=√14≈3.74
      expect(std).toBeCloseTo(3.74, 1);
    });

    test('应该处理两个分数', () => {
      const scores = [80, 90];
      const std = calculateRetestSTD(scores);

      // 标准差 = 5
      expect(std).toBe(5);
    });

    test('应该处理单个分数（标准差为0）', () => {
      const scores = [85];
      const std = calculateRetestSTD(scores);

      expect(std).toBe(0);
    });

    test('应该处理空数组', () => {
      expect(calculateRetestSTD([])).toBe(0);
    });

    test('应该处理相同分数', () => {
      const scores = [85, 85, 85, 85];
      const std = calculateRetestSTD(scores);

      expect(std).toBe(0);
    });

    test('应该计算高分变异的情况', () => {
      const scores = [60, 90, 70, 85, 65];
      const std = calculateRetestSTD(scores);

      // 均值=74, 方差较大
      expect(std).toBeGreaterThan(10);
    });
  });

  describe('calculateRetestConsistencyScore', () => {
    test('应该计算整体复测一致性', () => {
      const userScores = {
        'user1': [85, 88, 86],
        'user2': [90, 92, 91],
        'user3': [75, 78, 77]
      };

      const result = calculateRetestConsistencyScore(userScores);

      expect(result).toHaveProperty('averageSTD');
      expect(result).toHaveProperty('userCount');
      expect(result).toHaveProperty('passed');
      expect(result.userCount).toBe(3);
    });

    test('应该通过验收标准（STD < 8）', () => {
      const userScores = {
        'user1': [85, 87, 86],  // STD ≈ 1
        'user2': [90, 91, 90],  // STD ≈ 0.58
        'user3': [75, 77, 76]   // STD ≈ 1
      };

      const result = calculateRetestConsistencyScore(userScores);

      expect(result.averageSTD).toBeLessThan(8);
      expect(result.passed).toBe(true);
    });

    test('应该不通过验收标准（STD >= 8）', () => {
      const userScores = {
        'user1': [60, 90, 70],  // STD ≈ 15
        'user2': [50, 85, 65]   // STD ≈ 17.5
      };

      const result = calculateRetestConsistencyScore(userScores);

      expect(result.averageSTD).toBeGreaterThanOrEqual(8);
      expect(result.passed).toBe(false);
    });

    test('应该处理空对象', () => {
      const result = calculateRetestConsistencyScore({});

      expect(result.averageSTD).toBe(0);
      expect(result.userCount).toBe(0);
      expect(result.passed).toBe(false);
    });

    test('应该提供详细的用户STD信息', () => {
      const userScores = {
        'user1': [85, 87, 86],
        'user2': [90, 92, 91]
      };

      const result = calculateRetestConsistencyScore(userScores);

      expect(result).toHaveProperty('userSTDs');
      expect(Object.keys(result.userSTDs)).toHaveLength(2);
    });
  });

  describe('集成测试', () => {
    test('完整流程：从原始数据到一致性分数', () => {
      const assessments = [
        // 用户1：稳定的分数
        { _openid: 'user1', total_score: 85 },
        { _openid: 'user1', total_score: 87 },
        { _openid: 'user1', total_score: 86 },

        // 用户2：稳定的分数
        { _openid: 'user2', total_score: 90 },
        { _openid: 'user2', total_score: 91 },
        { _openid: 'user2', total_score: 90 },

        // 用户3：高分变异（应该失败）
        { _openid: 'user3', total_score: 60 },
        { _openid: 'user3', total_score: 90 },
        { _openid: 'user3', total_score: 70 }
      ];

      // 1. 分组
      const grouped = groupScoresByUser(assessments);

      // 2. 计算一致性
      const result = calculateRetestConsistencyScore(grouped);

      // 3. 验证
      expect(result.userCount).toBe(3);
      expect(result).toHaveProperty('averageSTD');
      expect(result).toHaveProperty('userSTDs');
      expect(result.userSTDs['user1']).toBeLessThan(8);
      expect(result.userSTDs['user2']).toBeLessThan(8);
      expect(result.userSTDs['user3']).toBeGreaterThan(8);
    });
  });
});
