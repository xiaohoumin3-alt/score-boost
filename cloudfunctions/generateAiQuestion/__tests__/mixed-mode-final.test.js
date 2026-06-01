/**
 * 混合出题模式集成测试
 * 验证核心功能和容错机制
 */

const { generateMixedQuestions } = require('../index');
const { fetchQuestionsFromPool } = require('../../practice_v2/question_pool');

// Mock 依赖
jest.mock('../../practice_v2/question_pool');
jest.mock('../llm-core');
jest.mock('../prompt-templates');

describe('混合出题模式集成测试', () => {

  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      collection: jest.fn().mockReturnValue({
        add: jest.fn().mockResolvedValue({ _id: 'history1' }),
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ data: [] })
        })
      }),
      command: {
        gt: () => ({}),
        nin: () => ({})
      }
    };
  });

  const mockKp = {
    kp_id: 'kp123',
    kp_name: '勾股定理',
    chapter: '几何'
  };

  describe('参数验证（RED-GREEN-REFACTOR 完成）', () => {
    test('count < 2 应该返回错误', async () => {
      const result = await generateMixedQuestions(1, 'user123', mockKp, 'medium', mockDb, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('count must be between 2 and 20');
    });

    test('count > 20 应该返回错误', async () => {
      const result = await generateMixedQuestions(21, 'user123', mockKp, 'medium', mockDb, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('count must be between 2 and 20');
    });

    test('缺少 user_id 应该返回错误', async () => {
      const result = await generateMixedQuestions(10, null, mockKp, 'medium', mockDb, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('user_id is required');
    });
  });

  describe('容错机制（AI失败场景）', () => {
    test('AI 全部失败时应该用纯题库', async () => {
      // Mock AI 调用失败
      const { createLLMClient } = require('../llm-core');
      createLLMClient.mockReturnValue({
        complete: jest.fn().mockRejectedValue(new Error('API调用失败'))
      });

      const poolQuestions = Array.from({ length: 10 }, (_, i) => ({
        question: `题库题目${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 0
      }));

      fetchQuestionsFromPool.mockResolvedValue(poolQuestions);

      const result = await generateMixedQuestions(10, 'user123', mockKp, 'medium', mockDb, {});

      expect(result.success).toBe(true);
      expect(result.data.questions).toHaveLength(10);
      expect(result.data.stats.ai_generated).toBe(0);
      expect(result.data.stats.pool_fetched).toBe(10);
    });

    test('题库不足时应该用实际数量', async () => {
      // Mock AI 调用失败
      const { createLLMClient } = require('../llm-core');
      createLLMClient.mockReturnValue({
        complete: jest.fn().mockRejectedValue(new Error('API调用失败'))
      });

      // 题库只有 5 题
      fetchQuestionsFromPool.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          question: `题库题目${i + 1}`,
          options: ['A', 'B', 'C', 'D'],
          correct_answer: 0
        }))
      );

      const result = await generateMixedQuestions(10, 'user123', mockKp, 'medium', mockDb, {});

      // FIX: 数量不足时 success=false, incomplete=true
      expect(result.success).toBe(false);
      expect(result.incomplete).toBe(true);
      expect(result.data.total).toBe(5); // 只有 5 题库题目
      expect(result.data.questions).toHaveLength(5);
      expect(result.data.stats.ai_generated).toBe(0);
      expect(result.data.stats.pool_fetched).toBe(5);
    });

    test('全部失败应该返回空数组', async () => {
      // Mock AI 调用失败
      const { createLLMClient } = require('../llm-core');
      createLLMClient.mockReturnValue({
        complete: jest.fn().mockRejectedValue(new Error('API调用失败'))
      });

      fetchQuestionsFromPool.mockResolvedValue([]);

      const result = await generateMixedQuestions(10, 'user123', mockKp, 'medium', mockDb, {});

      // FIX: 数量不足时 success=false
      expect(result.success).toBe(false);
      expect(result.incomplete).toBe(true);
      expect(result.data.questions).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });
  });

  describe('题库查询功能', () => {
    test('应该正确调用题库查询函数', async () => {
      // Mock AI 调用失败
      const { createLLMClient } = require('../llm-core');
      createLLMClient.mockReturnValue({
        complete: jest.fn().mockRejectedValue(new Error('API调用失败'))
      });

      const poolQuestions = [
        { question: '题库题目1', options: ['A', 'B', 'C', 'D'], correct_answer: 0 }
      ];

      fetchQuestionsFromPool.mockResolvedValue(poolQuestions);

      await generateMixedQuestions(5, 'user123', mockKp, 'medium', mockDb, {});

      // 验证题库查询被调用
      expect(fetchQuestionsFromPool).toHaveBeenCalledWith(
        mockDb,
        mockKp.kp_id,
        'medium',
        false,
        'user123',
        [], // AI题目ID列表（为空因为AI失败）
        5   // 需要的题目数量
      );
    });
  });

  describe('响应格式验证', () => {
    test('应该返回正确的响应格式', async () => {
      // Mock AI 调用失败
      const { createLLMClient } = require('../llm-core');
      createLLMClient.mockReturnValue({
        complete: jest.fn().mockRejectedValue(new Error('API调用失败'))
      });

      // Mock 题库返回足够题目，这样 success=true
      fetchQuestionsFromPool.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          question: `题库题目${i + 1}`,
          options: ['A', 'B', 'C', 'D'],
          correct_answer: 0
        }))
      );

      const result = await generateMixedQuestions(10, 'user123', mockKp, 'medium', mockDb, {});

      // FIX: 数量满足时 success=true, incomplete=false
      expect(result).toMatchObject({
        success: true,
        incomplete: false,
        data: {
          total: 10,
          requested: 10,
          questions: expect.any(Array),
          stats: {
            ai_generated: 0,
            pool_fetched: 10
          }
        }
      });
    });
  });

  describe('边界条件', () => {
    test('count=2 应该是最小值', async () => {
      // Mock AI 调用失败
      const { createLLMClient } = require('../llm-core');
      createLLMClient.mockReturnValue({
        complete: jest.fn().mockRejectedValue(new Error('API调用失败'))
      });

      fetchQuestionsFromPool.mockResolvedValue([
        { question: '题库题目1', options: ['A', 'B'], correct_answer: 0 },
        { question: '题库题目2', options: ['A', 'B'], correct_answer: 0 }
      ]);

      const result = await generateMixedQuestions(2, 'user123', mockKp, 'medium', mockDb, {});

      expect(result.success).toBe(true);
      expect(result.data.questions).toHaveLength(2);
    });

    test('count=20 应该是最大值', async () => {
      // Mock AI 调用失败
      const { createLLMClient } = require('../llm-core');
      createLLMClient.mockReturnValue({
        complete: jest.fn().mockRejectedValue(new Error('API调用失败'))
      });

      fetchQuestionsFromPool.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({
          question: `题库题目${i + 1}`,
          options: ['A', 'B', 'C', 'D'],
          correct_answer: 0
        }))
      );

      const result = await generateMixedQuestions(20, 'user123', mockKp, 'medium', mockDb, {});

      expect(result.success).toBe(true);
      expect(result.incomplete).toBe(false);
      expect(result.data.questions).toHaveLength(20);
      expect(result.data.stats.ai_generated).toBe(0);
      expect(result.data.stats.pool_fetched).toBe(20);
    });
  });
});