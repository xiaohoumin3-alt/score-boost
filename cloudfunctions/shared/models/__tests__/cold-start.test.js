/**
 * 冷启动管理器测试
 */

const ColdStartManager = require('../cold-start');

describe('ColdStartManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ColdStartManager();
  });

  describe('loadPretrainedModel', () => {
    test('小学数学科目', () => {
      const params = manager.loadPretrainedModel('math', '3');
      expect(params.discrimination).toBeGreaterThan(0);
      expect(params.difficultyBase).toBeLessThan(0);
    });

    test('初中数学科目', () => {
      const params = manager.loadPretrainedModel('math', '8');
      expect(params.discrimination).toBeGreaterThan(0);
      expect(params.difficultyBase).toBeGreaterThanOrEqual(0);
    });

    test('初中物理科目（难度更高）', () => {
      const params = manager.loadPretrainedModel('physics', '8');
      const mathParams = manager.loadPretrainedModel('math', '8');
      expect(params.difficultyBase).toBeGreaterThan(mathParams.difficultyBase);
    });
  });

  describe('getInitialAbility', () => {
    test('小学低年级 → 低 θ', () => {
      const ability = manager.getInitialAbility('2');
      expect(ability.theta).toBeLessThan(-1);
      expect(ability.confidence).toBeLessThan(0.3);
    });

    test('初中高年级 → 高 θ', () => {
      const ability = manager.getInitialAbility('9');
      expect(ability.theta).toBeGreaterThan(0);
    });

    test('默认年级 → 中等 θ', () => {
      const ability = manager.getInitialAbility(undefined);
      expect(ability.theta).toBe(0.1);
    });
  });

  describe('generateItemParams', () => {
    test('基础知识点 → 低难度', () => {
      const params = manager.generateItemParams('math', '3', '基础计算');
      expect(params.difficulty).toBeLessThan(0);
    });

    test('应用知识点 → 高难度', () => {
      const params = manager.generateItemParams('math', '8', '应用题综合');
      expect(params.difficulty).toBeGreaterThan(0);
    });

    test('区分度在合理范围', () => {
      const params = manager.generateItemParams('math', '5', '认识图形');
      expect(params.discrimination).toBeGreaterThanOrEqual(1.0);
      expect(params.discrimination).toBeLessThanOrEqual(1.5);
    });
  });

  describe('needsColdStart', () => {
    test('无预训练模型 → 需要冷启动', () => {
      expect(manager.needsColdStart('user1', 'math')).toBe(true);
    });

    test('有预训练模型 → 不需要冷启动', () => {
      manager.loadPretrainedModel('math', '8');
      expect(manager.needsColdStart('user1', 'math')).toBe(false);
    });
  });
});
