/**
 * extendedAssessment 云函数测试
 * 覆盖：安全边界、参数校验、Phase 1/2 完整流程、getNextQuestion、completeAssessment
 */

const mockGetWXContext = jest.fn(() => ({ OPENID: 'real_openid' }));
const mockCollection = jest.fn();

const mockCommand = {
  in: jest.fn(v => ({ $in: v })),
  nin: jest.fn(v => ({ $nin: v })),
  push: jest.fn(v => ({ $push: v }))
};

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test-env',
  getWXContext: mockGetWXContext,
  database: jest.fn(() => ({ collection: mockCollection, command: mockCommand })),
  command: mockCommand
}));

function createCollectionMock() {
  const state = {
    add: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    calls: []
  };

  const chain = {
    add: state.add,
    where: criteria => { state.calls.push({ method: 'where', criteria }); state.where(criteria); return chain; },
    limit: count => { state.calls.push({ method: 'limit', count }); state.limit(count); return chain; },
    get: () => { state.calls.push({ method: 'get' }); return state.get(); },
    update: payload => { state.calls.push({ method: 'update', payload }); return state.update(payload); },
    orderBy: () => chain,
    field: () => chain,
    count: () => chain
  };

  return { state, chain };
}

function loadFunction({ extendedSessions, assessments, questionPool, questionQueue } = {}) {
  jest.resetModules();
  mockGetWXContext.mockReturnValue({ OPENID: 'real_openid' });

  const collections = {
    question_queue: questionQueue || createCollectionMock(),
    extended_sessions: extendedSessions || createCollectionMock(),
    assessments: assessments || createCollectionMock(),
    ai_question_pool: questionPool || createCollectionMock()
  };

  if (!questionQueue) {
    collections.question_queue.state.get.mockResolvedValue({ data: [] });
  }

  mockCollection.mockImplementation(name => {
    if (!collections[name]) collections[name] = createCollectionMock();
    return collections[name].chain;
  });

  const cloud = require('wx-server-sdk');
  cloud.getWXContext = mockGetWXContext;
  cloud.database = jest.fn(() => ({ collection: mockCollection, command: mockCommand }));

  return {
    extendedAssessment: require('../cloudfunctions/extendedAssessment/index'),
    collections
  };
}

function createQuestion(overrides = {}) {
  return {
    id: 'q1', content: '1 + 1 = ?', options: ['1', '2', '3', '4'],
    correct_answer: 'B', difficulty: 0, kp_id: 'kp1', kp_name: '加法',
    knowledge_point_id: 'kp1', discrimination: 1.0, guessing: 0.25,
    ...overrides
  };
}

function createPoolQuestion(overrides = {}) {
  return {
    _id: 'pool_q1', question: '2 + 3 = ?', options: ['3', '4', '5', '6'],
    correct_answer: 2, difficulty: 'medium', kp_id: 'kp2', kp_name: '加法进阶',
    grade: '3', subject: 'math', verified: true, correct_rate: 0.7,
    ...overrides
  };
}

function createSession(overrides = {}) {
  return {
    _id: 'ext_session_id', session_id: 'ext_session_id', user_openid: 'real_openid',
    grade: 3, subject: 'math', assessment_type: 'extended',
    phase: 'first', current_question_index: 3,
    phase1: {
      questions: [
        createQuestion({ id: 'q1', correct_answer: 'B', difficulty: -0.5 }),
        createQuestion({ id: 'q2', correct_answer: 0, difficulty: 0 }),
        createQuestion({ id: 'q3', correct_answer: 'C', difficulty: 0.5 })
      ],
      answers: [], completed_at: null
    },
    phase2: { enabled: false, questions: [], answers: [], started_at: null },
    responses: [],
    theta_estimate: 0, std_error: 1.0, fisher_information: 0,
    confidence_interval: null,
    score: { raw: 50, percentile: 50, interpretation: '中等' },
    status: 'initialized', created_at: Date.now(), updated_at: Date.now(),
    ...overrides
  };
}

