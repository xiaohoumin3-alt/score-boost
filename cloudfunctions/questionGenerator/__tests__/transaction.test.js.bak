/**
 * 事务性和竞态条件修复测试
 * 测试 CRITICAL 问题的修复
 */

const {
  cleanupPartialQuestionsByTask,
  generateQuestionsForTask,
  processTask
} = require('../index');

describe('questionGenerator - Transaction & Race Fix Tests', () => {

  describe('cleanupPartialQuestionsByTask - 事务性清理', () => {
    test('应清理指定任务的未验证题目', async () => {
      const taskId = 'task_cleanup_test';
      const deletedIds = [];

      const mockDb = {
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            remove: jest.fn().mockImplementation(() => {
              deletedIds.push(taskId);
              return Promise.resolve({ stats: { removed: 5 } });
            })
          }))
        }))
      };

      await cleanupPartialQuestionsByTask(mockDb, taskId);

      expect(mockDb.collection).toHaveBeenCalledWith('ai_question_pool');
      expect(deletedIds).toContain(taskId);
    });

    test('应处理清理失败', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            remove: jest.fn().mockRejectedValue(new Error('Database connection lost'))
          }))
        }))
      };

      // 不应该抛出错误
      await expect(cleanupPartialQuestionsByTask(mockDb, 'task_1')).resolves.toBeUndefined();
    });
  });

  describe('processTask - 事务性保存', () => {
    test('保存题目失败时应清理已保存的数据', async () => {
      const task = {
        _id: 'task_save_fail',
        student_id: 'student_1',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 3,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      let addCallCount = 0;
      const mockDb = {
        collection: jest.fn((name) => {
          if (name === 'question_queue') {
            return {
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  data: { _id: task._id, status: 'processing' }
                }),
                update: jest.fn().mockResolvedValue({}),
                set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
              }))
            };
          } else if (name === 'ai_question_pool') {
            return {
              add: jest.fn().mockImplementation(() => {
                addCallCount++;
                if (addCallCount === 2) {
                  return Promise.reject(new Error('Storage quota exceeded'));
                }
                return Promise.resolve({ _id: `q_${addCallCount}` });
              }),
              where: jest.fn(() => ({
                remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } })
              }))
            };
          }
          return {};
        })
      };

      const mockGenerateAi = jest.fn().mockResolvedValue([
        { q: 1 }, { q: 2 }, { q: 3 }
      ]);

      const result = await processTask(mockDb, task, { generateAi: mockGenerateAi });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage quota exceeded');
      // 验证调用了清理
      expect(mockDb.collection).toHaveBeenCalledWith('ai_question_pool');
    });

    test('创建assessment失败时应清理已保存的题目', async () => {
      const task = {
        _id: 'task_assessment_fail',
        student_id: 'student_1',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 3,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      const mockDb = {
        collection: jest.fn((name) => {
          if (name === 'question_queue') {
            return {
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  data: { _id: task._id, status: 'processing' }
                }),
                update: jest.fn().mockResolvedValue({}),
                set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
              }))
            };
          } else if (name === 'ai_question_pool') {
            return {
              add: jest.fn().mockResolvedValue({ _id: 'q_1' }),
              where: jest.fn(() => ({
                remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } })
              }))
            };
          } else if (name === 'assessments') {
            return {
              add: jest.fn().mockRejectedValue(new Error('Assessment creation failed'))
            };
          }
          return {};
        })
      };

      const mockGenerateAi = jest.fn().mockResolvedValue([{ q: 1 }]);

      const result = await processTask(mockDb, task, { generateAi: mockGenerateAi });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Assessment creation failed');
      // 验证调用了清理
      expect(mockDb.collection).toHaveBeenCalledWith('ai_question_pool');
    });
  });

  describe('generateQuestionsForTask - 竞态条件修复', () => {
    test('进度更新前应检查取消状态', async () => {
      const task = {
        _id: 'task_race_condition',
        num_questions: 10,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      let checkCount = 0;
      const progressUpdates = [];
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockImplementation(() => {
              checkCount++;
              // 第一次检查（生成前）返回 processing
              // 第二次检查（进度更新前）返回 cancelled
              if (checkCount === 1) {
                return { data: { _id: task._id, status: 'processing' } };
              }
              return { data: { _id: task._id, status: 'cancelled' } };
            }),
            update: jest.fn().mockImplementation((data) => {
              if (data.data && data.data.progress) {
                progressUpdates.push(data.data.progress);
              }
              return Promise.resolve({});
            }),
            set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
          })),
          where: jest.fn().mockReturnValue({
            remove: jest.fn().mockResolvedValue({})
          })
        }))
      };

      const mockGenerateAi = jest.fn().mockResolvedValue([
        { q: 1 }, { q: 2 }, { q: 3 }, { q: 4 }, { q: 5 }
      ]);

      await expect(generateQuestionsForTask(task, mockGenerateAi, mockDb))
        .rejects.toThrow('TASK_CANCELLED');

      // 进度更新应该被阻止
      expect(progressUpdates).toHaveLength(0);
    });

    test('正常情况应更新进度', async () => {
      const task = {
        _id: 'task_progress_normal',
        num_questions: 10,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      const progressUpdates = [];
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: { _id: task._id, status: 'processing' }
            }),
            update: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockImplementation(({ data }) => {
              if (data && data.progress) {
                progressUpdates.push(data.progress);
              }
              return Promise.resolve({ stats: { updated: 1 } });
            })
          }))
        }))
      };

      const mockGenerateAi = jest.fn().mockResolvedValue([
        { q: 1 }, { q: 2 }, { q: 3 }, { q: 4 }, { q: 5 }
      ]);

      const result = await generateQuestionsForTask(task, mockGenerateAi, mockDb);

      expect(result).toHaveLength(5);
      expect(progressUpdates).toHaveLength(1);
      expect(progressUpdates[0]).toEqual({
        generated: 5,
        total: 10,
        percent: 50
      });
    });
  });

  describe('错误处理完整性', () => {
    test('catch块应清理部分数据（非取消情况）', async () => {
      const task = {
        _id: 'task_catch_cleanup',
        student_id: 'student_1',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 10,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      let cleanupCalled = false;
      const mockDb = {
        collection: jest.fn((name) => {
          if (name === 'question_queue') {
            return {
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  data: { _id: task._id, status: 'processing' }
                }),
                update: jest.fn().mockResolvedValue({}),
                set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
              }))
            };
          } else if (name === 'ai_question_pool') {
            return {
              where: jest.fn(() => ({
                remove: jest.fn().mockImplementation(() => {
                  cleanupCalled = true;
                  return Promise.resolve({ stats: { removed: 0 } });
                })
              }))
            };
          }
          return {};
        })
      };

      const mockGenerateAi = jest.fn().mockRejectedValue(new Error('AI service down'));

      const result = await processTask(mockDb, task, { generateAi: mockGenerateAi });

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI service down');
      // AI失败时没有数据被保存，不需要cleanup
      // cleanupCalled应为false
      expect(cleanupCalled).toBe(false);
    });
  });
});
