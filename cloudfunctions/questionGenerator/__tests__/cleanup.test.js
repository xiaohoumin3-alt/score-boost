/**
 * cleanup.test.js
 * 测试 cleanupStuckTasks 函数的返回值格式和使用
 * 问题：cleanupStuckTasks 返回对象 {cleanedCount, failedCleanedCount, targetBoosted}
 * 但调用方把它当数字使用，导致比较条件错误
 */

const { cleanupStuckTasks } = require('../index');

// 模拟数据库集合
class MockQueueCollection {
  constructor() {
    this.tasks = [];
    this.removedIds = [];
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
      }
    };
  }

  addTask(task) {
    this.tasks.push({ ...task, _id: 'task_' + this.tasks.length, created_at: new Date().toISOString() });
  }

  // 添加旧任务（超过阈值）
  addOldStuckTask() {
    const oldTime = new Date(Date.now() - 15 * 60 * 1000); // 15分钟前
    this.tasks.push({
      _id: 'stuck_' + this.tasks.length,
      status: 'processing',
      created_at: oldTime.toISOString()
    });
  }

  addOldFailedTask() {
    const oldTime = new Date(Date.now() - 70 * 60 * 1000); // 70分钟前
    this.tasks.push({
      _id: 'failed_' + this.tasks.length,
      status: 'failed',
      created_at: oldTime.toISOString()
    });
  }

  addRecentTask() {
    const recentTime = new Date(Date.now() - 2 * 60 * 1000); // 2分钟前
    this.tasks.push({
      _id: 'recent_' + this.tasks.length,
      status: 'processing',
      created_at: recentTime.toISOString()
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

describe('cleanupStuckTasks - 返回值格式测试', () => {

  describe('返回值结构', () => {
    test('应该返回对象包含 cleanedCount, failedCleanedCount, targetBoosted 字段', async () => {
      const db = new MockDatabase();

      const result = await cleanupStuckTasks(db);

      // 验证返回值是对象
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();

      // 验证必需字段存在
      expect(result).toHaveProperty('cleanedCount');
      expect(result).toHaveProperty('failedCleanedCount');
      expect(result).toHaveProperty('targetBoosted');

      // 验证字段类型
      expect(typeof result.cleanedCount).toBe('number');
      expect(typeof result.failedCleanedCount).toBe('number');
      expect(typeof result.targetBoosted).toBe('boolean');
    });

    test('正常情况应该返回默认值 {cleanedCount: 0, failedCleanedCount: 0, targetBoosted: false}', async () => {
      const db = new MockDatabase();

      const result = await cleanupStuckTasks(db);

      expect(result).toEqual({
        cleanedCount: 0,
        failedCleanedCount: 0,
        targetBoosted: false
      });
    });
  });

  describe('cleanedCount 计数测试', () => {
    test('应该正确计数清理的 stuck 任务', async () => {
      const db = new MockDatabase();

      // 添加2个超过阈值的 stuck 任务
      db.queue.addOldStuckTask();
      db.queue.addOldStuckTask();

      const result = await cleanupStuckTasks(db);

      expect(result.cleanedCount).toBe(2);
      expect(result.failedCleanedCount).toBe(0);
      expect(result.targetBoosted).toBe(false);
    });

    test('不应该清理未超过阈值的 processing 任务', async () => {
      const db = new MockDatabase();

      // 添加1个超过阈值的任务
      db.queue.addOldStuckTask();
      // 添加1个未超过阈值的任务
      db.queue.addRecentTask();

      const result = await cleanupStuckTasks(db);

      expect(result.cleanedCount).toBe(1);
      expect(result.failedCleanedCount).toBe(0);
    });
  });

  describe('failedCleanedCount 计数测试', () => {
    test('应该正确计数删除的旧 failed 任务', async () => {
      const db = new MockDatabase();

      // 添加2个超过1小时的 failed 任务
      db.queue.addOldFailedTask();
      db.queue.addOldFailedTask();

      const result = await cleanupStuckTasks(db);

      expect(result.failedCleanedCount).toBe(2);
      expect(result.cleanedCount).toBe(0);
      expect(result.targetBoosted).toBe(false);
    });
  });

  describe('targetBoosted 标志测试', () => {
    test('目标任务存在且为 pending 时应该返回 targetBoosted: true', async () => {
      const db = new MockDatabase();

      const TARGET_QUEUE_ID = '669eebf36a17092800eea1aa0a8c721b';
      db.queue.tasks.push({
        _id: TARGET_QUEUE_ID,
        status: 'pending',
        created_at: new Date().toISOString()
      });

      const result = await cleanupStuckTasks(db);

      expect(result.targetBoosted).toBe(true);
    });

    test('目标任务不存在时应该返回 targetBoosted: false', async () => {
      const db = new MockDatabase();

      const result = await cleanupStuckTasks(db);

      expect(result.targetBoosted).toBe(false);
    });
  });

  describe('异常情况测试', () => {
    test('数据库操作失败时应该返回默认值而不是抛出异常', async () => {
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
  });

  describe('调用方使用模式测试', () => {
    test('调用方应该能读取 cleanedCount 字段', async () => {
      const db = new MockDatabase();
      db.queue.addOldStuckTask();

      const result = await cleanupStuckTasks(db);

      // 模拟调用方如何使用返回值
      const cleanedCount = result.cleanedCount;

      expect(cleanedCount).toBe(1);
      expect(typeof cleanedCount).toBe('number');
    });

    test('条件判断应该使用 result.cleanedCount 而不是直接比较对象', async () => {
      const db = new MockDatabase();
      db.queue.addOldStuckTask();

      const result = await cleanupStuckTasks(db);

      // 错误用法（当前代码中的问题）：
      // const cleanedCount = await cleanupStuckTasks(db);
      // if (cleanedCount > 0) { ... }  // 对象与数字比较总是 false!

      // 正确用法：
      const shouldLog = result.cleanedCount > 0;

      expect(shouldLog).toBe(true);
    });

    test('演示问题：对象与数字比较总是返回 false', async () => {
      const db = new MockDatabase();
      db.queue.addOldStuckTask();

      const result = await cleanupStuckTasks(db);

      // 这就是当前代码中的 bug！
      const wrongComparison = result > 0; // 对象与数字比较

      expect(wrongComparison).toBe(false); // 总是 false，即使 cleanedCount = 1
      expect(result.cleanedCount).toBe(1); // 但实际清理了1个任务
    });
  });

  describe('综合场景测试', () => {
    test('应该同时处理 stuck 任务和 failed 任务', async () => {
      const db = new MockDatabase();

      // 添加混合任务
      db.queue.addOldStuckTask();    // cleanedCount++
      db.queue.addOldStuckTask();    // cleanedCount++
      db.queue.addOldFailedTask();   // failedCleanedCount++
      db.queue.addRecentTask();      // 不会清理

      const result = await cleanupStuckTasks(db);

      expect(result.cleanedCount).toBe(2);
      expect(result.failedCleanedCount).toBe(1);
      expect(result.targetBoosted).toBe(false);
    });
  });
});
