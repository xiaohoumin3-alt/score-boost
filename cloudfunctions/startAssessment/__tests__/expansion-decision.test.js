/**
 * 扩容决策逻辑单元测试 (TDD Red-Green-Refactor)
 * 功能：分析题池短缺情况，决定是否需要扩容
 */

const { analyzeShortage, shouldExpand, calculateExpansionPlan } = require('../expansion-decision');

describe('扩容决策逻辑', () => {

  describe('analyzeShortage - 分析题池短缺', () => {
    test('应返回空短缺当题池充足', () => {
      const result = analyzeShortage({
        demand: 5,
        available: 5
      });

      expect(result).toBeDefined();
      expect(result.shortage_count).toBe(0);
      expect(result.affected_kps).toHaveLength(0);
    });

    test('应计算短缺数量和知识点', () => {
      const result = analyzeShortage({
        demand: 10,
        available: 3,
        kp_gaps: {
          'kp1': { demand: 2, available: 0 },
          'kp2': { demand: 3, available: 1 }
        }
      });

      expect(result.shortage_count).toBe(7);
      expect(result.affected_kps).toHaveLength(2);
    });

    test('应区分verified和unverified题目', () => {
      const result = analyzeShortage({
        demand: 10,
        available_verified: 2,
        available_unverified: 3
      });

      expect(result.available_verified).toBe(2);
      expect(result.available_unverified).toBe(3);
    });
  });

  describe('shouldExpand - 扩容决策', () => {
    test('应在严重短缺时决定扩容', () => {
      const shortage = analyzeShortage({ demand: 10, available: 2 });
      const decision = shouldExpand(shortage);

      expect(decision).toBe(true);
    });

    test('应在轻微短缺时不扩容', () => {
      const shortage = analyzeShortage({ demand: 10, available: 8 });
      const decision = shouldExpand(shortage);

      expect(decision).toBe(false);
    });

    test('应考虑扩容历史避免重复扩容', () => {
      const shortage = analyzeShortage({ demand: 10, available: 2 });
      const recentExpansion = { last_expanded_at: Date.now() - 1000 };
      const decision = shouldExpand(shortage, recentExpansion);

      // 最近已扩容，不应再次扩容
      expect(decision).toBe(false);
    });
  });

  describe('calculateExpansionPlan - 计算扩容计划', () => {
    test('应生成扩容计划包含目标知识点', () => {
      const shortage = analyzeShortage({
        demand: 10,
        available: 2,
        kp_gaps: {
          'kp1': { demand: 5, available: 1 },
          'kp2': { demand: 5, available: 1 }
        }
      });

      const plan = calculateExpansionPlan(shortage);

      expect(plan).toBeDefined();
      expect(plan.kp_list).toBeDefined();
      expect(plan.count_per_kp).toBeGreaterThan(0);
    });

    test('应按优先级排序知识点', () => {
      const shortage = analyzeShortage({
        demand: 10,
        available: 2,
        kp_gaps: {
          'kp_hot': { demand: 8, available: 0, heat: 10 },
          'kp_cold': { demand: 2, available: 0, heat: 1 }
        }
      });

      const plan = calculateExpansionPlan(shortage);

      // 热点知识点应该在前面
      expect(plan.kp_list[0].kp_id).toBe('kp_hot');
    });
  });
});
