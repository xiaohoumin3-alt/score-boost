/**
 * GenerationState 单元测试
 * TDD: RED → GREEN → REFACTOR
 */

const GenerationState = require('../generation_state');

describe('GenerationState', () => {
  let state;

  beforeEach(() => {
    state = new GenerationState();
  });

  describe('recordQuestion', () => {
    test('应记录场景信息', () => {
      state.recordQuestion({ scenario_used: '梯子靠墙问题' });
      const scenarios = state.getUsedScenarios();
      expect(scenarios).toEqual(['梯子靠墙问题']);
    });

    test('应记录勾股数信息', () => {
      state.recordQuestion({ triple_used: [3, 4, 5] });
      const triples = state.getUsedTriples();
      expect(triples).toEqual([[3, 4, 5]]);
    });

    test('应记录问法类型', () => {
      state.recordQuestion({ question_pattern: '求值' });
      const patterns = state.getUsedPatterns();
      expect(patterns).toEqual(['求值']);
    });

    test('应记录完整题目信息', () => {
      state.recordQuestion({
        scenario_used: '航海航行方向',
        triple_used: [5, 12, 13],
        question_pattern: '计算'
      });

      expect(state.getUsedScenarios()).toContain('航海航行方向');
      expect(state.getUsedTriples()).toContainEqual([5, 12, 13]);
      expect(state.getUsedPatterns()).toContain('计算');
    });

    test('应保留最近5题记录', () => {
      for (let i = 1; i <= 7; i++) {
        state.recordQuestion({
          scenario_used: `场景${i}`,
          triple_used: [i, i+1, i+2],
          question_pattern: `问法${i}`
        });
      }

      // 场景3应该被移除（只保留最近5题：3,4,5,6,7中的5,6,7）
      const scenarios = state.getUsedScenarios();
      expect(scenarios).not.toContain('场景1');
      expect(scenarios).not.toContain('场景2');
      expect(scenarios.length).toBe(5);
    });
  });

  describe('getUsedPatterns', () => {
    test('应返回最近3个问法', () => {
      state.recordQuestion({ question_pattern: '求值' });
      state.recordQuestion({ question_pattern: '计算' });
      state.recordQuestion({ question_pattern: '判断' });
      state.recordQuestion({ question_pattern: '选择' });

      const patterns = state.getUsedPatterns();
      expect(patterns).toEqual(['判断', '选择']);
      expect(patterns).not.toContain('求值');
    });

    test('问法少于3个时应全部返回', () => {
      state.recordQuestion({ question_pattern: '求值' });
      state.recordQuestion({ question_pattern: '计算' });

      const patterns = state.getUsedPatterns();
      expect(patterns).toEqual(['求值', '计算']);
    });

    test('没有问法时应返回空数组', () => {
      const patterns = state.getUsedPatterns();
      expect(patterns).toEqual([]);
    });
  });

  describe('reset', () => {
    test('应清空所有记录', () => {
      state.recordQuestion({
        scenario_used: '测试场景',
        triple_used: [1, 2, 3],
        question_pattern: '测试问法'
      });

      state.reset();

      expect(state.getUsedScenarios()).toEqual([]);
      expect(state.getUsedTriples()).toEqual([]);
      expect(state.getUsedPatterns()).toEqual([]);
    });
  });

  describe('边界情况', () => {
    test('recordQuestion参数为空时应不报错', () => {
      expect(() => state.recordQuestion({})).not.toThrow();
      expect(() => state.recordQuestion(null)).not.toThrow();
      expect(() => state.recordQuestion(undefined)).not.toThrow();
    });

    test('getUsedPatterns在slice(-3)边界情况下正确工作', () => {
      state.recordQuestion({ question_pattern: 'A' });
      state.recordQuestion({ question_pattern: 'B' });

      const patterns = state.getUsedPatterns();
      expect(patterns).toEqual(['A', 'B']);
    });
  });
});
