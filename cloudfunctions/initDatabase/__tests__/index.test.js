/**
 * initDatabase 云函数测试 (TDD Red-Green-Refactor)
 * 测试kp_request_log和generation_tasks集合初始化
 */

jest.mock('wx-server-sdk');

// Mock数据库类
class MockCollection {
  constructor() {
    this.docs = {};
    this._existsError = false;
  }

  async add(data) {
    if (this._existsError) {
      const error = new Error('document exists');
      error.errCode = -1;
      throw error;
    }
    const id = data._id || `mock_${Date.now()}`;
    this.docs[id] = data;
    return { _id: id };
  }

  doc(id) {
    const self = this;
    return {
      async get() {
        return { data: self.docs[id] || null };
      }
    };
  }

  async count() {
    return { total: Object.keys(this.docs).length };
  }
}

class MockDatabase {
  constructor() {
    this.collections = {};
  }

  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new MockCollection();
    }
    return this.collections[name];
  }

  command() {
    return {
      gte: () => ({})
    };
  }
}

describe('initDatabase - kp_request_log & generation_tasks 初始化', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = new MockDatabase();
    const cloud = require('wx-server-sdk');
    cloud.database.mockReturnValue(mockDb);
  });

  test('应该初始化kp_request_log、generation_tasks和pregen_queue集合', async () => {
    const { main } = require('../index');

    const result = await main({ data: { action: 'initCollections' } }, {});

    expect(result.success).toBe(true);
    expect(result.results.collections).toHaveLength(3);
    expect(result.results.collections).toContain('kp_request_log');
    expect(result.results.collections).toContain('generation_tasks');
    expect(result.results.collections).toContain('pregen_queue');
  });

  test('集合已存在时应正常处理', async () => {
    // 设置所有集合为已存在状态
    mockDb.collection('kp_request_log')._existsError = true;
    mockDb.collection('generation_tasks')._existsError = true;
    mockDb.collection('pregen_queue')._existsError = true;

    const { main } = require('../index');

    const result = await main({ data: { action: 'initCollections' } }, {});

    expect(result.success).toBe(true);
    expect(result.results.collections).toHaveLength(3);
    expect(result.results.collections[0]).toContain('already exists');
  });

  test('创建失败时应返回错误', async () => {
    // 设置第一个集合抛出非exists错误
    const kpLogCol = mockDb.collection('kp_request_log');
    kpLogCol.add = jest.fn().mockRejectedValueOnce(new Error('Database error'));

    const { main } = require('../index');

    const result = await main({ data: { action: 'initCollections' } }, {});

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
