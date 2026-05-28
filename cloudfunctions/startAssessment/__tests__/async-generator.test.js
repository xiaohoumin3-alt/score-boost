/**
 * async-generator 单元测试 (TDD Red-Green-Refactor)
 */

let mockCloud;
jest.mock('wx-server-sdk', () => mockCloud);

function createMockCloud(overrides = {}) {
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    callFunction: jest.fn().mockResolvedValue({
      result: { success: true, task_id: 'task_123' }
    }),
    ...overrides
  };
}

describe('async-generator', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockCloud = createMockCloud();
    jest.resetModules();
  });

  describe('startAsyncGeneration', () => {
    test('应调用generateQuestions并返回task_id', async () => {
      const { startAsyncGeneration } = require('../async-generator');

      const result = await startAsyncGeneration({
        kp_id: 'kp_123',
        kp_name: '勾股定理',
        difficulty: 'medium',
        count: 5
      });

      expect(result.success).toBe(true);
      expect(result.task_id).toBe('task_123');
    });

    test('应使用默认值当参数缺失', async () => {
      const { startAsyncGeneration } = require('../async-generator');

      await startAsyncGeneration({ kp_id: 'kp_123' });

      const callArgs = mockCloud.callFunction.mock.calls[0][0];
      expect(callArgs.data.difficulty).toBe('medium');
      expect(callArgs.data.count).toBe(3);
    });

    test('应处理generateQuestions失败', async () => {
      mockCloud = createMockCloud({
        callFunction: jest.fn().mockResolvedValue({
          result: { success: false, error: 'AI service error' }
        })
      });
      jest.resetModules();

      const { startAsyncGeneration } = require('../async-generator');

      const result = await startAsyncGeneration({ kp_id: 'kp_123' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI service error');
    });

    test('应处理云函数调用异常', async () => {
      mockCloud = createMockCloud({
        callFunction: jest.fn().mockRejectedValue(new Error('Network error'))
      });
      jest.resetModules();

      const { startAsyncGeneration } = require('../async-generator');

      const result = await startAsyncGeneration({ kp_id: 'kp_123' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('queryGenerationProgress', () => {
    test('应返回completed状态和questions', async () => {
      mockCloud = createMockCloud({
        callFunction: jest.fn().mockResolvedValue({
          result: {
            success: true,
            status: 'completed',
            questions: [{ id: 'q1' }, { id: 'q2' }]
          }
        })
      });
      jest.resetModules();

      const { queryGenerationProgress } = require('../async-generator');

      const result = await queryGenerationProgress('task_123');

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.questions).toHaveLength(2);
    });

    test('应返回processing状态和进度', async () => {
      mockCloud = createMockCloud({
        callFunction: jest.fn().mockResolvedValue({
          result: {
            success: true,
            status: 'processing',
            progress: 2,
            total: 5
          }
        })
      });
      jest.resetModules();

      const { queryGenerationProgress } = require('../async-generator');

      const result = await queryGenerationProgress('task_123');

      expect(result.status).toBe('processing');
      expect(result.progress).toBe(2);
    });

    test('应返回failed状态和错误信息', async () => {
      mockCloud = createMockCloud({
        callFunction: jest.fn().mockResolvedValue({
          result: {
            success: true,
            status: 'failed',
            error: 'Generation timeout'
          }
        })
      });
      jest.resetModules();

      const { queryGenerationProgress } = require('../async-generator');

      const result = await queryGenerationProgress('task_123');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Generation timeout');
    });
  });
});
