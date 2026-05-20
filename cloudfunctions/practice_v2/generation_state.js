/**
 * 生成状态跟踪器
 * 跟踪已使用的场景、数值、问法，防止重复
 */
class GenerationState {
  constructor() {
    this.used_scenarios = [];
    this.used_triples = [];
    this.used_question_patterns = [];
    this.recent_questions = [];
  }

  /**
   * 记录已使用的题目信息
   * @param {Object} q - 题目对象
   * @param {string} q.scenario_used - 使用的场景
   * @param {Array} q.triple_used - 使用的勾股数
   * @param {string} q.question_pattern - 问法类型
   */
  recordQuestion(q) {
    if (!q) return;

    if (q.scenario_used) {
      this.used_scenarios.push(q.scenario_used);
    }
    if (q.triple_used) {
      this.used_triples.push(q.triple_used);
    }
    if (q.question_pattern) {
      this.used_question_patterns.push(q.question_pattern);
    }
    this.recent_questions.push(q);

    // 保持最近5题
    if (this.recent_questions.length > 5) {
      const removed = this.recent_questions.shift();
      // 同步移除used_scenarios和used_triples中的旧记录
      if (removed?.scenario_used) {
        this.used_scenarios.shift();
      }
      if (removed?.triple_used) {
        this.used_triples.shift();
      }
      if (removed?.question_pattern) {
        this.used_question_patterns.shift();
      }
    }
  }

  /**
   * 获取已使用的场景列表
   * @returns {Array<string>}
   */
  getUsedScenarios() {
    return this.used_scenarios;
  }

  /**
   * 获取已使用的数值列表
   * @returns {Array<Array<number>>}
   */
  getUsedTriples() {
    return this.used_triples;
  }

  /**
   * 获取最近使用的问法（最多3个）
   * @returns {Array<string>}
   */
  getUsedPatterns() {
    return this.used_question_patterns.slice(-3);
  }

  /**
   * 重置状态
   */
  reset() {
    this.used_scenarios = [];
    this.used_triples = [];
    this.used_question_patterns = [];
    this.recent_questions = [];
  }
}

module.exports = GenerationState;
