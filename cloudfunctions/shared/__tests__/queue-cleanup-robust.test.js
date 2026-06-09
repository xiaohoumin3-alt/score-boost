/**
 * queue-cleanup-robust.test.js
 * P2-05 验收测试：队列任务清理机制健壮化
 *
 * 覆盖验收标准：
 *   A1: 无 TARGET_QUEUE_ID 硬编码
 *   A2: stuck 任务自动重试
 *   A3: 超过3次重试标记为 failed 但不删除
 *   A4: failed 任务永不自动删除
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const QGEN_PATH = path.join(__dirname, '..', '..', 'questionGenerator', 'index.js');

// ========== Mock Database ==========

class MockQueueCollection {
  constructor() {
    this.tasks = [];
    this.updates = []; // 记录所有 update 操作
  }

  where(condition) {
    this._whereFilter = condition;
    return this;
  }

  orderBy() { return this; }
  limit(count) {
    this._limitCount = count;
    return this;
  }

  async get() {
    let result = this.tasks;
    if (this._whereFilter) {
      if (this._whereFilter.status) {
        result = result.filter(t => t.status === this._whereFilter.status);
      }
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
        const task = self.tasks.find(t => t._id === id);
        return task ? { data: task } : { data: null };
      },
      update: async (data) => {
        self.updates.push({ id, data });
        const task = self.tasks.find(t => t._id === id);
        if (task) Object.assign(task, data.data || data);
      },
      remove: async () => {
        self.tasks = self.tasks.filter(t => t._id !== id);
      }
    };
  }

  addOldStuckTask(retryCount = 0) {
    this.tasks.push({
      _id: `stuck_${this.tasks.length}`,
      status: 'processing',
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      retry_count: retryCount,
    });
  }
}

class MockDatabase {
  constructor() {
    this.queue = new MockQueueCollection();
  }

  collection(name) {
    if (name === 'question_queue') return this.queue;
    return {
      where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
      doc: () => ({
        get: async () => ({ data: null }),
        update: async () => {},
        remove: async () => {}
      })
    };
  }
}

// ========== 测试 ==========

describe('P2-05: 队列清理 — 源码验证 (A1)', () => {

  test('验收 A1: 无 TARGET_QUEUE_ID 硬编码', () => {
    const content = fs.readFileSync(QGEN_PATH, 'utf-8');

    // 不应包含硬编码的特定任务 ID
    expect(content).not.toContain("669eebf36a17092800eea1aa0a8c721b");
  });

  test('无 priority: 999 特殊提升逻辑', () => {
    const content = fs.readFileSync(QGEN_PATH, 'utf-8');

    // 不应包含硬编码的优先级提升
    expect(content).not.toMatch(/priority:\s*999/);
  });
});

describe('P2-05: 队列清理 — 源码验证 (A4)', () => {

  test('验收 A4: question_queue 无 .remove() 调用', () => {
    const content = fs.readFileSync(QGEN_PATH, 'utf-8');

    // 查找 question_queue 的 remove 调用
    // 排除注释
    const lines = content.split('\n');
    let foundRemove = false;
    for (const line of lines) {
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      if (line.includes("question_queue") && line.includes('.remove()')) {
        // 确认这是在操作 question_queue 的上下文中
        foundRemove = true;
      }
    }

    // 允许在 cleanupPartialQuestions 中删除 ai_question_pool
    // 但不应删除 question_queue 中的 failed 任务
    expect(foundRemove).toBe(false);
  });
});

describe('P2-05: 队列清理 — 重试逻辑验证 (A2, A3)', () => {

  // 注意：以下测试依赖 cleanupStuckTasks 的实际实现
  // 修复完成后，这些测试验证重试行为

  test('cleanupStuckTasks 函数存在且可调用', () => {
    // 清除模块缓存
    delete require.cache[require.resolve(QGEN_PATH)];
    jest.resetModules();

    // Mock wx-server-sdk
    jest.doMock('wx-server-sdk', () => ({
      init: jest.fn(),
      DYNAMIC_CURRENT_ENV: 'mock-env',
      database: jest.fn(),
      getWXContext: jest.fn().mockReturnValue({ OPENID: 'test' }),
    }));

    const qgen = require(QGEN_PATH);
    expect(typeof qgen.cleanupStuckTasks).toBe('function');
  });

  test('stuck 任务应被重置为 pending 而非 failed (首次)', async () => {
    jest.resetModules();
    jest.doMock('wx-server-sdk', () => ({
      init: jest.fn(),
      DYNAMIC_CURRENT_ENV: 'mock-env',
      database: jest.fn(),
      getWXContext: jest.fn().mockReturnValue({ OPENID: 'test' }),
    }));

    const { cleanupStuckTasks } = require(QGEN_PATH);
    const db = new MockDatabase();

    // 添加1个 stuck 任务 (retry_count: 0)
    db.queue.addOldStuckTask(0);

    const result = await cleanupStuckTasks(db);

    // 应清理了1个任务
    expect(result.cleanedCount).toBeGreaterThanOrEqual(1);

    // 检查 update 操作：应重置为 pending
    const updateCalls = db.queue.updates.filter(u => u.id.startsWith('stuck_'));
    expect(updateCalls.length).toBeGreaterThan(0);

    // 至少有一个 update 设置了 pending 状态
    const pendingUpdates = updateCalls.filter(u =>
      u.data && (u.data.status === 'pending' || (u.data.data && u.data.data.status === 'pending'))
    );
    expect(pendingUpdates.length).toBeGreaterThan(0);
  });

  test('超过最大重试次数的任务标记为 failed 但不删除', async () => {
    jest.resetModules();
    jest.doMock('wx-server-sdk', () => ({
      init: jest.fn(),
      DYNAMIC_CURRENT_ENV: 'mock-env',
      database: jest.fn(),
      getWXContext: jest.fn().mockReturnValue({ OPENID: 'test' }),
    }));

    const { cleanupStuckTasks } = require(QGEN_PATH);
    const db = new MockDatabase();

    // 添加1个超过重试次数的 stuck 任务
    db.queue.addOldStuckTask(5); // retry_count = 5 (> MAX_RETRY_COUNT=3)

    await cleanupStuckTasks(db);

    // 任务应仍在 tasks 中（未被删除）
    const remainingTasks = db.queue.tasks.filter(t => t._id.startsWith('stuck_'));
    expect(remainingTasks.length).toBe(1);
  });
});
