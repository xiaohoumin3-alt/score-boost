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
    test('应只删除本任务创建的assessment（使用assessment_id精确匹配）', async () => {
      const mockCollection = {
        where: jest.fn().mockReturnThis(),
        remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } })
      };

      mockDb.collection.mockReturnValue(mockCollection);

      // State 中设置 assessment_id
      mockCtx.state.set(STEP_OUTPUT_KEYS.ASSESSMENT_ID, 'assessment_abc');
      await step.rollback(mockCtx);

      // 验证调用where时使用了精确的assessment_id条件
      expect(mockDb.collection).toHaveBeenCalledWith('assessments');
      expect(mockCollection.where).toHaveBeenCalledWith({
        assessment_id: 'assessment_abc'
      });
      expect(mockCollection.remove).toHaveBeenCalled();
    });

    test('并发场景下不应误删其他任务的assessment', async () => {
      const mockCollection = {
        where: jest.fn().mockReturnThis(),
        remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } })
      };

      mockDb.collection.mockReturnValue(mockCollection);

      mockCtx.state.set(STEP_OUTPUT_KEYS.ASSESSMENT_ID, 'assessment_xyz');
      await step.rollback(mockCtx);

      // 验证使用 assessment_id 精确匹配，不会误删其他任务
      const whereClause = mockCollection.where.mock.calls[0][0];
      expect(whereClause).toHaveProperty('assessment_id');
      expect(whereClause.assessment_id).toBe('assessment_xyz');
    });
  });

  describe('execute - 正常流程', () => {
    test('应成功创建assessment并返回assessment_id', async () => {
      const mockCollection = {
        add: jest.fn().mockResolvedValue({ _id: 'db_record_id' })
      };

      mockDb.collection.mockReturnValue(mockCollection);

      const result = await step.execute(mockCtx);

      expect(result.success).toBe(true);
      // 返回的是生成的UUID格式assessment_id, 不是传入的固定值
      expect(result.data[STEP_OUTPUT_KEYS.ASSESSMENT_ID]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );

      expect(mockCollection.add).toHaveBeenCalledWith({
        data: {
          student_id: 'student_456',
          subject: 'math',
          grade: '7',
          semester: '下',
          mode: undefined,
          question_ids: ['q1', 'q2', 'q3'],
          status: 'ready',
          assessment_id: expect.any(String),
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
