/**
 * ai-question-consumer 测试 (TDD Red-Green-Refactor)
 * 功能：从ai_question_pool消费题目
 */

const {
  consumeQuestion,
  findBestMatch
} = require('../ai-question-consumer');

describe('findBestMatch', () => {
  test('should prioritize verified questions', () => {
    const pool = [
      { _id: '1', kp_id: 'kp1', difficulty: 'easy', verified: false, used_count: 0 },
      { _id: '2', kp_id: 'kp1', difficulty: 'easy', verified: true, used_count: 5 }
    ];

    const result = findBestMatch(pool, 'kp1', 'easy');
    expect(result._id).toBe('2'); // verified优先
  });

  test('should prefer lower used_count among verified', () => {
    const pool = [
      { _id: '1', kp_id: 'kp1', difficulty: 'easy', verified: true, used_count: 10 },
      { _id: '2', kp_id: 'kp1', difficulty: 'easy', verified: true, used_count: 2 }
    ];

    const result = findBestMatch(pool, 'kp1', 'easy');
    expect(result._id).toBe('2'); // used_count更低
  });

  test('should return null when no match', () => {
    const pool = [
      { _id: '1', kp_id: 'kp1', difficulty: 'easy', verified: true, used_count: 0 }
    ];

    const result = findBestMatch(pool, 'kp2', 'easy');
    expect(result).toBeNull();
  });
});

describe('consumeQuestion', () => {
  // Mock数据库
  class MockDoc {
    constructor(id, collection) {
      this.id = id;
      this.collection = collection;
    }

    async update({ data }) {
      const item = this.collection.data.find(q => q._id === this.id);
      if (item) {
        Object.assign(item, data);
      }
    }
  }

  class MockCollection {
    constructor() {
      this.data = [];
      this._sortField = null;
      this._sortOrder = 'asc';
    }

    where(cond) {
      this._where = cond;
      return this;
    }

    orderBy(field, order) {
      this._sortField = field;
      this._sortOrder = order;
      return this;
    }

    limit(n) {
      return this;
    }

    async get() {
      const { kp_id, difficulty } = this._where;
      let filtered = this.data.filter(q =>
        q.kp_id === kp_id && q.difficulty === difficulty
      );

      // 排序
      if (this._sortField) {
        const dir = this._sortOrder === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          if (a[this._sortField] < b[this._sortField]) return -1 * dir;
          if (a[this._sortField] > b[this._sortField]) return 1 * dir;
          return 0;
        });
      }

      return { data: filtered };
    }

    doc(id) {
      return new MockDoc(id, this);
    }
  }

  test('should return verified question with lowest used_count', async () => {
    const mockCollection = new MockCollection();
    mockCollection.data = [
      { _id: '1', kp_id: 'kp1', difficulty: 'easy', verified: true, used_count: 5 },
      { _id: '2', kp_id: 'kp1', difficulty: 'easy', verified: true, used_count: 1 }
    ];

    const result = await consumeQuestion(mockCollection, 'kp1', 'easy');
    expect(result._id).toBe('2'); // used_count=1 最小，应该被返回
  });

  test('should increment used_count', async () => {
    const mockCollection = new MockCollection();
    const question = { _id: '1', kp_id: 'kp1', difficulty: 'easy', verified: true, used_count: 5 };
    mockCollection.data = [question];

    const result = await consumeQuestion(mockCollection, 'kp1', 'easy');
    expect(result.used_count).toBe(6); // 5 + 1
  });

  test('should return null when no questions available', async () => {
    const mockCollection = new MockCollection();
    mockCollection.data = [];

    const result = await consumeQuestion(mockCollection, 'kp1', 'easy');
    expect(result).toBeNull();
  });
});
