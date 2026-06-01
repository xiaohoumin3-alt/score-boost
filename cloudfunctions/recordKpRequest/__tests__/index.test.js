/**
 * recordKpRequest 云函数测试 (TDD Red-Green-Refactor)
 * 核心功能：记录练习请求 + 自动触发预生成
 */

const {
  handleKpRequest
} = require('../index');

// 模拟微信云开发SDK
class MockCollection {
  constructor(data = {}) {
    this.data = data;
    this.docData = null;
  }

  doc(id) {
    this.docId = id;
    this.docData = this.data[id];
    return this;
  }

  async get() {
    if (this.docData) {
      return { data: [this.docData] };
    }
    return { data: [] };
  }

  async update({ data }) {
    if (this.docId && this.data[this.docId]) {
      this.data[this.docId] = { ...this.data[this.docId], ...data };
    }
    return { errMsg: 'collection.update:ok' };
  }

  async add({ data }) {
    const id = data._id || 'new_' + Date.now();
    this.data[id] = data;
    return { _id: id };
  }

  where(query) {
    return this;
  }

  async count() {
    return { total: 0 }; // 模拟空题池
  }

  orderBy() { return this; }
  limit() { return this; }
}

class MockDatabase {
  constructor() {
    this.requestLogData = {};
    this.poolData = {};
  }

  collection(name) {
    if (name === 'kp_request_log') {
      return new MockCollection(this.requestLogData);
    }
    if (name === 'ai_question_pool') {
      const pool = new MockCollection(this.poolData);
      pool.where = () => ({
        count: async () => ({ total: 0 }) // 默认题池为空
      });
      return pool;
    }
    return new MockCollection();
  }
}

class MockCloud {
  constructor() {
    this.db = new MockDatabase();
    this.callFunctionResults = [];
  }

  database() {
    return this.db;
  }

  async callFunction({ name, data }) {
    this.callFunctionResults.push({ name, data });
    return { errMsg: 'cloud.callFunction:ok' };
  }
}

describe('handleKpRequest', () => {
  test('should create new log entry for first request', async () => {
    const cloud = new MockCloud();
    const result = await handleKpRequest(cloud, 'kp1_1');

    expect(result.success).toBe(true);
    expect(result.heat_score).toBeGreaterThan(0);
    expect(result.request_count).toBe(1);

    // 验证数据库写入
    const logEntry = cloud.db.requestLogData['kp1_1'];
    expect(logEntry).toBeDefined();
    expect(logEntry.request_count).toBe(1);
  });

  test('should increment count for existing log entry', async () => {
    const cloud = new MockCloud();
    // 预先添加记录
    cloud.db.requestLogData['kp1_1'] = {
      request_count: 5,
      heat_score: 2.5,
      last_request_at: new Date().toISOString()
    };

    const result = await handleKpRequest(cloud, 'kp1_1');

    expect(result.success).toBe(true);
    expect(result.request_count).toBe(6);
  });

  test('should auto-trigger pregeneration when pool is low', async () => {
    const cloud = new MockCloud();
    // 设置热度足够高
    cloud.db.requestLogData['kp1_1'] = {
      request_count: 100,
      heat_score: 8,
      last_request_at: new Date().toISOString()
    };

    const result = await handleKpRequest(cloud, 'kp1_1');

    // 题池为空（0题），热度8分应该触发
    expect(result.auto_triggered).toBe(true);
    expect(result.trigger_reason).toBeDefined();
  });

  test('should NOT auto-trigger when pool is sufficient', async () => {
    const cloud = new MockCloud();
    // 设置热度高但题池充足（模拟）
    cloud.db.requestLogData['kp1_1'] = {
      request_count: 100,
      heat_score: 8,
      last_request_at: new Date().toISOString()
    };

    // 模拟题池有25题（>=20，不触发）
    const pool = new MockCollection(cloud.db.poolData);
    pool.where = () => ({
      count: async () => ({ total: 25 })
    });
    cloud.db.collection = (name) => {
      if (name === 'ai_question_pool') return pool;
      if (name === 'kp_request_log') {
        return new MockCollection(cloud.db.requestLogData);
      }
      return new MockCollection();
    };

    const result = await handleKpRequest(cloud, 'kp1_1');

    expect(result.auto_triggered).toBe(false);
  });

  test('should return error when kp_id is missing', async () => {
    const cloud = new MockCloud();
    const result = await handleKpRequest(cloud, null);

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });
});
