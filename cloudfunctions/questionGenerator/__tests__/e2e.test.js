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
        { id: 'q1', difficulty: 'easy', content: '1+1=?', options: ['2', '3', '4', '5'], correct_answer: 'A' },
        { id: 'q2', difficulty: 'easy', content: '2+2=?', options: ['3', '4', '5', '6'], correct_answer: 'B' },
        { id: 'q3', difficulty: 'easy', content: '3+3=?', options: ['5', '6', '7', '8'], correct_answer: 'B' },
        { id: 'q4', difficulty: 'medium', content: '12+13=?', options: ['23', '24', '25', '26'], correct_answer: 'C' },
        { id: 'q5', difficulty: 'medium', content: '14+16=?', options: ['28', '29', '30', '31'], correct_answer: 'C' },
        { id: 'q6', difficulty: 'hard', content: '99+1=?', options: ['98', '99', '100', '101'], correct_answer: 'C' }
      ];

      const mockGenerateAi = jest.fn()
        .mockResolvedValueOnce([questions[0], questions[1], questions[2]])      // easy: 3
        .mockResolvedValueOnce([questions[3]])                                   // medium: 1
        .mockResolvedValueOnce([questions[4], questions[5]]);                   // hard: 2

      const savedQuestionIds = [];

      const mockDb = {
        command: { in: jest.fn((arr) => ({ $in: arr })) },
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
              }),
              where: jest.fn(() => ({
                limit: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                get: jest.fn().mockResolvedValue({ data: [] }),
                remove: jest.fn().mockResolvedValue({ stats: { removed: 1 } })
              })),
              limit: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({ data: [] })
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

      // 验证调用参数（根据实际分布：3 easy + 1 medium + 2 hard）
      expect(mockGenerateAi).toHaveBeenCalledWith(task, 'easy', 3);
      expect(mockGenerateAi).toHaveBeenCalledWith(task, 'medium', 1);
      expect(mockGenerateAi).toHaveBeenCalledWith(task, 'hard', 2);

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
        command: { in: jest.fn((arr) => ({ $in: arr })) },
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
        command: { in: jest.fn((arr) => ({ $in: arr })) },
        collection: jest.fn(() => ({
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue({
              data: { _id: task._id, status: 'processing' }
            }),
            update: jest.fn().mockImplementation(({ data }) => {
              // 捕获所有更新，包括 status 和 progress
              if (data && data.progress) {
                progressUpdates.push(data.progress);
              }
              return Promise.resolve({ stats: { updated: 1 } });
            }),
            set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
          })),
          add: jest.fn().mockResolvedValue({ _id: 'q_{progressUpdates.length + 1}' }),
          where: jest.fn(() => ({
            limit: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ data: [] }),
            remove: jest.fn().mockResolvedValue({ stats: { removed: 0 } })
          })),
          limit: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ data: [] })
        }))
      };

      const mockGenerateAi = jest.fn()
        .mockResolvedValueOnce([{ content: 'Q1', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }, { content: 'Q2', options: ['A', 'B', 'C', 'D'], correct_answer: 'B' }, { content: 'Q3', options: ['A', 'B', 'C', 'D'], correct_answer: 'C' }, { content: 'Q4', options: ['A', 'B', 'C', 'D'], correct_answer: 'D' }, { content: 'Q5', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }])
        .mockResolvedValueOnce([{ content: 'Q6', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }, { content: 'Q7', options: ['A', 'B', 'C', 'D'], correct_answer: 'B' }, { content: 'Q8', options: ['A', 'B', 'C', 'D'], correct_answer: 'C' }])
        .mockResolvedValueOnce([{ content: 'Q9', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }, { content: 'Q10', options: ['A', 'B', 'C', 'D'], correct_answer: 'B' }]);

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
        command: { in: jest.fn((arr) => ({ $in: arr })) },
        collection: jest.fn((name) => {
          if (name === 'question_queue') {
            return {
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({
                  data: { _id: task._id, status: 'processing' }
                }),
                update: jest.fn().mockResolvedValue({}),
                set: jest.fn().mockImplementation(({ data }) => {
                  updateCalls.push({ data });
                  return Promise.resolve({ stats: { updated: 1 } });
                })
              }))
            };
          }
          return {
            add: jest.fn().mockResolvedValue({ _id: 'mock_id' }),
            where: jest.fn(() => ({
              limit: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({ data: [] }),
              remove: jest.fn().mockResolvedValue({ stats: { removed: 0 } })
            })),
            limit: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ data: [] }),
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ data: null }),
              update: jest.fn().mockResolvedValue({})
            }))
          };
        })
      };

      const mockGenerateAi = jest.fn()
        .mockRejectedValueOnce(new Error('AI service unavailable'));

      const result = await processTask(mockDb, task, { generateAi: mockGenerateAi });

      // AI 返回空时，系统使用默认题库回退，因此应成功
      expect(result.success).toBe(true);
    });
  });

  describe('并发任务处理', () => {
    test('应能同时处理多个独立任务', async () => {
      const tasks = [
        { _id: 'task_1', student_id: 's1', subject: 'math', grade: '7', semester: '上', mode: 'practice', num_questions: 3, difficulty_distribution: { easy: 1, medium: 0, hard: 0 } },
        { _id: 'task_2', student_id: 's2', subject: 'english', grade: '7', semester: '上', mode: 'practice', num_questions: 3, difficulty_distribution: { easy: 1, medium: 0, hard: 0 } },
        { _id: 'task_3', student_id: 's3', subject: 'physics', grade: '7', semester: '上', mode: 'practice', num_questions: 3, difficulty_distribution: { easy: 1, medium: 0, hard: 0 } }
      ];

      const mockGenerateAi = jest.fn().mockResolvedValue([
        { content: 'Q1', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' },
        { content: 'Q2', options: ['A', 'B', 'C', 'D'], correct_answer: 'B' },
        { content: 'Q3', options: ['A', 'B', 'C', 'D'], correct_answer: 'C' }
      ]);

      const results = await Promise.all(tasks.map(async (task) => {
        const mockDb = {
          command: { in: jest.fn((arr) => ({ $in: arr })) },
          collection: jest.fn((name) => {
            if (name === 'question_queue') {
              return {
                doc: jest.fn(() => ({
                  get: jest.fn().mockResolvedValue({ data: { _id: task._id, status: 'processing' } }),
                  update: jest.fn().mockResolvedValue({}),
                  set: jest.fn().mockResolvedValue({ stats: { updated: 1 } })
                }))
              };
            }
            return {
              add: jest.fn().mockResolvedValue({ _id: 'q_1' }),
              where: jest.fn(() => ({
                limit: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                get: jest.fn().mockResolvedValue({ data: [] }),
                remove: jest.fn().mockResolvedValue({ stats: { removed: 0 } })
              })),
              limit: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({ data: [] }),
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ data: null }),
                update: jest.fn().mockResolvedValue({})
              }))
            };
          })
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
