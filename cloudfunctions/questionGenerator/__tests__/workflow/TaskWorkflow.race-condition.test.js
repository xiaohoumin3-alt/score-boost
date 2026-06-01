/**
 * TaskWorkflow 状态转换竞态条件测试
 *
 * TDD: 修复取消检测的竞态条件
 * - 步骤执行过程中的取消不应被遗漏
 * - 不应在步骤执行后再次检查取消（避免状态不一致）
 */

const { TaskWorkflow } = require('../../workflow/TaskWorkflow');
const { createContext } = require('../../workflow/TaskContext');

// Mock步骤：执行过程中设置取消标志
class DelayedStep {
  constructor(name, delayMs = 0) {
    this.name = name;
    this.checkCancelled = true;
    this.delayMs = delayMs;
  }

  async execute(ctx) {
    // 模拟耗时操作
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }
    return { success: true, data: { [`${this.name}_output`]: 'data' } };
  }
}

// 失败步骤
class FailingStep {
  constructor(name) {
    this.name = name;
  }

  async execute(ctx) {
    return {
      success: false,
      shouldAbort: true,
      error: new Error(`${this.name} failed`)
    };
  }
}

describe('TaskWorkflow - 状态转换竞态条件', () => {
  let mockDb;
  let task;

  beforeEach(() => {
    jest.clearAllMocks();

    task = {
      _id: 'task_123',
      student_id: 'student_456',
      status: 'pending'
    };

    mockDb = {
      collection: jest.fn()
    };
  });

  describe('取消检测时机', () => {
    test('应在步骤执行前检查取消，执行后不检查（避免竞态）', async () => {
      let cancelledCheckCount = 0;
      mockDb.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            data: { status: 'cancelled' }  // 任务已被取消
          })
        })
      });

      // Mock checkTaskCancelled来计数
      const workflow = new TaskWorkflow([new DelayedStep('Step1')]);
      const originalCheck = workflow.checkTaskCancelled.bind(workflow);
      workflow.checkTaskCancelled = async () => {
        cancelledCheckCount++;
        return await originalCheck(mockDb, task._id);
      };

      const result = await workflow.execute(task, mockDb);

      expect(result.cancelled).toBe(true);
      // 应该只在步骤执行前检查一次，执行后不检查
      expect(cancelledCheckCount).toBe(1);
    });

    test('步骤执行成功后即使任务被取消也不应取消（数据已写入）', async () => {
      let callCount = 0;
      mockDb.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockImplementation(async () => {
            callCount++;
            // 第一次返回未取消，第二次返回已取消
            if (callCount === 1) {
              return { data: { status: 'processing' } };
            }
            return { data: { status: 'cancelled' } };
          })
        })
      });

      const workflow = new TaskWorkflow([new DelayedStep('Step1')]);
      const result = await workflow.execute(task, mockDb);

      // 步骤执行成功，即使后续检测到取消，也应返回成功
      // 数据已经写入，不能回滚
      expect(result.success).toBe(true);
    });
  });

  describe('取消检测一致性', () => {
    test('checkCancelled=false的步骤不检测取消', async () => {
      const step = new DelayedStep('Step1');
      step.checkCancelled = false;  // 不检测取消

      mockDb.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ data: { status: 'cancelled' } })
        })
      });

      const workflow = new TaskWorkflow([step]);
      const result = await workflow.execute(task, mockDb);

      // 步骤不检测取消，所以应该执行成功
      expect(result.success).toBe(true);
    });
  });
});
