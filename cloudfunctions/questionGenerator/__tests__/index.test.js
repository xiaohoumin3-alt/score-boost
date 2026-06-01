/**
 * questionGenerator 云函数测试 (TDD Red-Green-Refactor)
 * 功能：后台定时处理question_queue中的待生成任务
 */

const {
  fetchPendingTasks,
  processTask,
  updateQueueStatus,
  generateQuestionsForTask
} = require('../index');

// 模拟队列任务
const mockPendingTask = {
  _id: 'queue_123',
  student_id: 'student_123',
  openid: 'oHF0C7xxxxx',
  subject: 'biology',
  grade: '7',
  semester: 'down',
  mode: 'quick',
  num_questions: 20,
  difficulty_distribution: { easy: 0.5, medium: 0.3, hard: 0.2 },
  status: 'pending',
  priority: 1,
  created_at: new Date().toISOString()
};

// 模拟数据库集合
class MockQueueCollection {
  constructor() {
    this.tasks = [];
    this._whereFilter = null;
    this._limitCount = null;
  }

  where(condition) {
    this._whereFilter = condition;
    return this;
  }

  orderBy(field, order) {
    return this;
  }

  limit(count) {
    this._limitCount = count;
    return this;
  }

  async get() {
    let result = this.tasks;
    if (this._whereFilter && this._whereFilter.status) {
      result = result.filter(t => t.status === this._whereFilter.status);
    }
    if (this._limitCount) {
      result = result.slice(0, this._limitCount);
    }
    return { data: result };
  }

  doc(id) {
    const self = this;
    return {
      update: async ({ data }) => {
        const task = self.tasks.find(t => t._id === id);
        if (task) {
          Object.assign(task, data);
        }
        return { stats: { updated: 1 } };
      },
      set: async ({ data }) => {
        const taskIndex = self.tasks.findIndex(t => t._id === id);
        if (taskIndex >= 0) {
          self.tasks[taskIndex] = { ...self.tasks[taskIndex], ...data };
        } else {
          self.tasks.push({ _id: id, ...data });
        }
        return { stats: { updated: 1 } };
      },
      get: async () => {
        return { data: self.tasks.find(t => t._id === id) };
      },
      remove: async () => {
        self.tasks = self.tasks.filter(t => t._id !== id);
        return { stats: { removed: 1 } };
      }
    };
  }

  addTask(task) {
    this.tasks.push({ ...task, _id: 'queue_' + this.tasks.length });
  }
}

class MockAiPoolCollection {
  constructor() {
    this.questions = [];
  }

  async add({ data }) {
    if (Array.isArray(data)) {
      this.questions.push(...data);
    } else {
      this.questions.push(data);
    }
    return { _id: 'q_' + this.questions.length };
  }

  where(condition) {
    return this;
  }

  async remove() {
    return { stats: { removed: 1 } };
  }
}

class MockAssessmentCollection {
  constructor() {
    this.assessments = [];
  }

  async add({ data }) {
    this.assessments.push(data);
    return { _id: 'assessment_' + this.assessments.length };
  }

  doc(id) {
    const self = this;
    return {
      remove: async () => {
        self.assessments = self.assessments.filter(a => a._id !== id);
        return { stats: { removed: 1 } };
      }
    };
  }
}

// 模拟数据库
class MockDatabase {
  constructor() {
    this.queue = new MockQueueCollection();
    this.aiPool = new MockAiPoolCollection();
    this.assessments = new MockAssessmentCollection();
  }

  collection(name) {
    switch (name) {
      case 'question_queue': return this.queue;
      case 'ai_question_pool': return this.aiPool;
      case 'assessments': return this.assessments;
      default:
        return {
          add: async () => ({ _id: 'mock' }),
          doc: () => ({ remove: async () => ({ stats: { removed: 1 } }) })
        };
    }
  }
}

