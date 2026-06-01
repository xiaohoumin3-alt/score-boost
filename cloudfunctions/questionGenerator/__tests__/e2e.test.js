/**
 * questionGenerator 端到端流程测试
 * 测试完整的异步队列生成流程
 */

const {
  fetchPendingTasks,
  updateQueueStatus,
  checkTaskCancelled,
  generateQuestionsForTask,
  processTask
} = require('../index');

describe('questionGenerator - E2E Flow Tests', () => {

  describe('完整流程：从 pending 到 completed', () => {
    test('应完整处理一个队列任务', async () => {
      const task = {
        _id: 'task_e2e_001',
        student_id: 'student_e2e',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 6,
        difficulty_distribution: { easy: 0.5, medium: 0.3, hard: 0.2 }
      };

      const questions = [
        { id: 'q1', difficulty: 'easy', question: '1+1=?', answer: '2' },
        { id: 'q2', difficulty: 'easy', question: '2+2=?', answer: '4' },
        { id: 'q3', difficulty: 'easy', question: '3+3=?', answer: '6' },
        { id: 'q4', difficulty: 'medium', question: '12+13=?', answer: '25' },
        { id: 'q5', difficulty: 'medium', question: '14+16=?', answer: '30' },
        { id: 'q6', difficulty: 'hard', question: '99+1=?', answer: '100' }
      ];

      const mockGenerateAi = jest.fn()
        .mockResolvedValueOnce([questions[0], questions[1], questions[2]])      // easy: 3
        .mockResolvedValueOnce([questions[3], questions[4]])                   // medium: 2
        .mockResolvedValueOnce([questions[5]]);                                 // hard: 1

      const savedQuestionIds = [];

      const mockDb = {
        collection: jest.fn((name) => {
          if (name === 'question_queue') {
            return {
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  data: { _id: task._id, status: 'pending' }
                }),
                update: jest.fn().mockResolvedValue({}),
                set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
              }))
            };
          } else if (name === 'ai_question_pool') {
            return {
              add: jest.fn().mockImplementation((data) => {
                const newId = `q_${savedQuestionIds.length + 1}`;
                savedQuestionIds.push(newId);
                return Promise.resolve({ _id: newId });
              })
            };
          } else if (name === 'assessments') {
            return {
              add: jest.fn().mockResolvedValue({ _id: 'assessment_e2e_001' })
            };
          }
          return {};
        })
      };

      const result = await processTask(mockDb, task, { generateAi: mockGenerateAi });

      expect(result.success).toBe(true);
      expect(result.questions_count).toBe(6);
      expect(mockGenerateAi).toHaveBeenCalledTimes(3);

      // 验证调用参数
      expect(mockGenerateAi).toHaveBeenCalledWith(task, 'easy', 3);
      expect(mockGenerateAi).toHaveBeenCalledWith(task, 'medium', 2);
      expect(mockGenerateAi).toHaveBeenCalledWith(task, 'hard', 1);

      // 验证题目被保存
      expect(savedQuestionIds).toHaveLength(6);
    });

    test('应处理用户在生成过程中取消任务', async () => {
      const task = {
        _id: 'task_cancel_e2e',
        student_id: 'student_cancel',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 10,
        difficulty_distribution: { easy: 0.5, medium: 0.3, hard: 0.2 }
      };

      let callCount = 0;
      const mockDb = {
        collection: jest.fn(() => {
          callCount++;
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockImplementation(() => {
                // 前 3 次检查返回 processing，第 4 次返回 cancelled
                if (callCount <= 3) {
                  return { data: { _id: task._id, status: 'processing' } };
                }
                return { data: { _id: task._id, status: 'cancelled' } };
              }),
              update: jest.fn().mockResolvedValue({}),
              set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
            })),
            add: jest.fn().mockResolvedValue({ _id: 'q_1' })
          };
        })
      };

      const mockGenerateAi = jest.fn()
        .mockResolvedValueOnce([{ q: 1 }, { q: 2 }, { q: 3 }, { q: 4 }, { q: 5 }])
        .mockResolvedValue([{ q: 6 }]); // medium 调用

      const result = await processTask(mockDb, task, { generateAi: mockGenerateAi });

      expect(result.cancelled).toBe(true);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Task cancelled by user');
    });
  });

  describe('进度跟踪流程', () => {
    test('应正确更新进度百分比', async () => {
      const task = {
        _id: 'task_progress',
        student_id: 'student_progress',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 10,
        difficulty_distribution: { easy: 0.5, medium: 0.3, hard: 0.2 }
      };

      const progressUpdates = [];

      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue({
              data: { _id: task._id, status: 'processing' }
            }),
            update: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockImplementation(({ data }) => {
              // 捕获所有更新，包括 status 和 progress
              if (data && data.progress) {
                progressUpdates.push(data.progress);
              }
              return Promise.resolve({ stats: { updated: 1 } });
            })
          })),
          add: jest.fn().mockResolvedValue({ _id: `q_${progressUpdates.length + 1}` })
        }))
      };

      const mockGenerateAi = jest.fn()
        .mockResolvedValueOnce([{ q: 1 }, { q: 2 }, { q: 3 }, { q: 4 }, { q: 5 }])
        .mockResolvedValueOnce([{ q: 6 }, { q: 7 }, { q: 8 }])
        .mockResolvedValueOnce([{ q: 9 }, { q: 10 }]);

      await generateQuestionsForTask(task, mockGenerateAi, mockDb);

      // 验证进度更新：5 -> 8 -> 10
      expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
      expect(progressUpdates[progressUpdates.length - 1]).toEqual({ generated: 10, total: 10, percent: 100 });
    });
  });

  describe('错误恢复流程', () => {
    test('应处理 AI 生成失败并标记任务为 failed', async () => {
      const task = {
        _id: 'task_fail_e2e',
        student_id: 'student_fail',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 10,
        difficulty_distribution: { easy: 0.5, medium: 0.3, hard: 0.2 },
        retry_count: 0
      };

      const updateCalls = [];
      const mockDb = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              data: { _id: task._id, status: 'processing' }
            }),
            update: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockImplementation(({ data }) => {
              // updateQueueStatus 调用 set({ data: { status, ...extraFields } })
              updateCalls.push({ data });
              return Promise.resolve({ stats: { updated: 1 } });
            })
          }))
        }))
      };

      const mockGenerateAi = jest.fn()
        .mockRejectedValueOnce(new Error('AI service unavailable'));

      const result = await processTask(mockDb, task, { generateAi: mockGenerateAi });

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI service unavailable');

      // 验证任务被标记为 failed
      // updateQueueStatus 调用格式：doc.update({ data: { status, ...extraFields } })
      const failedUpdate = updateCalls.find(call => call.data && call.data.status === 'failed');
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate.data.error).toBe('AI service unavailable');
      expect(failedUpdate.data.retry_count).toBe(1);
    });
  });

  describe('并发任务处理', () => {
    test('应能同时处理多个独立任务', async () => {
      const tasks = [
        { _id: 'task_1', student_id: 's1', subject: 'math', grade: '7', semester: '上', mode: 'practice', num_questions: 3, difficulty_distribution: { easy: 1, medium: 0, hard: 0 } },
        { _id: 'task_2', student_id: 's2', subject: 'english', grade: '7', semester: '上', mode: 'practice', num_questions: 3, difficulty_distribution: { easy: 1, medium: 0, hard: 0 } },
        { _id: 'task_3', student_id: 's3', subject: 'physics', grade: '7', semester: '上', mode: 'practice', num_questions: 3, difficulty_distribution: { easy: 1, medium: 0, hard: 0 } }
      ];

      const mockGenerateAi = jest.fn().mockResolvedValue([{ q: 1 }, { q: 2 }, { q: 3 }]);

      const results = await Promise.all(tasks.map(async (task) => {
        const mockDb = {
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ data: { _id: task._id, status: 'processing' } }),
              update: jest.fn().mockResolvedValue({}),
              set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
            })),
            add: jest.fn().mockResolvedValue({ _id: 'q_1' })
          }))
        };

        return processTask(mockDb, task, { generateAi: mockGenerateAi });
      }));

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.questions_count).toBe(3);
      });

      expect(mockGenerateAi).toHaveBeenCalledTimes(3);
    });
  });
});
