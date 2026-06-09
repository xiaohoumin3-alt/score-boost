// Mock wx-server-sdk before importing
jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  database: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test'
}));

const { checkQueueForStudent } = require('../queue_manager');

// Mock wx-cloud-sdk
const mockData = [
  {
    _id: 'task1',
    student_id: 'student1',
    status: 'processing',
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10分钟前
    updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
  },
  {
    _id: 'task2',
    student_id: 'student2',
    status: 'processing',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2分钟前
    updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
  }
];

// Ensure wx global exists for cloud mock
global.wx = global.wx || { cloud: {} };

describe('checkQueueForStudent - queue timeout', () => {

  let mockDb;

  beforeEach(() => {
    // 重置 mock DB
    mockDb = {
      command: {
        in: jest.fn((arr) => ({ $in: arr }))
      },
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                data: []
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
        _id: 'task1',
        student_id: 'student1',
        status: 'processing',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
      }
    ];

    mockDb.collection().where().orderBy().limit().get = jest.fn()
      .mockResolvedValue({ data: oldData });

    const result = await checkQueueForStudent(mockDb, 'student1');

    expect(result.found).toBe(false);
  });

  test('应该返回未超时的processing任务（2分钟前）', async () => {
    const recentData = [
      {
        _id: 'task2',
        student_id: 'student2',
        status: 'processing',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      }
    ];

    mockDb.collection().where().orderBy().limit().get = jest.fn()
      .mockResolvedValue({ data: recentData });

    const result = await checkQueueForStudent(mockDb, 'student2');

    expect(result.found).toBe(true);
    expect(result.queue_id).toBe('task2');
  });

  test('应该混合返回：过滤超时任务，保留未超时任务', async () => {
    // 函数使用 limit(1) 只取最新一条任务
    // 如果最新任务是超时的（10分钟前），返回 found: false
    // 需要把未超时的任务放在前面（orderBy created_at desc）
    const mixedData = [
      {
        _id: 'task2',
        student_id: 'student1',
        status: 'processing',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      },
      {
        _id: 'task1',
        student_id: 'student1',
        status: 'processing',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
      }
    ];

    mockDb.collection().where().orderBy().limit().get = jest.fn()
      .mockResolvedValue({ data: mixedData });

    const result = await checkQueueForStudent(mockDb, 'student1');

    // 最新任务(task2)未超时，应该返回 found: true
    expect(result.found).toBe(true);
    expect(result.queue_id).toBe('task2');
  });

  test('边界情况：正好5分钟的任务应该被过滤', async () => {
    const boundaryData = [
      {
        _id: 'task1',
        student_id: 'student1',
        status: 'processing',
        created_at: new Date(Date.now() - 5 * 60 * 1000 - 1000).toISOString(),
        updated_at: new Date(Date.now() - 5 * 60 * 1000 - 1000).toISOString()
      }
    ];

    mockDb.collection().where().orderBy().limit().get = jest.fn()
      .mockResolvedValue({ data: boundaryData });

    const result = await checkQueueForStudent(mockDb, 'student1');

    expect(result.found).toBe(false);
  });

  test('应该按 subject 和 grade 过滤活跃队列任务', async () => {
    const whereMock = jest.fn().mockReturnValue({
      orderBy: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ data: [] })
        })
      })
    });
    mockDb.collection = jest.fn().mockReturnValue({ where: whereMock });

    await checkQueueForStudent(mockDb, 'student1', { subject: 'chinese', grade: '2' });

    expect(whereMock).toHaveBeenCalledWith({
      student_id: 'student1',
      subject: 'chinese',
      grade: '2',
      status: { $in: ['pending', 'processing', 'completed'] }
    });
  });
});