describe('questionGenerator - Queue Processing', () => {

  describe('fetchPendingTasks', () => {
    test('should fetch pending tasks ordered by priority and created_at', async () => {
      const db = new MockDatabase();
      db.queue.addTask({ ...mockPendingTask, priority: 2 });
      db.queue.addTask({ ...mockPendingTask, priority: 1 });

      const tasks = await fetchPendingTasks(db, 3);

      expect(tasks).toHaveLength(2);
      // 高优先级应该排在前面
      expect(tasks[0].priority).toBeGreaterThanOrEqual(tasks[1].priority);
    });

    test('should limit results to maxTasks parameter', async () => {
      const db = new MockDatabase();
      for (let i = 0; i < 5; i++) {
        db.queue.addTask({ ...mockPendingTask, _id: `queue_${i}` });
      }

      const tasks = await fetchPendingTasks(db, 3);

      expect(tasks.length).toBeLessThanOrEqual(3);
    });

    test('should return empty array when no pending tasks', async () => {
      const db = new MockDatabase();

      const tasks = await fetchPendingTasks(db, 3);

      expect(tasks).toEqual([]);
    });
  });

  describe('updateQueueStatus', () => {
    test('should update task status to processing', async () => {
      const db = new MockDatabase();
      db.queue.addTask(mockPendingTask);

      await updateQueueStatus(db, 'queue_0', 'processing');

      const updated = db.queue.tasks.find(t => t._id === 'queue_0');
      expect(updated.status).toBe('processing');
    });

    test('should update task status to completed with assessment_id', async () => {
      const db = new MockDatabase();
      db.queue.addTask(mockPendingTask);

      await updateQueueStatus(db, 'queue_0', 'completed', {
        generated_assessment_id: 'assessment_123'
      });

      const updated = db.queue.tasks.find(t => t._id === 'queue_0');
      expect(updated.status).toBe('completed');
      expect(updated.generated_assessment_id).toBe('assessment_123');
    });

    test('should update task status to failed with retry count', async () => {
      const db = new MockDatabase();
      db.queue.addTask(mockPendingTask);

      await updateQueueStatus(db, 'queue_0', 'failed', {
        retry_count: 1,
        error: 'AI generation failed'
      });

      const updated = db.queue.tasks.find(t => t._id === 'queue_0');
      expect(updated.status).toBe('failed');
      expect(updated.retry_count).toBe(1);
      expect(updated.error).toBe('AI generation failed');
    });
  });

  describe('processTask - Integration Test', () => {
    test('should process pending task end-to-end (mock AI)', async () => {
      const db = new MockDatabase();
      db.queue.addTask(mockPendingTask);
      const addedTask = db.queue.tasks[0]; // 获取添加后的任务（ID已生成）

      // Mock AI生成函数
      const mockGenerateAi = jest.fn().mockResolvedValue([
        { _id: 'q_1', question: 'Test question 1' },
        { _id: 'q_2', question: 'Test question 2' }
      ]);

      const result = await processTask(db, addedTask, { generateAi: mockGenerateAi });

      expect(result.success).toBe(true);
      expect(result.assessment_id).toBeDefined();

      // 验证题目已添加到ai_question_pool
      expect(db.aiPool.questions.length).toBeGreaterThan(0);

      // 验证assessment已创建
      expect(db.assessments.assessments.length).toBe(1);

      // 验证队列状态已更新
      const updatedTask = db.queue.tasks.find(t => t._id === addedTask._id);
      expect(updatedTask.status).toBe('completed');
    });

    test('should handle AI generation failure', async () => {
      const db = new MockDatabase();
      db.queue.addTask(mockPendingTask);
      const addedTask = db.queue.tasks[0];

      const mockGenerateAi = jest.fn().mockRejectedValue(new Error('AI service unavailable'));

      const result = await processTask(db, addedTask, { generateAi: mockGenerateAi });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      const updatedTask = db.queue.tasks.find(t => t._id === addedTask._id);
      expect(updatedTask.status).toBe('failed');
    });

    test('should check for cancelled status during processing', async () => {
      // 简化测试：直接在 GenerateStep 前返回 cancelled 状态
      const db = new MockDatabase();
      const task = { ...mockPendingTask, _id: 'queue_cancel' };

      let callCount = 0;
      db.queue.doc = jest.fn((id) => {
        callCount++;
        const taskData = db.queue.tasks.find(t => t._id === id) || task;

        return {
          get: async () => {
            // 第1次调用（InitStateStep.get）返回 pending
            // 第2次调用（InitStateStep.set 前的 check）返回 pending
            // 第3次调用（GenerateStep 前的 check）返回 cancelled
            const status = callCount >= 3 ? 'cancelled' : (taskData && taskData.status) || 'pending';
            return { data: { _id: id, status } };
          },
          set: async ({ data }) => {
            const idx = db.queue.tasks.findIndex(t => t._id === id);
            if (idx >= 0) {
              db.queue.tasks[idx] = { ...db.queue.tasks[idx], ...data };
            }
            return { stats: { updated: 1 } };
          },
          update: async ({ data }) => {
            const idx = db.queue.tasks.findIndex(t => t._id === id);
            if (idx >= 0) {
              Object.assign(db.queue.tasks[idx], data);
            }
            return { stats: { updated: 1 } };
          }
        };
      });

      const mockGenerateAi = jest.fn().mockResolvedValue([{ _id: 'q_1', question: 'Test' }]);

      const result = await processTask(db, task, { generateAi: mockGenerateAi });

      expect(result.cancelled).toBe(true);
      expect(result.success).toBe(false);
    });
  });

  describe('generateQuestionsForTask', () => {
    test('should distribute questions by difficulty', async () => {
      const task = {
        ...mockPendingTask,
        num_questions: 10,
        difficulty_distribution: { easy: 0.5, medium: 0.3, hard: 0.2 }
      };

      const mockGenerateAi = jest.fn().mockResolvedValue([{ _id: 'q_1' }]);

      await generateQuestionsForTask(task, mockGenerateAi);

      // 验证调用了3次（每个难度一次）
      expect(mockGenerateAi).toHaveBeenCalledTimes(3);

      // 验证难度分布
      const calls = mockGenerateAi.mock.calls;
      expect(calls[0][1]).toBe('easy');
      expect(calls[1][1]).toBe('medium');
      expect(calls[2][1]).toBe('hard');
    });
  });
});
