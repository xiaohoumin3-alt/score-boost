/**
 * queryProgress 云函数测试 (TDD Red-Green-Refactor)
 * 功能：查询异步生成任务进度
 */

let mockCloud;
jest.mock('wx-server-sdk', () => mockCloud);

function createMockCloud(overrides = {}) {
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            data: { _id: 'task_123', status: 'completed', questions: [] }
          })
        }))
      }))
    })),
    getWXContext: jest.fn(() => ({ OPENID: 'test_openid' })),
    ...overrides
  };
}

describe('queryProgress - Progress Query', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockCloud = createMockCloud();
    jest.resetModules();
  });

  describe('exports.main - 云函数入口', () => {
    test('应返回任务状态为completed时包含questions', async () => {
      const cloud = require('wx-server-sdk');
      const queryProgress = require('../index');

      const result = await queryProgress.main({
        task_id: 'task_123'
      }, {});

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.questions).toBeDefined();
    });

    test('应返回任务状态为processing时包含progress', async () => {
      mockCloud = createMockCloud({
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                data: { _id: 'task_123', status: 'processing', progress: 2, count: 3 }
              })
            }))
          }))
        }))
      });
      jest.resetModules();

      const cloud = require('wx-server-sdk');
      const queryProgress = require('../index');

      const result = await queryProgress.main({
        task_id: 'task_123'
      }, {});

      expect(result.success).toBe(true);
      expect(result.status).toBe('processing');
      expect(result.progress).toBe(2);
    });

    test('应返回任务状态为failed时包含error信息', async () => {
      mockCloud = createMockCloud({
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                data: { _id: 'task_123', status: 'failed', error: 'Generation failed' }
              })
            }))
          }))
        }))
      });
      jest.resetModules();

      const cloud = require('wx-server-sdk');
      const queryProgress = require('../index');

      const result = await queryProgress.main({
        task_id: 'task_123'
      }, {});

      expect(result.success).toBe(true);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Generation failed');
    });

    test('应处理task_id参数缺失', async () => {
      const cloud = require('wx-server-sdk');
      const queryProgress = require('../index');

      const result = await queryProgress.main({}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('task_id is required');
    });

    test('应处理任务不存在', async () => {
      mockCloud = createMockCloud({
        database: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                data: null
              })
            }))
          }))
        }))
      });
      jest.resetModules();

      const cloud = require('wx-server-sdk');
      const queryProgress = require('../index');

      const result = await queryProgress.main({
        task_id: 'task_nonexistent'
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });
  });
});
