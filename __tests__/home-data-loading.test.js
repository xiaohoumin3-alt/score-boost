/**
 * 端到端测试：验证首页数据加载流程
 *
 * 测试场景：
 * 1. AI今日任务（generateDailyTask 云函数）
 * 2. 待复习数据（kp_progress + knowledge_points 集合查询）
 */

// 重新加载模块以避免状态污染
jest.resetModules();

const api = require('../utils/cloudApi');

describe('端到端测试：首页数据加载', () => {

  beforeEach(() => {
    // 清除之前的 mock
    jest.clearAllMocks();

    // Mock db.command
    const dbCommand = {
      in: jest.fn((array) => ({ __in_op__: array }))
    };

    // Mock wx.cloud
    global.wx = {
      cloud: {
        init: jest.fn(),
        callFunction: jest.fn(),
        database: jest.fn(() => ({
          collection: jest.fn((name) => {
            // 根据集合名称返回不同的 mock 实现
            const mockCollection = {
              name: name,
              _whereCalled: false,
              where: function(condition) {
                this._whereCalled = true;
                this._whereCondition = condition;
                return this;
              },
              field: function(fields) {
                this._fields = fields;
                return this;
              },
              orderBy: function(field, order) {
                this._orderBy = { field, order };
                return this;
              },
              limit: function(n) {
                this._limit = n;
                return this;
              },
              get: function() {
                // 返回一个 Promise，需要在测试中设置 mock 返回值
                return this._getMockResult ? this._getMockResult() : Promise.resolve({ data: [] });
              },
              setMockResult: function(result) {
                this._getMockResult = () => Promise.resolve(result);
              }
            };
            return mockCollection;
          }),
          command: dbCommand
        }))
      }
    };

    // Mock getApp
    global.getApp = jest.fn(() => ({
      globalData: {
        studentId: 'test-student-001',
        subject: '数学',
        grade: '八年级'
      }
    }));
  });

  test('场景1：generateDailyTask 云函数返回今日任务', async () => {
    // Mock 云函数返回
    const mockTask = {
      success: true,
      data: {
        action: 'practice',
        kp_id: 'math_kp8_1',
        kp_name: '勾股定理',
        reason: '你在这个知识点上还需要加强练习'
      }
    };

    // callCloudFunction passes success/fail callbacks to wx.cloud.callFunction.
    // The mock must invoke the success callback synchronously, not return a Promise.
    global.wx.cloud.callFunction.mockImplementation(function(opts) {
      if (opts.success) {
        opts.success({
          errMsg: 'cloud.callFunction:ok',
          result: mockTask
        });
      }
    });

    // 模拟调用
    const result = await api.callCloudFunction('generateDailyTask', {
      student_id: 'test-student-001',
      subject: '数学',
      grade: '八年级'
    });

    expect(result).toEqual(mockTask.data);
    expect(global.wx.cloud.callFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'generateDailyTask',
        data: expect.objectContaining({
          student_id: 'test-student-001',
          subject: '数学',
          grade: '八年级'
        })
      })
    );
  });

  test('场景2：getKpProgress 返回待复习数据（包含过滤逻辑）', async () => {
    // Mock kp_progress 集合返回
    const mockKpProgress = [
      { kp_id: 'math_kp8_1', next_review_at: '2026-06-05T10:00:00Z', current_difficulty: 'hard' },
      { kp_id: 'math_kp8_2', next_review_at: '2026-06-06T12:00:00Z', current_difficulty: 'medium' },
      { kp_id: 'bio_kp7_1', next_review_at: '2026-06-06T08:00:00Z', current_difficulty: 'easy' }
    ];

    // Mock knowledge_points 集合返回（用于获取 grade/subject）
    const mockKnowledgePoints = [
      { kp_id: 'math_kp8_1', grade: '8', subject: 'math' },
      { kp_id: 'math_kp8_2', grade: '8', subject: 'math' },
      { kp_id: 'bio_kp7_1', grade: '7', subject: 'biology' }
    ];

    let kpCallCount = 0;
    global.wx.cloud.callFunction.mockClear();
    global.wx.cloud.database = jest.fn(() => ({
      collection: jest.fn((name) => {
        const mockCollection = {
          name: name,
          where: function(condition) {
            this._whereCondition = condition;
            return this;
          },
          field: function(fields) {
            this._fields = fields;
            return this;
          },
          get: function() {
            kpCallCount++;
            if (name === 'kp_progress') {
              return Promise.resolve({ data: mockKpProgress });
            } else if (name === 'knowledge_points') {
              return Promise.resolve({ data: mockKnowledgePoints });
            }
            return Promise.resolve({ data: [] });
          }
        };
        return mockCollection;
      }),
      command: {
        in: jest.fn((array) => ({ __in_op__: array }))
      }
    }));

    // 模拟调用 getKpProgress（传入科目年级过滤）
    const result = await api.getKpProgress('数学', '八年级');

    expect(result.success).toBe(true);
    // 只返回数学八年级数据
    expect(result.data.length).toBe(2);
    expect(result.data[0].kp_id).toBe('math_kp8_1');
    expect(result.data[1].kp_id).toBe('math_kp8_2');
  });

  test('场景3：getKpProgress 无数据时返回空数组', async () => {
    // Mock 空数据
    global.wx.cloud.database = jest.fn(() => ({
      collection: jest.fn((name) => {
        const mockCollection = {
          name: name,
          where: function(condition) {
            return this;
          },
          get: function() {
            return Promise.resolve({ data: [] });
          }
        };
        return mockCollection;
      }),
      command: {
        in: jest.fn((array) => ({ __in_op__: array }))
      }
    }));

    const result = await api.getKpProgress('数学', '八年级');

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  test('场景4：generateDailyTask 云函数失败时优雅降级', async () => {
    // callCloudFunction passes fail callback; invoke it synchronously
    global.wx.cloud.callFunction.mockImplementation(function(opts) {
      if (opts.fail) {
        opts.fail({ errMsg: '云函数调用失败' });
      }
    });

    // 模拟调用（应该抛出错误）
    await expect(
      api.callCloudFunction('generateDailyTask', {
        student_id: 'test-student-001',
        subject: '数学',
        grade: '八年级'
      })
    ).rejects.toThrow('云函数调用失败');
  });

  test('场景5：knowledge_points 查询失败时的降级处理', async () => {
    const mockKpProgress = [
      { kp_id: 'math_kp8_1', next_review_at: '2026-06-05T10:00:00Z' }
    ];

    let callOrder = 0;
    global.wx.cloud.database = jest.fn(() => ({
      collection: jest.fn((name) => {
        const self = {
          where: function(condition) {
            return this;
          },
          field: function(fields) {
            return this;
          },
          get: function() {
            callOrder++;
            if (name === 'kp_progress' && callOrder === 1) {
              return Promise.resolve({ data: mockKpProgress });
            } else if (name === 'knowledge_points') {
              // knowledge_points 查询失败
              return Promise.reject(new Error('查询失败'));
            }
            return Promise.resolve({ data: [] });
          }
        };
        return self;
      }),
      command: { in: jest.fn((array) => ({ __in_op__: array })) }
    }));

    // 当前实现中 knowledge_points 查询失败会返回空数组
    // 这是由于 getKpProgress 的 catch 块返回 { success: true, data: [] }
    const result = await api.getKpProgress('数学', '八年级');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });
});

