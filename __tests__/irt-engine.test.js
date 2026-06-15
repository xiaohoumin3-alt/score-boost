/**
 * IRT引擎测试
 * 验证3PL模型、Fisher信息量、能力估计、分数转换、精度转换
 */

const {
  threePLModel,
  calculateFisherInformation,
  calculateStandardError,
  estimateTheta,
  selectQuestionBatch,
  thetaToScore,
  scoreToTheta,
  seToAccuracy,
  accuracyToSE,
  assessAbility
} = require('../cloudfunctions/shared/utils/irt-engine');

describe('IRT引擎测试', () => {
  describe('3PL模型', () => {
    test('应该计算正确概率（中等能力、中等难度）', () => {
      const theta = 0;      // 中等能力
      const item = { a: 1, b: 0, c: 0.25 };  // 中等难度
      const P = threePLModel(theta, item);

      expect(P).toBeGreaterThan(0.4);
      expect(P).toBeLessThan(0.7);  // 调整期望上限
      expect(P).toBeCloseTo(0.625, 3);
    });

    test('高能力应该在高难度题目上有较高正确率', () => {
      const theta = 2;      // 高能力
      const item = { a: 1, b: 1.5, c: 0.25 };  // 高难度
      const P = threePLModel(theta, item);

      expect(P).toBeGreaterThan(0.5);
    });

    test('低能力应该在容易题目上有较高正确率', () => {
      const theta = -2;     // 低能力
      const item = { a: 1, b: -2, c: 0.25 };  // 容易题（难度匹配能力）
      const P = threePLModel(theta, item);

      expect(P).toBeGreaterThan(0.45);  // 容易题正确率应该较高
    });

    test('极端能力值应该边界收敛', () => {
      const item = { a: 1, b: 0, c: 0.25 };

      // 极高能力
      const P_high = threePLModel(4, item);
      expect(P_high).toBeGreaterThan(0.95);

      // 极低能力
      const P_low = threePLModel(-4, item);
      expect(P_low).toBeLessThan(0.3);
    });

    test('猜测参数c应该提高最低正确率', () => {
      const item_high_c = { a: 1, b: 0, c: 0.5 };  // 高猜测
      const item_low_c = { a: 1, b: 0, c: 0.0 };   // 无猜测

      const theta = -4;  // 极低能力
      const P_high_c = threePLModel(theta, item_high_c);
      const P_low_c = threePLModel(theta, item_low_c);

      expect(P_high_c).toBeGreaterThan(P_low_c);
      expect(P_high_c).toBeGreaterThanOrEqual(0.5);  // c=0.5保证最低50%
    });

    test('真实题池字符串difficulty不应该产生NaN', () => {
      const items = [
        { difficulty: 'easy' },
        { difficulty: 'medium' },
        { difficulty: 'hard' }
      ];

      items.forEach(item => {
        const probability = threePLModel(0, item);
        const information = calculateFisherInformation(0, [item]);
        const se = calculateStandardError(0, [item]);

        expect(Number.isFinite(probability)).toBe(true);
        expect(Number.isFinite(information)).toBe(true);
        expect(Number.isFinite(se)).toBe(true);
      });
    });
  });

  describe('Fisher信息量', () => {
    const items = [
      { a: 1, b: -2, c: 0.25 },
      { a: 1, b: -1, c: 0.25 },
      { a: 1, b: 0, c: 0.25 },
      { a: 1, b: 1, c: 0.25 },
      { a: 1, b: 2, c: 0.25 }
    ];

    test('应该计算总Fisher信息量', () => {
      const theta = 0;
      const info = calculateFisherInformation(theta, items);

      expect(info).toBeGreaterThan(0);
      expect(info).toBeLessThan(10);  // 合理范围
    });

    test('匹配能力的信息量应该最大', () => {
      const matchedItem = [{ a: 1, b: 0, c: 0.25 }];
      const theta_0 = calculateFisherInformation(0, matchedItem);
      const theta_2 = calculateFisherInformation(2, matchedItem);
      const theta_minus2 = calculateFisherInformation(-2, matchedItem);

      // 单题信息量在能力值接近题目难度时最大
      expect(theta_0).toBeGreaterThan(theta_2);
      expect(theta_0).toBeGreaterThan(theta_minus2);
    });

    test('应该计算标准误差', () => {
      const theta = 0;
      const se = calculateStandardError(theta, items);

      expect(se).toBeGreaterThan(0);
      expect(se).toBeLessThan(2);  // 合理范围
    });

    test('更多题目应该降低标准误差', () => {
      const fewItems = items.slice(0, 2);
      const manyItems = items;

      const se_few = calculateStandardError(0, fewItems);
      const se_many = calculateStandardError(0, manyItems);

      expect(se_many).toBeLessThan(se_few);
    });

    test('批量选题应该兼容_id字段并选出多题', () => {
      const pool = [
        { _id: 'q1', a: 1, b: -1, c: 0.25 },
        { _id: 'q2', a: 1, b: 0, c: 0.25 },
        { _id: 'q3', a: 1, b: 1, c: 0.25 }
      ];

      const selected = selectQuestionBatch(0, pool, 3);

      expect(selected).toHaveLength(3);
      expect(new Set(selected.map(item => item._id)).size).toBe(3);
    });
  });

  describe('能力估计', () => {
    test('应该估计能力值（全对）', () => {
      const responses = [
        { item: { a: 1, b: -2, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: -1, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: 0, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: 1, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: 2, c: 0.25 }, is_correct: true }
      ];

      const result = estimateTheta(responses);

      // 全对应该高能力（可能接近边界）
      expect(result.theta).toBeGreaterThan(0.5);
      // 即使未完全收敛，也应该有合理估计
      expect(result.theta).toBeDefined();
    });

    test('应该估计能力值（全错）', () => {
      const responses = [
        { item: { a: 1, b: -2, c: 0.25 }, is_correct: false },
        { item: { a: 1, b: -1, c: 0.25 }, is_correct: false },
        { item: { a: 1, b: 0, c: 0.25 }, is_correct: false },
        { item: { a: 1, b: 1, c: 0.25 }, is_correct: false },
        { item: { a: 1, b: 2, c: 0.25 }, is_correct: false }
      ];

      const result = estimateTheta(responses);

      expect(result.theta).toBeLessThan(-1);  // 全错应该低能力
    });

    test('应该估计能力值（混合）', () => {
      const responses = [
        { item: { a: 1, b: -2, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: -1, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: 0, c: 0.25 }, is_correct: false },
        { item: { a: 1, b: 1, c: 0.25 }, is_correct: false },
        { item: { a: 1, b: 2, c: 0.25 }, is_correct: false }
      ];

      const result = estimateTheta(responses);

      // 2对3错，能力应该在中等偏低
      expect(result.theta).toBeGreaterThan(-1);
      expect(result.theta).toBeLessThan(0.5);
    });

    test('应该处理空响应', () => {
      const result = estimateTheta([], 0);

      expect(result.theta).toBe(0);  // 返回初始值
      expect(result.se).toBe(1);     // 最大误差
    });

    test('应该收敛到稳定值', () => {
      const responses = [
        { item: { a: 1, b: 0, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: 0.5, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: 1, c: 0.25 }, is_correct: false }
      ];

      const result = estimateTheta(responses);

      expect(result.converged).toBe(true);
      expect(result.iterations).toBeLessThan(50);
    });
  });

  describe('分数转换', () => {
    test('theta=0应该转换为50分（中等）', () => {
      const score = thetaToScore(0);

      expect(score).toBeCloseTo(50, 0);
    });

    test('高theta应该转换为高分', () => {
      const score = thetaToScore(2);

      expect(score).toBeGreaterThan(90);
    });

    test('低theta应该转换为低分', () => {
      const score = thetaToScore(-2);

      expect(score).toBeLessThan(10);
    });

    test('极端theta应该边界收敛', () => {
      const score_max = thetaToScore(4);
      const score_min = thetaToScore(-4);

      expect(score_max).toBeCloseTo(100, 0);
      expect(score_min).toBeCloseTo(0, 0);
    });

    test('应该保持转换顺序', () => {
      // 测试thetaToScore的单调性
      const thetas = [-2, -1, 0, 1, 2];
      const scores = thetas.map(theta => thetaToScore(theta));

      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThan(scores[i - 1]);
      }

      // 验证映射合理性
      expect(scores[0]).toBeLessThan(30);   // theta=-2
      expect(scores[2]).toBeCloseTo(50, 0); // theta=0
      expect(scores[4]).toBeGreaterThan(70); // theta=2
    });

    test('scoreToTheta应该保持转换顺序', () => {
      const scores = [10, 30, 50, 70, 90];
      const thetas = scores.map(score => scoreToTheta(score));

      for (let i = 1; i < thetas.length; i++) {
        expect(thetas[i]).toBeGreaterThan(thetas[i - 1]);
      }

      expect(scoreToTheta(50)).toBeCloseTo(0, 1);
      expect(scoreToTheta(90)).toBeGreaterThan(scoreToTheta(70));
    });
  });

  describe('精度转换', () => {
    test('SE=0应该转换为100%精度', () => {
      const accuracy = seToAccuracy(0);

      expect(accuracy).toBe(1);
    });

    test('SE=0.3应该转换为70%精度', () => {
      const accuracy = seToAccuracy(0.3);

      expect(accuracy).toBeCloseTo(0.7, 1);
    });

    test('SE=1.0应该转换为0%精度', () => {
      const accuracy = seToAccuracy(1.0);

      expect(accuracy).toBeCloseTo(0, 1);
    });

    test('精度转换应该可逆', () => {
      const se = 0.5;
      const accuracy = seToAccuracy(se);
      const se_recovered = accuracyToSE(accuracy, 1.0);

      expect(se_recovered).toBeCloseTo(se, 1);
    });
  });

  describe('完整评估流程', () => {
    test('应该生成完整评估报告', () => {
      const responses = [
        { item: { a: 1, b: -1, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: 0, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: 0.5, c: 0.25 }, is_correct: false },
        { item: { a: 1, b: 1, c: 0.25 }, is_correct: false },
        { item: { a: 1, b: 1.5, c: 0.25 }, is_correct: false }
      ];

      const result = assessAbility(responses, 0.3);

      // 验证必需字段
      expect(result).toHaveProperty('theta');
      expect(result).toHaveProperty('se');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('percentile');
      expect(result).toHaveProperty('interpretation');
      expect(result).toHaveProperty('confidence_interval');
      expect(result).toHaveProperty('accuracy');
      expect(result).toHaveProperty('recommendation');

      // 验证数据范围
      expect(result.theta).toBeGreaterThanOrEqual(-4);
      expect(result.theta).toBeLessThanOrEqual(4);
      expect(result.se).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('应该生成合理的扩展建议', () => {
      const fewResponses = [
        { item: { a: 1, b: 0, c: 0.25 }, is_correct: true },
        { item: { a: 1, b: 0, c: 0.25 }, is_correct: true }
      ];

      const result = assessAbility(fewResponses, 0.3);

      // 题目少，SE应该大，建议扩展
      expect(result.recommendation.should_extend).toBe(true);
      expect(result.recommendation.estimated_questions).toBeGreaterThan(0);
    });

    test('高精度应该不建议扩展', () => {
      const manyResponses = [];
      for (let i = 0; i < 20; i++) {
        manyResponses.push({
          item: { a: 2.5, b: (i % 5) * 0.2 - 0.4, c: 0.1 },
          is_correct: i % 2 === 0
        });
      }

      const result = assessAbility(manyResponses, 1.0);  // 宽松目标

      expect(result.recommendation.should_extend).toBe(false);
      expect(result.recommendation.estimated_questions).toBe(0);
    });
  });

  describe('边界情况', () => {
    test('应该处理极端theta值', () => {
      const item = { a: 1, b: 0, c: 0.25 };

      expect(() => threePLModel(4, item)).not.toThrow();
      expect(() => threePLModel(-4, item)).not.toThrow();
    });

    test('应该处理空题目列表', () => {
      const se = calculateStandardError(0, []);

      expect(se).toBe(1);  // 无信息时返回最大误差
    });

    test('应该处理极端题目参数', () => {
      const extremeItem = { a: 0.1, b: 3, c: 0.5 };

      expect(() => threePLModel(0, extremeItem)).not.toThrow();
    });
  });
});
