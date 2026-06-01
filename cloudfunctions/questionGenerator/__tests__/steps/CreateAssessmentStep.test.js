/**
 * CreateAssessmentStep 单元测试
 *
 * TDD: 修复回滚逻辑过于宽泛的问题
 */

const { CreateAssessmentStep } = require('../../workflow/steps/CreateAssessmentStep');
const { STEP_OUTPUT_KEYS } = require('../../workflow/constants');

describe('CreateAssessmentStep - 回滚逻辑', () => {
  let step;
  let mockDb;
  let mockCtx;

  beforeEach(() => {
    step = new CreateAssessmentStep();

    mockDb = {
      collection: jest.fn(),
      command: {
        in: jest.fn((arr) => ({ $in: arr }))
      }
    };

    mockCtx = {
      task: {
        _id: 'task_123',
        student_id: 'student_456',
        subject: 'math',
        grade: '7',
        semester: '下'
      },
      db: mockDb,
      state: new Map([
        [STEP_OUTPUT_KEYS.QUESTION_IDS, ['q1', 'q2', 'q3']]
      ]),
      getRequired: jest.fn((key) => {
        if (key === STEP_OUTPUT_KEYS.QUESTION_IDS) {
          return ['q1', 'q2', 'q3'];
        }
        throw new Error(`Unknown key: ${key}`);
      })
    };
  });

  describe('rollback - 精确回滚测试', () => {
    test('应只删除本任务创建的assessment（使用question_ids精确匹配）', async () => {
      const mockCollection = {
        where: jest.fn().mockReturnThis(),
        remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } })
      };

      mockDb.collection.mockReturnValue(mockCollection);

      await step.rollback(mockCtx);

      // 验证调用where时使用了精确的question_ids条件
      expect(mockDb.collection).toHaveBeenCalledWith('assessments');
      expect(mockCollection.where).toHaveBeenCalledWith({
        student_id: 'student_456',
        status: 'ready',
        question_ids: { $in: ['q1', 'q2', 'q3'] }  // db.command.in()返回{$in: Array}格式
      });
      expect(mockCollection.remove).toHaveBeenCalled();
    });

    test('并发场景下不应误删其他任务的assessment', async () => {
      // 模拟数据库中有多个assessment记录
      const mockCollection = {
        where: jest.fn().mockReturnThis(),
        remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } })
      };

      mockDb.collection.mockReturnValue(mockCollection);

      // 任务A的question_ids
      const taskAQuestionIds = ['q1', 'q2', 'q3'];
      mockCtx.getRequired.mockReturnValue(taskAQuestionIds);

      await step.rollback(mockCtx);

      // 验证只删除了匹配question_ids的assessment
      // 如果只使用student_id和status，会删除所有学生的ready状态assessment
      const whereClause = mockCollection.where.mock.calls[0][0];

      expect(whereClause).toHaveProperty('student_id');
      expect(whereClause).toHaveProperty('status');
      expect(whereClause).toHaveProperty('question_ids');
      // db.command.in()返回{$in: Array}格式
      expect(whereClause.question_ids).toEqual({ $in: taskAQuestionIds });
    });
  });

  describe('execute - 正常流程', () => {
    test('应成功创建assessment并返回assessment_id', async () => {
      const assessmentId = 'assessment_789';
      const mockCollection = {
        add: jest.fn().mockResolvedValue({ _id: assessmentId })
      };

      mockDb.collection.mockReturnValue(mockCollection);

      const result = await step.execute(mockCtx);

      expect(result).toEqual({
        success: true,
        data: {
          [STEP_OUTPUT_KEYS.ASSESSMENT_ID]: assessmentId
        }
      });

      expect(mockCollection.add).toHaveBeenCalledWith({
        data: {
          student_id: 'student_456',
          subject: 'math',
          grade: '7',
          semester: '下',
          mode: undefined,
          question_ids: ['q1', 'q2', 'q3'],
          status: 'ready',
          created_at: expect.any(String)
        }
      });
    });

    test('应处理空question_ids的情况', async () => {
      mockCtx.getRequired.mockReturnValue([]);

      const result = await step.execute(mockCtx);

      expect(result).toEqual({
        success: false,
        shouldAbort: false,
        error: expect.any(Error)
      });
      expect(result.error.message).toBe('No question IDs to link');
    });

    test('应处理数据库错误并触发回滚', async () => {
      const dbError = new Error('Database connection failed');
      const mockCollection = {
        add: jest.fn().mockRejectedValue(dbError)
      };

      mockDb.collection.mockReturnValue(mockCollection);

      const result = await step.execute(mockCtx);

      expect(result).toEqual({
        success: false,
        shouldAbort: true, // 应触发回滚
        error: dbError
      });
    });
  });
});
