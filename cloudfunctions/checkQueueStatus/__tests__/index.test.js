/**
 * checkQueueStatus 云函数测试 (TDD Red-Green-Refactor)
 * 功能：检查question_queue任务状态
 */

const {
  checkQueueStatus,
  formatStatusResponse
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
    test('should format API response for pending status', () => {
      const statusData = {
        found: true,
        queue_id: 'queue_123',
        status: 'pending',
        created_at: '2026-05-27T00:00:00Z'
      };

      const response = formatStatusResponse(statusData);

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('pending');
      expect(response.data.queue_id).toBe('queue_123');
    });

    test('should format API response for completed status', () => {
      const statusData = {
        found: true,
        queue_id: 'queue_123',
        status: 'completed',
        assessment_id: 'assessment_456'
      };

      const response = formatStatusResponse(statusData);

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('completed');
      expect(response.data.assessment_id).toBe('assessment_456');
    });

    test('should format API response for not found', () => {
      const statusData = {
        found: false
      };

      const response = formatStatusResponse(statusData);

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });
  });
});
