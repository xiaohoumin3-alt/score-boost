/**
 * 在线学习器
 * 基于用户答题数据更新模型参数
 * 版本: v2.0
 */

const SCORE_CONSTANTS = require('./score-constants');

class OnlineLearner {
  constructor() {
    // 题目统计：{item_id: {correct_count, total_count, last_updated}}
    this.itemStats = {};
    
    // 学生统计：{student_id: {responses: [], theta_history: []}}
    this.studentStats = {};
  }

  /**
   * 记录答题数据
   */
  recordResponse(studentId, itemId, correct, responseTime) {
    // 更新题目统计
    if (!this.itemStats[itemId]) {
      this.itemStats[itemId] = { correct_count: 0, total_count: 0 };
    }
    this.itemStats[itemId].total_count++;
    if (correct) this.itemStats[itemId].correct_count++;

    // 更新学生统计
    if (!this.studentStats[studentId]) {
      this.studentStats[studentId] = { responses: [], theta_history: [] };
    }
    this.studentStats[studentId].responses.push({
      item_id: itemId,
      correct,
      response_time: responseTime,
    });
  }

  /**
   * 基于答题数据更新题目难度
   * 使用简易 EM 算法
   */
  updateItemDifficulty(itemId, currentTheta) {
    const stats = this.itemStats[itemId];
    if (!stats || stats.total_count < 10) {
      return null;  // 数据不足，不更新
    }

    const correctRate = stats.correct_count / stats.total_count;
    
    // 简易难度估计：正确率越低，难度越高
    // 使用 logit 变换的逆变换
    let newDifficulty;
    if (correctRate <= 0.01) {
      newDifficulty = 3;  // 极难
    } else if (correctRate >= 0.99) {
      newDifficulty = -3;  // 极简单
    } else {
      newDifficulty = Math.log(correctRate / (1 - correctRate));
    }

    // 贝叶斯更新：新估计和旧估计的加权平均
    const oldDifficulty = this.itemStats[itemId].difficulty || 0;
    const weight = Math.min(1, stats.total_count / 100);  // 数据越多，新估计权重越高
    const updatedDifficulty = oldDifficulty * (1 - weight) + newDifficulty * weight;

    this.itemStats[itemId].difficulty = updatedDifficulty;
    this.itemStats[itemId].updated = true;

    return {
      itemId,
      oldDifficulty,
      newDifficulty: Math.round(updatedDifficulty * 1000) / 1000,
      sampleSize: stats.total_count,
      confidence: Math.round(weight * 100),
    };
  }

  /**
   * 批量更新所有题目的难度
   */
  updateAllItemDifficulties() {
    const updates = [];
    for (const itemId of Object.keys(this.itemStats)) {
      const update = this.updateItemDifficulty(itemId);
      if (update) updates.push(update);
    }
    return updates;
  }

  /**
   * 获取题目难度统计
   */
  getItemStats(itemId) {
    return this.itemStats[itemId] || null;
  }

  /**
   * 获取学生答题历史
   */
  getStudentHistory(studentId) {
    return this.studentStats[studentId] || { responses: [], theta_history: [] };
  }

  /**
   * 导出统计数据（用于持久化）
   */
  exportStats() {
    return {
      itemStats: this.itemStats,
      studentStats: this.studentStats,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * 导入统计数据
   */
  importStats(data) {
    if (data.itemStats) this.itemStats = data.itemStats;
    if (data.studentStats) this.studentStats = data.studentStats;
  }
}

module.exports = OnlineLearner;
