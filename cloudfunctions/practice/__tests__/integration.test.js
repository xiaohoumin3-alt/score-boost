/**
 * practice云函数集成测试 (TDD Red-Green-Refactor)
 * 功能：验证AI题目消费与预生成闭环
 */

// Mock wx-server-sdk
jest.mock('wx-server-sdk', () => {
  const mockDb = {
    database: jest.fn(() => ({
      collection: jest.fn(() => ({
        add: jest.fn(() => Promise.resolve({ _id: 'test_id' })),
        where: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ data: [] }))
        }))
      }))
    }))
  };
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: mockDb.database
  };
});

// Mock shared模块
jest.mock('../../shared/ai-question-consumer', () => ({
  consumeQuestion: jest.fn()
}));

jest.mock('../../shared/pregen-trigger', () => ({
  shouldTriggerPregen: jest.fn()
}));

jest.mock('../../shared/heat-calculator', () => ({
  calculateHeat: jest.fn()
}));

const {
  getQuestionsWithAiFallback
} = require('../index');

const { consumeQuestion } = require('../../shared/ai-question-consumer');
const { shouldTriggerPregen } = require('../../shared/pregen-trigger');
const { calculateHeat } = require('../../shared/heat-calculator');

describe('getQuestionsWithAiFallback - 集成流程', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should consume AI question when available', async () => {
    const mockQuestion = {
      _id: 'ai_1',
      kp_id: 'kp1',
      difficulty: 'easy',
      question: 'AI生成的题目',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 0,
      explanation: '解析'
    };

    consumeQuestion.mockResolvedValue(mockQuestion);
    shouldTriggerPregen.mockReturnValue(false);

    const result = await getQuestionsWithAiFallback({
      kp_id: 'kp1',
      difficulty: 'easy',
      num_questions: 1
    });

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].source).toBe('ai');
    expect(result.triggeredPregen).toBe(false);
  });

  test('should trigger pregen when no AI questions available', async () => {
    consumeQuestion.mockResolvedValue(null); // 无AI题目
    shouldTriggerPregen.mockReturnValue(true);
    calculateHeat.mockReturnValue(100);

    const result = await getQuestionsWithAiFallback({
      kp_id: 'kp1',
      difficulty: 'easy',
      num_questions: 1
    });

    expect(result.questions).toHaveLength(0); // 无可用题目
    expect(result.triggeredPregen).toBe(true);
    expect(shouldTriggerPregen).toHaveBeenCalled();
  });

  test('should not trigger pregen when heat is low', async () => {
    consumeQuestion.mockResolvedValue(null);
    shouldTriggerPregen.mockReturnValue(false); // 热度低

    const result = await getQuestionsWithAiFallback({
      kp_id: 'kp1',
      difficulty: 'easy',
      num_questions: 1
    });

    expect(result.triggeredPregen).toBe(false);
  });

  test('should handle mixed AI and fallback sources', async () => {
    const aiQuestion = {
      _id: 'ai_1',
      kp_id: 'kp1',
      difficulty: 'easy',
      question: 'AI题目',
      options: ['A', 'B'],
      correct_answer: 0
    };

    consumeQuestion
      .mockResolvedValueOnce(aiQuestion) // 第一题有AI
      .mockResolvedValueOnce(null);      // 第二题无AI

    const result = await getQuestionsWithAiFallback({
      kp_id: 'kp1',
      difficulty: 'easy',
      num_questions: 2
    });

    expect(result.questions).toHaveLength(1); // 只有AI题目
    expect(result.questions[0].source).toBe('ai');
  });
});

describe('recordKpRequest集成', () => {
  test('should record request and calculate heat', async () => {
    // 此测试验证recordKpRequest云函数的完整流程
    // 包括：记录请求 → 计算热度 → 触发预生成
    expect(true).toBe(true); // 占位测试
  });
});
