/**
 * migrateQuestionBank 云函数测试 (TDD Red-Green-Refactor)
 * 功能：迁移静态题库到 ai_question_pool
 */

jest.mock('../question_bank', () => ({
  QUESTION_BANK: {
    kp1_1: [
      { content: '测试题1', options: ['A. 选项1', 'B. 选项2'], correct_answer: 'A', difficulty: 'easy' }
    ]
  },
  BIO_QUESTION_BANK: {
    kp1_1: [
      { content: '生物测试题1', options: ['A. 选项1', 'B. 选项2'], correct_answer: 'A', difficulty: 'easy' }
    ]
  },
  GEO_QUESTION_BANK: {
    kp1_1: [
      { content: '地理测试题1', options: ['A. 选项1', 'B. 选项2'], correct_answer: 'A', difficulty: 'easy' }
    ]
  }
}));

const {
  migrateStaticBank
} = require('../index');

// 模拟数据库
class MockCollection {
  constructor(name) {
    this.name = name;
    this.data = [];
  }

  async add({ data }) {
    if (Array.isArray(data)) {
      this.data.push(...data);
    } else {
      this.data.push(data);
    }
    return { _id: 'mock_' + this.name + '_' + this.data.length };
  }

  async get() {
    return { data: this.data };
  }

  where() {
    return this;
  }

  count() {
    return Promise.resolve({ total: this.data.length });
  }
}

class MockDatabase {
  constructor() {
    this.collections = {};
  }

  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new MockCollection(name);
    }
    return this.collections[name];
  }
}

describe('migrateStaticBank', () => {
  test('should migrate math questions to ai_question_pool', async () => {
    const db = new MockDatabase();
    const result = await migrateStaticBank(db, 'math');

    expect(result.success).toBe(true);
    expect(result.migrated).toBeGreaterThan(0);

    const aiPool = db.collection('ai_question_pool');
    const count = await aiPool.count();
    expect(count.total).toBeGreaterThan(0);
  });

  test('should set verified=true for migrated questions', async () => {
    const db = new MockDatabase();
    await migrateStaticBank(db, 'math');

    const aiPool = db.collection('ai_question_pool');
    const records = await aiPool.get();

    records.data.forEach(q => {
      expect(q.verified).toBe(true);
      expect(q.source).toBe('static');
    });
  });

  test('should migrate biology questions', async () => {
    const db = new MockDatabase();
    const result = await migrateStaticBank(db, 'biology');

    expect(result.success).toBe(true);
    expect(result.subject).toBe('biology');
  });

  test('should migrate geography questions', async () => {
    const db = new MockDatabase();
    const result = await migrateStaticBank(db, 'geography');

    expect(result.success).toBe(true);
    expect(result.subject).toBe('geography');
  });

  test('should convert options format from string to object', async () => {
    const db = new MockDatabase();
    await migrateStaticBank(db, 'math');

    const aiPool = db.collection('ai_question_pool');
    const records = await aiPool.get();

    records.data.forEach(q => {
      expect(Array.isArray(q.options)).toBe(true);
      if (q.options.length > 0) {
        expect(q.options[0]).toHaveProperty('key');
        expect(q.options[0]).toHaveProperty('value');
      }
    });
  });
});
