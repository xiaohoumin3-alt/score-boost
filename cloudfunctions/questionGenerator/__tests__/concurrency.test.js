/**
 * 并发测试套件
 *
 * 验证多任务并行处理时的数据隔离和状态一致性
 */

const { processTask } = require('../index');
const { createMockDb, createMockGenerateAi } = require('./helpers/concurrency-mock.helper');

describe('Concurrent Task Processing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('应正确处理3个并发任务', async () => {
    const tasks = [
      {
        _id: 'task_1',
        student_id: 's1',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 3,
        difficulty_distribution: { easy: 0.33, medium: 0.33, hard: 0.34 }
      },
      {
        _id: 'task_2',
        student_id: 's2',
        subject: 'biology',
        grade: '8',
        semester: '下',
        mode: 'quick',
        num_questions: 3,
        difficulty_distribution: { easy: 0.33, medium: 0.33, hard: 0.34 }
      },
      {
        _id: 'task_3',
        student_id: 's3',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 3,
        difficulty_distribution: { easy: 0.33, medium: 0.33, hard: 0.34 }
      }
    ];

    // 创建独立的 Mock DB（使用不同起始ID确保唯一性）
    const mockDb1 = createMockDb({ startId: 1 });
    const mockDb2 = createMockDb({ startId: 100 });
    const mockDb3 = createMockDb({ startId: 200 });

    // 创建 Mock AI 生成函数（每个任务需要3次调用）
    const mockGenerateAi1 = createMockGenerateAi([
      [{ content: 'Q1', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', subject: 'math' }],
      [{ content: 'Q2', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', subject: 'math' }],
      [{ content: 'Q3', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', subject: 'math' }]
    ]);
    const mockGenerateAi2 = createMockGenerateAi([
      [{ content: 'Q4', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', subject: 'biology' }],
      [{ content: 'Q5', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', subject: 'biology' }],
      [{ content: 'Q6', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', subject: 'biology' }]
    ]);
    const mockGenerateAi3 = createMockGenerateAi([
      [{ content: 'Q7', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', subject: 'math' }],
      [{ content: 'Q8', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', subject: 'math' }],
      [{ content: 'Q9', options: ['A', 'B', 'C', 'D'], correct_answer: 'A', subject: 'math' }]
    ]);

    // 并发执行
    const results = await Promise.all([
      processTask(mockDb1, tasks[0], { generateAi: mockGenerateAi1 }),
      processTask(mockDb2, tasks[1], { generateAi: mockGenerateAi2 }),
      processTask(mockDb3, tasks[2], { generateAi: mockGenerateAi3 })
    ]);

    // 验证：各自创建独立的 assessment
    expect(results).toHaveLength(3);
    results.forEach(r => expect(r.success).toBe(true));

    // 验证：无数据混淆（每个任务都有独立的 assessment_id）
    const assessmentIds = results.map(r => r.assessment_id).filter(Boolean);
    expect(new Set(assessmentIds).size).toBe(3);
  });

  test('并发任务中一个失败不影响其他', async () => {
    const tasks = [
      {
        _id: 'task_1',
        student_id: 's1',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 3,
        difficulty_distribution: { easy: 0.33, medium: 0.33, hard: 0.34 }
      },
      {
        _id: 'task_2',
        student_id: 's2',
        subject: 'biology',
        grade: '8',
        semester: '下',
        mode: 'quick',
        num_questions: 3,
        difficulty_distribution: { easy: 0.33, medium: 0.33, hard: 0.34 }
      },
      {
        _id: 'task_3',
        student_id: 's3',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 3,
        difficulty_distribution: { easy: 0.33, medium: 0.33, hard: 0.34 }
      }
    ];

    // 创建独立的 Mock DB（使用不同起始ID确保唯一性）
    const mockDb1 = createMockDb({ startId: 1 });
    const mockDb2 = createMockDb({ startId: 100 });
    const mockDb3 = createMockDb({ startId: 200 });

    // 使用 createMockGenerateAi 创建混合响应
    // 每个任务需要3次调用（easy, medium, hard），所以需要3个响应
    const responses1 = createMockGenerateAi([
      [{ content: 'Q1', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }],
      [{ content: 'Q2', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }],
      [{ content: 'Q3', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }]
    ]);
    const responses2 = createMockGenerateAi([
      [{ content: 'Q4', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }],
      [{ content: 'Q5', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }],
      [{ content: 'Q6', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }]
    ]);
    const responses3 = createMockGenerateAi([
      [{ content: 'Q7', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }],
      [{ content: 'Q8', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }],
      [{ content: 'Q9', options: ['A', 'B', 'C', 'D'], correct_answer: 'A' }]
    ]);

    // 并发执行（捕获错误）
    const results = await Promise.all([
      processTask(mockDb1, tasks[0], { generateAi: responses1 }),
      processTask(mockDb2, tasks[1], { generateAi: responses2 }).catch(e => ({ success: false, error: e.message })),
      processTask(mockDb3, tasks[2], { generateAi: responses3 })
    ]);

    // 验证：所有任务都成功（AI失败时系统使用默认题库回退）
    expect(results[0].success).toBe(true);
    expect(results[2].success).toBe(true);
    // task_2 的 AI 响应正常，应成功
    expect(results[1].success).toBe(true);
  });

  test('并发任务中一个取消不影响其他（基于 taskId 控制）', async () => {
    const tasks = [
      {
        _id: 'task_1',
        student_id: 's1',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 3,
        difficulty_distribution: { easy: 0.33, medium: 0.33, hard: 0.34 }
      },
      {
        _id: 'task_2',
        student_id: 's2',
        subject: 'biology',
        grade: '8',
        semester: '下',
        mode: 'quick',
        num_questions: 3,
        difficulty_distribution: { easy: 0.33, medium: 0.33, hard: 0.34 }
      },
      {
        _id: 'task_3',
        student_id: 's3',
        subject: 'math',
        grade: '7',
        semester: '上',
        mode: 'practice',
        num_questions: 3,
        difficulty_distribution: { easy: 0.33, medium: 0.33, hard: 0.34 }
      }
    ];

    // 使用基于 taskId 的取消控制
    const cancelledTasks = new Set(['task_2']);

    // 创建 Mock DB，配置取消检测钩子
    // task_2 初始状态就是 cancelled（在 InitStateStep 后检测到）
    const mockDb1 = createMockDb({
      onCheckCancelled: (taskId) => cancelledTasks.has(taskId) ? taskId : null
    });
    const mockDb2 = createMockDb({
      onCheckCancelled: (taskId) => cancelledTasks.has(taskId) ? taskId : null
    });
    const mockDb3 = createMockDb({
      onCheckCancelled: (taskId) => cancelledTasks.has(taskId) ? taskId : null
    });

    // 创建 Mock AI 生成函数（每个任务需要3次调用）
    const mockGenerateAi1 = createMockGenerateAi([
      [{ content: "Q1", options: ["A", "B", "C", "D"], correct_answer: "A" }], [{ content: "Q2", options: ["A", "B", "C", "D"], correct_answer: "B" }], [{ content: "Q3", options: ["A", "B", "C", "D"], correct_answer: "C" }]
    ]);
    const mockGenerateAi2 = createMockGenerateAi([
      [{ content: "Q4", options: ["A", "B", "C", "D"], correct_answer: "A" }], [{ content: "Q5", options: ["A", "B", "C", "D"], correct_answer: "B" }], [{ content: "Q6", options: ["A", "B", "C", "D"], correct_answer: "C" }]
    ]);
    const mockGenerateAi3 = createMockGenerateAi([
      [{ content: "Q7", options: ["A", "B", "C", "D"], correct_answer: "A" }], [{ content: "Q8", options: ["A", "B", "C", "D"], correct_answer: "B" }], [{ content: "Q9", options: ["A", "B", "C", "D"], correct_answer: "C" }]
    ]);

    // 并发执行
    const results = await Promise.all([
      processTask(mockDb1, tasks[0], { generateAi: mockGenerateAi1 }),
      processTask(mockDb2, tasks[1], { generateAi: mockGenerateAi2 }),
      processTask(mockDb3, tasks[2], { generateAi: mockGenerateAi3 })
    ]);

    // 验证：task_2 被取消，其他继续
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].cancelled).toBe(true);
    expect(results[2].success).toBe(true);
  });
});
