/**
 * 题目参数库构建器测试
 */

const { estimateItemParams, buildItemBank, toIRTItems, DIFFICULTY_TO_B } = require('../../item-bank-builder');

describe('ItemBankBuilder', () => {
  describe('estimateItemParams', () => {
    test('有足够数据时使用数据驱动估计', () => {
      const question = {
        _id: 'q1',
        usage_count: 50,
        correct_count: 30,
        difficulty: 'medium',
        grade: '8',
        subject: 'math',
      };
      const params = estimateItemParams(question);
      expect(params.source).toBe('data_driven');
      expect(params.a).toBeGreaterThanOrEqual(0.5);
      expect(params.a).toBeLessThanOrEqual(2.5);
      expect(params.b).toBeGreaterThanOrEqual(-3);
      expect(params.b).toBeLessThanOrEqual(3);
    });

    test('数据不足时使用冷启动', () => {
      const question = {
        _id: 'q2',
        usage_count: 5,
        correct_count: 3,
        difficulty: 'easy',
        grade: '3',
        subject: 'math',
      };
      const params = estimateItemParams(question);
      expect(params.source).toBe('cold_start');
      expect(params.a).toBeGreaterThan(0);
    });

    test('无数据时使用冷启动', () => {
      const question = {
        _id: 'q3',
        difficulty: 'hard',
        grade: '9',
        subject: 'physics',
      };
      const params = estimateItemParams(question);
      expect(params.source).toBe('cold_start');
    });

    test('高正确率 → 低难度 b', () => {
      const question = {
        _id: 'q4',
        usage_count: 100,
        correct_count: 95,
        difficulty: 'medium',
      };
      const params = estimateItemParams(question);
      expect(params.b).toBeLessThan(0);
    });

    test('低正确率 → 高难度 b', () => {
      const question = {
        _id: 'q5',
        usage_count: 100,
        correct_count: 10,
        difficulty: 'medium',
      };
      const params = estimateItemParams(question);
      expect(params.b).toBeGreaterThan(0);
    });
  });

  describe('buildItemBank', () => {
    test('批量生成 IRT 参数', () => {
      const questions = [
        { _id: 'q1', usage_count: 50, correct_count: 30, difficulty: 'medium', grade: '8', subject: 'math' },
        { _id: 'q2', usage_count: 5, correct_count: 3, difficulty: 'easy', grade: '3', subject: 'math' },
      ];
      const items = buildItemBank(questions);
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveProperty('item_id', 'q1');
      expect(items[0]).toHaveProperty('irt_a');
      expect(items[0]).toHaveProperty('irt_b');
      expect(items[0]).toHaveProperty('irt_source');
    });
  });

  describe('toIRTItems', () => {
    test('转换为 IRTModel 可用格式', () => {
      const questions = [
        { _id: 'q1', usage_count: 50, correct_count: 30, difficulty: 'medium', grade: '8', subject: 'math', kp_name: '二次方程' },
      ];
      const items = toIRTItems(questions);
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveProperty('item_id', 'q1');
      expect(items[0]).toHaveProperty('a');
      expect(items[0]).toHaveProperty('b');
      expect(items[0]).toHaveProperty('subject', 'math');
      expect(items[0]).toHaveProperty('grade', '8');
      expect(items[0]).toHaveProperty('knowledge_point', '二次方程');
    });
  });

  describe('DIFFICULTY_TO_B', () => {
    test('easy 难度范围', () => {
      expect(DIFFICULTY_TO_B.easy.min).toBeLessThan(DIFFICULTY_TO_B.easy.max);
      expect(DIFFICULTY_TO_B.easy.default).toBeGreaterThanOrEqual(DIFFICULTY_TO_B.easy.min);
      expect(DIFFICULTY_TO_B.easy.default).toBeLessThanOrEqual(DIFFICULTY_TO_B.easy.max);
    });

    test('hard 难度范围 > medium > easy', () => {
      expect(DIFFICULTY_TO_B.hard.default).toBeGreaterThan(DIFFICULTY_TO_B.medium.default);
      expect(DIFFICULTY_TO_B.medium.default).toBeGreaterThan(DIFFICULTY_TO_B.easy.default);
    });
  });
});
