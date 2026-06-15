/**
 * IRT 种子数据生成器测试
 */

const {
  generateIRTParams,
  generateSeedQuestions,
  DIFFICULTY_IRT_PARAMS,
  SUBJECT_DIFFICULTY_ADJUST,
  GRADE_DIFFICULTY_ADJUST,
} = require('../../irt-seed-generator');

describe('IRT Seed Generator', () => {
  describe('generateIRTParams', () => {
    test('easy 难度 → 负 b 值', () => {
      const kp = {
        kp_id: 'math_kp1',
        kp_name: '二次根式',
        subject: 'math',
        grade: 8,
        difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 },
      };
      const params = generateIRTParams(kp, 'easy');
      expect(params.a).toBeGreaterThanOrEqual(0.6);
      expect(params.a).toBeLessThanOrEqual(1.4);
      expect(params.b).toBeGreaterThanOrEqual(-2.5);
      expect(params.b).toBeLessThanOrEqual(-0.5);
      expect(params.source).toBe('research_based');
    });

    test('hard 难度 → 正 b 值', () => {
      const kp = {
        kp_id: 'math_kp1',
        kp_name: '二次根式',
        subject: 'math',
        grade: 8,
        difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 },
      };
      const params = generateIRTParams(kp, 'hard');
      expect(params.a).toBeGreaterThanOrEqual(1.0);
      expect(params.a).toBeLessThanOrEqual(2.2);
      expect(params.b).toBeGreaterThanOrEqual(0.8);
      expect(params.b).toBeLessThanOrEqual(2.5);
    });

    test('科目修正生效', () => {
      const kp = {
        kp_id: 'bio_kp1',
        kp_name: '种子的萌发',
        subject: 'biology',
        grade: 7,
        difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 },
      };
      const params = generateIRTParams(kp, 'easy');
      // 生物 easy 难度应该更低（更简单）
      expect(params.b).toBeLessThanOrEqual(-1.0);
    });

    test('年级修正生效', () => {
      // 多次采样取平均，消除随机扰动影响
      const kp1 = { kp_id: 'kp1', kp_name: 'test', subject: 'math', grade: 3, difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } };
      const kp9 = { kp_id: 'kp9', kp_name: 'test', subject: 'math', grade: 9, difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } };
      let sum1 = 0, sum9 = 0;
      const N = 20;
      for (let i = 0; i < N; i++) {
        sum1 += generateIRTParams(kp1, 'medium').b;
        sum9 += generateIRTParams(kp9, 'medium').b;
      }
      // 低年级平均 b 应该更低（更简单）
      expect(sum1 / N).toBeLessThan(sum9 / N);
    });
  });

  describe('generateSeedQuestions', () => {
    test('为每个知识点生成题目', () => {
      const kps = [
        {
          kp_id: 'math_kp1',
          kp_name: '二次根式',
          subject: 'math',
          grade: 8,
          chapter: '二次根式',
          difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 },
        },
        {
          kp_id: 'math_kp2',
          kp_name: '勾股定理',
          subject: 'math',
          grade: 8,
          chapter: '勾股定理',
          difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 },
        },
      ];
      const seeds = generateSeedQuestions(kps, 3);
      expect(seeds.length).toBeGreaterThanOrEqual(6);  // 2 kp × 3 questions

      // 检查每个种子都有必要字段
      for (const s of seeds) {
        expect(s).toHaveProperty('kp_id');
        expect(s).toHaveProperty('kp_name');
        expect(s).toHaveProperty('subject');
        expect(s).toHaveProperty('grade');
        expect(s).toHaveProperty('difficulty');
        expect(s).toHaveProperty('irt_a');
        expect(s).toHaveProperty('irt_b');
        expect(s).toHaveProperty('irt_source', 'research_based');
      }
    });

    test('难度分布符合 difficulty_weight', () => {
      const kps = [
        {
          kp_id: 'math_kp1',
          kp_name: 'test',
          subject: 'math',
          grade: 8,
          difficulty_weight: { easy: 0.6, medium: 0.3, hard: 0.1 },
        },
      ];
      const seeds = generateSeedQuestions(kps, 10);
      const easyCount = seeds.filter(s => s.difficulty === 'easy').length;
      const mediumCount = seeds.filter(s => s.difficulty === 'medium').length;
      const hardCount = seeds.filter(s => s.difficulty === 'hard').length;

      // easy 应该最多
      expect(easyCount).toBeGreaterThan(mediumCount);
      expect(mediumCount).toBeGreaterThan(hardCount);
    });
  });

  describe('常量配置', () => {
    test('DIFFICULTY_IRT_PARAMS 覆盖三种难度', () => {
      expect(DIFFICULTY_IRT_PARAMS).toHaveProperty('easy');
      expect(DIFFICULTY_IRT_PARAMS).toHaveProperty('medium');
      expect(DIFFICULTY_IRT_PARAMS).toHaveProperty('hard');
    });

    test('easy b 范围 < medium b 范围 < hard b 范围', () => {
      expect(DIFFICULTY_IRT_PARAMS.easy.bRange[1]).toBeLessThan(DIFFICULTY_IRT_PARAMS.medium.bRange[0]);
      expect(DIFFICULTY_IRT_PARAMS.medium.bRange[1]).toBeLessThan(DIFFICULTY_IRT_PARAMS.hard.bRange[0]);
    });

    test('SUBJECT_DIFFICULTY_ADJUST 覆盖所有科目', () => {
      const subjects = ['math', 'chinese', 'english', 'physics', 'chemistry', 'biology', 'geography', 'history', 'politics'];
      for (const s of subjects) {
        expect(SUBJECT_DIFFICULTY_ADJUST).toHaveProperty(s);
      }
    });
  });
});
