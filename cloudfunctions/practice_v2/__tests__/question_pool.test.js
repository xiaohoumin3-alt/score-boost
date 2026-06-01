/**
 * question_pool 模块测试 (TDD Red-Green-Refactor)
 * 功能：从 ai_question_pool 查询题目
 */

const {
  fetchQuestionsFromPool
} = require('../question_pool');

// 模拟数据库
class MockCollection {
  constructor(name) {
    this.name = name;
    this.data = [];
  }

  where(query) {
    this.whereQuery = query;
    return this;
  }

  orderBy(field, order) {
    this.orderField = field;
    this.orderDirection = order;
    return this;
  }

  limit(n) {
    this.limitValue = n;
    return this;
  }

  async get() {
    // 根据查询条件过滤数据
    let results = [...this.data];

    if (this.whereQuery) {
      // verified 过滤
      if (this.whereQuery.verified !== undefined) {
        results = results.filter(r => r.verified === this.whereQuery.verified);
      }

      // kp_id 过滤
      if (this.whereQuery.kp_id) {
        results = results.filter(r => r.kp_id === this.whereQuery.kp_id);
      }

      // difficulty 过滤
      if (this.whereQuery.difficulty) {
        results = results.filter(r => r.difficulty === this.whereQuery.difficulty);
      }

      // correct_rate 过滤 - 处理 db.command.gt(value)
      // where.correct_rate 会被设置为命令值，需要特殊处理
      if (this.whereQuery.correct_rate !== undefined) {
        // 如果是 number 类型且 < 1，说明是 gt(0.5) 的阈值
        if (typeof this.whereQuery.correct_rate === 'number') {
          results = results.filter(r => (r.correct_rate || 0) > this.whereQuery.correct_rate);
        }
      }

      // _id 过滤 - 处理 db.command.nin(array)
      if (this.whereQuery._id !== undefined) {
        if (Array.isArray(this.whereQuery._id)) {
          // nin 排除数组中的 ID
          results = results.filter(r => !this.whereQuery._id.includes(r._id));
        }
      }
    }

    // 按 correct_rate 降序排序
    results.sort((a, b) => (b.correct_rate || 0) - (a.correct_rate || 0));

    // 限制数量
    if (this.limitValue) {
      results = results.slice(0, this.limitValue);
    }

    return { data: results };
  }

  async add({ data }) {
    if (Array.isArray(data)) {
      this.data.push(...data);
    } else {
      this.data.push(data);
    }
    return { _id: 'mock_' + Date.now() };
  }

  doc(id) {
    const self = this;
    return {
      async update({ data }) {
        const record = self.data.find(r => r._id === id);
        if (record) {
          Object.assign(record, data);
        }
      }
    };
  }
}

class MockDatabase {
  constructor() {
    this.collections = {};
    // command 是对象，不是函数
    this.command = {
      gt: (val) => val,  // 返回阈值，用于后续比较
      nin: (arr) => arr  // 返回排除数组
    };
  }

  collection(name) {
    if (!this.collections[name]) {
      this.collections[name] = new MockCollection(name);
    }
    return this.collections[name];
  }
}

describe('fetchQuestionsFromPool', () => {
  let db;

  beforeEach(() => {
    db = new MockDatabase();
    // 添加测试数据
    const aiPool = db.collection('ai_question_pool');
    aiPool.data = [
      { _id: 'q1', kp_id: 'kp1_1', difficulty: 'easy', verified: true, correct_rate: 0.9, question: 'Q1' },
      { _id: 'q2', kp_id: 'kp1_1', difficulty: 'easy', verified: true, correct_rate: 0.8, question: 'Q2' },
      { _id: 'q3', kp_id: 'kp1_1', difficulty: 'easy', verified: false, correct_rate: 0.6, question: 'Q3' },
      { _id: 'q4', kp_id: 'kp1_1', difficulty: 'easy', verified: false, correct_rate: 0.4, question: 'Q4' },
    ];
  });

  test('should fetch verified questions from pool', async () => {
    const questions = await fetchQuestionsFromPool(db, 'kp1_1', 'easy', true, 'user1', [], 2);

    expect(questions.length).toBeGreaterThan(0);
    questions.forEach(q => {
      expect(q.verified).toBe(true);
      expect(q.correct_rate).toBeGreaterThan(0.5);
    });
  });

  test('should filter questions by correct_rate > 0.5', async () => {
    const questions = await fetchQuestionsFromPool(db, 'kp1_1', 'easy', false, 'user1', [], 10);

    questions.forEach(q => {
      expect(q.correct_rate).toBeGreaterThan(0.5);
    });
  });

  test('should update last_used_at for fetched questions', async () => {
    await fetchQuestionsFromPool(db, 'kp1_1', 'easy', true, 'user1', [], 1);

    const aiPool = db.collection('ai_question_pool');
    const updated = aiPool.data.find(q => q.last_used_at);
    expect(updated).toBeDefined();
  });

  test('should record user history for fetched questions', async () => {
    await fetchQuestionsFromPool(db, 'kp1_1', 'easy', true, 'user1', [], 1);

    const userHistory = db.collection('user_question_history');
    expect(userHistory.data.length).toBeGreaterThan(0);

    const record = userHistory.data[0];
    expect(record.user_id).toBe('user1');
    expect(record.question_id).toBeDefined();
  });

  test('should exclude questions from excludeIds', async () => {
    const questions = await fetchQuestionsFromPool(db, 'kp1_1', 'easy', true, 'user1', ['q1'], 10);

    const q1 = questions.find(q => q._id === 'q1');
    expect(q1).toBeUndefined();
  });
});
