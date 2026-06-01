/**
 * migrateQuestionQueue 云函数测试 (TDD Red-Green-Refactor)
 * 功能：创建question_queue集合索引
 */

const {
  verifyIndexes,
  createIndexes,
  formatConsoleCommands
} = require('../index');

// 模拟数据库集合
class MockCollection {
  constructor(name, hasIndexes = false) {
    this.name = name;
    this.hasIndexes = hasIndexes;
  }

  async getIndexes() {
    if (!this.hasIndexes) {
      // 模拟索引不存在的情况
      return {
        indexes: [
          { _id: '_id_', name: '_id_' }
        ]
      };
    }
    // 模拟索引存在的情况
    return {
      indexes: [
        { _id: '_id_', name: '_id_' },
        {
          _id: 'idx_student_status',
          name: 'student_id_1_status_1_created_at_-1',
          keys: { student_id: 1, status: 1, created_at: -1 }
        },
        {
          _id: 'idx_priority_created',
          name: 'priority_-1_created_at_1',
          keys: { priority: -1, created_at: 1 }
        }
      ]
    };
  }
}

// 模拟数据库
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

  // 设置集合是否有索引（用于测试）
  setCollectionHasIndexes(name, hasIndexes) {
    this.collections[name] = new MockCollection(name, hasIndexes);
  }
}

describe('migrateQuestionQueue - Index Management', () => {

  describe('verifyIndexes - RED Phase', () => {
    test('should fail when question_queue indexes do not exist', async () => {
      const db = new MockDatabase();
      // 默认情况下索引不存在

      const result = await verifyIndexes(db);

      // 断言：索引应该不存在
      expect(result.question_queue_index1).toBe(false);
      expect(result.question_queue_index2).toBe(false);
    });

    test('should pass when both indexes exist', async () => {
      const db = new MockDatabase();
      db.setCollectionHasIndexes('question_queue', true);

      const result = await verifyIndexes(db);

      // 断言：两个索引都应该存在
      expect(result.question_queue_index1).toBe(true);
      expect(result.question_queue_index2).toBe(true);
    });

    test('should handle collection not exists error', async () => {
      const db = new MockDatabase();
      // 模拟getIndexes抛出异常
      db.collection = jest.fn(() => {
        throw new Error('Collection not exists');
      });

      const result = await verifyIndexes(db);

      expect(result.question_queue_index1).toBe(false);
      expect(result.question_queue_index2).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('createIndexes - GREEN Phase', () => {
    test('should return index creation commands for question_queue', () => {
      const commands = createIndexes();

      // 验证返回两个索引创建命令
      expect(commands).toHaveLength(2);

      // 验证第一个索引命令
      expect(commands[0].collection).toBe('question_queue');
      expect(commands[0].name).toContain('student_id');
      expect(commands[0].keys).toEqual({
        student_id: 1,
        status: 1,
        created_at: -1
      });

      // 验证第二个索引命令
      expect(commands[1].collection).toBe('question_queue');
      expect(commands[1].name).toContain('priority');
      expect(commands[1].keys).toEqual({
        priority: -1,
        created_at: 1
      });
    });

    test('should include description for each index', () => {
      const commands = createIndexes();

      commands.forEach(cmd => {
        expect(cmd.description).toBeDefined();
        expect(typeof cmd.description).toBe('string');
        expect(cmd.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('formatConsoleCommands', () => {
    test('should format commands for console execution', () => {
      const commands = formatConsoleCommands();

      expect(commands).toHaveLength(2);

      // 验证命令格式
      expect(commands[0]).toContain('db.collection');
      expect(commands[0]).toContain('question_queue');
      expect(commands[0]).toContain('createIndex');

      expect(commands[1]).toContain('db.collection');
      expect(commands[1]).toContain('question_queue');
      expect(commands[1]).toContain('createIndex');
    });

    test('should produce valid JavaScript commands', () => {
      const commands = formatConsoleCommands();

      commands.forEach(cmd => {
        // 验证命令可以被eval（基本语法检查）
        expect(() => {
          // 只验证语法，不执行
          Function('"use strict";return (' + cmd + ')');
        }).not.toThrow();
      });
    });
  });
});
