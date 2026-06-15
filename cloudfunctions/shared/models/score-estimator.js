/**
 * 分数估算器
 * 整合 IRT 模型 + 分数映射器
 * 版本: v2.0
 */

const IRTModel = require('./irt-model');
const ScoreMapper = require('./score-mapper');

class ScoreEstimator {
  constructor(subject) {
    this.subject = subject;
    this.irtModel = new IRTModel();
    this.scoreMapper = new ScoreMapper(subject);
  }

  /**
   * 从答题记录预估分数
   */
  estimateFromResponses(responses, grade) {
    // 1. IRT 估计能力值
    const abilityResult = this.irtModel.estimateAbility(responses);
    
    // 2. 计算选择题正确率
    const choiceResponses = responses.filter(r => r.question_type === 'choice');
    const choiceCorrect = choiceResponses.filter(r => r.correct).length;
    const choiceTotal = choiceResponses.length;
    const choiceRate = choiceTotal > 0 ? choiceCorrect / choiceTotal : 0;

    // 3. 计算平均难度
    const difficultyAvg = responses.length > 0
      ? responses.reduce((sum, r) => {
          const item = this.irtModel.itemBank[r.item_id] || { b: 0 };
          return sum + (item.b + 3) / 6;
        }, 0) / responses.length
      : 0.5;

    // 4. 使用分数映射器
    const scoreResult = this.scoreMapper.estimateScore(
      choiceCorrect,
      choiceTotal,
      difficultyAvg,
      grade
    );

    // 5. 结合 IRT 能力值修正
    const irtBonus = abilityResult.theta * 5;
    const finalScore = Math.min(
      scoreResult.estimatedScore + irtBonus,
      this.scoreMapper.config.schoolFullScore
    );

    // 6. 重新计算等级（基于修正后的分数）
    const gradeInfo = this.scoreMapper.getGradeLevel(
      finalScore,
      this.scoreMapper.config.schoolFullScore
    );

    return {
      // IRT 结果
      theta: abilityResult.theta,
      se: abilityResult.se,

      // 分数结果
      ...scoreResult,
      estimatedScore: Math.round(finalScore),

      // 覆盖等级为修正后的等级
      ...gradeInfo,

      // 综合置信度
      confidence: Math.round(
        (scoreResult.confidence + abilityResult.confidence) / 2
      ),
    };
  }
}

module.exports = ScoreEstimator;
