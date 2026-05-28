/**
 * startAssessment 异步集成测试 (TDD Red-Green-Refactor)
 * 功能：当题池不足时，调用generateQuestions异步生成
 */

let mockCloud;
jest.mock('wx-server-sdk', () => mockCloud);

// Mock question_pool模块
jest.mock('../question_pool', () => ({
  fetchQuestionsBatch: jest.fn(),
  fetchQuestionsFromPool: jest.fn()
}));

function createMockCloud(overrides = {}) {
  const mockCommand = {
    in: jest.fn((arr) => ({ $in: arr })),
    nin: jest.fn((arr) => ({ $nin: arr })),
    and: jest.fn((conds) => ({ $and: conds })),
    or: jest.fn((conds) => ({ $or: conds })),
    eq: jest.fn((val) => ({ $eq: val }))
  };

  const dbInstance = {
    collection: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ data: [] }),
      count: jest.fn().mockResolvedValue({ total: 100 }),
      add: jest.fn().mockResolvedValue({ _id: 'assessment_123' })
    })),
    doc: jest.fn().mockReturnThis(),
    command: mockCommand
  };

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: jest.fn(() => dbInstance),
    getWXContext: jest.fn(() => ({ OPENID: 'test_openid' })),
    callFunction: jest.fn().mockResolvedValue({
      result: { success: true, task_id: 'task_123' }
    }),
    ...overrides
  };
}