describe('extendedAssessment 骨架', () => {
  let extendedSessions;

  beforeEach(() => { jest.clearAllMocks(); extendedSessions = createCollectionMock(); });

  test('startExtendedAssessment 使用云上下文 OPENID', async () => {
    extendedSessions.state.add.mockResolvedValue({ _id: 'created' });
    const questionPool = createCollectionMock();
    questionPool.state.get.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => createPoolQuestion({ _id: `pool_q${i}` }))
    });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment', user_openid: 'fake_openid', grade: 3, subject: 'math'
    }, {});

    expect(result.success).toBe(true);
    expect(extendedSessions.state.add.mock.calls[0][0].data.user_openid).toBe('real_openid');
  });

  test('startExtendedAssessment 拒绝无效年级', async () => {
    const { extendedAssessment } = loadFunction({ extendedSessions });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment', grade: 10, subject: 'math'
    }, {});

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_PARAMS');
  });

  test('startExtendedAssessment 拒绝不支持的年级科目组合', async () => {
    const { extendedAssessment } = loadFunction({ extendedSessions });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment', grade: 1, subject: 'physics'
    }, {});

    expect(result.success).toBe(false);
  });

  test('startExtendedAssessment 支持英语 7-9 年级', async () => {
    extendedSessions.state.add.mockResolvedValue({ _id: 'created' });
    const questionPool = createCollectionMock();
    questionPool.state.get.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => createPoolQuestion({ _id: `pool_q${i}`, subject: 'english' }))
    });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment', grade: 8, subject: 'english'
    }, {});

    expect(result.success).toBe(true);
  });

  test('数据库错误不应向客户端暴露内部 message', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    extendedSessions.state.add.mockRejectedValue(new Error('permission denied'));
    const questionPool = createCollectionMock();
    questionPool.state.get.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => createPoolQuestion({ _id: `pool_q${i}` }))
    });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment', grade: 4, subject: 'math'
    }, {});

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DATABASE_ERROR');
    expect(result.error.details).toBeUndefined();
    errorSpy.mockRestore();
  });

  test('未实现接口返回 success false', async () => {
    const { extendedAssessment } = loadFunction({ extendedSessions });

    const result = await extendedAssessment.main({
      action: 'submitAnswers', session_id: 'ext_test',
      answers: [{ question_id: 'q1', answer: 'A' }]
    }, {});

    expect(result.success).toBe(false);
  });

  test('支持 event.data 调用形态', async () => {
    extendedSessions.state.add.mockResolvedValue({ _id: 'created' });
    const questionPool = createCollectionMock();
    questionPool.state.get.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => createPoolQuestion({ _id: `pool_q${i}` }))
    });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      data: { action: 'startExtendedAssessment', grade: 5, subject: 'english' }
    }, {});

    expect(result.success).toBe(true);
  });
});

