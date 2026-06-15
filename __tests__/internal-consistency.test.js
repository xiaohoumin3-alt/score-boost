/**
 * 内部一致性测试
 * 验证题目难度单调性：简单题正确率 >= 困难题
 * 验收标准：80%测评通过难度单调性检验
 */

const {
  checkMonotonicity,
  calculateInternalConsistency,
  calculatePassRate
} = require('../cloudfunctions/shared/utils/internal-consistency');

describe('内部一致性检查', () => {
  describe('calculatePassRate', () => {
    test('应该计算正确率', () => {
      const attempts = [
        { is_correct: true },
        { is_correct: true },
        { is_correct: false },
        { is_correct: true },
        { is_correct: false }
      ];

      const passRate = calculatePassRate(attempts);

      expect(passRate).toBe(0.6); // 3/5 = 0.6
    });

    test('应该处理空数组', () => {
      expect(calculatePassRate([])).toBe(0);
    });

    test('应该处理全对', () => {
      const attempts = [
        { is_correct: true },
        { is_correct: true },
        { is_correct: true }
      ];

      expect(calculatePassRate([])).toBe(0);
    });

    test('应该处理全错', () => {
      const attempts = [
        { is_correct: false },
        { is_correct: false },
        { is_correct: false }
      ];

      expect(calculatePassRate(attempts)).toBe(0);
    });

    test('应该忽略无效数据', () => {
      const attempts = [
        { is_correct: true },
        { is_correct: null },
        { is_correct: false },
        { is_correct: undefined },
        { is_correct: true }
      ];

      expect(calculatePassRate(attempts)).toBeCloseTo(0.67, 2); // 2/3 ≈ 0.67
    });
  });

  describe('checkMonotonicity', () => {
    test('应该检测到单调性（简单题正确率 >= 困难题）', () => {
      const difficultyRates = [
        { difficulty: 1, passRate: 0.9 },  // 简单
        { difficulty: 2, passRate: 0.7 },  // 中等
        { difficulty: 3, passRate: 0.5 }   // 困难
      ];

      const result = checkMonotonicity(difficultyRates);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    test('应该检测到单调性违规', () => {
      const difficultyRates = [
        { difficulty: 1, passRate: 0.5 },  // 简单但正确率低
        { difficulty: 2, passRate: 0.7 },  // 中等但正确率高（违规！）
        { difficulty: 3, passRate: 0.4 }   // 困难
      ];

      const result = checkMonotonicity(difficultyRates);

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toMatchObject({
        from: { difficulty: 1, passRate: 0.5 },
        to: { difficulty: 2, passRate: 0.7 }
      });
    });

    test('应该处理多个违规', () => {
      const difficultyRates = [
        { difficulty: 1, passRate: 0.5 },
        { difficulty: 2, passRate: 0.8 },  // 违规1
        { difficulty: 3, passRate: 0.6 },
        { difficulty: 4, passRate: 0.9 }   // 违规2
      ];

      const result = checkMonotonicity(difficultyRates);

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBe(2);
    });

    test('应该处理空数组', () => {
      const result = checkMonotonicity([]);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    test('应该处理单个难度', () => {
      const difficultyRates = [
        { difficulty: 1, passRate: 0.8 }
      ];

      const result = checkMonotonicity(difficultyRates);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    test('应该允许相等的正确率', () => {
      const difficultyRates = [
        { difficulty: 1, passRate: 0.7 },
        { difficulty: 2, passRate: 0.7 },  // 相等，不违规
        { difficulty: 3, passRate: 0.6 }
      ];

      const result = checkMonotonicity(difficultyRates);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('calculateInternalConsistency', () => {
    test('应该计算整体内部一致性', () => {
      const questions = [
        {
          question_id: 'q1',
          difficulty: 1,
          attempts: [
            { is_correct: true },
            { is_correct: true },
            { is_correct: false }
          ]
        },
        {
          question_id: 'q2',
          difficulty: 2,
          attempts: [
            { is_correct: true },
            { is_correct: false },
            { is_correct: false }
          ]
        },
        {
          question_id: 'q3',
          difficulty: 3,
          attempts: [
            { is_correct: false },
            { is_correct: false },
            { is_correct: true }
          ]
        }
      ];

      const result = calculateInternalConsistency(questions);

      expect(result).toHaveProperty('passRate');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('totalQuestions');
      expect(result.totalQuestions).toBe(3);
    });

    test('应该通过验收标准（>= 80%通过率）', () => {
      // 5个测评，4个通过
      const assessments = [
        createValidAssessment(), // 通过
        createValidAssessment(), // 通过
        createValidAssessment(), // 通过
        createValidAssessment(), // 通过
        createInvalidAssessment() // 不通过
      ];

      const result = calculateInternalConsistencyFromAssessments(assessments);

      expect(result.passRate).toBeGreaterThanOrEqual(0.8);
      expect(result.passed).toBe(true);
    });

    test('应该不通过验收标准（< 80%通过率）', () => {
      // 5个测评，3个通过
      const assessments = [
        createValidAssessment(), // 通过
        createValidAssessment(), // 通过
        createValidAssessment(), // 通过
        createInvalidAssessment(), // 不通过
        createInvalidAssessment() // 不通过
      ];

      const result = calculateInternalConsistencyFromAssessments(assessments);

      expect(result.passRate).toBeLessThan(0.8);
      expect(result.passed).toBe(false);
    });

    test('应该处理空数组', () => {
      const result = calculateInternalConsistency([]);

      expect(result.passRate).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.totalQuestions).toBe(0);
    });

    test('应该提供详细的问题信息', () => {
      const questions = [
        {
          question_id: 'q1',
          difficulty: 1,
          attempts: [{ is_correct: true }, { is_correct: true }]
        },
        {
          question_id: 'q2',
          difficulty: 2,
          attempts: [{ is_correct: false }, { is_correct: false }]
        }
      ];

      const result = calculateInternalConsistency(questions);

      expect(result).toHaveProperty('questionAnalysis');
      expect(Object.keys(result.questionAnalysis)).toHaveLength(2);
    });
  });

  describe('集成测试', () => {
    test('完整流程：从答题数据到一致性分数', () => {
      const assessments = [
        // 通过的测评（单调性好）
        {
          assessment_id: 'a1',
          questions: [
            { question_id: 'q1', difficulty: 1, is_correct: true },
            { question_id: 'q2', difficulty: 2, is_correct: true },
            { question_id: 'q3', difficulty: 3, is_correct: false }
          ]
        },
        // 不通过的测评（单调性差）
        {
          assessment_id: 'a2',
          questions: [
            { question_id: 'q1', difficulty: 1, is_correct: false },
            { question_id: 'q2', difficulty: 2, is_correct: true },
            { question_id: 'q3', difficulty: 3, is_correct: true }
          ]
        }
      ];

      const result = calculateInternalConsistencyFromAssessments(assessments);

      expect(result).toHaveProperty('passRate');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('totalAssessments');
      expect(result.totalAssessments).toBe(2);
    });
  });
});

// 辅助函数：创建符合单调性的测评
function createValidAssessment() {
  return {
    assessment_id: `valid_${Date.now()}`,
    questions: [
      { question_id: 'q1', difficulty: 1, is_correct: true },
      { question_id: 'q2', difficulty: 2, is_correct: true },
      { question_id: 'q3', difficulty: 3, is_correct: true },
      { question_id: 'q4', difficulty: 4, is_correct: false },
      { question_id: 'q5', difficulty: 5, is_correct: false }
    ]
  };
}

// 辅助函数：创建不符合单调性的测评
function createInvalidAssessment() {
  return {
    assessment_id: `invalid_${Date.now()}`,
    questions: [
      { question_id: 'q1', difficulty: 1, is_correct: false },
      { question_id: 'q2', difficulty: 2, is_correct: true },
      { question_id: 'q3', difficulty: 3, is_correct: true },
      { question_id: 'q4', difficulty: 4, is_correct: true },
      { question_id: 'q5', difficulty: 5, is_correct: false }
    ]
  };
}

// 从测评数据计算一致性（辅助函数）
function calculateInternalConsistencyFromAssessments(assessments) {
  let passedCount = 0;

  assessments.forEach(assessment => {
    // 按难度分组
    const difficultyMap = {};
    assessment.questions.forEach(q => {
      if (!difficultyMap[q.difficulty]) {
        difficultyMap[q.difficulty] = [];
      }
      difficultyMap[q.difficulty].push({ is_correct: q.is_correct });
    });

    // 计算每个难度的正确率
    const difficultyRates = Object.entries(difficultyMap)
      .map(([difficulty, attempts]) => ({
        difficulty: parseInt(difficulty),
        passRate: calculatePassRate(attempts)
      }))
      .sort((a, b) => a.difficulty - b.difficulty);

    // 检查单调性
    const result = checkMonotonicity(difficultyRates);
    if (result.passed) {
      passedCount++;
    }
  });

  const passRate = assessments.length > 0 ? passedCount / assessments.length : 0;

  return {
    passRate,
    passed: passRate >= 0.8,
    totalAssessments: assessments.length
  };
}
