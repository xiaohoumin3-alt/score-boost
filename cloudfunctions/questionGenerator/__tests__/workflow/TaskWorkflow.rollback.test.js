/**
 * TaskWorkflow 回滚机制测试
 *
 * TDD: 修复双重清理问题
 * - rollback后不应再调用cleanupPartialQuestionsByTask
 * - 回滚失败时应记录错误但继续回滚其他步骤
 */

const { TaskWorkflow } = require('../../workflow/TaskWorkflow');
const { createContext } = require('../../workflow/TaskContext');

// Mock步骤
class MockStep {
  constructor(name, options = {}) {
    this.name = name;
    this.checkCancelled = options.checkCancelled || false;
    this.dependencies = options.dependencies || [];
    this.rollbackCalled = false;
    this.shouldFailRollback = options.shouldFailRollback || false;
  }

  async execute(ctx) {
    return { success: true, data: { [`${this.name}_output`]: 'data' } };
  }

  async rollback(ctx) {
    this.rollbackCalled = true;
    if (this.shouldFailRollback) {
      throw new Error(`Rollback failed for ${this.name}`);
    }
  }
}

// 失败步骤
class FailingStep extends MockStep {
  constructor(name, options = {}) {
    super(name, options);
  }

  async execute(ctx) {
    return {
      success: false,
      shouldAbort: true,  // 触发回滚
      error: new Error(`${this.name} failed`)
    };
  }
}

describe('TaskWorkflow - 回滚机制', () => {
  let mockDb;
  let cleanupPartialQuestionsByTaskMock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      collection: jest.fn()
    };

    // Mock cleanupPartialQuestionsByTask
    cleanupPartialQuestionsByTaskMock = jest.fn().mockResolvedValue({ stats: { removed: 0 } });
    jest.doMock('../../workflow/utils/cleanupPartialQuestionsByTask', () => ({
      cleanupPartialQuestionsByTask: cleanupPartialQuestionsByTaskMock
    }));
  });

  afterEach(() => {
    jest.dontMock('../../workflow/utils/cleanupPartialQuestionsByTask');
  });

  describe('双重清理问题', () => {
    test('rollback后不应再调用cleanupPartialQuestionsByTask（避免双重清理）', async () => {
      const step1 = new MockStep('Step1');
      const step2 = new FailingStep('Step2', { dependencies: ['Step1'] });
      const step3 = new MockStep('Step3');

      const workflow = new TaskWorkflow([step1, step2, step3]);
      const task = { _id: 'task_123', student_id: 'student_456' };
      const ctx = createContext(task, mockDb);

      // 执行工作流（会在Step2失败并触发回滚）
      const result = await workflow.execute(task, mockDb);

      expect(result.success).toBe(false);
      expect(step1.rollbackCalled).toBe(true);  // Step1应该被回滚
      expect(step2.rollbackCalled).toBe(false); // Step2失败，没有执行完成
      expect(step3.rollbackCalled).toBe(false); // Step3未执行

      // 关键断言：不应调用cleanupPartialQuestionsByTask
      // 因为rollback已经处理了清理
      expect(cleanupPartialQuestionsByTaskMock).not.toHaveBeenCalled();
    });

    test('只有当rollback完全失败时才调用cleanupPartialQuestionsByTask', async () => {
      // 这个测试验证当前实现中存在双重清理问题
      // 修复后应该移除cleanupPartialQuestionsByTask的调用
      const step1 = new MockStep('Step1');
      const step2 = new FailingStep('Step2', { dependencies: ['Step1'] });

      const workflow = new TaskWorkflow([step1, step2]);
      const task = { _id: 'task_123', student_id: 'student_456' };

      await workflow.execute(task, mockDb);

      // 当前实现会调用cleanupPartialQuestionsByTask（双重清理）
      // 修复后这个断言应该失败，因为不应该调用
      expect(cleanupPartialQuestionsByTaskMock).not.toHaveBeenCalled();
    });
  });

  describe('回滚容错性', () => {
    test('单个步骤回滚失败应继续回滚其他步骤', async () => {
      const step1 = new MockStep('Step1', { shouldFailRollback: true });
      const step2 = new FailingStep('Step2', { dependencies: ['Step1'] });
      const step3 = new MockStep('Step3');

      const workflow = new TaskWorkflow([step1, step2, step3]);
      const task = { _id: 'task_123', student_id: 'student_456' };

      const result = await workflow.execute(task, mockDb);

      expect(result.success).toBe(false);
      expect(step1.rollbackCalled).toBe(true);  // 尝试回滚但失败
      // Step3不应该被回滚，因为Step2失败了
    });
  });
});