describe('startExtendedAssessment 自动获取题目', () => {
  let extendedSessions, questionPool;

  beforeEach(() => {
    jest.clearAllMocks();
    extendedSessions = createCollectionMock();
    questionPool = createCollectionMock();
  });

  test('应该从 ai_question_pool 获取题目并返回', async () => {
    extendedSessions.state.add.mockResolvedValue({ _id: 'created' });
    questionPool.state.get.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => createPoolQuestion({ _id: `pool_q${i}` }))
    });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment', grade: 3, subject: 'math'
    }, {});

    expect(result.success).toBe(true);
    expect(result.questions).toBeDefined();
    expect(result.questions.length).toBe(5);
    expect(result.phase).toBe('first');
    expect(result.target_se).toBe(0.3);
    expect(result.questions[0].correct_answer).toBeUndefined();
  });

  test('题池为空时应创建生成队列并返回 queued', async () => {
    questionPool.state.get.mockResolvedValue({ data: [] });
    const questionQueue = createCollectionMock();
    questionQueue.state.get.mockResolvedValue({ data: [] });
    questionQueue.state.add.mockResolvedValue({ _id: 'queue_123' });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool, questionQueue });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment', grade: 3, subject: 'math'
    }, {});

    expect(result.success).toBe(true);
    expect(result.status).toBe('queued');
    expect(result.queue_id).toBe('queue_123');
    expect(extendedSessions.state.add).not.toHaveBeenCalled();
    expect(questionQueue.state.add).toHaveBeenCalled();
  });

  test('after_queue_id 应读取队列顶层 question_ids 创建 session', async () => {
    const questionQueue = createCollectionMock();
    questionQueue.state.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{
          _id: 'queue_done',
          status: 'completed',
          question_ids: ['q1', 'q2', 'q3', 'q4', 'q5']
        }]
      });
    questionPool.state.get.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => createPoolQuestion({ _id: `q${i + 1}` }))
    });
    extendedSessions.state.add.mockResolvedValue({ _id: 'created' });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool, questionQueue });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment',
      grade: 3,
      subject: 'math',
      after_queue_id: 'queue_done'
    }, {});

    expect(result.success).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.questions).toHaveLength(5);
  });

  test('after_queue_id 应读取 result.question_ids 创建 session', async () => {
    const questionQueue = createCollectionMock();
    questionQueue.state.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{
          _id: 'queue_done',
          status: 'completed',
          result: { question_ids: ['q1', 'q2', 'q3', 'q4', 'q5'] }
        }]
      });
    questionPool.state.get.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => createPoolQuestion({ _id: `q${i + 1}` }))
    });
    extendedSessions.state.add.mockResolvedValue({ _id: 'created' });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool, questionQueue });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment',
      grade: 3,
      subject: 'math',
      after_queue_id: 'queue_done'
    }, {});

    expect(result.success).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.questions).toHaveLength(5);
  });

  test('after_queue_id 应在 result.question_ids 为空时回退读取顶层 question_ids', async () => {
    const questionQueue = createCollectionMock();
    questionQueue.state.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{
          _id: 'queue_done',
          status: 'completed',
          result: { question_ids: [] },
          question_ids: ['q1', 'q2', 'q3', 'q4', 'q5']
        }]
      });
    questionPool.state.get.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => createPoolQuestion({ _id: `q${i + 1}` }))
    });
    extendedSessions.state.add.mockResolvedValue({ _id: 'created' });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool, questionQueue });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment',
      grade: 3,
      subject: 'math',
      after_queue_id: 'queue_done'
    }, {});

    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(5);
  });

  test('返回的题目不应包含 correct_answer', async () => {
    extendedSessions.state.add.mockResolvedValue({ _id: 'created' });
    questionPool.state.get.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => createPoolQuestion({ _id: `pool_q${i}` }))
    });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'startExtendedAssessment', grade: 3, subject: 'math'
    }, {});

    expect(JSON.stringify(result)).not.toContain('correct_answer');
  });
});

