/**
 * startAssessment 队列模式集成测试 (TDD Red-Green-Refactor)
 * 功能：验证queued状态返回逻辑
 */

const { main: startAssessment } = require('../index');
const { checkQueueForStudent, createQueueTask } = require('../queue_manager');

// Mock wx-server-sdk
jest.mock('wx-server-sdk', () => {
  const mockDb = {
    collection: jest.fn(),
    command: {
      in: jest.fn((arr) => ({ $in: arr }))
    }
  };

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'mock-env',
    database: jest.fn(() => mockDb),
    getWXContext: jest.fn(() => ({
      OPENID: 'test_openid_123'
    }))
  };
});

// Mock queue_manager - 默认返回无队列
jest.mock('../queue_manager', () => ({
  checkQueueForStudent: jest.fn().mockResolvedValue({ found: false }),
  createQueueTask: jest.fn().mockResolvedValue({ success: true, queue_id: 'default_queue_id' })
}));

// Mock question_pool - 默认返回空题目（让测试更快失败在队列逻辑上）
jest.mock('../question_pool', () => ({
  fetchQuestionsFromPool: jest.fn(),
  fetchQuestionsBatch: jest.fn().mockResolvedValue({})
}));

describe('startAssessment - Queued Mode Integration', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('题池为空且无预生成队列时', () => {
    test('应返回queued状态和queue_id', async () => {
      // queue_manager mock已经默认返回无队列
      // question_pool mock已经默认返回空题目
      // 所以会自动走到创建队列任务的逻辑

      const mockEvent = {
        data: {
          student_id: 'student_123',
          subject: 'biology',
          grade: '7',
          semester: 'down',
          mode: 'quick',
          num_questions: 20
        }
      };

      const result = await startAssessment(mockEvent, {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('queued');
      expect(result.data.queue_id).toBe('default_queue_id');
      expect(result.data.message).toContain('生成');
    });
  });

  describe('已有完成队列任务时', () => {
    test('应返回ready状态和assessment_id', async () => {
      // 覆盖checkQueueForStudent返回已完成
      const queueManager = require('../queue_manager');
      queueManager.checkQueueForStudent.mockResolvedValue({
        found: true,
        status: 'completed',
        assessment_id: 'assessment_789',
        queue_id: 'queue_456'
      });

      // Mock assessments查询返回数据
      const cloud = require('wx-server-sdk');
      const mockDb = cloud.database();
      const mockWhere = jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: [{
            assessment_id: 'assessment_789',
            questions: [
              { id: 'q1', content: 'Test question 1', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', type: 'choice', knowledge_point: '知识点1', knowledge_point_id: 'kp1', difficulty: 'easy' }
            ],
            time_limit_minutes: 45
          }]
        })
      });
      mockDb.collection.mockReturnValue({ where: mockWhere });

      const mockEvent = {
        data: {
          student_id: 'student_123',
          subject: 'biology',
          grade: '7',
          num_questions: 20
        }
      };

      const result = await startAssessment(mockEvent, {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ready');
      expect(result.data.assessment_id).toBe('assessment_789');
      expect(result.data.from_cache).toBe(true);
    });
  });

  describe('有进行中队列任务时', () => {
    test('应返回queued状态和现有queue_id', async () => {
      // 覆盖checkQueueForStudent返回进行中
      const queueManager = require('../queue_manager');
      queueManager.checkQueueForStudent.mockResolvedValue({
        found: true,
        status: 'pending',
        queue_id: 'queue_pending_123'
      });

      const mockEvent = {
        data: {
          student_id: 'student_123',
          subject: 'biology',
          grade: '7',
          num_questions: 20
        }
      };

      const result = await startAssessment(mockEvent, {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('queued');
      expect(result.data.queue_id).toBe('queue_pending_123');
      expect(result.data.message).toContain('生成');
    });
  });

  describe('题池充足时', () => {
    test('应直接返回ready状态（不使用队列）', async () => {
      // Mock question_pool返回足够题目
      const questionPool = require('../question_pool');
      questionPool.fetchQuestionsBatch.mockImplementation(async (db, kpIds, ...rest) => {
        const result = {};
        kpIds.forEach((kpId, idx) => {
          const questions = [];
          for (let i = 0; i < 20; i++) {
            questions.push({
              _id: `q_${kpId}_${i}`,
              question: `Q${i + 1} for ${kpId}`,
              options: ['A', 'B', 'C', 'D'],
              correct_answer: 'A',
              kp_id: kpId,
              kp_name: `知识点${idx}`,
              difficulty: 'easy'
            });
          }
          result[kpId] = questions;
        });
        return result;
      });

      // Mock queue_manager - 无队列
      const queueManager = require('../queue_manager');
      queueManager.checkQueueForStudent.mockResolvedValue({ found: false });
      queueManager.createQueueTask.mockResolvedValue({
        success: false,
        error: 'Queue creation disabled for test'
      });

      // Mock assessments add
      const cloud = require('wx-server-sdk');
      const mockDb = cloud.database();
      mockDb.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        add: jest.fn().mockResolvedValue({ _id: 'assessment_999' })
      });

      const mockEvent = {
        data: {
          student_id: 'student_123',
          subject: 'biology',
          grade: '7',
          num_questions: 5
        }
      };

      const result = await startAssessment(mockEvent, {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ready');
      expect(result.data.assessment_id).toBeDefined();
      expect(result.data.questions).toBeDefined();
      expect(result.data.questions.length).toBeGreaterThan(0);
    });
  });
});