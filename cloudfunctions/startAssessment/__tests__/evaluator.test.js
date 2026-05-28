/**
 * 难度评估器测试 (TDD Red-Green-Refactor)
 */

const { evaluate, evaluateIfNeeded, EVALUATOR_VERSION } = require('../evaluator');

// Mock LlmClient - evaluator.js imports from ./llm-client
jest.mock('../llm-client', () => ({
  LlmClient: jest.fn().mockImplementation(() => ({
    callWithTimeout: jest.fn()
  }))
}));

const { LlmClient } = require('../llm-client');

describe('evaluate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return evaluation result with correct structure', async () => {
    const mockResponse = {
      content: JSON.stringify({
        difficulty: 'easy',
        score: 25,
        reasoning: '直接套用勾股定理，单一知识点',
        dimensions: {
          cognitive_complexity: 'low',
          concept_depth: 'shallow',
          innovation: 'standard',
          calculation: 'simple'
        }
      })
    };

    LlmClient.mockImplementation(() => ({
      callWithTimeout: jest.fn().mockResolvedValue(mockResponse)
    }));

    const question = {
      content: '√16的值是？',
      options: ['A. 4', 'B. ±4', 'C. 8', 'D. -4'],
      correct_answer: 'A'
    };

    const result = await evaluate(question);

    expect(result).not.toBeNull();
    expect(result.level).toBe('easy');
    expect(result.score).toBe(25);
    expect(result.reasoning).toBeDefined();
    expect(result.dimensions).toBeDefined();
    expect(result.evaluator_version).toBe('v1');
    expect(result.evaluated_at).toBeDefined();
  });

  test('should return null when LLM call fails', async () => {
    LlmClient.mockImplementation(() => ({
      callWithTimeout: jest.fn().mockRejectedValue(new Error('API Error'))
    }));

    const question = {
      content: 'test',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'A'
    };

    const result = await evaluate(question);

    expect(result).toBeNull();
  });

  test('should return null when JSON parse fails', async () => {
    LlmClient.mockImplementation(() => ({
      callWithTimeout: jest.fn().mockResolvedValue({
        content: 'invalid json'
      })
    }));

    const question = {
      content: 'test',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'A'
    };

    const result = await evaluate(question);

    expect(result).toBeNull();
  });
});

describe('evaluateIfNeeded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return existing evaluation if present', async () => {
    const existingEvaluation = {
      level: 'hard',
      score: 85,
      reasoning: '复杂计算',
      dimensions: {},
      evaluated_at: '2026-05-21T10:00:00Z',
      evaluator_version: 'v1'
    };

    const question = {
      content: 'test',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'A',
      difficulty_ai: existingEvaluation
    };

    const result = await evaluateIfNeeded(question);

    expect(result).toEqual(existingEvaluation);
    // Should not call LLM
    expect(LlmClient).not.toHaveBeenCalled();
  });

  test('should call evaluate when no existing evaluation', async () => {
    const mockResponse = {
      content: JSON.stringify({
        difficulty: 'medium',
        score: 50,
        reasoning: '中等难度',
        dimensions: {
          cognitive_complexity: 'medium',
          concept_depth: 'moderate',
          innovation: 'variant',
          calculation: 'moderate'
        }
      })
    };

    LlmClient.mockImplementation(() => ({
      callWithTimeout: jest.fn().mockResolvedValue(mockResponse)
    }));

    const question = {
      content: 'test',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'A'
      // no difficulty_ai
    };

    const result = await evaluateIfNeeded(question);

    expect(result).not.toBeNull();
    expect(result.level).toBe('medium');
    expect(LlmClient).toHaveBeenCalled();
  });
});

describe('EVALUATOR_VERSION', () => {
  test('should be v1', () => {
    expect(EVALUATOR_VERSION).toBe('v1');
  });
});
