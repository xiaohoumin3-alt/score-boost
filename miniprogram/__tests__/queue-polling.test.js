/**
 * Queue Polling API Tests
 * 测试轮询API调用逻辑
 */

describe('QueuePollingApi', () => {
  let QueueApi;
  let mockCloud;

  beforeEach(() => {
    jest.resetModules();
    mockCloud = {
      callFunction: jest.fn()
    };
    QueueApi = require('../../miniprogram/utils/queue-api');
  });

  describe('checkQueueStatus', () => {
    test('应调用checkQueueStatus云函数', async () => {
      mockCloud.callFunction.mockResolvedValue({
        result: { success: true, data: { status: 'completed', assessment_id: 'ass_123' } }
      });

      const api = new QueueApi(mockCloud);
      const result = await api.checkQueueStatus('queue_123');

      expect(mockCloud.callFunction).toHaveBeenCalledWith({
        name: 'checkQueueStatus',
        data: { queue_id: 'queue_123' }
      });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('completed');
      expect(result.data.assessment_id).toBe('ass_123');
    });

    test('应处理云函数调用失败', async () => {
      mockCloud.callFunction.mockRejectedValue(new Error('Network error'));

      const api = new QueueApi(mockCloud);
      const result = await api.checkQueueStatus('queue_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('pollQueueStatus', () => {
    test('应轮询直到completed状态', async () => {
      mockCloud.callFunction
        .mockResolvedValueOnce({ result: { success: true, data: { status: 'pending' } } })
        .mockResolvedValueOnce({ result: { success: true, data: { status: 'processing' } } })
        .mockResolvedValueOnce({ result: { success: true, data: { status: 'completed', assessment_id: 'ass_123' } } });

      const api = new QueueApi(mockCloud);
      const onPoll = jest.fn();

      const result = await api.pollQueueStatus('queue_123', { onPoll, maxPolls: 10, interval: 10 });

      expect(result.status).toBe('completed');
      expect(result.assessment_id).toBe('ass_123');
      expect(onPoll).toHaveBeenCalledTimes(3);
    });

    test('遇到failed状态应返回失败', async () => {
      mockCloud.callFunction
        .mockResolvedValueOnce({ result: { success: true, data: { status: 'pending' } } })
        .mockResolvedValueOnce({ result: { success: true, data: { status: 'failed', error: '生成失败' } } });

      const api = new QueueApi(mockCloud);
      const result = await api.pollQueueStatus('queue_123', { maxPolls: 10, interval: 10 });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('生成失败');
    });

    test('超时应返回timeout状态', async () => {
      mockCloud.callFunction.mockResolvedValue({
        result: { success: true, data: { status: 'pending' } }
      });

      const api = new QueueApi(mockCloud);
      const result = await api.pollQueueStatus('queue_123', { maxPolls: 2, interval: 10 });

      expect(result.status).toBe('timeout');
      expect(mockCloud.callFunction).toHaveBeenCalledTimes(2);
    });

    test('第一轮就完成应立即返回', async () => {
      mockCloud.callFunction.mockResolvedValue({
        result: { success: true, data: { status: 'completed', assessment_id: 'ass_456' } }
      });

      const api = new QueueApi(mockCloud);
      const onPoll = jest.fn();

      const result = await api.pollQueueStatus('queue_123', { onPoll, maxPolls: 10, interval: 10 });

      expect(result.status).toBe('completed');
      expect(result.assessment_id).toBe('ass_456');
      expect(onPoll).toHaveBeenCalledTimes(1);
    });
  });
});