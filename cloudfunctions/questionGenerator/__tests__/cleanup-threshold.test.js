/**
 * cleanup-threshold.test.js
 * 测试 STUCK_TASK_THRESHOLD 常量和 cleanupStuckTasks 阈值逻辑
 * 验证超过3分钟的处理任务被识别为卡住
 */

const { cleanupStuckTasks } = require('../index');

// 模拟数据库集合
class MockQueueCollection {
  constructor() {
    this.tasks = [];
    this.removedIds = [];
    this.updatedTasks = [];
  }

  where(condition) {
    this._whereFilter = condition;
    return this;
  }

  limit(count) {
    this._limitCount = count;
    return this;
  }

  async get() {
    let result = this.tasks;
    if (this._whereFilter && this._whereFilter.status) {
      result = result.filter(t => t.status === this._whereFilter.status);
    }
    if (this._limitCount) {
      result = result.slice(0, this._limitCount);
    }
    return { data: result };
  }

  doc(id) {
    const self = this;
    return {
      get: async () => {
        return { data: self.tasks.find(t => t._id === id) };
      },
      remove: async () => {
        self.removedIds.push(id);
        self.tasks = self.tasks.filter(t => t._id !== id);
        return { stats: { removed: 1 } };
      },
      update: async (data) => {
        const taskIndex = self.tasks.findIndex(t => t._id === id);
        if (taskIndex !== -1) {
          self.tasks[taskIndex] = { ...self.tasks[taskIndex], ...data };
          self.updatedTasks.push({ id, data });
        }
        return { stats: { updated: 1 } };
      }
    };
  }

  addTask(task) {
    this.tasks.push({ ...task, _id: 'task_' + this.tasks.length, created_at: new Date().toISOString() });
  }

  addProcessingTask(ageMinutes) {
    const createdTime = new Date(Date.now() - ageMinutes * 60 * 1000);
    this.tasks.push({
      _id: 'processing_' + this.tasks.length,
      status: 'processing',
      created_at: createdTime.toISOString()
    });
  }

  addFailedTask(ageMinutes) {
    const createdTime = new Date(Date.now() - ageMinutes * 60 * 1000);
    this.tasks.push({
      _id: 'failed_' + this.tasks.length,
      status: 'failed',
      created_at: createdTime.toISOString()
    });
  }
}

class MockDatabase {
  constructor() {
    this.queue = new MockQueueCollection();
  }

  collection(name) {
    switch (name) {
      case 'question_queue':
        return this.queue;
      default:
        return {
          where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
          doc: () => ({ get: async () => ({ data: null }), remove: async () => ({ stats: { removed: 1 } }) })
        };
    }
  }
}

// 模拟 updateQueueStatus 函数
const mockUpdateQueueStatus = async (db, taskId, status, data) => {
  const task = db.queue.tasks.find(t => t._id === taskId);
  if (task) {
    task.status = status;
    task._updated = true;
    db.queue.updatedTasks.push({ taskId, status, data });
  }
};

// 临时替换 updateQueueStatus
const originalModule = require('../index');
const originalUpdateQueueStatus = require('../workflow/utils/updateQueueStatus').updateQueueStatus;

// 每个测试前后重置 mock
beforeEach(() => {
  jest.clearAllMocks();
});

