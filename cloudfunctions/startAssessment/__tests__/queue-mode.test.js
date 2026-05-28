/**
 * startAssessment 队列模式测试 (TDD Red-Green-Refactor)
 * 功能：支持异步队列生成题目
 */

const {
  checkQueueForStudent,
  createQueueTask,
  shouldUseQueueMode,
  formatQueuedResponse
} = require('../queue_manager');

describe('startAssessment - Queue Mode', () => {

  describe('shouldUseQueueMode', () => {
    test('should return true when AI questions needed and num_questions > 10', () => {
      const poolQuestionCount = 5;
      const totalNeeded = 20;

      const result = shouldUseQueueMode(poolQuestionCount, totalNeeded);

      expect(result).toBe(true);
    });

    test('should return false when pool has enough questions', () => {
      const poolQuestionCount = 20;
      const totalNeeded = 20;

      const result = shouldUseQueueMode(poolQuestionCount, totalNeeded);

      expect(result).toBe(false);
    });

    test('should return false when num_questions is small (<=10)', () => {
      const poolQuestionCount = 5;
      const totalNeeded = 10;

      const result = shouldUseQueueMode(poolQuestionCount, totalNeeded);

      expect(result).toBe(false);
    });
  });

  describe('checkQueueForStudent', () => {
    test('should return completed task with assessment_id', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              limit: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  data: [
                    {
                      _id: 'queue_123',
                      status: 'completed',
                      generated_assessment_id: 'assessment_456'
                    }
                  ]
                })
              }))
            }))
          }))
        })),
        command: {
          in: jest.fn((arr) => arr)
        }
      };

      const result = await checkQueueForStudent(mockDb, 'student_123');

      expect(result.found).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.assessment_id).toBe('assessment_456');
    });

    test('should return pending task when queue exists but not ready', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              limit: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  data: [
                    {
                      _id: 'queue_123',
                      status: 'processing',
                      created_at: new Date().toISOString()
                    }
                  ]
                })
              }))
            }))
          }))
        })),
        command: {
          in: jest.fn((arr) => arr)
        }
      };

      const result = await checkQueueForStudent(mockDb, 'student_123');

      expect(result.found).toBe(true);
      expect(result.status).toBe('processing');
      expect(result.assessment_id).toBeUndefined();
    });

    test('should return not found when no queue exists', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              limit: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ data: [] })
              }))
            }))
          }))
        }))
      };

      const result = await checkQueueForStudent(mockDb, 'student_123');

      expect(result.found).toBe(false);
    });
  });

  describe('createQueueTask', () => {
    test('should create queue task with correct parameters', async () => {
      const mockAdd = jest.fn().mockResolvedValue({ _id: 'queue_123' });
      const mockDb = {
        collection: jest.fn(() => ({
          add: mockAdd
        }))
      };

      const taskData = {
        student_id: 'student_123',
        subject: 'biology',
        grade: '7',
        semester: 'down',
        mode: 'quick',
        num_questions: 20,
        difficulty_distribution: { easy: 0.5, medium: 0.3, hard: 0.2 }
      };

      const result = await createQueueTask(mockDb, taskData);

      expect(result.success).toBe(true);
      expect(result.queue_id).toBeDefined();
      expect(mockAdd).toHaveBeenCalledWith({
        data: expect.objectContaining({
          student_id: 'student_123',
          status: 'pending',
          priority: 1
        })
      });
    });
  });

  describe('formatQueuedResponse', () => {
    test('should format queued response with queue_id', () => {
      const queueId = 'queue_123';
      const status = 'pending';

      const response = formatQueuedResponse(queueId, status);

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('queued');
      expect(response.data.queue_id).toBe(queueId);
      expect(response.data.message).toContain('生成中');
    });

    test('should format ready response when completed', () => {
      const queueId = 'queue_123';
      const status = 'completed';
      const assessmentId = 'assessment_456';

      const response = formatQueuedResponse(queueId, status, assessmentId);

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('ready');
      expect(response.data.assessment_id).toBe(assessmentId);
    });
  });
});
