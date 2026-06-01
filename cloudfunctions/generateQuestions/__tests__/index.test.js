/**
 * generateQuestions 云函数测试 (TDD Red-Green-Refactor)
 * 功能：异步生成题目，返回task_id供客户端轮询
 */

let mockCloud;
jest.mock('wx-server-sdk', () => mockCloud);

// 可配置的 mock 工厂
function createMockCloud(overrides = {}) {
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: jest.fn(() => ({
      collection: jest.fn(() => ({
        add: jest.fn().mockResolvedValue({ _id: 'task_123' }),
        doc: jest.fn(() => ({
          update: jest.fn().mockResolvedValue({})
        }))
      }))
    })),
    getWXContext: jest.fn(() => ({ OPENID: 'test_openid' })),
    callFunction: jest.fn().mockResolvedValue({
      result: { success: true, questions: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    }),
    ...overrides
  };
}

describe('generateQuestions - Async Question Generation', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // 设置默认 mock
    mockCloud = createMockCloud();
    jest.resetModules();
  });

  describe('exports.main - 云函数入口', () => {
    test('应创建任务并返回task_id', async () => {
      const cloud = require('wx-server-sdk');
      const generateQuestions = require('../index');

      const result = await generateQuestions.main({
        kp_id: 'kp_123',
        kp_name: '光合作用',
        difficulty: 'medium',
        count: 3
      }, {});

      expect(result.success).toBe(true);
      expect(result.task_id).toBeDefined();
    });

    test('应处理参数缺失情况', async () => {
      const cloud = require('wx-server-sdk');
      const generateQuestions = require('../index');

      const result = await generateQuestions.main({}, {});

      expect(result.success).toBe(true);
      expect(result.task_id).toBeDefined();
    });

    test('应处理数据库错误', async () => {
      mockCloud = createMockCloud({
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            add: jest.fn().mockRejectedValue(new Error('Database error'))
          }))
        }))
      });
      jest.resetModules();

      const cloud = require('wx-server-sdk');
      const generateQuestions = require('../index');

      const result = await generateQuestions.main({
        kp_id: 'kp_123'
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('generateQuestionsAsync - 异步生成逻辑', () => {
    test('应调用generateAiQuestion并更新任务状态为completed', async () => {
      const mockDocUpdate = jest.fn().mockResolvedValue({});
      mockCloud = createMockCloud({
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              update: mockDocUpdate
            }))
          }))
        }))
      });
      jest.resetModules();

      const cloud = require('wx-server-sdk');
      const generateQuestions = require('../index');

      await generateQuestions.generateQuestionsAsync('task_123', {
        kp_id: 'kp_123',
        kp_name: '光合作用',
        difficulty: 'medium',
        count: 3
      });

      expect(cloud.callFunction).toHaveBeenCalledWith({
        name: 'generateAiQuestion',
        data: expect.objectContaining({
          kp_id: 'kp_123',
          count: 3
        })
      });

      expect(mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({
        status: 'completed'
      }));
    });

    test('应处理generateAiQuestion失败并更新任务状态为failed', async () => {
      const mockDocUpdate = jest.fn().mockResolvedValue({});
      mockCloud = createMockCloud({
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              update: mockDocUpdate
            }))
          }))
        })),
        callFunction: jest.fn().mockResolvedValue({
          result: { success: false, errMsg: 'AI generation failed' }
        })
      });
      jest.resetModules();

      const cloud = require('wx-server-sdk');
      const generateQuestions = require('../index');

      await generateQuestions.generateQuestionsAsync('task_123', {
        kp_id: 'kp_123',
        kp_name: '光合作用',
        difficulty: 'medium',
        count: 3
      });

      expect(mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({
        status: 'failed',
        error: expect.any(String)
      }));
    });
  });
});
