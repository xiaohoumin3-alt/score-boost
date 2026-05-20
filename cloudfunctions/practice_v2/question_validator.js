/**
 * 题目质量验证器
 * 验证选项均衡、反模板化、问法多样性
 */
class QuestionValidator {
  /**
   * 验证选项长度均衡
   * @param {Object} q - 题目对象
   * @returns {Object} {pass: boolean, max, min, diff}
   */
  validateOptionsBalance(q) {
    const options = q.options || [];
    if (options.length === 0) return { pass: false };

    const lengths = options.map(o => o.value ? o.value.length : 0);
    const max = Math.max(...lengths);
    const min = Math.min(...lengths);

    const diff = max > 0 ? (max - min) / max : 0;
    return {
      max,
      min,
      diff,
      pass: diff < 0.3
    };
  }

  /**
   * 验证无模板化表达
   * @param {Object} q - 题目对象
   * @returns {Object} {pass: boolean, detected: Array}
   */
  validateNoPatternization(q) {
    const patterns = [
      /3[- ]*4[- ]*5.*直角三角形/,
      /直角三角形.*边长.*3.*4.*5/,
      /计算.*√\(.*\).*值/,
      /^求(斜边|直角边)长度$/
    ];
    const detected = patterns.filter(p => p.test(q.question));
    return {
      pass: detected.length === 0,
      detected: detected.map(p => p.source)
    };
  }

  /**
   * 验证问法多样性
   * @param {Array} questions - 题目列表
   * @param {number} minPatterns - 最少问法种类
   * @returns {Object} {diversity: number, pass: boolean}
   */
  validateQuestionPatternDiversity(questions, minPatterns = 2) {
    const patterns = new Set();
    const patternRegex = [
      { type: '求值', regex: /求(.*?)(的值|是多少|长|宽|高)/ },
      { type: '计算', regex: /计算(.*?)(的值|结果)/ },
      { type: '判断', regex: /判断(.*?)(是否|是)/ },
      { type: '选择', regex: /以下.*?正确/ }
    ];

    questions.forEach(q => {
      patternRegex.forEach(({ type, regex }) => {
        if (regex.test(q.question)) patterns.add(type);
      });
    });

    return {
      diversity: patterns.size,
      pass: patterns.size >= minPatterns
    };
  }

  /**
   * 综合验证
   * @param {Object} q - 题目对象
   * @param {Object} context - 上下文信息
   * @returns {Object} {pass: boolean, details: Object, retry: boolean, errors: Array}
   */
  validate(q, context) {
    const results = {
      optionsBalance: this.validateOptionsBalance(q),
      noPatternization: this.validateNoPatternization(q)
    };

    const pass = Object.values(results).every(r => r.pass);

    // 验证失败重试机制
    if (!pass) {
      return {
        pass: false,
        details: results,
        retry: true,
        errors: Object.entries(results)
          .filter(([_, r]) => !r.pass)
          .map(([key, _]) => key)
      };
    }

    return { pass: true, details: results };
  }
}

module.exports = QuestionValidator;
