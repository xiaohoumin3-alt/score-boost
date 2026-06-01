/**
 * configPermissions 云函数测试 (TDD Red-Green-Refactor)
 * 功能：检查和配置question_queue集合权限
 */

const {
  checkCollectionPermissions,
  testWritePermission,
  getCollectionStats
} = require('../index');

describe('configPermissions - Collection Permissions', () => {

  describe('checkCollectionPermissions', () => {
    test('should return readable status for existing collection', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: [{ _id: 'test_1' }]
            })
          }))
        }))
      };

      const result = await checkCollectionPermissions(mockDb, 'question_queue');

      expect(result.collection).toBe('question_queue');
      expect(result.exists).toBe(true);
      expect(result.readable).toBe(true);
      expect(result.count).toBe(1);
    });

    test('should return error for non-existent collection', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error('Collection not found'))
          }))
        }))
      };

      const result = await checkCollectionPermissions(mockDb, 'nonexistent');

      expect(result.collection).toBe('nonexistent');
      expect(result.exists).toBe(false);
      expect(result.readable).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('testWritePermission', () => {
    test('should test write permission and clean up', async () => {
      const mockRemove = jest.fn().mockResolvedValue({ stats: { removed: 1 } });
      const mockAdd = jest.fn().mockResolvedValue({ _id: 'test_123' });

      const mockDb = {
        collection: jest.fn(() => ({
          add: mockAdd,
          doc: jest.fn((id) => ({
            remove: mockRemove
          }))
        }))
      };

      const result = await testWritePermission(mockDb, 'question_queue');

      expect(result.collection).toBe('question_queue');
      expect(result.writable).toBe(true);
      expect(mockAdd).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
    });

    test('should handle write permission denied', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          add: jest.fn().mockRejectedValue(new Error('Permission denied'))
        }))
      };

      const result = await testWritePermission(mockDb, 'question_queue');

      expect(result.writable).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('getCollectionStats', () => {
    test('should return collection statistics', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          count: jest.fn().mockResolvedValue({ total: 100 }),
          limit: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: [{ _id: 'test_1', status: 'pending' }]
            })
          }))
        }))
      };

      const result = await getCollectionStats(mockDb, 'question_queue');

      expect(result.collection).toBe('question_queue');
      expect(result.total_count).toBe(100);
      expect(result.has_data).toBe(true);
      expect(result.sample).toBeDefined();
    });

    test('should handle empty collection', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          count: jest.fn().mockResolvedValue({ total: 0 }),
          limit: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ data: [] })
          }))
        }))
      };

      const result = await getCollectionStats(mockDb, 'question_queue');

      expect(result.total_count).toBe(0);
      expect(result.has_data).toBe(false);
      expect(result.sample).toBeNull();
    });
  });
});
