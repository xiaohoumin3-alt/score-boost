/**
 * IRT 模型（Item Response Theory）
 * 2PL 模型实现 + 动态 θ 估计
 * 版本: v2.0
 */

const SCORE_CONSTANTS = require('./score-constants');

class IRTModel {
  constructor() {
    // 题目参数库：{item_id: {a, b, subject, grade, knowledge_point}}
    this.itemBank = {};
    
    // 学生能力缓存
    this.abilityCache = {};
  }

  /**
   * 加载题目参数
   */
  loadItemBank(items) {
    for (const item of items) {
      this.itemBank[item.item_id] = {
        a: item.discrimination || 1.0,
        b: item.difficulty || 0,
        subject: item.subject,
        grade: item.grade,
        knowledgePoint: item.knowledge_point,
      };
    }
  }

  /**
   * 计算答对概率（2PL 模型）
   */
  probability(theta, a, b) {
    const z = a * (theta - b);
    if (z > 20) return 0.9999;
    if (z < -20) return 0.0001;
    return 1 / (1 + Math.exp(-z));
  }

  /**
   * 正确率转初始 θ（logit 变换）
   */
  rateToTheta(rate) {
    if (rate <= 0.01) return -3;
    if (rate >= 0.99) return 3;
    return Math.log(rate / (1 - rate));
  }

  /**
   * 估计学生能力值 (θ)
   * 使用牛顿法迭代优化
   */
  estimateAbility(responses) {
    if (responses.length === 0) {
      return { theta: 0, se: 1, confidence: 0 };
    }

    // 动态初始值：基于正确率
    const correctCount = responses.filter(r => r.correct).length;
    const initialRate = correctCount / responses.length;
    let theta = this.rateToTheta(initialRate);

    // 牛顿法迭代
    const C = SCORE_CONSTANTS;
    for (let iter = 0; iter < C.IRT_MAX_ITERATIONS; iter++) {
      let gradient = 0;
      let hessian = 0;

      for (const r of responses) {
        const item = this.itemBank[r.item_id] || { a: 1, b: 0 };
        const p = this.probability(theta, item.a, item.b);
        const q = 1 - p;

        gradient += item.a * (r.correct - p);
        hessian += item.a * item.a * p * q;
      }

      if (Math.abs(hessian) < C.IRT_INFORMATION_THRESHOLD) break;

      const delta = gradient / hessian;
      theta += delta;

      // 防止发散：限制 theta 范围
      theta = Math.max(-4, Math.min(4, theta));

      if (Math.abs(delta) < C.IRT_CONVERGENCE_THRESHOLD) break;
    }

    // 计算标准误 (SE)
    let information = 0;
    for (const r of responses) {
      const item = this.itemBank[r.item_id] || { a: 1, b: 0 };
      const p = this.probability(theta, item.a, item.b);
      information += item.a * item.a * p * (1 - p);
    }
    const se = information > 0 ? 1 / Math.sqrt(information) : 1;

    // 计算置信度
    const confidence = Math.min(0.95, Math.max(0.1, 1 - se / 2));

    return {
      theta: Math.round(theta * 1000) / 1000,
      se: Math.round(se * 1000) / 1000,
      confidence: Math.round(confidence * 100),
      questionCount: responses.length,
    };
  }

  /**
   * 动态 θ 估计（替代固定初始值）
   * 前 5 题用正确率推算，5 题后用 IRT
   */
  getInitialTheta(responses) {
    if (responses.length < 5) {
      const correctRate = responses.filter(r => r.correct).length / Math.max(1, responses.length);
      return this.rateToTheta(correctRate);
    }
    return this.estimateAbility(responses).theta;
  }

  /**
   * 在线更新能力值
   */
  updateAbility(studentId, newResponses) {
    const cached = this.abilityCache[studentId] || { responses: [] };
    const allResponses = [...cached.responses, ...newResponses];
    
    const result = this.estimateAbility(allResponses);
    
    this.abilityCache[studentId] = {
      ...result,
      responses: allResponses,
      lastUpdate: Date.now(),
    };

    return result;
  }
}

module.exports = IRTModel;
