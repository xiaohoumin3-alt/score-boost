/**
 * kp-request-logger 测试 (TDD Red-Green-Refactor)
 */

describe('kp-request-logger', () => {
  let mockDb, mockCollection;

  beforeEach(() => {
    // Mock collection
    mockCollection = {
      add: jest.fn(),
      where: jest.fn()
    };

    // Mock command对象（微信云数据库API）
    const mockCommand = {
      gte: jest.fn().mockReturnValue({})
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
      command: mockCommand
    };
  });

  describe('logKpRequest', () => {
    test('应该记录知识点请求', async () => {
      const { logKpRequest } = require('../kp-request-logger');

      mockCollection.add.mockResolvedValue({ _id: 'log_123' });

      await logKpRequest(mockDb, {
        kp_id: 'kp_123',
        kp_name: '测试知识点',
        subject: 'biology',
        student_id: 'student_123',
        source: 'assessment'
      });

      expect(mockDb.collection).toHaveBeenCalledWith('kp_request_log');
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          kp_id: 'kp_123',
          kp_name: '测试知识点',
          subject: 'biology',
          student_id: 'student_123',
          source: 'assessment',
          requested_at: expect.any(Date)
        })
      );
    });

    test('记录失败不应抛出错误', async () => {
      const { logKpRequest } = require('../kp-request-logger');

      mockCollection.add.mockRejectedValue(new Error('Database error'));

      // 应该不抛出错误
      await expect(
        logKpRequest(mockDb, { kp_id: 'kp_123', kp_name: 'Test' })
      ).resolves.toBeUndefined();
    });
  });

  describe('getKpRequestStats', () => {
    test('应该返回知识点请求统计', async () => {
      const { getKpRequestStats } = require('../kp-request-logger');

      // Mock where().count()链式调用
      mockCollection.where.mockReturnValue({
        count: jest.fn().mockResolvedValue({ total: 42 })
      });

      const result = await getKpRequestStats(mockDb, 'kp_123', 7);

      expect(result).toEqual({
        kp_id: 'kp_123',
        count: 42,
        days: 7
      });
    });

    test('查询失败时应返回0计数', async () => {
      const { getKpRequestStats } = require('../kp-request-logger');

      mockCollection.where.mockImplementation(() => {
        throw new Error('Query error');
      });

      const result = await getKpRequestStats(mockDb, 'kp_123', 7);

      expect(result).toEqual({
        kp_id: 'kp_123',
        count: 0,
        days: 7
      });
    });
  });
});
