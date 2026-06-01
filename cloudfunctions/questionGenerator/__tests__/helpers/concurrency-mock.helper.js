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

  return {
    collection: jest.fn((name) => {
      // 创建返回对象，支持链式调用
      const collectionObj = {
        // 查询方法
        where: (query) => {
          const field = query ? Object.keys(query)[0] : null;
          const value = query ? query[field] : null;

          return {
            field,
            value,
            get: async () => {
              const coll = collections[name] || [];

              if (!field || !value) {
                return [coll];
              }

              return [coll.filter(item => item[field] === value)];
            },
            remove: async () => {
              const coll = collections[name] || [];
              const idx = coll.findIndex(i => i[field] === value);
              if (idx !== -1) {
                coll.splice(idx, 1);
              }
              return { deleted: idx !== -1 ? 1 : 0 };
            }
          };
        },
        // 添加方法
        add: jest.fn().mockImplementation(async ({ data }) => {
          const id = generateId(name.split('_')[0] || 'item');
          const item = { _id: id, ...data };
          collections[name].push(item);
          return { _id: id };
        }),
        // 更新方法
        update: jest.fn().mockResolvedValue({ returned: 1 })
      };

      // 添加 doc 方法到 collection 对象（用于 question_queue）
      collectionObj.doc = jest.fn((id) => {
        // 检查取消钩子：如果taskId在取消集合中，返回cancelled状态
        const isCancelled = onCheckCancelled && onCheckCancelled(id);
        return {
          get: jest.fn().mockResolvedValue({
            data: isCancelled
              ? { _id: id, status: 'cancelled' }
              : (collections[name].find(item => item._id === id) || { _id: id, status: 'pending' })
          }),
          update: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
        };
      });

      return collectionObj;
    }),

    // 取消检测钩子（支持基于 taskId 的控制）
    _checkCancelledHook: onCheckCancelled,

    // 清除所有集合数据（每个测试前调用）
    _reset: () => {
      Object.keys(collections).forEach(k => collections[k] = []);
      idCounter = 1;
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
