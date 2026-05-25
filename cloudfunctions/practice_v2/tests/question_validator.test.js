/**
 * QuestionValidator 单元测试
 * TDD: RED → GREEN → REFACTOR
 */

const QuestionValidator = require('../question_validator');

describe('QuestionValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new QuestionValidator();
  });

  describe('validateOptionsBalance', () => {
    test('均衡选项应通过验证', () => {
      const question = {
        question: '测试题目',
        options: [
          { key: 'A', value: '选项一内容' },
          { key: 'B', value: '选项二内容' },
          { key: 'C', value: '选项三内容' },
          { key: 'D', value: '选项四内容' }
        ]
      };
      const result = validator.validateOptionsBalance(question);
      expect(result.pass).toBe(true);
      expect(result.diff).toBeLessThan(0.3);
    });

    test('不均衡选项（正确答案太长）应不通过', () => {
      const question = {
        question: '测试题目',
        options: [
          { key: 'A', value: 'A' },
          { key: 'B', value: 'B' },
          { key: 'C', value: 'C' },
          { key: 'D', value: '这是正确答案的详细解释内容非常长' }
        ]
      };
      const result = validator.validateOptionsBalance(question);
      expect(result.pass).toBe(false);
      expect(result.diff).toBeGreaterThanOrEqual(0.3);
    });

    test('空选项应返回不通过', () => {
      const result = validator.validateOptionsBalance({ question: '测试' });
      expect(result.pass).toBe(false);
    });

    test('应兼容字符串数组格式选项', () => {
      const question = {
        question: '测试题目',
        options: ['选项一', '选项二', '选项三', '选项四']
      };
      const result = validator.validateOptionsBalance(question);
      expect(result.pass).toBe(true);
      expect(result.max).toBe(3);
      expect(result.min).toBe(3);
    });
  });

  describe('validateNoPatternization', () => {
    test('正常题目应通过验证', () => {
      const question = {
        question: '梯子长5米，底端离墙3米，顶端离地面多高？'
      };
      const result = validator.validateNoPatternization(question);
      expect(result.pass).toBe(true);
      expect(result.detected).toEqual([]);
    });

    test('模板化题目应不通过', () => {
      const question = {
        question: '一个3-4-5的直角三角形，求斜边长度'
      };
      const result = validator.validateNoPatternization(question);
      expect(result.pass).toBe(false);
      expect(result.detected.length).toBeGreaterThan(0);
    });

    test('纯计算题模板应被检测', () => {
      const question = {
        question: '计算√(9+16)的值'
      };
      const result = validator.validateNoPatternization(question);
      expect(result.pass).toBe(false);
    });
  });

  describe('validateQuestionPatternDiversity', () => {
    test('问法多样性应被正确统计', () => {
      const questions = [
        { question: '求梯子高度' },
        { question: '计算斜边长度' },
        { question: '判断是否直角三角形' }
      ];
      const result = validator.validateQuestionPatternDiversity(questions);
      expect(result.diversity).toBeGreaterThanOrEqual(2);
      expect(result.pass).toBe(true);
    });

    test('单一问法应不通过', () => {
      const questions = [
        { question: '求梯子高度' },
        { question: '求斜边长度' },
        { question: '求直角边长度' }
      ];
      const result = validator.validateQuestionPatternDiversity(questions);
      expect(result.diversity).toBe(1);
      expect(result.pass).toBe(false);
    });
  });

  describe('validate综合验证', () => {
    test('好题目应通过综合验证', () => {
      const question = {
        question: '梯子长5米，底端离墙3米，顶端离地面多高？',
        options: [
          { key: 'A', value: '4米' },
          { key: 'B', value: '3米' },
          { key: 'C', value: '2米' },
          { key: 'D', value: '5米' }
        ]
      };
      const result = validator.validate(question, {});
      expect(result.pass).toBe(true);
    });

    test('选项不均衡应返回retry=true', () => {
      const question = {
        question: '测试题目',
        options: [
          { key: 'A', value: 'A' },
          { key: 'B', value: 'B' },
          { key: 'C', value: 'C' },
          { key: 'D', value: '这是正确答案的详细解释内容非常长' }
        ]
      };
      const result = validator.validate(question, {});
      expect(result.pass).toBe(false);
      expect(result.retry).toBe(true);
      expect(result.errors).toContain('optionsBalance');
    });
  });
});
