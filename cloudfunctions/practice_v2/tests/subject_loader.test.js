/**
 * SubjectLoader 单元测试
 * TDD: RED → GREEN → REFACTOR
 */

const SubjectLoader = require('../subject_loader');

describe('SubjectLoader', () => {
  let loader;

  beforeEach(() => {
    loader = new SubjectLoader();
  });

  describe('loadConfig', () => {
    test('应成功加载配置文件', () => {
      const config = loader.loadConfig('math', 'kp2_3');
      expect(config).toBeDefined();
      expect(config.subject).toBe('math');
      expect(config.knowledge_point).toBe('kp2_3');
    });

    test('应解析场景库', () => {
      const config = loader.loadConfig('math', 'kp2_3');
      expect(config.scenarios).toBeDefined();
      expect(config.scenarios.length).toBeGreaterThan(0);
      expect(config.scenarios[0]).toHaveProperty('id');
      expect(config.scenarios[0]).toHaveProperty('name');
      expect(config.scenarios[0]).toHaveProperty('templates');
    });

    test('应解析勾股数库', () => {
      const config = loader.loadConfig('math', 'kp2_3');
      expect(config.pythagorean_triples).toBeDefined();
      expect(config.pythagorean_triples.length).toBeGreaterThan(0);
      expect(config.pythagorean_triples[0]).toEqual([3, 4, 5]);
    });

    test('应解析问法模式', () => {
      const config = loader.loadConfig('math', 'kp2_3');
      expect(config.question_patterns).toBeDefined();
      expect(config.question_patterns.length).toBeGreaterThan(0);
      expect(config.question_patterns[0]).toHaveProperty('type');
      expect(config.question_patterns[0]).toHaveProperty('templates');
    });

    test('不存在的配置应返回null', () => {
      const config = loader.loadConfig('invalid', 'kp');
      expect(config).toBeNull();
    });
  });

  describe('getRandomScenario', () => {
    test('应返回随机场景', () => {
      const config = loader.loadConfig('math', 'kp2_3');
      const scenario = loader.getRandomScenario(config);
      expect(scenario).toBeDefined();
      expect(scenario).toHaveProperty('id');
      expect(scenario).toHaveProperty('name');
      expect(scenario).toHaveProperty('templates');
    });
  });

  describe('getRandomTriple', () => {
    test('应返回随机勾股数', () => {
      const config = loader.loadConfig('math', 'kp2_3');
      const triple = loader.getRandomTriple(config);
      expect(triple).toBeDefined();
      expect(triple).toHaveLength(3);
      expect(triple[0] ** 2 + triple[1] ** 2).toBe(triple[2] ** 2);
    });
  });

  describe('getRandomQuestionPattern', () => {
    test('应返回随机问法模式', () => {
      const config = loader.loadConfig('math', 'kp2_3');
      const pattern = loader.getRandomQuestionPattern(config);
      expect(pattern).toBeDefined();
      expect(pattern).toHaveProperty('type');
      expect(pattern).toHaveProperty('templates');
    });
  });

  describe('excludeUsed', () => {
    test('应排除已使用的场景', () => {
      const config = loader.loadConfig('math', 'kp2_3');
      const used = ['ladder', 'shadow'];
      const available = loader.excludeUsed(config.scenarios, 'id', used);
      expect(available.every(s => !used.includes(s.id))).toBe(true);
    });

    test('应排除已使用的勾股数', () => {
      const config = loader.loadConfig('math', 'kp2_3');
      const used = [[3, 4, 5], [5, 12, 13]];
      const available = loader.excludeUsed(config.pythagorean_triples, null, used);
      expect(available.every(t => !used.some(u => u[0] === t[0] && u[1] === t[1]))).toBe(true);
    });
  });
});
