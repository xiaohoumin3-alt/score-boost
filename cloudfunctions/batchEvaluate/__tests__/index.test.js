/**
 * 批量评估云函数测试 (TDD)
 */

// Mock wx-server-sdk and evaluator
jest.mock('wx-server-sdk', () => {
  const mockCommand = {
    eq: jest.fn((val) => val)
  };

  const mockDb = {
    database: jest.fn(() => ({
      collection: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({ data: [] }))
          }))
        })),
        update: jest.fn(() => Promise.resolve())
      })),
      command: mockCommand
    })),
    command: mockCommand
  };
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: mockDb.database,
    command: mockCommand
  };
});

jest.mock('../../shared/llm-client', () => ({
  LlmClient: jest.fn().mockImplementation(() => ({
    callWithTimeout: jest.fn()
  }))
}));

// Mock evaluator - correct path from batchEvaluate/__tests__ is ../../startAssessment/evaluator.js
jest.mock('../../startAssessment/evaluator.js', () => ({
  evaluate: jest.fn(),
  EVALUATOR_VERSION: 'v1'
}));

const { evaluate } = require('../../startAssessment/evaluator.js');
const cloud = require('wx-server-sdk');

// Re-import after mocks
const { getPendingQuestions, executeBatchEvaluate } = require('../index');

describe('getPendingQuestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return empty array when no pending questions', async () => {
    const result = await getPendingQuestions(10);
    expect(result).toEqual([]);
  });
});

describe('executeBatchEvaluate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return zero results when no pending questions', async () => {
    const result = await executeBatchEvaluate({ limit: 10 });
    expect(result.success).toBe(0);
    expect(result.total).toBe(0);
  });
});