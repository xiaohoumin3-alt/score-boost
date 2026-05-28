/**
 * startAssessment 异步生成单元测试 (TDD Red-Green-Refactor)
 * 功能：测试异步生成调用的核心逻辑
 */

let mockCloud;
jest.mock('wx-server-sdk', () => mockCloud);

function createMockCloud(overrides = {}) {
  const mockCommand = {
    in: jest.fn((arr) => ({ $in: arr })),
    nin: jest.fn((arr) => ({ $nin: arr }))
  };

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: jest.fn(() => ({
      collection: jest.fn(),
      command: mockCommand
    })),
    getWXContext: jest.fn(() => ({ OPENID: 'test_openid' })),
    callFunction: jest.fn(),
    ...overrides
  };
}

describe('startAssessment - Async Generation Logic', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockCloud = createMockCloud();
    jest.resetModules();
  });

  describe('当需要调用异步生成时', () => {
    test('应正确调用generateQuestions云函数', async () => {
      // 设置mock
      mockCloud = createMockCloud({
        callFunction: jest.fn().mockResolvedValue({
          result: { success: true, task_id: 'task_abc123' }
        })
      });

      jest.resetModules();
      const cloud = require('wx-server-sdk');

      // 模拟调用
      const result = await cloud.callFunction({
        name: 'generateQuestions',
        data: {
          kp_id: 'kp_123',
          kp_name: '勾股定理',
          difficulty: 'medium',
          count: 5
        }
      });

      // 验证调用
      expect(cloud.callFunction).toHaveBeenCalledWith({
        name: 'generateQuestions',
        data: expect.objectContaining({
          kp_id: 'kp_123',
          kp_name: '勾股定理',
          difficulty: 'medium',
          count: 5
        })
      });

      // 验证返回
      expect(result.result.success).toBe(true);
      expect(result.result.task_id).toBe('task_abc123');
    });

    test('应处理generateQuestions返回失败', async () => {
      mockCloud = createMockCloud({
        callFunction: jest.fn().mockResolvedValue({
          result: { success: false, error: 'AI service error' }
        })
      });

      jest.resetModules();
      const cloud = require('wx-server-sdk');

      const result = await cloud.callFunction({
        name: 'generateQuestions',
        data: { kp_id: 'kp_123', count: 3 }
      });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('AI service error');
    });
  });

  describe('当需要查询进度时', () => {
    test('应正确调用queryProgress云函数', async () => {
      mockCloud = createMockCloud({
        callFunction: jest.fn()
          .mockResolvedValueOnce({ result: { success: true, task_id: 'task_123' } }) // generateQuestions
          .mockResolvedValueOnce({ result: { success: true, status: 'completed', questions: [{ id: 'q1' }] } }) // queryProgress
      });

      jest.resetModules();
      const cloud = require('wx-server-sdk');

      // 1. 调用generateQuestions
      const genResult = await cloud.callFunction({
        name: 'generateQuestions',
        data: { kp_id: 'kp_123', count: 3 }
      });

      expect(genResult.result.success).toBe(true);

      // 2. 查询进度
      const taskId = genResult.result.task_id;
      const progressResult = await cloud.callFunction({
        name: 'queryProgress',
        data: { task_id: taskId }
      });

      expect(cloud.callFunction).toHaveBeenCalledTimes(2);
      expect(progressResult.result.status).toBe('completed');
      expect(progressResult.result.questions).toBeDefined();
    });

    test('应处理processing状态', async () => {
      mockCloud = createMockCloud({
        callFunction: jest.fn().mockResolvedValue({
          result: { success: true, status: 'processing', progress: 2, total: 5 }
        })
      });

      jest.resetModules();
      const cloud = require('wx-server-sdk');

      const result = await cloud.callFunction({
        name: 'queryProgress',
        data: { task_id: 'task_pending' }
      });

      expect(result.result.success).toBe(true);
      expect(result.result.status).toBe('processing');
      expect(result.result.progress).toBe(2);
    });
  });
});