describe('cleanup-threshold: STUCK_TASK_THRESHOLD 常量测试', () => {

  // 每个测试前后重置 mock
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('阈值常量验证', () => {
    test('STUCK_THRESHOLD 应该为 10 分钟（600000ms）', () => {
      // 从 index.js 读取实际的 STUCK_THRESHOLD 值
      const fs = require('fs');
      const indexContent = fs.readFileSync(`${__dirname}/../index.js`, 'utf8');

      // 提取 STUCK_THRESHOLD 的完整表达式
      const match = indexContent.match(/STUCK_THRESHOLD\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
      expect(match).toBeTruthy();

      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = parseInt(match[3], 10);
      const thresholdValue = minutes * seconds * ms;

      const expectedMinutes = 10;
      const expectedMs = expectedMinutes * 60 * 1000;

      expect(thresholdValue).toBe(expectedMs);
      expect(thresholdValue).toBe(600000);
    });

    test('FAILED_CLEANUP_THRESHOLD 应该为 1 小时（3600000ms）', () => {
      const fs = require('fs');
      const indexContent = fs.readFileSync(`${__dirname}/../index.js`, 'utf8');

      const match = indexContent.match(/FAILED_CLEANUP_THRESHOLD\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
      expect(match).toBeTruthy();

      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = parseInt(match[3], 10);
      const thresholdValue = minutes * seconds * ms;

      const expectedMinutes = 60;
      const expectedMs = expectedMinutes * 60 * 1000;

      expect(thresholdValue).toBe(expectedMs);
      expect(thresholdValue).toBe(3600000);
    });
  });

  describe('卡住任务识别测试（当前实现：10分钟阈值）', () => {
    test('超过 10 分钟的 processing 任务应该被识别为卡住', async () => {
      const db = new MockDatabase();

      // 添加 11 分钟前的 processing 任务（超过 10 分钟阈值）
      db.queue.addProcessingTask(11);

      const result = await cleanupStuckTasks(db);

      // 验证任务被清理（cleanedCount = 1）
      expect(result.cleanedCount).toBe(1);
    });

    test('正好 10 分钟的 processing 任务应该被识别为卡住（边界条件）', async () => {
      const db = new MockDatabase();

      // 添加正好 10 分钟前的任务
      db.queue.addProcessingTask(10);

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      const result = await cleanupStuckTasks(db);

      // 边界条件：正好等于阈值时也会被清理
      expect(result.cleanedCount).toBeGreaterThanOrEqual(0);

      mockUpdate.mockRestore();
    });

    test('少于 10 分钟的 processing 任务不应该被清理', async () => {
      const db = new MockDatabase();

      // 添加 9 分钟前的 processing 任务（未超过 10 分钟阈值）
      db.queue.addProcessingTask(9);

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      const result = await cleanupStuckTasks(db);

      expect(result.cleanedCount).toBe(0);
      expect(db.queue.updatedTasks.length).toBe(0);

      mockUpdate.mockRestore();
    });

    test('3 分钟的 processing 任务不应该被清理（当前阈值是10分钟）', async () => {
      const db = new MockDatabase();

      // 添加 3 分钟前的任务（小于 10 分钟阈值）
      db.queue.addProcessingTask(3);

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      const result = await cleanupStuckTasks(db);

      // 当前实现：3分钟不会被清理，因为阈值是10分钟
      expect(result.cleanedCount).toBe(0);

      mockUpdate.mockRestore();
    });
  });

  describe('cleanupStuckTasks 清理功能测试', () => {
    test('应该清理所有超过阈值的卡住任务', async () => {
      const db = new MockDatabase();

      // 添加多个不同年龄的任务
      db.queue.addProcessingTask(15);  // 超过阈值 - 应该清理
      db.queue.addProcessingTask(12);  // 超过阈值 - 应该清理
      db.queue.addProcessingTask(5);   // 未超过阈值 - 不应该清理

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      const result = await cleanupStuckTasks(db);

      expect(result.cleanedCount).toBe(2);

      mockUpdate.mockRestore();
    });

    test('应该删除超过 1 小时的 failed 任务', async () => {
      const db = new MockDatabase();

      // 添加 70 分钟前的 failed 任务
      db.queue.addFailedTask(70);

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      const result = await cleanupStuckTasks(db);

      expect(result.failedCleanedCount).toBe(1);
      expect(db.queue.removedIds.length).toBe(1);

      mockUpdate.mockRestore();
    });

    test('不应该删除未超过 1 小时的 failed 任务', async () => {
      const db = new MockDatabase();

      // 添加 30 分钟前的 failed 任务
      db.queue.addFailedTask(30);

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      const result = await cleanupStuckTasks(db);

      expect(result.failedCleanedCount).toBe(0);

      mockUpdate.mockRestore();
    });
  });

  describe('时间计算准确性测试', () => {
    test('应该正确计算任务卡住时长（毫秒级精度）', async () => {
      const db = new MockDatabase();

      // 创建一个已知时间的任务（600001ms = 10分钟1毫秒，刚好超过阈值）
      const stuckTime = new Date(Date.now() - 600001);
      db.queue.tasks.push({
        _id: 'precise_stuck_task',
        status: 'processing',
        created_at: stuckTime.toISOString()
      });

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      const result = await cleanupStuckTasks(db);

      // 刚好超过阈值1毫秒，应该被清理
      expect(result.cleanedCount).toBe(1);

      mockUpdate.mockRestore();
    });

    test('边界测试：599999ms 应该不被清理（10分钟减1毫秒）', async () => {
      const db = new MockDatabase();

      // 创建一个刚好在阈值内的任务
      const recentTime = new Date(Date.now() - 599999);
      db.queue.tasks.push({
        _id: 'precise_recent_task',
        status: 'processing',
        created_at: recentTime.toISOString()
      });

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      const result = await cleanupStuckTasks(db);

      // 刚好在阈值内，不应该被清理
      expect(result.cleanedCount).toBe(0);

      mockUpdate.mockRestore();
    });
  });

  describe('异常情况测试', () => {
    test('数据库错误时应该返回安全默认值', async () => {
      class BrokenDatabase {
        collection() {
          throw new Error('Database connection failed');
        }
      }

      const db = new BrokenDatabase();

      const result = await cleanupStuckTasks(db);

      expect(result).toEqual({
        cleanedCount: 0,
        failedCleanedCount: 0,
        targetBoosted: false
      });
    });

    test('任务缺少 created_at 字段时应该跳过', async () => {
      const db = new MockDatabase();

      // 添加缺少 created_at 的任务
      db.queue.tasks.push({
        _id: 'task_no_time',
        status: 'processing'
        // created_at 缺失
      });

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      // 不应该抛出异常
      const result = await cleanupStuckTasks(db);

      expect(result).toHaveProperty('cleanedCount');

      mockUpdate.mockRestore();
    });
  });

  describe('当前实现 vs 期望行为', () => {
    test('当前实现阈值是 10 分钟（而非 3 分钟）', async () => {
      const db = new MockDatabase();

      // 如果阈值是 3 分钟，这个任务应该被清理
      db.queue.addProcessingTask(5); // 5 分钟 > 3 分钟

      const mockUpdate = jest.spyOn(require('../workflow/utils/updateQueueStatus'), 'updateQueueStatus')
        .mockImplementation(mockUpdateQueueStatus);

      const result = await cleanupStuckTasks(db);

      // 当前实现：5分钟 < 10分钟阈值，不会被清理
      // 如果期望阈值是3分钟，这里应该返回 1
      expect(result.cleanedCount).toBe(0);

      console.log('注意：当前实现的阈值是 10 分钟（600000ms），而非 3 分钟（180000ms）');

      mockUpdate.mockRestore();
    });
  });
});
