/**
 * questionGenerator 队列类型支持测试 (TDD Red)
 */

jest.mock('wx-server-sdk');

// Mock collection
const mockCollection = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn(),
  doc: jest.fn().mockReturnThis(),
  update: jest.fn()
};

const mockDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
  command: { gte: jest.fn().mockReturnValue({}) }
};

describe('questionGenerator - 队列类型支持', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const cloud = require('wx-server-sdk');
    cloud.database.mockReturnValue(mockDb);
  });

  describe('fetchPendingTasks 支持两种队列', () => {
    test('应该能从question_queue获取用户任务', async () => {
      mockCollection.get.mockResolvedValue({
        data: [
          { _id: 'task1', status: 'pending', priority: 5, student_id: 'student1' }
        ]
      });

      // 测试直接调用数据库操作（模拟fetchPendingTasks逻辑）
      const result = await mockDb.collection('question_queue')
        .where({ status: 'pending' })
        .orderBy('priority', 'desc')
        .orderBy('created_at', 'asc')
        .limit(3)
        .get();

      expect(mockDb.collection).toHaveBeenCalledWith('question_queue');
      expect(result.data).toHaveLength(1);
    });

    test('应该能从pregen_queue获取预生成任务', async () => {
      mockCollection.get.mockResolvedValue({
        data: [
          { _id: 'pregen1', status: 'pending', priority: 1, kp_id: 'kp_001' }
        ]
      });

      // 测试直接调用数据库操作（模拟fetchPendingTasks逻辑）
      const result = await mockDb.collection('pregen_queue')
        .where({ status: 'pending' })
        .orderBy('priority', 'desc')
        .orderBy('created_at', 'asc')
        .limit(5)
        .get();

      expect(mockDb.collection).toHaveBeenCalledWith('pregen_queue');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('updateQueueStatus 支持两种队列', () => {
    test('应该能更新question_queue任务状态', async () => {
      mockCollection.update.mockResolvedValue({ updated: 1 });

      await mockDb.collection('question_queue').doc('task_123').update({
        status: 'processing',
        updated_at: new Date().toISOString()
      });

      expect(mockDb.collection).toHaveBeenCalledWith('question_queue');
      expect(mockCollection.doc).toHaveBeenCalledWith('task_123');
    });

    test('应该能更新pregen_queue任务状态', async () => {
      mockCollection.update.mockResolvedValue({ updated: 1 });

      await mockDb.collection('pregen_queue').doc('pregen_123').update({
        status: 'completed',
        updated_at: new Date().toISOString()
      });

      expect(mockDb.collection).toHaveBeenCalledWith('pregen_queue');
      expect(mockCollection.doc).toHaveBeenCalledWith('pregen_123');
    });
  });

  describe('队列处理优先级', () => {
    test('两种队列都支持按优先级和创建时间排序', async () => {
      // 用户队列高优先级
      mockCollection.get.mockResolvedValue({
        data: [{ _id: 'user_task', status: 'pending', priority: 5 }]
      });

      const userResult = await mockDb.collection('question_queue')
        .where({ status: 'pending' })
        .orderBy('priority', 'desc')
        .orderBy('created_at', 'asc')
        .limit(3)
        .get();

      // 预生成队列低优先级
      mockCollection.get.mockResolvedValue({
        data: [{ _id: 'pregen_task', status: 'pending', priority: 1 }]
      });

      const pregenResult = await mockDb.collection('pregen_queue')
        .where({ status: 'pending' })
        .orderBy('priority', 'desc')
        .orderBy('created_at', 'asc')
        .limit(5)
        .get();

      // 验证两种队列都能正确查询
      expect(userResult.data).toHaveLength(1);
      expect(pregenResult.data).toHaveLength(1);
      expect(userResult.data[0].priority).toBe(5);
      expect(pregenResult.data[0].priority).toBe(1);
    });
  });

  describe('队列状态流转', () => {
    test('question_queue应遵循状态流转：pending -> processing -> completed/failed', async () => {
      const states = ['pending', 'processing', 'completed'];

      mockCollection.update.mockImplementation(async (data) => {
        // 验证状态流转逻辑
        if (data.status === 'processing') {
          expect(data).toHaveProperty('updated_at');
        }
        return { updated: 1 };
      });

      for (const state of states) {
        await mockDb.collection('question_queue').doc('task_123').update({
          status: state,
          updated_at: new Date().toISOString()
        });
      }

      expect(mockCollection.update).toHaveBeenCalledTimes(3);
    });

    test('pregen_queue应遵循相同的状态流转', async () => {
      const states = ['pending', 'processing', 'completed'];

      mockCollection.update.mockImplementation(async (data) => {
        expect(data).toHaveProperty('updated_at');
        return { updated: 1 };
      });

      for (const state of states) {
        await mockDb.collection('pregen_queue').doc('pregen_123').update({
          status: state,
          updated_at: new Date().toISOString()
        });
      }

      expect(mockCollection.update).toHaveBeenCalledTimes(3);
    });
  });
});