describe('集成验证：数据过滤逻辑', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    global.wx = {
      cloud: {
        init: jest.fn(),
        callFunction: jest.fn(),
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            where: jest.fn(() => ({
              field: jest.fn(function() { return this; }),
              get: jest.fn()
            }))
          })),
          command: {
            in: jest.fn((array) => ({ __in_op__: array }))
          }
        }))
      }
    };

    global.getApp = jest.fn(() => ({
      globalData: {
        studentId: 'test-student-001',
        subject: '数学',
        grade: '八年级'
      }
    }));
  });

  test('科目过滤：只返回指定科目的知识点', async () => {
    const mockKpProgress = [
      { kp_id: 'math_kp8_1', next_review_at: '2026-06-05T10:00:00Z' },
      { kp_id: 'chinese_kp8_1', next_review_at: '2026-06-05T10:00:00Z' }
    ];

    const mockKnowledgePoints = [
      { kp_id: 'math_kp8_1', grade: '8', subject: 'math' },
      { kp_id: 'chinese_kp8_1', grade: '8', subject: 'chinese' }
    ];

    let callCount = 0;
    global.wx.cloud.database = jest.fn(() => ({
      collection: jest.fn((name) => {
        return {
          where: function(condition) {
            return this;
          },
          field: function(fields) {
            return this;
          },
          get: function() {
            callCount++;
            if (name === 'kp_progress') {
              return Promise.resolve({ data: mockKpProgress });
            } else if (name === 'knowledge_points') {
              return Promise.resolve({ data: mockKnowledgePoints });
            }
            return Promise.resolve({ data: [] });
          }
        };
      }),
      command: { in: jest.fn((array) => ({ __in_op__: array })) }
    }));

    // 请求数学数据
    const result = await api.getKpProgress('数学', '八年级');

    expect(result.success).toBe(true);
    expect(result.data.length).toBe(1);
    expect(result.data[0].kp_id).toBe('math_kp8_1');
  });

  test('年级过滤：只返回指定年级的知识点', async () => {
    const mockKpProgress = [
      { kp_id: 'math_kp8_1', next_review_at: '2026-06-05T10:00:00Z' },
      { kp_id: 'math_kp7_1', next_review_at: '2026-06-05T10:00:00Z' }
    ];

    const mockKnowledgePoints = [
      { kp_id: 'math_kp8_1', grade: '8', subject: 'math' },
      { kp_id: 'math_kp7_1', grade: '7', subject: 'math' }
    ];

    let callCount = 0;
    global.wx.cloud.database = jest.fn(() => ({
      collection: jest.fn((name) => {
        return {
          where: function(condition) {
            return this;
          },
          field: function(fields) {
            return this;
          },
          get: function() {
            callCount++;
            if (name === 'kp_progress') {
              return Promise.resolve({ data: mockKpProgress });
            } else if (name === 'knowledge_points') {
              return Promise.resolve({ data: mockKnowledgePoints });
            }
            return Promise.resolve({ data: [] });
          }
        };
      }),
      command: { in: jest.fn((array) => ({ __in_op__: array })) }
    }));

    // 请求八年级数据
    const result = await api.getKpProgress('数学', '八年级');

    expect(result.success).toBe(true);
    expect(result.data.length).toBe(1);
    expect(result.data[0].kp_id).toBe('math_kp8_1');
  });
});
