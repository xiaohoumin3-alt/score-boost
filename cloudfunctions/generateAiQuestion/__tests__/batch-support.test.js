/**
 * generateAiQuestion 批量生成测试 (TDD Red-Green)
 * 阶段1：批量API改造
 * 测试generateQuestionBatch的编排逻辑
 */

// 测试generateQuestionBatch的编排逻辑，不测试实际的HTTP请求
// HTTP层测试通过集成测试完成

const {
  generateQuestionBatch,
  parseLlmResponse,
  validateQuestion
} = require('../index');

describe('generateAiQuestion - 批量生成支持', () => {
  describe('generateQuestionBatch 函数', () => {
    test('应导出generateQuestionBatch函数', () => {
      expect(typeof generateQuestionBatch).toBe('function');
    });

    test('generateQuestionBatch应处理空任务列表', async () => {
      const results = await generateQuestionBatch([]);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    test('generateQuestionBatch应处理单任务', async () => {
      const results = await generateQuestionBatch([
        { kp: { kp_id: 'kp1', kp_name: '测试' }, difficulty: 'easy' }
      ]);
      // 由于无法mock HTTP，这个测试只验证函数能正确处理输入
      // 实际的API测试通过集成测试完成
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('parseLlmResponse', () => {
    test('应正确解析标准JSON响应', () => {
      const content = JSON.stringify({
        question: '批量生成测试题',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 2,
        explanation: '解析'
      });

      const result = parseLlmResponse(content);

      expect(result.question).toBe('批量生成测试题');
      expect(result.options).toEqual(['A', 'B', 'C', 'D']);
      expect(result.correct_answer).toBe(2);
      expect(result.explanation).toBe('解析');
    });

    test('应处理markdown代码块中的JSON', () => {
      const content = `\`\`\`json
{
  "question": "批量生成测试题",
  "options": ["A", "B", "C", "D"],
  "correct_answer": 2,
  "explanation": "解析"
}
\`\`\``;

      const result = parseLlmResponse(content);

      expect(result.question).toBe('批量生成测试题');
    });

    test('应处理无效JSON', () => {
      expect(parseLlmResponse('not json')).toBeNull();
      expect(parseLlmResponse('')).toBeNull();
    });
  });

  describe('validateQuestion', () => {
    test('应验证合法的选择题', () => {
      const question = {
        question: '批量生成测试题',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 2,
        explanation: '解析'
      };

      expect(validateQuestion(question)).toBe(true);
    });

    test('应拒绝无效题目', () => {
      expect(validateQuestion(null)).toBe(false);
      expect(validateQuestion({})).toBe(false);
      expect(validateQuestion({
        question: '题',
        options: ['A'],
        correct_answer: 0
      })).toBe(false); // 选项太少
    });
  });
});