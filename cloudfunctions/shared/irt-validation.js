/**
 * IRT 模型验证框架
 * 使用合成数据验证 IRT 模型的精度
 * 目标：证明模型能够从选择题正确率准确推断学生能力
 * 版本: v1.0
 */

const IRTModel = require('./models/irt-model');
const ScoreEstimator = require('./models/score-estimator');
const ScoreMapper = require('./models/score-mapper');
const SUBJECT_SCORE_CONFIG = require('./models/subject-score-config');

/**
 * 合成学生参数
 * 基于教育统计：学生能力近似正态分布
 */
const SYNTHETIC_STUDENTS = [
  // 优秀学生 (θ = 1.5 ~ 2.5)
  { id: 'S01', theta: 2.0, label: '优秀', grade: '8', subject: 'math' },
  { id: 'S02', theta: 1.8, label: '优秀', grade: '8', subject: 'math' },
  { id: 'S03', theta: 2.2, label: '优秀', grade: '7', subject: 'chinese' },
  { id: 'S04', theta: 1.6, label: '优秀', grade: '9', subject: 'physics' },

  // 良好学生 (θ = 0.5 ~ 1.5)
  { id: 'S05', theta: 1.0, label: '良好', grade: '8', subject: 'math' },
  { id: 'S06', theta: 0.8, label: '良好', grade: '8', subject: 'math' },
  { id: 'S07', theta: 1.2, label: '良好', grade: '7', subject: 'chinese' },
  { id: 'S08', theta: 0.6, label: '良好', grade: '9', subject: 'physics' },

  // 及格学生 (θ = -0.5 ~ 0.5)
  { id: 'S09', theta: 0.0, label: '及格', grade: '8', subject: 'math' },
  { id: 'S10', theta: -0.3, label: '及格', grade: '8', subject: 'math' },
  { id: 'S11', theta: 0.2, label: '及格', grade: '7', subject: 'chinese' },
  { id: 'S12', theta: -0.1, label: '及格', grade: '9', subject: 'physics' },

  // 待提高学生 (θ = -1.5 ~ -0.5)
  { id: 'S13', theta: -1.0, label: '待提高', grade: '8', subject: 'math' },
  { id: 'S14', theta: -0.8, label: '待提高', grade: '8', subject: 'math' },
  { id: 'S15', theta: -1.2, label: '待提高', grade: '7', subject: 'chinese' },
  { id: 'S16', theta: -0.6, label: '待提高', grade: '9', subject: 'physics' },

  // 需加强学生 (θ = -2.5 ~ -1.5)
  { id: 'S17', theta: -2.0, label: '需加强', grade: '8', subject: 'math' },
  { id: 'S18', theta: -1.8, label: '需加强', grade: '8', subject: 'math' },
  { id: 'S19', theta: -2.2, label: '需加强', grade: '7', subject: 'chinese' },
  { id: 'S20', theta: -1.6, label: '需加强', grade: '9', subject: 'physics' },
];

/**
 * 生成合成题目参数
 * 基于真实考试的题目难度分布
 */
function generateSyntheticItems(subject, grade, count = 20) {
  const items = [];
  const gradeNum = parseInt(grade) || 8;

  // 难度分布：easy 40%, medium 40%, hard 20%
  const difficulties = [
    ...Array(Math.floor(count * 0.4)).fill('easy'),
    ...Array(Math.floor(count * 0.4)).fill('medium'),
    ...Array(count - Math.floor(count * 0.4) * 2).fill('hard'),
  ];

  for (let i = 0; i < count; i++) {
    const diff = difficulties[i] || 'medium';
    let b, a;

    switch (diff) {
      case 'easy':
        b = -1.5 + (Math.random() - 0.5) * 1.0;  // -2.0 ~ -1.0
        a = 0.8 + Math.random() * 0.6;             // 0.8 ~ 1.4
        break;
      case 'medium':
        b = -0.3 + (Math.random() - 0.5) * 0.6;   // -0.6 ~ 0.0
        a = 1.0 + Math.random() * 0.8;             // 1.0 ~ 1.8
        break;
      case 'hard':
        b = 1.0 + (Math.random() - 0.5) * 1.0;    // 0.5 ~ 1.5
        a = 1.2 + Math.random() * 0.8;             // 1.2 ~ 2.0
        break;
    }

    items.push({
      item_id: `${subject}_g${grade}_q${i + 1}`,
      discrimination: Math.round(a * 100) / 100,
      difficulty: Math.round(b * 100) / 100,
      subject,
      grade,
      difficulty_level: diff,
    });
  }

  return items;
}

/**
 * 使用 IRT 模型模拟学生答题
 * P(correct) = 1 / (1 + exp(-a*(θ - b)))
 */
function simulateResponses(studentTheta, items) {
  const responses = [];

  for (const item of items) {
    const a = item.discrimination || item.a || 1.0;
    const b = item.difficulty || item.b || 0;
    const p = 1 / (1 + Math.exp(-a * (studentTheta - b)));
    const correct = Math.random() < p ? 1 : 0;

    responses.push({
      item_id: item.item_id,
      correct,
      question_type: 'choice',
    });
  }

  return responses;
}

/**
 * 验证 IRT 模型精度
 * 检查：估计的 θ 是否接近真实 θ
 */
