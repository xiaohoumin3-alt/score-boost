/**
 * 预生成触发器测试 (TDD Red-Green-Refactor)
 * 核心功能：实现"润物细无声"的自动触发机制
 */

const {
  shouldPreGenerate,
  createPreGenTask
} = require('../pregen-trigger');

// 模拟数据库
class MockDb {
  constructor() {
    this.data = new Map();
  }

  collection(name) {
    return {
      where: (query) => ({
        get: async () => {
          const items = Array.from(this.data.values())
            .filter(item => Object.entries(query).every(([k, v]) => item[k] === v));
          return { data: items };
        }
      }),
      add: async ({ data }) => {
        const id = 'task_' + Date.now();
        const newDoc = { _id: id, ...data };
        this.data.set(id, newDoc);
        return { _id: id };
      }
    };
  }
}

describe('shouldPreGenerate', () => {
  test('should NOT trigger when high heat but sufficient pool', () => {
    const result = shouldPreGenerate('kp1_1', { heat_score: 8 }, 25);
    expect(result.shouldTrigger).toBe(false);
  });

  test('should trigger when high heat (>=7) and pool < 20', () => {
    const result = shouldPreGenerate('kp1_1', { heat_score: 8 }, 10);
    expect(result.shouldTrigger).toBe(true);
    expect(result.reason).toBe('high_heat_insufficient');
    expect(result.targetCount).toBe(20);
  });

  test('should trigger when medium heat (>=4) and pool < 5', () => {
    const result = shouldPreGenerate('kp1_1', { heat_score: 5 }, 3);
    expect(result.shouldTrigger).toBe(true);
    expect(result.reason).toBe('medium_heat_depleted');
  });

  test('should trigger when pool < 2 regardless of heat', () => {
    const result = shouldPreGenerate('kp1_1', { heat_score: 1 }, 1);
    expect(result.shouldTrigger).toBe(true);
    expect(result.reason).toBe('low_pool_minimum');
  });

  test('should trigger when no request log and pool empty', () => {
    const result = shouldPreGenerate('kp1_1', null, 0);
    expect(result.shouldTrigger).toBe(true);
    expect(result.targetCount).toBe(2);
  });

  test('should return correct heat level', () => {
    const highResult = shouldPreGenerate('kp1_1', { heat_score: 8 }, 10);
    expect(highResult.heatLevel).toBe('high');

    const mediumResult = shouldPreGenerate('kp1_1', { heat_score: 5 }, 3);
    expect(mediumResult.heatLevel).toBe('medium');

    const lowResult = shouldPreGenerate('kp1_1', { heat_score: 2 }, 1);
    expect(lowResult.heatLevel).toBe('low');
  });
});

describe('createPreGenTask', () => {
  test('should create new task when no existing pending task', async () => {
    const db = new MockDb();
    const triggerResult = {
      shouldTrigger: true,
      priority: 8,
      targetCount: 20,
      reason: 'high_heat_insufficient'
    };

    const result = await createPreGenTask(db, 'kp1_1', triggerResult);

    expect(result.created).toBe(true);
  });

  test('should NOT create task when already queued', async () => {
    const db = new MockDb();
    // 预先添加一个pending任务
    await db.collection('pregen_queue').add({
      data: {
        kp_id: 'kp1_1',
        priority: 5,
        target_count: 10,
        status: 'pending'
      }
    });

    const triggerResult = {
      shouldTrigger: true,
      priority: 8,
      targetCount: 20,
      reason: 'high_heat_insufficient'
    };

    const result = await createPreGenTask(db, 'kp1_1', triggerResult);

    expect(result.created).toBe(false);
    expect(result.reason).toBe('already_queued');
  });
});