describe('submitPhase1Answers TDD 合同', () => {
  let extendedSessions, assessments;

  beforeEach(() => {
    jest.clearAllMocks();
    extendedSessions = createCollectionMock();
    assessments = createCollectionMock();
  });

  test('使用真实 OPENID 查询会话并忽略客户端伪造身份', async () => {
    extendedSessions.state.get.mockResolvedValue({ data: [] });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'submitPhase1Answers', session_id: 'ext_session_id',
      user_openid: 'victim_openid', answers: [{ question_id: 'q1', answer: 'B' }]
    }, {});

    expect(extendedSessions.state.where).toHaveBeenCalledWith({
      session_id: 'ext_session_id', user_openid: 'real_openid'
    });
    expect(result.success).toBe(false);
  });

  test('成功路径使用服务端内嵌题目判分', async () => {
    extendedSessions.state.get.mockResolvedValue({ data: [createSession()] });
    extendedSessions.state.update.mockResolvedValue({ stats: { updated: 1 } });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'submitPhase1Answers', session_id: 'ext_session_id',
      answers: [
        { question_id: 'q1', answer: 'D', correct_answer: 'D' },
        { questionId: 'q2', selected: 'A' },
        { question_id: 'q3', user_answer: 'C' }
      ]
    }, {});

    expect(result.success).toBe(true);
    expect(result.data.phase1_summary).toEqual(expect.objectContaining({ total: 3, correct_count: 2 }));
    expect(JSON.stringify(result)).not.toContain('correct_answer');
    expect(extendedSessions.state.update).toHaveBeenCalledTimes(1);
  });

  test('phase1.questions 为空时应拒绝', async () => {
    extendedSessions.state.get.mockResolvedValue({
      data: [createSession({ phase1: { questions: [], answers: [], completed_at: null } })]
    });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'submitPhase1Answers', session_id: 'ext_session_id',
      answers: [{ question_id: 'q1', answer: 'B' }]
    }, {});

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('PHASE1_QUESTIONS_NOT_READY');
  });

  test.each([
    ['空数组', []],
    ['少答', [{ question_id: 'q1', answer: 'B' }]],
    ['多答', [{ question_id: 'q1', answer: 'B' }, { question_id: 'q2', answer: 'A' }, { question_id: 'q3', answer: 'C' }, { question_id: 'q4', answer: 'D' }]],
    ['非法答案', [{ question_id: 'q1', answer: 'E' }, { question_id: 'q2', answer: 'A' }, { question_id: 'q3', answer: 'C' }]],
    ['重复题号', [{ question_id: 'q1', answer: 'B' }, { question_id: 'q1', answer: 'A' }, { question_id: 'q3', answer: 'C' }]],
    ['未知题号', [{ question_id: 'q1', answer: 'B' }, { question_id: 'q2', answer: 'A' }, { question_id: 'q9', answer: 'C' }]]
  ])('答案格式错误：%s', async (name, answers) => {
    extendedSessions.state.get.mockResolvedValue({ data: [createSession()] });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'submitPhase1Answers', session_id: 'ext_session_id', answers
    }, {});

    expect(result.success).toBe(false);
    expect(['INVALID_ANSWER_FORMAT', 'INVALID_PARAMS']).toContain(result.error.code);
  });

  test('phase1 已完成时幂等返回', async () => {
    const completedSession = createSession({
      status: 'phase1_completed',
      theta_estimate: 1, std_error: 0.4, fisher_information: 6.25,
      score: { raw: 84, percentile: 84, interpretation: '中等偏上' },
      phase1: {
        questions: [createQuestion({ id: 'q1' })],
        answers: [{ question_id: 'q1', user_answer: 'B', is_correct: true }],
        summary: { total: 1, correct_count: 1, accuracy: 1 }, completed_at: Date.now()
      }
    });
    extendedSessions.state.get.mockResolvedValue({ data: [completedSession] });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'submitPhase1Answers', session_id: 'ext_session_id',
      answers: [{ question_id: 'q1', answer: 'A' }]
    }, {});

    expect(result.success).toBe(true);
    expect(extendedSessions.state.update).not.toHaveBeenCalled();
  });

  test('条件更新失败返回 CONFLICT', async () => {
    extendedSessions.state.get.mockResolvedValue({ data: [createSession()] });
    extendedSessions.state.update.mockResolvedValue({ stats: { updated: 0 } });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'submitPhase1Answers', session_id: 'ext_session_id',
      answers: [
        { question_id: 'q1', answer: 'B' }, { question_id: 'q2', answer: 'A' }, { question_id: 'q3', answer: 'C' }
      ]
    }, {});

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('CONFLICT');
  });

  test('数据库错误脱敏', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    extendedSessions.state.get.mockRejectedValue(new Error('permission denied: extended_sessions'));
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'submitPhase1Answers', session_id: 'ext_session_id',
      answers: [{ question_id: 'q1', answer: 'B' }]
    }, {});

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DATABASE_ERROR');
    expect(JSON.stringify(result)).not.toContain('permission denied');
    errorSpy.mockRestore();
  });

  test('返回应包含 accuracy_meter', async () => {
    extendedSessions.state.get.mockResolvedValue({ data: [createSession()] });
    extendedSessions.state.update.mockResolvedValue({ stats: { updated: 1 } });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'submitPhase1Answers', session_id: 'ext_session_id',
      answers: [
        { question_id: 'q1', answer: 'B' }, { question_id: 'q2', answer: 'A' }, { question_id: 'q3', answer: 'C' }
      ]
    }, {});

    expect(result.success).toBe(true);
    expect(result.data.accuracy_meter).toBeDefined();
    expect(result.data.accuracy_meter.current).toBeDefined();
  });
});

