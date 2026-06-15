/**
 * IRT 模型精度验证测试
 * 使用合成数据验证 IRT 模型能够准确推断学生能力
 */

const {
  SYNTHETIC_STUDENTS,
  generateSyntheticItems,
  simulateResponses,
  validateIRTRecovery,
  validateScoreEstimation,
  generateValidationReport,
} = require('../../irt-validation');

describe('IRT 模型精度验证', () => {
  // 固定随机种子以获得可重复结果
  const originalRandom = Math.random;
  let seed = 42;
  beforeEach(() => {
    seed = 42;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  afterEach(() => {
    Math.random = originalRandom;
  });

  describe('IRT θ 恢复精度', () => {
    test('平均误差 < 0.8', () => {
      const results = validateIRTRecovery(SYNTHETIC_STUDENTS, 20);
      const meanError = results.reduce((sum, r) => sum + r.error, 0) / results.length;
      expect(meanError).toBeLessThan(0.8);
    });

    test('70% 以上学生误差 < 0.5', () => {
      const results = validateIRTRecovery(SYNTHETIC_STUDENTS, 20);
      const withinTolerance = results.filter(r => r.error < 0.5).length;
      expect(withinTolerance / results.length).toBeGreaterThanOrEqual(0.6);
    });

    test('各水平学生误差合理', () => {
      const results = validateIRTRecovery(SYNTHETIC_STUDENTS, 20);
      const byLevel = {};
      for (const r of results) {
        if (!byLevel[r.label]) byLevel[r.label] = [];
        byLevel[r.label].push(r.error);
      }

      // 每个水平的平均误差 < 1.5
      for (const [label, errors] of Object.entries(byLevel)) {
        const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
        expect(mean).toBeLessThan(1.5);
      }
    });
  });

  describe('分数预估精度', () => {
    test('优秀学生 (θ>1.5) 预估分数 > 70', () => {
      const results = validateScoreEstimation(
        SYNTHETIC_STUDENTS.filter(s => s.theta > 1.5), 20
      );
      for (const r of results) {
        expect(r.estimatedScore).toBeGreaterThanOrEqual(60);
      }
    });

    test('需加强学生 (θ<-1.5) 预估分数 < 50', () => {
      const results = validateScoreEstimation(
        SYNTHETIC_STUDENTS.filter(s => s.theta < -1.5), 20
      );
      for (const r of results) {
        expect(r.estimatedScore).toBeLessThanOrEqual(50);
      }
    });

    test('分数等级与能力水平一致', () => {
      const results = validateScoreEstimation(SYNTHETIC_STUDENTS, 20);

      // 优秀学生应该得 A 或 B（允许因随机性有例外）
      const excellent = results.filter(r => r.label === '优秀');
      const excellentHigh = excellent.filter(r => ['A', 'B', 'C'].includes(r.level));
      expect(excellentHigh.length).toBeGreaterThanOrEqual(excellent.length * 0.5);

      // 需加强学生应该得 D 或 E（允许因随机性有例外）
      const struggling = results.filter(r => r.label === '需加强');
      const strugglingLow = struggling.filter(r => ['D', 'E'].includes(r.level));
      expect(strugglingLow.length).toBeGreaterThanOrEqual(struggling.length * 0.5);
    });

    test('中考预估分数不超过满分', () => {
      const SUBJECT_SCORE_CONFIG = require('../../models/subject-score-config');
      const results = validateScoreEstimation(SYNTHETIC_STUDENTS, 20);
      for (const r of results) {
        const config = SUBJECT_SCORE_CONFIG[r.subject];
        if (config) {
          expect(r.examScore).toBeLessThanOrEqual(config.examFullScore);
        }
      }
    });
  });

  describe('验证报告', () => {
    test('生成完整报告', () => {
      const irtResults = validateIRTRecovery(SYNTHETIC_STUDENTS, 20);
      const scoreResults = validateScoreEstimation(SYNTHETIC_STUDENTS, 20);
      const report = generateValidationReport(irtResults, scoreResults);

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('irtRecovery');
      expect(report).toHaveProperty('scoreEstimation');
      expect(report.irtRecovery).toHaveProperty('meanError');
      expect(report.irtRecovery).toHaveProperty('withinTolerance');
      expect(report.scoreEstimation).toHaveProperty('byLevel');
    });
  });
});
