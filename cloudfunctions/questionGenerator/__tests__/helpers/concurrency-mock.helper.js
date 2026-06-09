/**
 * 并发测试 Mock 工具
 *
 * 提供支持并发控制的 Mock DB 和相关工具函数
 */

/**
 * 创建支持并发控制的 Mock DB
 * @param {Object} options - 配置选项
 * @param {Function} options.onCheckCancelled - 取消检测钩子函数 (taskId) => cancelledValue
 * @param {number} options.startId - ID起始值，默认为1
 * @returns {Object} Mock DB 对象
 */
function createMockDb(options = {}) {
  const { onCheckCancelled, startId = 1 } = options;

  // 模拟集合数据存储
  const collections = {
    question_queue: [],
    ai_question_pool: [],
    assessments: []
  };

  // 模拟唯一ID生成器（使用startId确保并发测试中ID唯一性）
  let idCounter = startId;
  const generateId = (prefix) => `${prefix}_${idCounter++}`;

  // 创建支持链式调用的 where 结果
  function createWhereResult(collName, filterField, filterValue) {
    let limitCount = 50;
    let orderField = null;
    let orderDir = 'asc';

    const chainable = {
      limit: (n) => { limitCount = n; return chainable; },
      orderBy: (field, dir) => { orderField = field; orderDir = dir || 'asc'; return chainable; },
      get: async () => {
        const coll = collections[collName] || [];
        let results = [...coll];
        if (filterField !== null) {
          if (filterField === '_id' && typeof filterValue === 'object' && filterValue.$in) {
            results = results.filter(item => filterValue.$in.includes(item._id));
          } else {
            results = results.filter(item => item[filterField] === filterValue);
          }
        }
        if (orderField) {
          results.sort((a, b) => {
            const va = a[orderField], vb = b[orderField];
            if (va < vb) return orderDir === 'asc' ? -1 : 1;
            if (va > vb) return orderDir === 'asc' ? 1 : -1;
            return 0;
          });
        }
        results = results.slice(0, limitCount);
        return { data: results };
      },
      remove: async () => {
        const coll = collections[collName] || [];
        const before = coll.length;
        if (filterField !== null && filterValue !== null) {
          for (let i = coll.length - 1; i >= 0; i--) {
            if (coll[i][filterField] === filterValue) {
              coll.splice(i, 1);
            }
          }
        }
        return { stats: { removed: before - coll.length } };
      }
    };
    return chainable;
  }

  return {
    command: {
      in: jest.fn((arr) => ({ $in: arr }))
    },

    collection: jest.fn((name) => {
      const collName = name;
      return {
        // 链式查询 where
        where: (query) => {
          const keys = Object.keys(query || {});
          if (keys.length === 0) {
            return createWhereResult(collName, null, null);
          }
          const field = keys[0];
          const value = query[field];
          return createWhereResult(collName, field, value);
        },

        // 直接链式方法（不带 where 过滤）
        limit: (n) => createWhereResult(collName, null, null).limit(n),
        orderBy: (field, dir) => createWhereResult(collName, null, null).orderBy(field, dir),
        get: async () => {
          const data = collections[collName] || [];
          return { data };
        },

        // 添加方法（CloudBase 风格）
        add: jest.fn().mockImplementation(async ({ data }) => {
          const id = generateId(collName.split('_')[0] || 'item');
          const item = { _id: id, ...(data || {}) };
          collections[collName].push(item);
          return { _id: id };
        }),

        // 文档操作方法
        doc: jest.fn((id) => {
          const isCancelled = onCheckCancelled && onCheckCancelled(id);
          return {
            get: jest.fn().mockResolvedValue({
              data: isCancelled
                ? { _id: id, status: 'cancelled' }
                : (collections[collName].find(item => item._id === id) || { _id: id, status: 'pending' })
            }),
            update: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
          };
        })
      };
    }),

    // 取消检测钩子（支持基于 taskId 的控制）
    _checkCancelledHook: onCheckCancelled,

    // 清除所有集合数据（每个测试前调用）
    _reset: () => {
      Object.keys(collections).forEach(k => collections[k] = []);
      idCounter = startId;
    }
  };
}

/**
 * 创建支持取消检测的 mock checkTaskCancelled
 * @param {Set<string>} cancelledTasks - 被取消的任务ID集合
 * @returns {Function} mock 函数
 */
function createMockCheckTaskCancelled(cancelledTasks = new Set()) {
  return async function mockCheckTaskCancelled(db, taskId) {
    // 支持外部钩子
    if (db && db._checkCancelledHook) {
      return db._checkCancelledHook(taskId);
    }
    // 默认检查逻辑
    return cancelledTasks.has(taskId) ? taskId : null;
  };
}

/**
 * 创建并发测试专用的 mockGenerateAi
 * @param {Array} responses - 按顺序返回的响应，可混合成功/失败/Error
 * @returns {Function} mock 函数
 */
function createMockGenerateAi(responses) {
  let callIndex = 0;
  return async function mockGenerateAi(params) {
    if (callIndex >= responses.length) {
      throw new Error('No more responses configured');
    }
    const response = responses[callIndex++];
    if (response instanceof Error) {
      throw response;
    }
    return response;
  };
}

module.exports = {
  createMockDb,
  createMockCheckTaskCancelled,
  createMockGenerateAi
};
