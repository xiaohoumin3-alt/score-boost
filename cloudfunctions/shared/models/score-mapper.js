/**
 * 分数映射器
 * 从选择题正确率预估真实考试分数
 * 版本: v2.0
 */

const SCORE_CONSTANTS = require('./score-constants');
const SUBJECT_SCORE_CONFIG = require('./subject-score-config');

class ScoreMapper {
  constructor(subject) {
    // 中文科目名映射
    const subjectMap = {
      '数学': 'math',
      '语文': 'chinese',
      '英语': 'english',
      '物理': 'physics',
      '化学': 'chemistry',
      '生物': 'biology',
      '地理': 'geography',
      '历史': 'history',
      '政治': 'politics'
    };

    const normalizedSubject = subjectMap[subject] || subject;
    this.config = SUBJECT_SCORE_CONFIG[normalizedSubject];
    if (!this.config) throw new Error(`Unknown subject: ${subject}`);
    this.subject = normalizedSubject;
  }

  /**
   * 核心算法：从选择题正确率预估真实分数
   */
  estimateScore(choiceCorrect, choiceTotal, difficultyAvg, grade) {
    const { examFullScore, schoolFullScore, examWeight, questionTypes } = this.config;
    const C = SCORE_CONSTANTS;

    // 识别学段：小学1-6年级，初中7-9年级
    const gradeNum = parseInt(grade) || 8;
    const isPrimarySchool = gradeNum >= 1 && gradeNum <= 6;
    const isMiddleSchool = gradeNum >= 7 && gradeNum <= 9;

    // 小学使用100分满分，不适用中考预估
    const effectiveFullScore = isPrimarySchool ? 100 : schoolFullScore;
    const effectiveExamWeight = isPrimarySchool ? 1.0 : examWeight;
    const effectiveExamFullScore = isPrimarySchool ? 100 : examFullScore;

    // 1. 选择题正确率
    const choiceRate = choiceTotal > 0 ? choiceCorrect / choiceTotal : 0;

    // 2. 选择题得分（基于有效满分）
    const choiceRatio = isPrimarySchool ? 0.4 : questionTypes.choice.ratio; // 小学选择题占比40%
    const choiceFullScore = effectiveFullScore * choiceRatio;
    const choiceScore = Math.round(choiceRate * choiceFullScore);
    
    // 3. 推算其他题型得分（基于有效满分）
    const otherRatio = isPrimarySchool
      ? 0.6
      : (1 - questionTypes.choice.ratio); // 初中：其他题型 = 1 - 选择题比例
    const otherScore = this.estimateOtherTypeScores(choiceRate, difficultyAvg, effectiveFullScore, otherRatio);

    // 4. 总分 + 难度修正
    const rawTotal = choiceScore + otherScore;
    const difficultyBonus = (difficultyAvg - 0.5) * C.DIFFICULTY_BONUS_SCALE;
    const adjustedTotal = rawTotal + difficultyBonus;

    // 5. 年级修正（根据正确率动态调整）
    const baseGradeCorrection = isPrimarySchool ? 1.0 : (C.GRADE_CORRECTIONS[gradeNum] || 1.0);
    // choiceRate <= 0.5 时不修正，0.5-0.7 之间渐进修正，>= 0.7 应用完整修正
    const effectiveCorrection = choiceRate <= 0.5
      ? 1.0
      : choiceRate >= 0.7
        ? baseGradeCorrection
        : baseGradeCorrection + (0.7 - choiceRate) * (1 - baseGradeCorrection) / 0.2;
    const finalScore = Math.min(adjustedTotal * effectiveCorrection, effectiveFullScore);

    // 6. 置信度
    const confidence = this.calculateConfidence(choiceTotal, choiceRate);

    // 7. 中考预估（仅初中）
    let examScore = null;
    if (isMiddleSchool) {
      examScore = Math.min(
        Math.round(finalScore * effectiveExamWeight),
        effectiveExamFullScore
      );
    } else {
      examScore = finalScore; // 小学"期末预估"=平时预估
    }

    // 8. 等级（基于有效满分）
    const gradeInfo = this.getGradeLevel(finalScore, effectiveFullScore);
    
    return {
      choiceCorrect,
      choiceTotal,
      choiceRate: Math.round(choiceRate * 100),
      choiceScore,
      estimatedScore: Math.round(finalScore),
      examScore: examScore ? Math.round(examScore) : null,
      confidence: Math.round(confidence * 100),
      margin: Math.round((1 - confidence) * 12),
      isPrimarySchool, // 标识学段
      ...gradeInfo,
      diagnostics: {
        rawTotal: Math.round(rawTotal),
        difficultyBonus: Math.round(difficultyBonus),
        gradeCorrection: effectiveCorrection,
        otherTypeScore: Math.round(otherScore),
      }
    };
  }

  /**
   * 推算其他题型得分
   */
  estimateOtherTypeScores(choiceRate, difficultyAvg, fullScore = 100, otherRatio = 0.6) {
    const C = SCORE_CONSTANTS;

    const otherFullScore = fullScore * otherRatio;

    // 基础系数（受难度影响）
    const baseCoefficient = C.CORRELATION_COEF_BASE - (difficultyAvg - 0.5) * C.DIFFICULTY_SENSITIVITY;
    // 根据正确率调整：高正确率时提高相关性系数，低正确率时降低
    const rateAdjustedCoefficient = baseCoefficient + (choiceRate - 0.5) * 0.1;
    const coefficient = Math.min(1.0, Math.max(0.5, rateAdjustedCoefficient));

    return Math.round(choiceRate * otherFullScore * coefficient);
  }

  /**
   * 计算置信度
   */
  calculateConfidence(questionCount, choiceRate) {
    const C = SCORE_CONSTANTS;
    const volumeFactor = Math.min(1, questionCount / C.VOLUME_THRESHOLD);
    const extremityPenalty = Math.pow(Math.abs(choiceRate - 0.5), C.EXTREMITY_PENALTY_POWER) * C.EXTREMITY_PENALTY_SCALE;
    return Math.min(0.95, Math.max(0.1, volumeFactor - extremityPenalty));
  }

  /**
   * 获取分数等级
   */
  getGradeLevel(score, fullScore) {
    const rate = score / fullScore;
    if (rate >= 0.9) return { level: 'A', text: '优秀', color: '#00D9A5', emoji: '🏆' };
    if (rate >= 0.75) return { level: 'B', text: '良好', color: '#4CAF50', emoji: '👍' };
    if (rate >= 0.6) return { level: 'C', text: '及格', color: '#FFA94D', emoji: '✅' };
    if (rate >= 0.4) return { level: 'D', text: '待提高', color: '#FF6B6B', emoji: '📝' };
    return { level: 'E', text: '需加强', color: '#FF4444', emoji: '💪' };
  }
}

module.exports = ScoreMapper;
