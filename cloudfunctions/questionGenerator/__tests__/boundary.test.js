/**
 * questionGenerator 边界测试
 * 测试极端情况和边界条件
 */

const {
  fetchPendingTasks,
  updateQueueStatus,
  checkTaskCancelled,
  generateQuestionsForTask,
  processTask
} = require('../index');

describe('questionGenerator - Boundary Tests', () => {

  describe('fetchPendingTasks - 边界条件', () => {
    test('应处理空结果集', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue({ data: [] })
                }))
              }))
            }))
          }))
        }))
      };

      const result = await fetchPendingTasks(mockDb, 3);
      expect(result).toEqual([]);
    });

    test('应处理数据库异常', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn().mockRejectedValue(new Error('Database connection lost'))
                }))
              }))
            }))
          }))
        }))
      };

      const result = await fetchPendingTasks(mockDb, 3);
      expect(result).toEqual([]);
    });

    test('应处理 maxTasks 为 0', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          where: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue({ data: [] })
                }))
              }))
            }))
          }))
        }))
      };

      const result = await fetchPendingTasks(mockDb, 0);
      expect(result).toEqual([]);
    });
  });

  describe('generateQuestionsForTask - 边界条件', () => {
    test('应处理 num_questions 为 0', async () => {
      const task = {
        _id: 'task_0',
        num_questions: 0,
        difficulty_distribution: { easy: 0.5, medium: 0.3, hard: 0.2 }
      };

      const mockGenerateAi = jest.fn().mockResolvedValue([]);
      const mockDb = null;

      const result = await generateQuestionsForTask(task, mockGenerateAi, mockDb);
      expect(result).toEqual([]);
      expect(mockGenerateAi).not.toHaveBeenCalled();
    });

    test('应处理难度分布导致某难度为 0', async () => {
      const task = {
        _id: 'task_zero_easy',
        num_questions: 10,
        difficulty_distribution: { easy: 0, medium: 0.5, hard: 0.5 }
      };

      const mockGenerateAi = jest.fn()
        .mockResolvedValueOnce([{ q: 1 }, { q: 2 }, { q: 3 }, { q: 4 }, { q: 5 }])
        .mockResolvedValueOnce([{ q: 6 }, { q: 7 }, { q: 8 }, { q: 9 }, { q: 10 }]);

      const mockDb = {
        collection: jest.fn()
      };

      const result = await generateQuestionsForTask(task, mockGenerateAi, mockDb);
      expect(result).toHaveLength(10);
      expect(mockGenerateAi).toHaveBeenCalledTimes(2); // medium 和 hard
      expect(mockGenerateAi).not.toHaveBeenCalledWith(task, 'easy', expect.any(Number));
    });

    test('应处理 generateAi 抛出非取消错误', async () => {
      const task = {
        _id: 'task_error',
        num_questions: 10,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      const mockGenerateAi = jest.fn().mockRejectedValue(new Error('AI service unavailable'));
      const mockDb = null;

      await expect(generateQuestionsForTask(task, mockGenerateAi, mockDb))
        .rejects.toThrow('AI service unavailable');
    });

    test('应处理 TASK_CANCELLED 错误', async () => {
      const task = {
        _id: 'task_cancel',
        num_questions: 10,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      const mockGenerateAi = jest.fn().mockRejectedValue(new Error('TASK_CANCELLED'));
      const mockDb = null;

      await expect(generateQuestionsForTask(task, mockGenerateAi, mockDb))
        .rejects.toThrow('TASK_CANCELLED');
    });

    test('应处理缺失 difficulty_distribution', async () => {
      const task = {
        _id: 'task_no_dist',
        num_questions: 10
      };

      // 模拟每次调用返回对应数量的题目
      const mockGenerateAi = jest.fn()
        .mockResolvedValueOnce([{ q: 1 }, { q: 2 }, { q: 3 }, { q: 4 }, { q: 5 }])     // easy: 5
        .mockResolvedValueOnce([{ q: 6 }, { q: 7 }, { q: 8 }])                          // medium: 3
        .mockResolvedValueOnce([{ q: 9 }, { q: 10 }]);                                  // hard: 2

      const mockDb = null;

      const result = await generateQuestionsForTask(task, mockGenerateAi, mockDb);
      expect(result).toHaveLength(10); // 默认分布: 5 easy, 3 medium, 2 hard
      expect(mockGenerateAi).toHaveBeenCalledTimes(3);
    });

    test('应处理生成题目数量不等于请求数量', async () => {
      const task = {
        _id: 'task_mismatch',
        num_questions: 10,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      // 模拟 AI 返回的题目数量与请求不同
      const mockGenerateAi = jest.fn().mockResolvedValue([{ q: 1 }, { q: 2 }]);
      const mockDb = null;

      const result = await generateQuestionsForTask(task, mockGenerateAi, mockDb);
      // 接受 AI 实际返回的数量（2 题），即使请求的是 10 题
      expect(result).toHaveLength(2);
    });
  });

  describe('checkTaskCancelled - 边界条件', () => {
    test('应处理任务不存在', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ data: null })
          }))
        }))
      };

      const result = await checkTaskCancelled(mockDb, 'nonexistent_task');
      expect(result).toBe(false);
    });

    test('应处理数据库异常', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(new Error('Database error'))
          }))
        }))
      };

      const result = await checkTaskCancelled(mockDb, 'task_id');
      expect(result).toBe(false); // 异常时返回 false，继续执行
    });

    test('应处理状态不是 cancelled 的任务', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: { _id: 'task_1', status: 'processing' }
            })
          }))
        }))
      };

      const result = await checkTaskCancelled(mockDb, 'task_1');
      expect(result).toBe(false);
    });
  });

  describe('updateQueueStatus - 边界条件', () => {
    test('应处理空 extraFields', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: { _id: 'task_1', status: 'pending' }
            }),
            update: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
          }))
        }))
      };

      const result = await updateQueueStatus(mockDb, 'task_1', 'processing', {});
      expect(result.success).toBe(true);
    });

    test('应处理更新失败', async () => {
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            update: jest.fn().mockRejectedValue(new Error('Update failed')),
            set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
          }))
        }))
      };

      const result = await updateQueueStatus(mockDb, 'task_1', 'processing', {});
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('processTask - 边界条件', () => {
    test('应处理任务被立即取消', async () => {
      const task = {
        _id: 'task_immediate_cancel',
        student_id: 'student_1',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 10,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      const mockDb = {
        collection: jest.fn()
      };

      // 模拟第一次检查就发现已取消
      mockDb.collection.mockImplementation((name) => {
        if (name === 'question_queue') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                data: { _id: task._id, status: 'cancelled' }
              }),
              update: jest.fn().mockResolvedValue({}),
              set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
            }))
          };
        }
        return {};
      });

      const mockGenerateAi = jest.fn();

      const result = await processTask(mockDb, task, { generateAi: mockGenerateAi });
      expect(result.cancelled).toBe(true);
      expect(result.success).toBe(false);
      expect(mockGenerateAi).not.toHaveBeenCalled();
    });

    test('应处理保存题目时失败', async () => {
      const task = {
        _id: 'task_save_fail',
        student_id: 'student_1',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 10,
        difficulty_distribution: { easy: 1, medium: 0, hard: 0 }
      };

      let callCount = 0;
      const mockDb = {
        collection: jest.fn(() => {
          callCount++;
          if (callCount === 1) {
            // question_queue update (InitStateStep)
            return {
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  data: { _id: task._id, status: 'processing' }
                }),
                update: jest.fn().mockResolvedValue({}),
                set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
              }))
            };
          } else if (callCount === 2) {
            // ai_question_pool add - 失败
            return {
              add: jest.fn().mockRejectedValue(new Error('Storage quota exceeded')),
              where: jest.fn(() => ({
                remove: jest.fn().mockResolvedValue({ stats: { removed: 0 } })
              }))
            };
          }
          // 后续调用（如 rollback 时的 updateQueueStatus）返回完整的 question_queue 结构
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                data: { _id: task._id, status: 'processing' }
              }),
              update: jest.fn().mockResolvedValue({}),
              set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
            }))
          };
        })
      };

      const mockGenerateAi = jest.fn().mockResolvedValue([
        { question: 'q1' },
        { question: 'q2' }
      ]);

      const result = await processTask(mockDb, task, { generateAi: mockGenerateAi });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
