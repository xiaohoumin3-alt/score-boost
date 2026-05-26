/**
 * cloudApi.js 队列接口测试 (TDD Red-Green-Refactor)
 * 功能：队列状态查询和轮询API
 */

// Mock wx对象
const mockCallFunction = jest.fn();
global.wx = {
  cloud: {
    init: jest.fn(),
    callFunction: mockCallFunction
  }
};

const cloudApi = require('../cloudApi');

describe('cloudApi - Queue API', () => {

  describe('checkQueueStatus', () => {
    beforeEach(() => {
      mockCallFunction.mockClear();
    });

    test('should call checkQueueStatus cloud function with queue_id', async () => {
      mockCallFunction.mockImplementation(({ success }) => {
        success({
          errMsg: 'cloud.callFunction:ok',
          result: {
            success: true,
            data: {
              status: 'completed',
              assessment_id: 'assessment_456',
              queue_id: 'queue_123'
            }
          }
        });
      });

      const result = await cloudApi.checkQueueStatus('queue_123');

      expect(mockCallFunction).toHaveBeenCalledWith({
        name: 'checkQueueStatus',
        data: { queue_id: 'queue_123' },
        success: expect.any(Function),
        fail: expect.any(Function)
      });
      expect(result.status).toBe('completed');
      expect(result.assessment_id).toBe('assessment_456');
    });

    test('should return pending status when task is processing', async () => {
      mockCallFunction.mockImplementation(({ success }) => {
        success({
          errMsg: 'cloud.callFunction:ok',
          result: {
            success: true,
            data: {
              status: 'pending',
              queue_id: 'queue_123',
              message: '题目正在排队生成中...'
            }
          }
        });
      });

      const result = await cloudApi.checkQueueStatus('queue_123');

      expect(result.status).toBe('pending');
      expect(result.assessment_id).toBeUndefined();
    });

    test('should return error when queue not found', async () => {
      mockCallFunction.mockImplementation(({ success }) => {
        success({
          errMsg: 'cloud.callFunction:ok',
          result: {
            success: false,
            error: 'Queue task not found or has expired'
          }
        });
      });

      await expect(cloudApi.checkQueueStatus('queue_nonexistent'))
        .rejects.toThrow('Queue task not found or has expired');
    });

    test('should handle network errors', async () => {
      mockCallFunction.mockImplementation(({ fail }) => {
        fail({ errMsg: '网络错误' });
      });

      await expect(cloudApi.checkQueueStatus('queue_123'))
        .rejects.toThrow('网络错误');
    });
  });

  describe('pollQueueStatus', () => {
    beforeEach(() => {
      mockCallFunction.mockClear();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should poll until status is completed', async () => {
      const statuses = ['pending', 'processing', 'completed'];
      let callCount = 0;

      mockCallFunction.mockImplementation(({ success }) => {
        const status = statuses[callCount];
        callCount++;

        success({
          errMsg: 'cloud.callFunction:ok',
          result: {
            success: true,
            data: {
              status: status,
              queue_id: 'queue_123',
              ...(status === 'completed' ? { assessment_id: 'assessment_456' } : {})
            }
          }
        });
      });

      const pollPromise = cloudApi.pollQueueStatus('queue_123', {
        maxAttempts: 3,
        intervalMs: 1000
      });

      // Fast-forward timers
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(1000);
        await Promise.resolve(); // Allow promises to resolve
      }

      const result = await pollPromise;

      expect(result.status).toBe('completed');
      expect(result.assessment_id).toBe('assessment_456');
      expect(callCount).toBe(3);
    });

    test('should stop after max attempts when still pending', async () => {
      mockCallFunction.mockImplementation(({ success }) => {
        success({
          errMsg: 'cloud.callFunction:ok',
          result: {
            success: true,
            data: {
              status: 'pending',
              queue_id: 'queue_123'
            }
          }
        });
      });

      const pollPromise = cloudApi.pollQueueStatus('queue_123', {
        maxAttempts: 2,
        intervalMs: 500
      });

      for (let i = 0; i < 2; i++) {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      }

      const result = await pollPromise;

      expect(result.status).toBe('pending');
      expect(result.exceededMaxAttempts).toBe(true);
    });

    test('should handle failed status', async () => {
      mockCallFunction.mockImplementation(({ success }) => {
        success({
          errMsg: 'cloud.callFunction:ok',
          result: {
            success: true,
            data: {
              status: 'failed',
              queue_id: 'queue_123',
              error: 'AI generation failed',
              retry_count: 2
            }
          }
        });
      });

      const pollPromise = cloudApi.pollQueueStatus('queue_123', {
        maxAttempts: 1,
        intervalMs: 100
      });

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      const result = await pollPromise;

      expect(result.status).toBe('failed');
      expect(result.error).toBe('AI generation failed');
      expect(result.retry_count).toBe(2);
    });
  });

  describe('startAssessment with queued response', () => {
    beforeEach(() => {
      mockCallFunction.mockClear();
    });

    test('should handle queued response from startAssessment', async () => {
      mockCallFunction.mockImplementation(({ success }) => {
        success({
          errMsg: 'cloud.callFunction:ok',
          result: {
            success: true,
            data: {
              status: 'queued',
              queue_id: 'queue_123',
              message: '题目正在生成中，请稍候...'
            }
          }
        });
      });

      const result = await cloudApi.startAssessment('八年级', '生物', 'quick');

      expect(result.status).toBe('queued');
      expect(result.queue_id).toBe('queue_123');
    });

    test('should handle ready response with assessment_id', async () => {
      mockCallFunction.mockImplementation(({ success }) => {
        success({
          errMsg: 'cloud.callFunction:ok',
          result: {
            success: true,
            data: {
              status: 'ready',
              assessment_id: 'assessment_456'
            }
          }
        });
      });

      const result = await cloudApi.startAssessment('八年级', '生物', 'quick');

      expect(result.status).toBe('ready');
      expect(result.assessment_id).toBe('assessment_456');
    });
  });
});
