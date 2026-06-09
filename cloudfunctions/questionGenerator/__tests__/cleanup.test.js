/**
 * cleanup.test.js
 * 验证 cleanupStuckTasks 清理功能
 * 测试清理卡住任务和旧失败任务
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
      update: async (updateData) => {
        const taskIndex = self.tasks.findIndex(t => t._id === id);
        if (taskIndex !== -1) {
          const fields = updateData.data || updateData;
          Object.assign(self.tasks[taskIndex], fields);
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
    this.command = {
      in: (arr) => ({ $in: arr }),
      gte: (val) => ({ $gte: val }),
      gt: (val) => ({ $gt: val }),
      lt: (val) => ({ $lt: val }),
      lte: (val) => ({ $lte: val }),
      and: (...args) => ({ $and: args }),
      or: (...args) => ({ $or: args }),
    };
    this.queue = new MockQueueCollection();
  }

  collection(name) {
    switch (name) {
      case 'question_queue':
        return this.queue;
      default:
        return {
          where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
          doc: () => ({ get: async () => ({ data: null }), remove: async () => ({ stats: { removed: 1 } }), update: async () => ({ stats: { updated: 1 } }) })
        };
    }
  }
}

const mockUpdateFn = async (db, taskId, status, extraFields) => {
  const task = db.queue.tasks.find(t => t._id === taskId);
  if (task) {
    Object.assign(task, { status, ...extraFields });
    db.queue.updatedTasks.push({ taskId, status, extraFields });
  }
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cleanupStuckTasks', () => {

  test('应该返回对象包含 cleanedCount', async () => {
    const db = new MockDatabase();
    const result = await cleanupStuckTasks(db);
    expect(result).toHaveProperty('cleanedCount');
  });

  test('正常情况应该返回默认值 {cleanedCount: 0}', async () => {
    const db = new MockDatabase();
    const result = await cleanupStuckTasks(db);
    expect(result).toEqual({
      cleanedCount: 0
    });
  });

  test('应该正确计数清理的 stuck 任务', async () => {
    const db = new MockDatabase();
    db.queue.addProcessingTask(4);   // 4分钟 > 3分钟阈值
    db.queue.addProcessingTask(5);   // 5分钟 > 3分钟阈值
    const result = await cleanupStuckTasks(db);
    expect(result.cleanedCount).toBe(2);
  });

  test('不应该清理未超过阈值的 processing 任务', async () => {
    const db = new MockDatabase();
    db.queue.addProcessingTask(2);   // 2分钟 < 3分钟阈值
    const result = await cleanupStuckTasks(db);
    expect(result.cleanedCount).toBe(0);
  });



  test('数据库操作失败时应该返回默认值而不是抛出异常', async () => {
    class BrokenDatabase {
      collection() { throw new Error('DB error'); }
    }
    const db = new BrokenDatabase();
    const result = await cleanupStuckTasks(db);
    expect(result).toEqual({
      cleanedCount: 0
    });
  });

  test('调用方应该能读取 cleanedCount 字段', async () => {
    const db = new MockDatabase();
    const result = await cleanupStuckTasks(db);
    expect(result.cleanedCount).toBeDefined();
    expect(typeof result.cleanedCount).toBe('number');
  });


});