describe('startAssessment - Async Generation Integration', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockCloud = createMockCloud();
    jest.resetModules();
  });

  describe('async-generator模块集成', () => {
    test('应导入并使用async-generator模块', async () => {
      jest.resetModules();
      const asyncGenerator = require('../async-generator');

      // 验证模块导出
      expect(asyncGenerator.startAsyncGeneration).toBeDefined();
      expect(asyncGenerator.queryGenerationProgress).toBeDefined();
      expect(typeof asyncGenerator.startAsyncGeneration).toBe('function');
      expect(typeof asyncGenerator.queryGenerationProgress).toBe('function');
    });

    test('startAsyncGeneration应调用generateQuestions云函数', async () => {
      // 先设置mock
      mockCloud = createMockCloud({
        callFunction: jest.fn().mockResolvedValue({
          result: { success: true, task_id: 'task_abc' }
        })
      });
      jest.resetModules();

      // 重新加载模块
      const { startAsyncGeneration } = require('../async-generator');

      const result = await startAsyncGeneration({
        kp_id: 'kp_123',
        kp_name: '勾股定理',
        difficulty: 'medium',
        count: 5
      });

      expect(result.success).toBe(true);
      expect(result.task_id).toBe('task_abc');
    });
  });

  describe('当题池题目不足时（队列模式）', () => {
    test('应创建队列任务并返回queued状态', async () => {
      const mockCommand = {
        in: jest.fn((arr) => ({ $in: arr })),
        nin: jest.fn((arr) => ({ $nin: arr }))
      };

      mockCloud = createMockCloud({
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ data: [] }),
            add: jest.fn().mockResolvedValue({ _id: 'queue_123' })
          })),
          doc: jest.fn().mockReturnThis(),
          command: mockCommand
        })),
        callFunction: jest.fn()
      });

      jest.resetModules();

      // Mock fetchQuestionsBatch返回空结果
      const { fetchQuestionsBatch } = require('../question_pool');
      fetchQuestionsBatch.mockResolvedValue({});

      // Mock queue_manager
      jest.doMock('../queue_manager', () => ({
        checkQueueForStudent: jest.fn().mockResolvedValue({ found: false }),
        createQueueTask: jest.fn().mockResolvedValue({
          success: true,
          queue_id: 'queue_abc_123'
        })
      }));

      const cloud = require('wx-server-sdk');
      const startAssessment = require('../index');

      const result = await startAssessment.main({
        data: { subject: 'math', grade: '8', num_questions: 5 }
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('queued');
      expect(result.data.queue_id).toBeDefined();
      expect(result.data.message).toContain('生成');
    });

    test('应返回queue_id供客户端轮询', async () => {
      const mockCommand = {
        in: jest.fn((arr) => ({ $in: arr })),
        nin: jest.fn((arr) => ({ $nin: arr }))
      };

      mockCloud = createMockCloud({
        callFunction: jest.fn(),
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ data: [] }),
            add: jest.fn().mockResolvedValue({ _id: 'queue_456' })
          })),
          doc: jest.fn().mockReturnThis(),
          command: mockCommand
        }))
      });

      jest.resetModules();

      // Mock fetchQuestionsBatch返回空结果
      const { fetchQuestionsBatch } = require('../question_pool');
      fetchQuestionsBatch.mockResolvedValue({});

      // Mock queue_manager
      jest.doMock('../queue_manager', () => ({
        checkQueueForStudent: jest.fn().mockResolvedValue({ found: false }),
        createQueueTask: jest.fn().mockResolvedValue({
          success: true,
          queue_id: 'queue_test_789'
        })
      }));

      const cloud = require('wx-server-sdk');
      const startAssessment = require('../index');

      const result = await startAssessment.main({
        data: { subject: 'math', grade: '8', num_questions: 5 }
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.queue_id).toBe('queue_test_789');
      expect(result.data.status).toBe('queued');
    });
  });

  describe('当题池题目足够时', () => {
    test('应直接返回题目，不调用generateQuestions', async () => {
      const mockCommand = {
        in: jest.fn((arr) => ({ $in: arr })),
        nin: jest.fn((arr) => ({ $nin: arr }))
      };

      mockCloud = createMockCloud({
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            add: jest.fn().mockResolvedValue({ _id: 'assessment_123' })
          })),
          doc: jest.fn().mockReturnThis(),
          command: mockCommand
        })),
        callFunction: jest.fn().mockResolvedValue({
          result: { success: true, task_id: 'task_123' }
        })
      });

      jest.resetModules();

      // Mock fetchQuestionsBatch：对任意kp_id都返回题目
      const { fetchQuestionsBatch } = require('../question_pool');
      fetchQuestionsBatch.mockImplementation((db, kpIds) => {
        const result = {};
        kpIds.forEach(kpId => {
          result[kpId] = [{
            _id: `q_${kpId}`,
            question: `Question for ${kpId}`,
            options: ['A','B','C','D'],
            correct_answer: 'A',
            kp_id: kpId,
            kp_name: `Knowledge Point ${kpId}`,
            difficulty: 'medium'
          }];
        });
        return Promise.resolve(result);
      });

      const cloud = require('wx-server-sdk');
      const startAssessment = require('../index');

      const result = await startAssessment.main({
        data: { subject: 'math', grade: '8', num_questions: 5 }
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ready');
      expect(result.data.questions).toBeDefined();
      expect(result.data.questions.length).toBe(5);
      // 题目足够时不应调用generateQuestions
      expect(cloud.callFunction).not.toHaveBeenCalled();
    });
  });

  describe('当generateQuestions调用失败时', () => {
    test('应返回错误信息', async () => {
      // Mock fetchQuestionsBatch返回空结果
      const { fetchQuestionsBatch } = require('../question_pool');
      fetchQuestionsBatch.mockResolvedValue({});

      const mockCommand = {
        in: jest.fn((arr) => ({ $in: arr })),
        nin: jest.fn((arr) => ({ $nin: arr }))
      };

      mockCloud = createMockCloud({
        callFunction: jest.fn().mockResolvedValue({
          result: { success: false, error: 'AI service unavailable' }
        }),
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            add: jest.fn().mockResolvedValue({ _id: 'assessment_123' })
          })),
          doc: jest.fn().mockReturnThis(),
          command: mockCommand
        }))
      });

      jest.resetModules();
      const startAssessment = require('../index');

      const result = await startAssessment.main({
        data: { subject: 'math', grade: '8', num_questions: 5 }
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
