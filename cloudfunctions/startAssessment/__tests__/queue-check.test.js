const { checkQueueForStudent } = require('../index');

// Mock wx-cloud-sdk
const mockData = [
  {
    id: 'task1',
    data: {
      studentId: 'student1',
      status: 'processing',
      createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10分钟前
      updatedAt: new Date(Date.now() - 10 * 60 * 1000)
    }
  },
  {
    id: 'task2',
    data: {
      studentId: 'student2',
      status: 'processing',
      createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2分钟前
      updatedAt: new Date(Date.now() - 2 * 60 * 1000)
    }
  }
];

describe('checkQueueForStudent - queue timeout', () => {
  let mockDb;

  beforeEach(() => {
    // 重置 wx.cloud.database
    mockDb = {
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                data: mockData
              })
            })
          })
        })
      })
    };

    wx.cloud.database = jest.fn().mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('应该返回空结果当所有processing任务都超时（超过5分钟）', async () => {
    // 所有任务都是10分钟前的，应该被过滤
    const oldData = [
      {
        id: 'task1',
        data: {
          studentId: 'student1',
          status: 'processing',
          createdAt: new Date(Date.now() - 10 * 60 * 1000),
          updatedAt: new Date(Date.now() - 10 * 60 * 1000)
        }
      }
    ];

    mockDb.collection().where().orderBy().limit().get = jest.fn()
      .mockResolvedValue({ data: oldData });

    const result = await checkQueueForStudent('student1');

    expect(result).toEqual({
      found: false,
      task: null
    });
  });

  test('应该返回未超时的processing任务（2分钟前）', async () => {
    const recentData = [
      {
        id: 'task2',
        data: {
          studentId: 'student2',
          status: 'processing',
          createdAt: new Date(Date.now() - 2 * 60 * 1000),
          updatedAt: new Date(Date.now() - 2 * 60 * 1000)
        }
      }
    ];

    mockDb.collection().where().orderBy().limit().get = jest.fn()
      .mockResolvedValue({ data: recentData });

    const result = await checkQueueForStudent('student2');

    expect(result).toEqual({
      found: true,
      task: recentData[0]
    });
  });

  test('应该混合返回：过滤超时任务，保留未超时任务', async () => {
    // 混合数据：一个超时，一个未超时
    const mixedData = [
      {
        id: 'task1',
        data: {
          studentId: 'student1',
          status: 'processing',
          createdAt: new Date(Date.now() - 10 * 60 * 1000), // 超时
          updatedAt: new Date(Date.now() - 10 * 60 * 1000)
        }
      },
      {
        id: 'task2',
        data: {
          studentId: 'student1',
          status: 'processing',
          createdAt: new Date(Date.now() - 2 * 60 * 1000), // 未超时
          updatedAt: new Date(Date.now() - 2 * 60 * 1000)
        }
      }
    ];

    mockDb.collection().where().orderBy().limit().get = jest.fn()
      .mockResolvedValue({ data: mixedData });

    const result = await checkQueueForStudent('student1');

    // 应该只返回未超时的任务
    expect(result.found).toBe(true);
    expect(result.task.id).toBe('task2');
  });

  test('边界情况：正好5分钟的任务应该被过滤', async () => {
    const boundaryData = [
      {
        id: 'task1',
        data: {
          studentId: 'student1',
          status: 'processing',
          createdAt: new Date(Date.now() - 5 * 60 * 1000 - 1000), // 5分1秒前
          updatedAt: new Date(Date.now() - 5 * 60 * 1000 - 1000)
        }
      }
    ];

    mockDb.collection().where().orderBy().limit().get = jest.fn()
      .mockResolvedValue({ data: boundaryData });

    const result = await checkQueueForStudent('student1');

    expect(result.found).toBe(false);
  });

  test('边界情况：4分59秒的任务应该被保留', async () => {
    const boundaryData = [
      {
        id: 'task1',
        data: {
          studentId: 'student1',
          status: 'processing',
          createdAt: new Date(Date.now() - 4 * 60 * 1000 - 59 * 1000), // 4分59秒前
          updatedAt: new Date(Date.now() - 4 * 60 * 1000 - 59 * 1000)
        }
      }
    ];

    mockDb.collection().where().orderBy().limit().get = jest.fn()
      .mockResolvedValue({ data: boundaryData });

    const result = await checkQueueForStudent('student1');

    expect(result.found).toBe(true);
  });
});
