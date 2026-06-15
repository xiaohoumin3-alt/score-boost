/**
 * 点二列相关系数测试
 * 验证题目区分度：题目得分与总分的相关性
 * 验收标准：90%题目点二列相关 > 0.2
 */

const {
  calculatePointBiserialCorrelation,
  calculateQuestionDiscrimination,
  evaluateQuestionQuality
} = require('../cloudfunctions/shared/utils/point-biserial');

describe('点二列相关计算', () => {
  describe('calculatePointBiserialCorrelation', () => {
    test('应该计算点二列相关系数', () => {
      // 题目答案：[对, 错, 对, 错, 对] = [1, 0, 1, 0, 1]
      // 总分：    [90, 60, 85, 55, 80]
      const itemScores = [1, 0, 1, 0, 1];
      const totalScores = [90, 60, 85, 55, 80];

      const correlation = calculatePointBiserialCorrelation(itemScores, totalScores);

      // 正相关：答对的学生总分更高
      expect(correlation).toBeGreaterThan(0);
      expect(correlation).toBeLessThanOrEqual(1);
    });

    test('应该处理完美区分（完全相关）', () => {
      // 答对的都高分，答错的都低分
      const itemScores = [1, 1, 0, 0];
      const totalScores = [90, 85, 60, 55];

      const correlation = calculatePointBiserialCorrelation(itemScores, totalScores);

      expect(correlation).toBeCloseTo(1, 1);
    });

    test('应该处理负相关（区分度反向）', () => {
      // 答对的都低分，答错的都高分（异常情况）
      const itemScores = [1, 1, 0, 0];
      const totalScores = [55, 60, 90, 85];

      const correlation = calculatePointBiserialCorrelation(itemScores, totalScores);

      expect(correlation).toBeLessThan(0);
    });

    test('应该处理零相关（无区分度）', () => {
      // 答对和答错的学生总分相同
      const itemScores = [1, 0, 1, 0];
      const totalScores = [70, 70, 70, 70];

      const correlation = calculatePointBiserialCorrelation(itemScores, totalScores);

      expect(correlation).toBeCloseTo(0, 1);
    });

    test('应该处理全对（所有人答对）', () => {
      const itemScores = [1, 1, 1, 1];
      const totalScores = [90, 85, 80, 75];

      const correlation = calculatePointBiserialCorrelation(itemScores, totalScores);

      // 全对时无法计算区分度，返回0
      expect(correlation).toBe(0);
    });

    test('应该处理全错（所有人答错）', () => {
      const itemScores = [0, 0, 0, 0];
      const totalScores = [90, 85, 80, 75];

      const correlation = calculatePointBiserialCorrelation(itemScores, totalScores);

      // 全错时无法计算区分度，返回0
      expect(correlation).toBe(0);
    });

    test('应该处理空数组', () => {
      const correlation = calculatePointBiserialCorrelation([], []);

      expect(correlation).toBe(0);
    });

    test('应该处理长度不匹配的数组', () => {
      const correlation = calculatePointBiserialCorrelation([1, 0, 1], [90, 85]);

      expect(correlation).toBe(0);
    });
  });

  describe('calculateQuestionDiscrimination', () => {
    test('应该计算题目区分度', () => {
      const attempts = [
        { student_id: 's1', is_correct: true, total_score: 90 },
        { student_id: 's2', is_correct: false, total_score: 60 },
        { student_id: 's3', is_correct: true, total_score: 85 },
        { student_id: 's4', is_correct: false, total_score: 55 },
        { student_id: 's5', is_correct: true, total_score: 80 }
      ];

      const discrimination = calculateQuestionDiscrimination(attempts);

      expect(discrimination).toHaveProperty('correlation');
      expect(discrimination).toHaveProperty('passed');
      expect(discrimination.correlation).toBeGreaterThan(0);
    });

    test('应该判断题目是否通过验收标准（> 0.2）', () => {
      // 高区分度题目
      const goodAttempts = [
        { student_id: 's1', is_correct: true, total_score: 90 },
        { student_id: 's2', is_correct: true, total_score: 85 },
        { student_id: 's3', is_correct: false, total_score: 60 },
        { student_id: 's4', is_correct: false, total_score: 55 }
      ];

      const result = calculateQuestionDiscrimination(goodAttempts);

      expect(result.passed).toBe(true);
      expect(result.correlation).toBeGreaterThan(0.2);
    });

    test('应该判断题目不通过验收标准（<= 0.2）', () => {
      // 低区分度题目
      const poorAttempts = [
        { student_id: 's1', is_correct: true, total_score: 70 },
        { student_id: 's2', is_correct: false, total_score: 71 },
        { student_id: 's3', is_correct: true, total_score: 69 },
        { student_id: 's4', is_correct: false, total_score: 70 }
      ];

      const result = calculateQuestionDiscrimination(poorAttempts);

      expect(result.passed).toBe(false);
      expect(result.correlation).toBeLessThanOrEqual(0.2);
    });

    test('应该处理空数组', () => {
      const result = calculateQuestionDiscrimination([]);

      expect(result.correlation).toBe(0);
      expect(result.passed).toBe(false);
    });

    test('应该处理单个学生', () => {
      const attempts = [
        { student_id: 's1', is_correct: true, total_score: 90 }
      ];

      const result = calculateQuestionDiscrimination(attempts);

      expect(result.correlation).toBe(0);
      expect(result.passed).toBe(false);
    });

    test('应该提供详细的统计信息', () => {
      const attempts = [
        { student_id: 's1', is_correct: true, total_score: 90 },
        { student_id: 's2', is_correct: false, total_score: 60 },
        { student_id: 's3', is_correct: true, total_score: 85 }
      ];

      const result = calculateQuestionDiscrimination(attempts);

      expect(result).toHaveProperty('totalAttempts');
      expect(result).toHaveProperty('correctCount');
      expect(result.totalAttempts).toBe(3);
      expect(result.correctCount).toBe(2);
    });
  });

  describe('evaluateQuestionQuality', () => {
    test('应该评估整体题目质量', () => {
      const questions = [
        {
          question_id: 'q1',
          attempts: [
            { student_id: 's1', is_correct: true, total_score: 90 },
            { student_id: 's2', is_correct: false, total_score: 60 }
          ]
        },
        {
          question_id: 'q2',
          attempts: [
            { student_id: 's1', is_correct: true, total_score: 90 },
            { student_id: 's2', is_correct: true, total_score: 85 }
          ]
        },
        {
          question_id: 'q3',
          attempts: [
            { student_id: 's1', is_correct: true, total_score: 70 },
            { student_id: 's2', is_correct: false, total_score: 71 }
          ]
        }
      ];

      const result = evaluateQuestionQuality(questions);

      expect(result).toHaveProperty('passRate');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('totalQuestions');
      expect(result.totalQuestions).toBe(3);
    });

    test('应该通过验收标准（>= 90%题目区分度 > 0.2）', () => {
      // 10道题，9道区分度高，1道低
      const questions = createQuestionBatch(9, 1);

      const result = evaluateQuestionQuality(questions);

      expect(result.passRate).toBeGreaterThanOrEqual(0.9);
      expect(result.passed).toBe(true);
    });

    test('应该不通过验收标准（< 90%题目区分度 > 0.2）', () => {
      // 10道题，8道区分度高，2道低
      const questions = createQuestionBatch(8, 2);

      const result = evaluateQuestionQuality(questions);

      expect(result.passRate).toBeLessThan(0.9);
      expect(result.passed).toBe(false);
    });

    test('应该处理空数组', () => {
      const result = evaluateQuestionQuality([]);

      expect(result.passRate).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.totalQuestions).toBe(0);
    });

    test('应该提供每道题的详细分析', () => {
      const questions = [
        {
          question_id: 'q1',
          attempts: [
            { student_id: 's1', is_correct: true, total_score: 90 },
            { student_id: 's2', is_correct: false, total_score: 60 }
          ]
        }
      ];

      const result = evaluateQuestionQuality(questions);

      expect(result).toHaveProperty('questionAnalysis');
      expect(Object.keys(result.questionAnalysis)).toContain('q1');
      expect(result.questionAnalysis.q1).toHaveProperty('correlation');
      expect(result.questionAnalysis.q1).toHaveProperty('passed');
    });
  });

  describe('集成测试', () => {
    test('完整流程：从答题数据到题目质量评估', () => {
      const questions = [
        {
          question_id: 'q1',
          attempts: [
            { student_id: 's1', is_correct: true, total_score: 90 },
            { student_id: 's2', is_correct: false, total_score: 60 },
            { student_id: 's3', is_correct: true, total_score: 85 }
          ]
        },
        {
          question_id: 'q2',
          attempts: [
            { student_id: 's1', is_correct: true, total_score: 70 },
            { student_id: 's2', is_correct: false, total_score: 71 },
            { student_id: 's3', is_correct: true, total_score: 69 }
          ]
        }
      ];

      const result = evaluateQuestionQuality(questions);

      expect(result.totalQuestions).toBe(2);
      expect(result).toHaveProperty('questionAnalysis');
      expect(result.questionAnalysis.q1.correlation).toBeGreaterThan(
        result.questionAnalysis.q2.correlation
      );
    });
  });
});

// 辅助函数：创建题目批次
function createQuestionBatch(goodCount, poorCount) {
  const questions = [];

  // 创建高区分度题目
  for (let i = 0; i < goodCount; i++) {
    questions.push({
      question_id: `good_q${i}`,
      attempts: [
        { student_id: `s${i * 2}`, is_correct: true, total_score: 90 },
        { student_id: `s${i * 2 + 1}`, is_correct: false, total_score: 60 }
      ]
    });
  }

  // 创建低区分度题目
  for (let i = 0; i < poorCount; i++) {
    questions.push({
      question_id: `poor_q${i}`,
      attempts: [
        { student_id: `s${i * 2}`, is_correct: true, total_score: 70 },
        { student_id: `s${i * 2 + 1}`, is_correct: false, total_score: 71 }
      ]
    });
  }

  return questions;
}
