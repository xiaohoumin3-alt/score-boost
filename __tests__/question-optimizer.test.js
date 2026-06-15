/**
 * questionOptimizer 共享模块测试
 */

const {
  normalizeQuestion,
  validateQuestion,
  validateQuestions,
  getQuestions,
  getKnowledgePointCoverage
} = require('../cloudfunctions/shared/question-optimizer');

describe('questionOptimizer', () => {
  describe('normalizeQuestion', () => {
    test('应该标准化原始题目格式', () => {
      const raw = {
        _id: 'pool_123',
        question: '1 + 1 = ?',
        options: ['1', '2', '3', '4'],
        correct_answer: 1,
        difficulty: 'medium',
        kp_id: 'kp_001',
        kp_name: '加法'
      };

      const result = normalizeQuestion(raw);

      expect(result.question_id).toBe('pool_123');
      expect(result.content).toBe('1 + 1 = ?');
      expect(result.correct_answer).toBe('B');
      expect(result.difficulty).toBe(0);
      expect(result.kp_id).toBe('kp_001');
    });

    test('应该处理字符串难度', () => {
      expect(normalizeQuestion({ difficulty: 'easy' }).difficulty).toBe(-1);
      expect(normalizeQuestion({ difficulty: 'hard' }).difficulty).toBe(1);
    });

    test('应该处理数字正确答案', () => {
      expect(normalizeQuestion({ correct_answer: 0 }).correct_answer).toBe('A');
      expect(normalizeQuestion({ correct_answer: 3 }).correct_answer).toBe('D');
    });
  });

  describe('validateQuestion', () => {
    test('有效题目应该通过验证', () => {
      const q = normalizeQuestion({
        _id: 'q1', question: '测试题目内容', options: ['A', 'B', 'C', 'D'],
        correct_answer: 0, difficulty: 0
      });

      const result = validateQuestion(q);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('缺少内容应该失败', () => {
      const q = normalizeQuestion({
        _id: 'q1', question: '短', options: ['A', 'B', 'C', 'D'], correct_answer: 0
      });
      const result = validateQuestion(q);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('题目内容过短');
    });

    test('选项数量不对应该失败', () => {
      const q = normalizeQuestion({
        _id: 'q1', question: '测试题目内容', options: ['A', 'B'], correct_answer: 0
      });
      const result = validateQuestion(q);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('选项数量必须为4');
    });

    test('难度超出范围应该失败', () => {
      const q = normalizeQuestion({
        _id: 'q1', question: '测试题目内容', options: ['A', 'B', 'C', 'D'],
        correct_answer: 0, difficulty: 5
      });
      const result = validateQuestion(q);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('难度'))).toBe(true);
    });
  });

  describe('validateQuestions', () => {
    test('应该分离有效和无效题目', () => {
      const questions = [
        normalizeQuestion({ _id: 'q1', question: '有效题目内容1', options: ['A', 'B', 'C', 'D'], correct_answer: 0 }),
        normalizeQuestion({ _id: 'q2', question: '短', options: ['A', 'B', 'C', 'D'], correct_answer: 0 }),
        normalizeQuestion({ _id: 'q3', question: '有效题目内容2', options: ['A', 'B', 'C', 'D'], correct_answer: 1 })
      ];

      const result = validateQuestions(questions);
      expect(result.valid.length).toBe(2);
      expect(result.invalid.length).toBe(1);
    });
  });
});
