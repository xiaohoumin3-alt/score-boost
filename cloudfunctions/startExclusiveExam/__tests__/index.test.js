/**
 * startExclusiveExam 云函数测试
 * TDD: Red-Green-Refactor
 * 测试覆盖：RAG检索、测评创建、配额验证
 */

const cloud = require('wx-server-sdk');

// Mock cloud SDK
jest.mock('wx-server-sdk', () => {
  const mockDB = {
    _data: {
      users: [{ _openid: 'test_openid', vip_status: 'vip', vip_expire_at: '2099-01-01' }],
      materials: [
        { _id: 'material1', openid: 'test_openid', status: 'approved' },
        { _id: 'material2', openid: 'test_openid', status: 'approved' }
      ],
      vectors: [
        { _id: 'chunk1', openid: 'test_openid', material_id: 'material1', content: '知识点1' }
      ],
      exams: [],
      queue: []
    },
    _coll: '',
    collection: function(name) {
      this._coll = name;
      return this;
    },
    where: function(condition) {
      this._where = condition;
      return this;
    },
    field: function(fields) {
      this._fields = fields;
      return this;
    },
    limit: function(n) {
      this._limit = n;
      return this;
    },
    orderBy: function(field, order) {
      this._orderBy = { field, order };
      return this;
    },
    doc: function(id) {
      this._docId = id;
      return this;
    },
    get: function() {
      const coll = this._coll;
      const where = this._where;
      console.log('[Mock] get() 被调用, coll:', coll, '_counting:', this._counting);

      if (coll === 'users') {
        let data = this._data.users;
        if (where && where._openid) {
          data = data.filter(u => u._openid === where._openid);
        }
        return Promise.resolve({ data });
      } else if (coll === 'user_materials') {
        let data = this._data.materials;
        // 处理 _.in() 查询
        if (where && where._id && where._id.$in) {
          data = data.filter(m => where._id.$in.includes(m._id) &&
                            (!where.openid || m.openid === where.openid) &&
                            (!where.status || m.status === where.status));
        }
        return Promise.resolve({ data });
      } else if (coll === 'user_materials_vectors') {
        let data = this._data.vectors;
        if (where && where.material_id && where.material_id.$in) {
          data = data.filter(v => where.material_id.$in.includes(v.material_id) &&
                            (!where.openid || v.openid === where.openid));
        }
        return Promise.resolve({ data });
      } else if (coll === 'user_exams') {
        console.log('[Mock] user_exams get() 被调用');
        return Promise.resolve({ data: this._data.exams });
      }
      return Promise.resolve({ data: [] });
    },
    count: function() {
      console.log('[Mock] count() 被调用, coll:', this._coll);
      // 直接返回结果，不需要调用get()
      const coll = this._coll;
      const where = this._where;

      if (coll === 'user_exams') {
        let data = this._data.exams;
        console.log('[Mock] user_exams count查询, 总记录:', data.length);
        console.log('[Mock] where条件:', JSON.stringify(where));

        if (where) {
          // 过滤openid
          if (where.openid) {
            data = data.filter(e => e.openid === where.openid);
            console.log('[Mock] 过滤openid后:', data.length);
          }
          // 过滤exam_type
          if (where.exam_type) {
            data = data.filter(e => e.exam_type === where.exam_type);
            console.log('[Mock] 过滤exam_type后:', data.length);
          }
          // 处理日期范围查询
          if (where.created_at && where.created_at.$gte) {
            const dateThreshold = new Date(where.created_at.$gte).getTime();
            data = data.filter(e => {
              const createdTime = new Date(e.created_at).getTime();
              return createdTime >= dateThreshold;
            });
            console.log('[Mock] 过滤created_at后:', data.length);
          }
        }

        console.log('[Mock] user_exams count最终结果:', data.length);
        return Promise.resolve({ total: data.length });
      }

      return Promise.resolve({ total: 0 });
    },
    add: function({ data }) {
      const id = 'test_id_' + Math.random().toString(36).substr(2, 9);
      const record = { ...data, _id: id };

      if (this._coll === 'user_exams') {
        this._data.exams.push(record);
      } else if (this._coll === 'question_queue') {
        this._data.queue.push(record);
      }
      return Promise.resolve({ _id: id, id });
    },
    update: function() { return Promise.resolve({ stats: { updated: 1 } }); },
    command: {
      in: jest.fn((val) => ({ $in: val })),
      gte: jest.fn((val) => ({ $gte: val }))
    }
  };

  const mockContext = {
    userInfo: {
      openId: 'test_openid',
      isVip: true
    },
    OPENID: 'test_openid'
  };

  return {
    init: jest.fn(),
    database: jest.fn(() => mockDB),
    getWXContext: jest.fn(() => mockContext)
  };
});

