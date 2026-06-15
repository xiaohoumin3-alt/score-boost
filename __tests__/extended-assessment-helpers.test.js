/**
 * Extended Assessment Helper Tests
 * 测试 fetchQuestionsWithFallback 和相关 helpers
 */

const {
  fetchQuestionsWithFallback,
  getSubjectAliases
} = require('../cloudfunctions/extendedAssessment/index');

describe('Extended Assessment Helpers', () => {
  describe('getSubjectAliases', () => {
    it('should return correct aliases for math (数学)', () => {
      const aliases = getSubjectAliases('math');
      expect(aliases).toContain('math');
      expect(aliases).toContain('数学');
      expect(aliases).toContain('mathematics');
    });

    it('should return correct aliases for chinese (语文)', () => {
      const aliases = getSubjectAliases('chinese');
      expect(aliases).toContain('chinese');
      expect(aliases).toContain('语文');
      expect(aliases).toContain('yuwen');
    });

    it('should return correct aliases for english (英语)', () => {
      const aliases = getSubjectAliases('english');
      expect(aliases).toContain('english');
      expect(aliases).toContain('英语');
    });

    it('should return canonical form for unsupported subjects', () => {
      const aliases = getSubjectAliases('unknown_subject');
      expect(aliases).toEqual(['unknown_subject']);
    });
  });

  describe('fetchQuestionsWithFallback', () => {
    let mockDb;
    let mockCollection;

    beforeEach(() => {
      mockCollection = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn()
      };
      mockDb = { collection: jest.fn().mockReturnValue(mockCollection) };
    });

    it('should query verified:true alias first', async () => {
      const mockQuestions = [
        { _id: 'q1', question: 'Test 1', subject: 'math', verified: true },
        { _id: 'q2', question: 'Test 2', subject: '数学', verified: true }
      ];
      mockCollection.get.mockResolvedValue({ data: mockQuestions });

      const result = await fetchQuestionsWithFallback(mockDb, 2, 'math', 5, []);

      expect(mockCollection.where).toHaveBeenCalledWith(
        expect.objectContaining({
          grade: '2',
          subject: 'math',
          verified: true
        })
      );
    });

    it('should fallback to verified:false when verified:true insufficient', async () => {
      // 第一次 verified:true 查询返回不足
      mockCollection.get.mockResolvedValueOnce({ data: [{ _id: 'q1', verified: true }] });
      // 第二次 verified:false 查询返回补充题
      mockCollection.get.mockResolvedValueOnce({ data: [{ _id: 'q2', verified: false }] });

      const result = await fetchQuestionsWithFallback(mockDb, 2, 'math', 5, []);

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect excludeIds parameter', async () => {
      const mockQuestions = [
        { _id: 'q1', question: 'Test 1' },
        { _id: 'q2', question: 'Test 2' }
      ];
      mockCollection.get.mockResolvedValue({ data: mockQuestions });

      const result = await fetchQuestionsWithFallback(mockDb, 2, 'math', 5, ['q1']);

      // 结果不应包含 q1
      expect(result.every(q => q.question_id !== 'q1')).toBe(true);
    });

    it('should deduplicate by question_id', async () => {
      const mockQuestions = [
        { _id: 'q1', question_id: 'q1', question: 'Test 1' },
        { _id: 'q2', question_id: 'q2', question: 'Test 2' }
      ];
      mockCollection.get.mockResolvedValue({ data: mockQuestions });

      const result = await fetchQuestionsWithFallback(mockDb, 2, 'math', 5, []);

      const ids = result.map(q => q.question_id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should throw queryFailedAll when all fallback levels exhausted', async () => {
      // 所有查询都返回空
      mockCollection.get.mockResolvedValue({ data: [] });

      await expect(
        fetchQuestionsWithFallback(mockDb, 2, 'math', 5, [])
      ).rejects.toThrow('题库查询失败');
    });

    it('should limit queries to same grade (String(grade))', async () => {
      mockCollection.get.mockResolvedValue({ data: [] });

      try {
        await fetchQuestionsWithFallback(mockDb, 2, 'math', 5, []);
      } catch (e) {
        // Expected to fail after all fallbacks
      }

      // 验证所有查询都使用 String(grade) = '2'
      const calls = mockCollection.where.mock.calls;
      calls.forEach(call => {
        const whereClause = call[0];
        expect(whereClause.grade).toBe('2'); // 字符串，不是数字
      });
    });
  });
});
