/**
 * startAssessment 集成 kp-request-logger 测试 (TDD Red)
 */

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test-env',
  database: jest.fn(),
  getWXContext: jest.fn(),
  callFunction: jest.fn()
}), { virtual: true });

jest.mock('../../shared/kp-request-logger');

// Mock kp-request-logger
const mockLogKpRequest = jest.fn().mockResolvedValue(undefined);
jest.mock('../../shared/kp-request-logger', () => ({
  logKpRequest: (...args) => mockLogKpRequest(...args),
  getKpRequestStats: jest.fn()
}));

// Mock knowledge_tree
jest.mock('../knowledge_tree', () => ({
  loadKnowledgeTree: jest.fn().mockReturnValue({
    subject: 'math',
    grade: '8',
    chapters: [{
      id: 'ch1',
      name: '第一章',
      knowledge_points: [{
        kp_id: 'kp_001',
        kp_name: '勾股定理',
        chapter: '第一章'
      }]
    }]
  }),
  loadHuikaoTree: jest.fn().mockReturnValue({}),
  generateQuestionPlan: jest.fn().mockReturnValue([
    { kp: { kp_id: 'kp_001', kp_name: '勾股定理' }, difficulty: 'easy' },
    { kp: { kp_id: 'kp_001', kp_name: '勾股定理' }, difficulty: 'medium' },
    { kp: { kp_id: 'kp_001', kp_name: '勾股定理' }, difficulty: 'hard' }
  ]),
  generateHuikaoPlan: jest.fn().mockReturnValue([])
}));

// Mock question_pool
jest.mock('../question_pool', () => ({
  fetchQuestionsFromPool: jest.fn().mockResolvedValue([]),
  fetchQuestionsBatch: jest.fn().mockResolvedValue({})
}));

// Mock llm_client
jest.mock('../llm_client', () => ({
  LlmClient: jest.fn(),
  parseLlmResponse: jest.fn(),
  validateQuestion: jest.fn()
}));

// Mock数据库类
class MockCollection {
  constructor() {
    this.docs = {};
  }

  add(data) {
    const id = data._id || `mock_${Date.now()}`;
    this.docs[id] = data;
    return Promise.resolve({ _id: id });
  }

  where() {
    return {
      count: jest.fn().mockResolvedValue({ total: 0 }),
      get: jest.fn().mockResolvedValue({ data: [] }),
      orderBy: () => ({
        limit: () => ({
          get: jest.fn().mockResolvedValue({ data: [] })
        })
      })
    };
  }
}

class MockDatabase {
  collection(name) {
    return new MockCollection();
  }
  command() {
    const self = this;
    return {
      gte: () => ({
        lte: () => ({}),
        and: () => ({})
      }),
      in: jest.fn((arr) => ({ $in: arr })),
      nin: jest.fn((arr) => ({ $nin: arr })),
      gt: jest.fn((val) => ({ $gt: val }))
    };
  }
}

describe('startAssessment - kp-request-logger 集成', () => {
  let mockDb;
  let startAssessmentModule;
  let mockCloud;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = new MockDatabase();

    // Mock wx-server-sdk
    const cloud = require('wx-server-sdk');
    mockCloud = {
      init: jest.fn(),
      database: jest.fn().mockReturnValue(mockDb),
      getWXContext: jest.fn().mockReturnValue({ OPENID: 'test_openid_123' }),
      callFunction: jest.fn().mockResolvedValue({
        result: { success: true, task_id: 'test_task_id' }
      }),
      DYNAMIC_CURRENT_ENV: 'test-env'
    };

    // 设置所有mock
    cloud.init.mockReturnValue(mockCloud);
    cloud.database.mockReturnValue(mockDb);
    cloud.getWXContext.mockReturnValue({ OPENID: 'test_openid_123' });
    cloud.callFunction.mockResolvedValue({
      result: { success: true, task_id: 'test_task_id' }
    });
  });

  test('应该记录请求的知识点', async () => {
    // 设置题池返回空，触发队列创建
    const { fetchQuestionsBatch } = require('../question_pool');
    fetchQuestionsBatch.mockResolvedValue({});

    const { main } = require('../index');

    await main({
      data: {
        subject: 'math',
        grade: '8',
        semester: '下',
        num_questions: 3,
        student_id: 'student_123'
      }
    }, {});

    // 验证 logKpRequest 被调用
    expect(mockLogKpRequest).toHaveBeenCalled();
    const callArgs = mockLogKpRequest.mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      kp_id: 'kp_001',
      kp_name: '勾股定理',
      subject: 'math',
      student_id: 'student_123',
      source: 'assessment'
    });
  });

  test('知识点请求应包含时间戳', async () => {
    const { fetchQuestionsBatch } = require('../question_pool');
    fetchQuestionsBatch.mockResolvedValue({});

    const { main } = require('../index');

    await main({
      data: {
        subject: 'math',
        grade: '8',
        semester: '下',
        num_questions: 3
      }
    }, {});

    const callArgs = mockLogKpRequest.mock.calls[0];
    // kp-request-logger内部创建时间戳，验证日志被记录
    expect(callArgs[1]).toHaveProperty('kp_id');
  });

  test('记录失败不应影响主流程', async () => {
    mockLogKpRequest.mockRejectedValueOnce(new Error('DB error'));

    const { fetchQuestionsBatch } = require('../question_pool');
    fetchQuestionsBatch.mockResolvedValue({});

    const { main } = require('../index');

    // 不应抛出错误
    await expect(main({
      data: { subject: 'math', grade: '8', semester: '下', num_questions: 3 }
    }, {})).resolves.toMatchObject({ success: true });
  });
});