describe('getNextQuestion', () => {
  let extendedSessions, questionPool;

  beforeEach(() => {
    jest.clearAllMocks();
    extendedSessions = createCollectionMock();
    questionPool = createCollectionMock();
  });

  test('phase1_completed 状态应返回下一题', async () => {
    const session = createSession({
      status: 'phase1_completed', theta_estimate: 0, std_error: 0.8,
      phase1: { questions: [createQuestion({ id: 'q1' })], answers: [{ question_id: 'q1', is_correct: true }], completed_at: Date.now() }
    });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    extendedSessions.state.update.mockResolvedValue({ stats: { updated: 1 } });
    questionPool.state.get.mockResolvedValue({
      data: [createPoolQuestion({ _id: 'pool_q2' })]
    });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'getNextQuestion', session_id: 'ext_session_id'
    }, {});

    expect(result.success).toBe(true);
    expect(result.question).toBeDefined();
    expect(result.question.correct_answer).toBeUndefined();
    expect(result.current_se).toBe(0.8);
    expect(result.progress).toBeDefined();
  });

  test('completed 状态应返回 ASSESSMENT_COMPLETED', async () => {
    const session = createSession({ status: 'completed' });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'getNextQuestion', session_id: 'ext_session_id'
    }, {});

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('ASSESSMENT_COMPLETED');
  });

  test('SE ≤ TARGET_SE 时应返回 TARGET_REACHED', async () => {
    const session = createSession({
      status: 'extending', std_error: 0.25,
      phase1: { questions: [createQuestion({ id: 'q1' })], answers: [{ question_id: 'q1', is_correct: true }], completed_at: Date.now() }
    });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'getNextQuestion', session_id: 'ext_session_id'
    }, {});

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('TARGET_REACHED');
  });

  test('题库无更多题目返回 INSUFFICIENT_QUESTIONS', async () => {
    const session = createSession({
      status: 'extending', std_error: 0.8,
      phase1: { questions: [createQuestion({ id: 'q1' })], answers: [{ question_id: 'q1', is_correct: true }], completed_at: Date.now() }
    });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    questionPool.state.get.mockResolvedValue({ data: [] });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'getNextQuestion', session_id: 'ext_session_id'
    }, {});

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INSUFFICIENT_QUESTIONS');
  });
});

describe('submitAnswers Phase 2', () => {
  let extendedSessions, questionPool;

  beforeEach(() => {
    jest.clearAllMocks();
    extendedSessions = createCollectionMock();
    questionPool = createCollectionMock();
  });

  test('extending 状态应接受答案并更新 IRT', async () => {
    const session = createSession({
      status: 'extending', std_error: 0.8,
      phase1: { questions: [createQuestion({ id: 'q1' })], answers: [{ question_id: 'q1', is_correct: true }], completed_at: Date.now() },
      phase2: {
        enabled: true, started_at: Date.now(),
        questions: [createQuestion({ id: 'pool_q2', correct_answer: 'B', difficulty: 0.3 })],
        answers: []
      },
      responses: [{ question_id: 'q1', is_correct: true, difficulty: 0 }]
    });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    extendedSessions.state.update.mockResolvedValue({ stats: { updated: 1 } });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'submitAnswers', session_id: 'ext_session_id',
      answers: [{ question_id: 'pool_q2', answer: 'B' }]
    }, {});

    expect(result.success).toBe(true);
    expect(result.data.current_se).toBeDefined();
    expect(result.data.recommendation).toBeDefined();
    expect(result.data.accuracy_meter).toBeDefined();
  });

  test('重复提交已答 Phase 2 题目不应重复追加 answers/responses', async () => {
    const session = createSession({
      status: 'extending', std_error: 0.8,
      phase1: { questions: [createQuestion({ id: 'q1' })], answers: [{ question_id: 'q1', is_correct: true }], completed_at: Date.now() },
      phase2: {
        enabled: true, started_at: Date.now(),
        questions: [createQuestion({ id: 'pool_q2', correct_answer: 'B', difficulty: 0.3 })],
        answers: [{ question_id: 'pool_q2', user_answer: 'B', is_correct: true, answered_at: 1000 }]
      },
      responses: [
        { question_id: 'q1', is_correct: true, difficulty: 0 },
        { question_id: 'pool_q2', is_correct: true, difficulty: 0.3, answered_at: 1000 }
      ]
    });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    extendedSessions.state.update.mockResolvedValue({ stats: { updated: 1 } });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'submitAnswers', session_id: 'ext_session_id',
      answers: [{ question_id: 'pool_q2', answer: 'B' }]
    }, {});

    expect(result.success).toBe(true);
    expect(extendedSessions.state.update).not.toHaveBeenCalled();
  });

  test('initialized 状态应返回 INVALID_STATUS', async () => {
    const session = createSession({ status: 'initialized' });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    const { extendedAssessment } = loadFunction({ extendedSessions, questionPool });

    const result = await extendedAssessment.main({
      action: 'submitAnswers', session_id: 'ext_session_id',
      answers: [{ question_id: 'q1', answer: 'B' }]
    }, {});

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_STATUS');
  });
});