describe('startExclusiveExam 云函数', () => {
  let mockContext;
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    const { getWXContext, database } = require('wx-server-sdk');
    mockContext = getWXContext();
    mockDb = database();

    // 重置数据 - 必须在调用main之前设置
    mockDb._data = {
      users: [{ _openid: 'test_openid', vip_status: 'vip', vip_expire_at: '2099-01-01' }],
      materials: [
        { _id: 'material1', openid: 'test_openid', status: 'approved' },
        { _id: 'material2', openid: 'test_openid', status: 'approved' }
      ],
      vectors: [
        { _id: 'chunk1', openid: 'test_openid', material_id: 'material1', content: '知识点1' },
        { _id: 'chunk2', openid: 'test_openid', material_id: 'material1', content: '知识点2' }
      ],
      exams: [],
      queue: []
    };

    // 重置mock状态
    mockDb._coll = '';
    mockDb._where = null;
    mockDb._fields = null;
    mockDb._limit = null;
    mockDb._orderBy = null;
    mockDb._docId = null;
  });

  describe('Step 6.1: user_exams存储', () => {
    test('应该创建专属测评记录', async () => {
      const { main } = require('../index');

      const result = await main(
        {
          subject: 'math',
          grade: '高一',
          materialIds: ['material1', 'material2'],
          questionCount: 10
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data.exam_id).toBeDefined();
      expect(result.data.status).toBe('pending');
      expect(mockDb._data.exams.length).toBe(1);
      expect(mockDb._data.exams[0].exam_type).toBe('exclusive');
    });

    test('user_exams记录应该包含所有必需字段', async () => {
      const { main } = require('../index');

      await main(
        {
          subject: 'math',
          grade: '高一',
          materialIds: ['material1'],
          questionCount: 10,
          difficulty: 'medium'
        },
        mockContext
      );

      const exam = mockDb._data.exams[0];
      expect(exam).toMatchObject({
        openid: 'test_openid',
        exam_type: 'exclusive',
        material_ids: ['material1'],
        num_questions: 10,
        subject: 'math',
        difficulty: 'medium',
        status: 'pending'
      });
      expect(exam.created_at).toBeDefined();
      expect(exam.grade).toBe('高一');
    });
  });

  describe('Step 6.2: RAG检索逻辑', () => {
    test('应该从user_materials_vectors检索相关chunks', async () => {
      const { main } = require('../index');

      const result = await main(
        {
          subject: 'math',
          grade: '高一',
          materialIds: ['material1'],
          questionCount: 10
        },
        mockContext
      );

      // 验证RAG检索被调用（通过检查exam记录中的rag_chunks_count）
      const exam = mockDb._data.exams[0];
      expect(exam).toBeDefined();
      expect(exam.rag_chunks_count).toBe(mockDb._data.vectors.length);
      expect(result.success).toBe(true);
    });
  });

  describe('Step 6.3: 专属测评创建', () => {
    test('应该验证必填参数', async () => {
      const { main } = require('../index');

      const result = await main({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('MISSING_PARAMS');
    });

    test('应该验证题目数量范围', async () => {
      const { main } = require('../index');

      const result = await main(
        { subject: 'math', grade: '高一', materialIds: ['m1'], questionCount: 0 },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('INVALID_QUESTION_COUNT');
    });

    test('应该验证难度参数', async () => {
      const { main } = require('../index');

      const result = await main(
        { subject: 'math', grade: '高一', materialIds: ['m1'], difficulty: 'invalid' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('INVALID_DIFFICULTY');
    });

    test('应该验证VIP状态', async () => {
      const { main } = require('../index');

      // 设置非VIP用户
      mockDb._data.users = [{ _openid: 'test_openid', vip_status: 'free' }];

      const result = await main(
        {
          subject: 'math',
          grade: '高一',
          materialIds: ['material1']
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('NOT_VIP');
    });

    test('应该验证专属测评配额', async () => {
      const { main } = require('../index');

      // 创建当月1号的时间戳
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // 设置10条当月专属测评记录（达到VIP配额上限）
      const examRecords = Array(10).fill(null).map((_, i) => ({
        openid: 'test_openid',
        exam_type: 'exclusive',
        created_at: new Date(monthStart.getTime() + i * 3600000).toISOString()
      }));

      // 设置exams数据
      mockDb._data.exams = examRecords;

      console.log('[配额测试] 设置exam记录数:', mockDb._data.exams.length);

      const result = await main(
        {
          subject: 'math',
          grade: '高一',
          materialIds: ['material1']
        },
        mockContext
      );

      console.log('[配额测试] result.success:', result.success);
      console.log('[配额测试] result:', JSON.stringify(result, null, 2));

      // VIP配额是10，如果已经有10条记录，应该被拒绝
      expect(result.success).toBe(false);
      expect(result.error_code).toBe('QUOTA_EXCEEDED');
      expect(result.quota_info).toBeDefined();
    });

    test('应该验证资料所有权和审核状态', async () => {
      const { main } = require('../index');

      // 只返回1个材料，但请求了2个
      mockDb._data.materials = [{ _id: 'material1', openid: 'test_openid', status: 'approved' }];

      const result = await main(
        {
          subject: 'math',
          grade: '高一',
          materialIds: ['material1', 'material2'] // material2不存在
        },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('INVALID_MATERIALS');
    });

    test('创建成功后应该关联到question_queue', async () => {
      const { main } = require('../index');

      await main(
        {
          subject: 'math',
          grade: '高一',
          materialIds: ['material1'],
          questionCount: 10
        },
        mockContext
      );

      // 验证创建了队列任务
      expect(mockDb._data.queue.length).toBe(1);
      expect(mockDb._data.queue[0].mode).toBe('exclusive');
      expect(mockDb._data.queue[0].exam_id).toBeDefined();
    });
  });

  describe('Step 6.4: 配置验证', () => {
    test('config.json应该配置超时90s和内存512MB', () => {
      const fs = require('fs');
      const path = require('path');

      const configPath = path.join(__dirname, '../config.json');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);

      expect(config.timeout).toBeGreaterThanOrEqual(90);
      expect(config.memorySize).toBeGreaterThanOrEqual(512);
    });
  });
});
