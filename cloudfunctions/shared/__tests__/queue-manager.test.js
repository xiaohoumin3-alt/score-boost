/**
 * queue-manager 测试 (TDD Red-Green-Refactor)
 */

jest.mock('wx-server-sdk');

// Mock collection
const mockCollection = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn(),
  doc: jest.fn().mockReturnThis(),
  update: jest.fn(),
  add: jest.fn()
};

const mockDb = {
  collection: jest.fn().mockReturnValue(mockCollection)
};

describe('queue-manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const cloud = require('wx-server-sdk');
    cloud.database.mockReturnValue(mockDb);
  });

  describe('fetchPendingTasks', () => {
    test('应该从question_queue获取待处理任务', async () => {
      const { fetchPendingTasks } = require('../queue-manager');

      mockCollection.get.mockResolvedValue({
        data: [
          { _id: 'task1', status: 'pending', priority: 5 },
          { _id: 'task2', status: 'pending', priority: 3 }
        ]
      });

      const tasks = await fetchPendingTasks(mockDb, 3, 'question_queue');

      expect(mockDb.collection).toHaveBeenCalledWith('question_queue');
      expect(mockCollection.where).toHaveBeenCalledWith({ status: 'pending' });
      expect(tasks).toHaveLength(2);
      expect(tasks[0]._id).toBe('task1');
    });

    test('应该从pregen_queue获取预生成任务', async () => {
      const { fetchPendingTasks } = require('../queue-manager');

      mockCollection.get.mockResolvedValue({
        data: [{ _id: 'pregen1', status: 'pending' }]
      });

      const tasks = await fetchPendingTasks(mockDb, 5, 'pregen_queue');

      expect(mockDb.collection).toHaveBeenCalledWith('pregen_queue');
      expect(tasks).toHaveLength(1);
    });

    test('查询失败时应返回空数组', async () => {
      const { fetchPendingTasks } = require('../queue-manager');

      mockCollection.get.mockRejectedValue(new Error('DB error'));

      const tasks = await fetchPendingTasks(mockDb);

      expect(tasks).toEqual([]);
    });
  });

  describe('updateTaskStatus', () => {
    test('应该更新question_queue任务状态', async () => {
      const { updateTaskStatus } = require('../queue-manager');

      mockCollection.update.mockResolvedValue({ updated: 1 });

      const result = await updateTaskStatus(mockDb, 'task_123', 'completed', { error: null });

      expect(mockDb.collection).toHaveBeenCalledWith('question_queue');
      expect(mockCollection.doc).toHaveBeenCalledWith('task_123');
      expect(mockCollection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          error: null
        })
      );
      expect(result).toBe(true);
    });

    test('更新失败时应返回false', async () => {
      const { updateTaskStatus } = require('../queue-manager');

      mockCollection.update.mockRejectedValue(new Error('Update error'));

      const result = await updateTaskStatus(mockDb, 'task_123', 'failed');

      expect(result).toBe(false);
    });
  });

  describe('getTaskById', () => {
    test('应该返回任务详情', async () => {
      const { getTaskById } = require('../queue-manager');

      mockCollection.get.mockResolvedValue({
        data: { _id: 'task_123', status: 'completed' }
      });

      const task = await getTaskById(mockDb, 'task_123');

      expect(task).toEqual({ _id: 'task_123', status: 'completed' });
    });

    test('任务不存在时应返回null', async () => {
      const { getTaskById } = require('../queue-manager');

      mockCollection.get.mockResolvedValue({ data: null });

      const task = await getTaskById(mockDb, 'nonexistent');

      expect(task).toBeNull();
    });
  });

  describe('createGenerationTask', () => {
    test('应该创建生成任务记录', async () => {
      const { createGenerationTask } = require('../queue-manager');

      mockCollection.add.mockResolvedValue({ _id: 'gen_task_456' });

      const taskId = await createGenerationTask(mockDb, {
        kp_id: 'kp_001',
        difficulty: 'medium',
        source: 'user'
      });

      expect(mockDb.collection).toHaveBeenCalledWith('generation_tasks');
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          kp_id: 'kp_001',
          difficulty: 'medium',
          status: 'pending'
        })
      );
      expect(taskId).toBe('gen_task_456');
    });

    test('创建失败时应抛出错误', async () => {
      const { createGenerationTask } = require('../queue-manager');

      mockCollection.add.mockRejectedValue(new Error('Create error'));

      await expect(createGenerationTask(mockDb, { kp_id: 'kp_001' }))
        .rejects.toThrow('Create error');
    });
  });

  describe('updateGenerationTaskStatus', () => {
    test('完成时应设置completed_at时间戳', async () => {
      const { updateGenerationTaskStatus } = require('../queue-manager');

      mockCollection.update.mockResolvedValue({ updated: 1 });

      const result = await updateGenerationTaskStatus(mockDb, 'gen_123', 'completed', {
        question_id: 'q_456'
      });

      expect(mockCollection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          result: { question_id: 'q_456' },
          completed_at: expect.any(String)
        })
      );
      expect(result).toBe(true);
    });

    test('失败时应清除completed_at', async () => {
      const { updateGenerationTaskStatus } = require('../queue-manager');

      mockCollection.update.mockResolvedValue({ updated: 1 });

      const result = await updateGenerationTaskStatus(mockDb, 'gen_123', 'failed', {
        error: 'Generation timeout'
      });

      expect(mockCollection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          completed_at: null
        })
      );
      expect(result).toBe(true);
    });
  });
});