describe('completeAssessment', () => {
  let extendedSessions, assessments;

  beforeEach(() => {
    jest.clearAllMocks();
    extendedSessions = createCollectionMock();
    assessments = createCollectionMock();
  });

  test('extending 状态应完成测评并生成报告', async () => {
    const session = createSession({
      status: 'extending', theta_estimate: 0.5, std_error: 0.35, fisher_information: 8.16,
      confidence_interval: { lower: -0.19, upper: 1.19 },
      phase1: {
        questions: [createQuestion({ id: 'q1', difficulty: -0.5 }), createQuestion({ id: 'q2', difficulty: 0 })],
        answers: [{ question_id: 'q1', is_correct: true }, { question_id: 'q2', is_correct: false }],
        completed_at: Date.now()
      },
      phase2: { enabled: true, questions: [createQuestion({ id: 'q3', difficulty: 0.5 })], answers: [{ question_id: 'q3', is_correct: true }], started_at: Date.now() },
      responses: [
        { question_id: 'q1', is_correct: true, difficulty: -0.5 },
        { question_id: 'q2', is_correct: false, difficulty: 0 },
        { question_id: 'q3', is_correct: true, difficulty: 0.5 }
      ]
    });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    extendedSessions.state.update.mockResolvedValue({ stats: { updated: 1 } });
    assessments.state.add.mockResolvedValue({ _id: 'created' });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'completeAssessment', session_id: 'ext_session_id'
    }, {});

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('completed');
    expect(result.data.final_score).toBeDefined();
    expect(result.data.final_theta).toBeDefined();
    expect(result.data.final_se).toBeDefined();
    expect(result.data.confidence_interval).toBeDefined();
    expect(result.data.detailed_report).toBeDefined();
    expect(result.data.detailed_report.total_questions).toBe(3);
    expect(result.data.detailed_report.correct_count).toBe(2);
    expect(result.data.detailed_report.extended_questions).toBe(1);
  });

  test('completed 状态应幂等返回', async () => {
    const session = createSession({
      status: 'completed', final_score: 75, final_theta: 0.5, final_se: 0.3,
      detailed_report: { total_questions: 3, correct_count: 2, extended_questions: 1, fisher_information: 8 }
    });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'completeAssessment', session_id: 'ext_session_id'
    }, {});

    expect(result.success).toBe(true);
    expect(result.data.final_score).toBe(75);
    expect(extendedSessions.state.update).not.toHaveBeenCalled();
  });

  test('应同步写入 assessments 集合', async () => {
    const session = createSession({
      status: 'extending', theta_estimate: 0.5, std_error: 0.35, fisher_information: 8,
      confidence_interval: { lower: -0.19, upper: 1.19 },
      phase1: { questions: [createQuestion({ id: 'q1' })], answers: [{ question_id: 'q1', is_correct: true }], completed_at: Date.now() },
      phase2: { enabled: true, questions: [], answers: [], started_at: Date.now() },
      responses: [{ question_id: 'q1', is_correct: true, difficulty: 0 }]
    });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    extendedSessions.state.update.mockResolvedValue({ stats: { updated: 1 } });
    assessments.state.add.mockResolvedValue({ _id: 'created' });
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'completeAssessment', session_id: 'ext_session_id'
    }, {});

    expect(result.success).toBe(true);
    expect(assessments.state.add).toHaveBeenCalledTimes(1);
    const assessmentData = assessments.state.add.mock.calls[0][0].data;
    expect(assessmentData.assessment_type).toBe('extended');
    expect(assessmentData.session_id).toBe('ext_session_id');
    expect(assessmentData.openid).toBe('real_openid');
  });

  test('assessments 同步失败不应阻断主流程', async () => {
    const session = createSession({
      status: 'extending', theta_estimate: 0.5, std_error: 0.35, fisher_information: 8,
      confidence_interval: { lower: -0.19, upper: 1.19 },
      phase1: { questions: [createQuestion({ id: 'q1' })], answers: [{ question_id: 'q1', is_correct: true }], completed_at: Date.now() },
      phase2: { enabled: true, questions: [], answers: [], started_at: Date.now() },
      responses: [{ question_id: 'q1', is_correct: true, difficulty: 0 }]
    });
    extendedSessions.state.get.mockResolvedValue({ data: [session] });
    extendedSessions.state.update.mockResolvedValue({ stats: { updated: 1 } });
    assessments.state.add.mockRejectedValue(new Error('permission denied'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { extendedAssessment } = loadFunction({ extendedSessions, assessments });

    const result = await extendedAssessment.main({
      action: 'completeAssessment', session_id: 'ext_session_id'
    }, {});

    expect(result.success).toBe(true);
    errorSpy.mockRestore();
  });
});
