/**
 * 冷启动管理器
 * 规则-based 冷启动 + 在线微调
 * 版本: v2.0
 */

const SCORE_CONSTANTS = require('./score-constants');

class ColdStartManager {
  constructor() {
    // 预训练的题目参数（从数据库或配置加载）
    this.pretrainedItems = null;
  }

  /**
   * 加载预训练模型（规则-based，无需真实数据）
   * 每个知识点的默认难度和区分度基于年级和科目类型
   */
  loadPretrainedModel(subject, grade) {
    const gradeNum = parseInt(grade) || 8;
    
    // 根据年级和科目设置默认参数
    const defaultParams = {
      // 小学：简单题为主
      primary: { discrimination: 1.0, difficultyBase: -1.0 },
      // 初中：中等难度
      junior: { discrimination: 1.2, difficultyBase: 0.0 },
    };
    
    const gradeBand = gradeNum <= 6 ? 'primary' : 'junior';
    const params = defaultParams[gradeBand];
    
    // 根据科目调整
    const subjectAdjust = {
      math: 0,
      chinese: 0.2,
      english: 0.1,
      physics: 0.3,
      chemistry: 0.3,
      biology: 0.1,
      geography: 0.1,
      history: 0.1,
      politics: 0.1,
    };
    
    const adjust = subjectAdjust[subject] || 0;
    
    this.pretrainedItems = {
      discrimination: params.discrimination,
      difficultyBase: params.difficultyBase + adjust,
    };
    
    return this.pretrainedItems;
  }

  /**
   * 获取新用户的初始能力值
   * 基于年级的合理默认值
   */
  getInitialAbility(grade) {
    const gradeNum = parseInt(grade) || 8;
    
    // 年级 → 初始 θ 映射（基于年级平均水平）
    const gradeThetaMap = {
      1: -1.5, 2: -1.3, 3: -1.1, 4: -0.9, 5: -0.7, 6: -0.5,
      7: -0.2, 8: 0.1, 9: 0.4
    };
    
    return {
      theta: gradeThetaMap[gradeNum] || 0,
      se: 1.5,  // 高不确定性
      confidence: 0.2,  // 低置信度
      source: 'cold_start',
    };
  }

  /**
   * 为新题目生成默认参数
   * 基于年级、科目、知识点类型
   */
  generateItemParams(subject, grade, knowledgePoint) {
    const gradeNum = parseInt(grade) || 8;
    const gradeBand = gradeNum <= 6 ? 'primary' : 'junior';
    
    // 基础难度：根据年级
    let baseDifficulty = gradeBand === 'primary' ? -1.0 : 0.0;
    
    // 知识点类型调整
    if (knowledgePoint) {
      const kp = knowledgePoint.toLowerCase();
      if (kp.includes('基础') || kp.includes('认识') || kp.includes('计算')) {
        baseDifficulty -= 0.5;
      } else if (kp.includes('应用') || kp.includes('综合') || kp.includes('拓展')) {
        baseDifficulty += 0.5;
      }
    }
    
    return {
      discrimination: 1.0 + Math.random() * 0.5,  // 1.0 - 1.5
      difficulty: baseDifficulty + (Math.random() - 0.5) * 0.5,
      source: 'cold_start',
    };
  }

  /**
   * 检查是否需要冷启动
   */
  needsColdStart(studentId, subject) {
    // 如果没有缓存数据，需要冷启动
    return !this.pretrainedItems;
  }
}

module.exports = ColdStartManager;
