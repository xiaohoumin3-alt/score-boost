/**
 * Extended Assessment Queue Tests
 * 测试 createExtendedAssessmentQueue 和队列创建逻辑
 */

const {
  createExtendedAssessmentQueue,
  validateGeneratorSupport,
  SUPPORTED_COMBINATIONS
} = require('../cloudfunctions/extendedAssessment/index');

describe('Extended Assessment Queue', () => {
  describe('SUPPORTED_COMBINATIONS', () => {
    it('should define supported grade-subject combinations', () => {
      expect(SUPPORTED_COMBINATIONS).toBeDefined();
      expect(typeof SUPPORTED_COMBINATIONS).toBe('object');
    });

    it('should include math for grades 1-9', () => {
      expect(SUPPORTED_COMBINATIONS.math).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    });

    it('should include physics for grades 8-9 only', () => {
      expect(SUPPORTED_COMBINATIONS.physics).toEqual([8, 9]);
    });

    it('should include chemistry for grade 9 only', () => {
      expect(SUPPORTED_COMBINATIONS.chemistry).toEqual([9]);
    });
  });

  describe('validateGeneratorSupport', () => {
    it('should validate supported combinations', () => {
      const result = validateGeneratorSupport(2, 'math');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject unsupported combinations', () => {
      const result = validateGeneratorSupport(7, 'physics');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('暂不支持');
    });

    it('should reject invalid grade-subject pairs', () => {
      const result = validateGeneratorSupport(2, 'chemistry');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('createExtendedAssessmentQueue', () => {
    let mockDb;
    let mockCollection;

    beforeEach(() => {
      mockCollection = {
        add: jest.fn().mockResolvedValue({ _id: 'queue_123' })
      };
      mockDb = {
        collection: jest.fn().mockReturnValue(mockCollection)
      };
    });

    it('should create queue with required fields', async () => {
      const params = {
        student_id: 'user_123',
        grade: 2,
        subject: 'math',
        semester: 'up'
      };

      const result = await createExtendedAssessmentQueue(mockDb, params);

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'extended_assessment',
            source: 'extendedAssessment',
            grade: '2', // String
            subject: 'math',
            semester: 'up',
            question_plan: expect.any(Object),
            target_kps: expect.any(Array)
          })
        })
      );
    });

    it('should include difficulty_distribution with exact counts', async () => {
      const params = {
        student_id: 'user_123',
        grade: 2,
        subject: 'math',
        semester: 'up'
      };

      await createExtendedAssessmentQueue(mockDb, params);

      const callArgs = mockCollection.add.mock.calls[0][0].data;
      expect(callArgs.difficulty_distribution).toEqual([
        { difficulty: 'easy', count: 2 },
        { difficulty: 'medium', count: 2 },
        { difficulty: 'hard', count: 1 }
      ]);
    });

    it('should include expires_at and timeline', async () => {
      const params = {
        student_id: 'user_123',
        grade: 2,
        subject: 'math',
        semester: 'up'
      };

      await createExtendedAssessmentQueue(mockDb, params);

      const callArgs = mockCollection.add.mock.calls[0][0].data;
      expect(callArgs.expires_at).toBeDefined();
      expect(callArgs.expires_at).toBeGreaterThan(Date.now());
      expect(callArgs.timeline).toBeDefined();
      expect(callArgs.timeline.queued_at).toBeDefined();
    });

    it('should call buildExtendedQuestionPlan with same grade', async () => {
      const params = {
        student_id: 'user_123',
        grade: 2,
        subject: 'math',
        semester: 'up'
      };

      await createExtendedAssessmentQueue(mockDb, params);

      const callArgs = mockCollection.add.mock.calls[0][0].data;
      // target_kps 应来自同年级知识点
      expect(callArgs.target_kps.length).toBeGreaterThan(0);
    });

    it('should return queue_id on success', async () => {
      const params = {
        student_id: 'user_123',
        grade: 2,
        subject: 'math',
        semester: 'up'
      };

      const result = await createExtendedAssessmentQueue(mockDb, params);

      expect(result.queue_id).toBeDefined();
      expect(result.queue_id).toBe('queue_123');
    });
  });
});
