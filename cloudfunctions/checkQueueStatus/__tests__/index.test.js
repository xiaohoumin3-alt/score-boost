/**
 * checkQueueStatus 云函数测试 (TDD Red-Green-Refactor)
 * 功能：检查question_queue任务状态
 */

const cloud = require('wx-server-sdk');

const {
  checkQueueStatus,
  formatStatusResponse,
  main
} = require('../index');

describe('checkQueueStatus - Queue Status Check', () => {

  describe('checkQueueStatus', () => {
    test('should return pending status for pending task', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                status: 'pending',
                created_at: new Date().toISOString()
              }
            })
          }))
        }))
      };

      const result = await checkQueueStatus(mockDb, 'queue_123');

      expect(result.found).toBe(true);
      expect(result.status).toBe('pending');
      expect(result.assessment_id).toBeUndefined();
    });

    test('should return completed status with assessment_id', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                status: 'completed',
                generated_assessment_id: 'assessment_456',
                created_at: new Date().toISOString()
              }
            })
          }))
        }))
      };

      const result = await checkQueueStatus(mockDb, 'queue_123');

      expect(result.found).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.assessment_id).toBe('assessment_456');
    });

    test('should return completed extended_assessment question_ids from top-level field', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                type: 'extended_assessment',
                status: 'completed',
                question_ids: ['q1', 'q2'],
                created_at: new Date().toISOString()
              }
            })
          }))
        }))
      };

      const result = await checkQueueStatus(mockDb, 'queue_123');

      expect(result.found).toBe(true);
      expect(result.type).toBe('extended_assessment');
      expect(result.question_ids).toEqual(['q1', 'q2']);
    });

    test('should return completed extended_assessment question_ids from result field fallback', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                type: 'extended_assessment',
                status: 'completed',
                result: { question_ids: ['q3', 'q4'] },
                created_at: new Date().toISOString()
              }
            })
          }))
        }))
      };

      const result = await checkQueueStatus(mockDb, 'queue_123');

      expect(result.question_ids).toEqual(['q3', 'q4']);
    });

    test('should fallback to result question_ids when top-level question_ids is empty', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                type: 'extended_assessment',
                status: 'completed',
                question_ids: [],
                result: { question_ids: ['q5', 'q6'] },
                created_at: new Date().toISOString()
              }
            })
          }))
        }))
      };

      const result = await checkQueueStatus(mockDb, 'queue_123');

      expect(result.question_ids).toEqual(['q5', 'q6']);
    });

    test('should return failed status with error message', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                status: 'failed',
                error: 'AI generation failed',
                retry_count: 2,
                created_at: new Date().toISOString()
              }
            })
          }))
        }))
      };

      const result = await checkQueueStatus(mockDb, 'queue_123');

      expect(result.found).toBe(true);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('AI generation failed');
      expect(result.retry_count).toBe(2);
    });

    test('should return not found for non-existent queue', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error('Document not found'))
          }))
        }))
      };

      const result = await checkQueueStatus(mockDb, 'queue_nonexistent');

      expect(result.found).toBe(false);
    });

    test('should return cancelled status', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                status: 'cancelled',
                created_at: new Date().toISOString()
              }
            })
          }))
        }))
      };

      const result = await checkQueueStatus(mockDb, 'queue_123');

      expect(result.found).toBe(true);
      expect(result.status).toBe('cancelled');
    });
  });

  describe('formatStatusResponse', () => {
    test('should format API response for pending status', async () => {
      const statusData = {
        found: true,
        queue_id: 'queue_123',
        status: 'pending',
        created_at: '2026-05-27T00:00:00Z'
      };

      const response = await formatStatusResponse(statusData);

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('pending');
      expect(response.data.queue_id).toBe('queue_123');
    });

    test('should format API response for completed status', async () => {
      const statusData = {
        found: true,
        queue_id: 'queue_123',
        status: 'completed',
        assessment_id: 'assessment_456'
      };

      const response = await formatStatusResponse(statusData);

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('completed');
      expect(response.data.assessment_id).toBe('assessment_456');
    });

    test('should format API response for completed extended_assessment with question_ids', async () => {
      const statusData = {
        found: true,
        queue_id: 'queue_123',
        type: 'extended_assessment',
        status: 'completed',
        question_ids: ['q1', 'q2']
      };

      const response = await formatStatusResponse(statusData);

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('completed');
      expect(response.data.question_ids).toEqual(['q1', 'q2']);
    });

    test('should format API response for not found', async () => {
      const statusData = {
        found: false
      };

      const response = await formatStatusResponse(statusData);

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });
  });

  describe('main ownership security', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      cloud.getWXContext.mockReturnValue({ OPENID: 'user_openid' });
    });

    test('should reject queue status access from another user', async () => {
      cloud.database.mockReturnValue({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                student_id: 'other_openid',
                type: 'extended_assessment',
                status: 'completed',
                question_ids: ['q1']
              }
            })
          }))
        }))
      });

      const response = await main({ queue_id: 'queue_123' }, {});

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    test('should reject queue status when owner field is missing', async () => {
      cloud.database.mockReturnValue({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                type: 'extended_assessment',
                status: 'completed',
                question_ids: ['q1']
              }
            })
          }))
        }))
      });

      const response = await main({ queue_id: 'queue_123' }, {});

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    test('should reject queue status when OPENID is missing', async () => {
      cloud.getWXContext.mockReturnValue({});
      cloud.database.mockReturnValue({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                student_id: 'user_openid',
                type: 'extended_assessment',
                status: 'completed',
                question_ids: ['q1']
              }
            })
          }))
        }))
      });

      const response = await main({ queue_id: 'queue_123' }, {});

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    test('should allow queue owner to read own status', async () => {
      cloud.database.mockReturnValue({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: {
                _id: 'queue_123',
                student_id: 'user_openid',
                type: 'extended_assessment',
                status: 'completed',
                question_ids: ['q1']
              }
            })
          }))
        }))
      });

      const response = await main({ queue_id: 'queue_123' }, {});

      expect(response.success).toBe(true);
      expect(response.data.question_ids).toEqual(['q1']);
    });
  });
});