function validateIRTRecovery(students, itemsPerSubject = 20) {
  const results = [];

  for (const student of students) {
    const items = generateSyntheticItems(student.subject, student.grade, itemsPerSubject);
    const responses = simulateResponses(student.theta, items);

    // 使用 IRT 模型估计 θ
    const irt = new IRTModel();
    irt.loadItemBank(items);
    const estimated = irt.estimateAbility(responses);

    // 计算误差
    const error = Math.abs(estimated.theta - student.theta);
    const errorPercent = Math.abs(error / student.theta) * 100;

    results.push({
      studentId: student.id,
      trueTheta: student.theta,
      estimatedTheta: estimated.theta,
      error: Math.round(error * 1000) / 1000,
      errorPercent: Math.round(errorPercent * 10) / 10,
      se: estimated.se,
      confidence: estimated.confidence,
      label: student.label,
      subject: student.subject,
      grade: student.grade,
    });
  }

  return results;
}

/**
 * 验证分数预估精度
 * 检查：预估分数是否合理
 */
function validateScoreEstimation(students, itemsPerSubject = 20) {
  const results = [];

  for (const student of students) {
    const items = generateSyntheticItems(student.subject, student.grade, itemsPerSubject);
    const responses = simulateResponses(student.theta, items);

    // 使用 ScoreEstimator 预估分数
    const estimator = new ScoreEstimator(student.subject);
    estimator.irtModel.loadItemBank(items);
    const estimation = estimator.estimateFromResponses(responses, student.grade);

    // 计算正确率
    const correctCount = responses.filter(r => r.correct).length;
    const accuracy = correctCount / responses.length;

    results.push({
      studentId: student.id,
      trueTheta: student.theta,
      accuracy: Math.round(accuracy * 100),
      estimatedScore: estimation.estimatedScore,
      examScore: estimation.examScore,
      level: estimation.level,
      levelText: estimation.text,
      confidence: estimation.confidence,
      label: student.label,
      subject: student.subject,
    });
  }

  return results;
}

/**
 * 生成验证报告
 */
function generateValidationReport(irtResults, scoreResults) {
  const report = {
    timestamp: new Date().toISOString(),
    irtRecovery: {
      meanError: 0,
      maxError: 0,
      withinTolerance: 0,  // 误差 < 0.5 的比例
      byLevel: {},
    },
    scoreEstimation: {
      byLevel: {},
    },
  };

  // IRT 恢复精度统计
  let totalError = 0;
  for (const r of irtResults) {
    totalError += r.error;
    if (r.error < 0.5) report.irtRecovery.withinTolerance++;

    if (!report.irtRecovery.byLevel[r.label]) {
      report.irtRecovery.byLevel[r.label] = { count: 0, totalError: 0, maxError: 0 };
    }
    const level = report.irtRecovery.byLevel[r.label];
    level.count++;
    level.totalError += r.error;
    level.maxError = Math.max(level.maxError, r.error);
  }

  report.irtRecovery.meanError = Math.round(totalError / irtResults.length * 1000) / 1000;
  report.irtRecovery.maxError = Math.max(...irtResults.map(r => r.error));
  report.irtRecovery.withinTolerance = Math.round(report.irtRecovery.withinTolerance / irtResults.length * 100);

  for (const [label, level] of Object.entries(report.irtRecovery.byLevel)) {
    level.meanError = Math.round(level.totalError / level.count * 1000) / 1000;
    delete level.totalError;
  }

  // 分数预估统计
  for (const r of scoreResults) {
    if (!report.scoreEstimation.byLevel[r.label]) {
      report.scoreEstimation.byLevel[r.label] = { count: 0, scores: [], exams: [] };
    }
    const level = report.scoreEstimation.byLevel[r.label];
    level.count++;
    level.scores.push(r.estimatedScore);
    level.exams.push(r.examScore);
  }

  for (const [label, level] of Object.entries(report.scoreEstimation.byLevel)) {
    level.meanScore = Math.round(level.scores.reduce((a, b) => a + b, 0) / level.count);
    level.meanExam = Math.round(level.exams.reduce((a, b) => a + b, 0) / level.count);
    delete level.scores;
    delete level.exams;
  }

  return report;
}

module.exports = {
  SYNTHETIC_STUDENTS,
  generateSyntheticItems,
  simulateResponses,
  validateIRTRecovery,
  validateScoreEstimation,
  generateValidationReport,
};

// CLI 入口
if (require.main === module) {
  console.log('=== IRT 模型验证 ===\n');

  // 1. IRT θ 恢复验证
  console.log('1. IRT θ 恢复验证');
  const irtResults = validateIRTRecovery(SYNTHETIC_STUDENTS);
  for (const r of irtResults) {
    const status = r.error < 0.5 ? '✓' : '✗';
    console.log(`  ${status} ${r.studentId} (${r.label}): true=${r.trueTheta}, est=${r.estimatedTheta}, error=${r.error}`);
  }

  // 2. 分数预估验证
  console.log('\n2. 分数预估验证');
  const scoreResults = validateScoreEstimation(SYNTHETIC_STUDENTS);
  for (const r of scoreResults) {
    console.log(`  ${r.studentId} (${r.label}): accuracy=${r.accuracy}%, score=${r.estimatedScore}, exam=${r.examScore}, level=${r.level}`);
  }

  // 3. 生成报告
  const report = generateValidationReport(irtResults, scoreResults);
  console.log('\n3. 验证报告');
  console.log(JSON.stringify(report, null, 2));
}
