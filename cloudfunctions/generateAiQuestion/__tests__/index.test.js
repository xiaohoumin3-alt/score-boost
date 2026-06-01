/**
 * generateAiQuestion 云函数测试 (TDD Red-Green-Refactor)
 * 功能：调用LLM生成题目，写入ai_question_pool
 * 注意：此模块测试parseLlmResponse和validateQuestion（纯函数）
 * generateQuestion和generateQuestionBatch的完整测试需要集成测试
 */

const {
  generateQuestionBatch,
  parseLlmResponse,
  validateQuestion
} = require('../index');

describe('generateAiQuestion - parseLlmResponse', () => {
  test('should parse valid JSON response', () => {
    const content = JSON.stringify({
      question: '测试题目',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 0,
      explanation: '解析'
    });

    const result = parseLlmResponse(content);

    expect(result).toEqual({
      question: '测试题目',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 0,
      explanation: '解析'
    });
  });

  test('should extract JSON from markdown code block', () => {
    const content = `以下是题目：
\`\`\`json
{
  "question": "题目",
  "options": ["A", "B"],
  "correct_answer": 0,
  "explanation": "解析"
}
\`\`\`
`;

    const result = parseLlmResponse(content);

    expect(result.question).toBe('题目');
  });

  test('should handle JSON wrapped in markdown without json tag', () => {
    const content = `\`\`\`
{
  "question": "题目",
  "options": ["A", "B"],
  "correct_answer": 0,
  "explanation": "解析"
}
\`\`\`
`;

    const result = parseLlmResponse(content);

    expect(result.question).toBe('题目');
  });

  test('should return null for invalid response', () => {
    expect(parseLlmResponse('not json')).toBeNull();
    expect(parseLlmResponse('')).toBeNull();
    expect(parseLlmResponse('{}')).toBeNull();
  });

  test('should handle JSON with extra text before and after', () => {
    const content = `这是题目说明：
{
  "question": "测试题目",
  "options": ["A", "B", "C", "D"],
  "correct_answer": 0,
  "explanation": "解析"
}
这是更多说明`;

    const result = parseLlmResponse(content);

    expect(result.question).toBe('测试题目');
  });
});

describe('generateAiQuestion - validateQuestion', () => {
  test('should validate correct choice question structure', () => {
    const question = {
      question: '题目',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 0,
      explanation: '解析'
    };

    expect(validateQuestion(question)).toBe(true);
  });

  test('should validate correct written question structure', () => {
    const question = {
      question: '题目',
      sample_answer: '参考答案',
      explanation: '解析'
    };

    expect(validateQuestion(question, 'written')).toBe(true);
  });

  test('should validate correct coding question structure', () => {
    const question = {
      question: '题目',
      expected_code: '期望代码',
      explanation: '解析'
    };

    expect(validateQuestion(question, 'coding')).toBe(true);
  });

  test('should reject null or undefined', () => {
    expect(validateQuestion(null)).toBe(false);
  });

  test('should reject empty object', () => {
    expect(validateQuestion({})).toBe(false);
  });

  test('should reject question without options for choice type', () => {
    expect(validateQuestion({ question: '题' })).toBe(false);
  });

  test('should reject question with only one option', () => {
    expect(validateQuestion({
      question: '题',
      options: ['A'],
      correct_answer: 0,
      explanation: '解析'
    })).toBe(false);
  });

  test('should reject choice question missing explanation', () => {
    expect(validateQuestion({
      question: '题',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 0
    })).toBe(false);
  });

  test('should reject choice question with out-of-bounds correct_answer', () => {
    expect(validateQuestion({
      question: '题',
      options: ['A', 'B'],
      correct_answer: 5,
      explanation: '解析'
    })).toBe(false);
  });

  test('should reject written question without sample_answer', () => {
    expect(validateQuestion({
      question: '题',
      explanation: '解析'
    }, 'written')).toBe(false);
  });

  test('should reject coding question without expected_code', () => {
    expect(validateQuestion({
      question: '题',
      explanation: '解析'
    }, 'coding')).toBe(false);
  });
});

describe('generateAiQuestion - generateQuestionBatch', () => {
  test('should export generateQuestionBatch function', () => {
    expect(typeof generateQuestionBatch).toBe('function');
  });

  test('should handle empty task list', async () => {
    const results = await generateQuestionBatch([]);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});