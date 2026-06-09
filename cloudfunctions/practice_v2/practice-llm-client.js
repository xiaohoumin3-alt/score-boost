/**
 * @deprecated Use shared/llm-client.js for new code
 * practice_v2 的 LLM 客户端 - 保留业务逻辑（状态跟踪、场景检测）
 * 底层 LLM 调用已委托给 shared/llm-core
 */

const { LlmClient: BaseLlmClient, parseLlmResponse, validateQuestion } = require('../shared/llm-client');
const SubjectLoader = require('./subject_loader');
const GenerationState = require('./generation_state');
const QuestionValidator = require('./question_validator');

class LlmClient extends BaseLlmClient {
  constructor(apiKey) {
    super(apiKey);
    this.loader = new SubjectLoader();
    this.state = new GenerationState();
    this.validator = new QuestionValidator();
  }

  async generateQuestion(params) {
    const response = await this.generate(params);
    const question = parseLlmResponse(response.content);
    if (!question || !validateQuestion(question, params.question_type)) {
      throw new Error('Invalid question structure');
    }

    const validationResult = this.validator.validate(question, {});
    if (!validationResult.pass) {
      throw new Error('Question validation failed');
    }

    question.scenario_used = this._detectScenario(question.question);
    question.triple_used = this._detectTriple(question.question);
    question.question_pattern = this._detectPattern(question.question);
    this.state.recordQuestion(question);
    return question;
  }

  _detectScenario(questionText) {
    const patterns = [
      { id: 'ladder', keywords: ['梯子', '斜靠'] },
      { id: 'sailing', keywords: ['航行', '海里'] },
      { id: 'screen', keywords: ['屏幕', '对角线', '电视', '平板'] },
      { id: 'construction', keywords: ['旗杆', '拉索', '电线杆'] },
      { id: 'shadow', keywords: ['影子', '树影', '建筑物影'] }
    ];
    for (const { id, keywords } of patterns) {
      if (keywords.some(kw => questionText.includes(kw))) return id;
    }
    return 'other';
  }

  _detectTriple(questionText) {
    const numbers = questionText.match(/\d+/g)?.map(Number) || [];
    const triples = [[3,4,5],[5,12,13],[6,8,10],[8,15,17],[7,24,25]];
    for (const triple of triples) {
      if (triple.every(n => numbers.includes(n))) return triple;
    }
    return null;
  }

  _detectPattern(questionText) {
    if (questionText.includes('求') || questionText.includes('是多少')) return '求值';
    if (questionText.includes('计算') || questionText.includes('算出')) return '计算';
    if (questionText.includes('判断') || questionText.includes('是否')) return '判断';
    return '其他';
  }

  resetState() { this.state.reset(); }
  getState() {
    return {
      usedScenarios: this.state.getUsedScenarios(),
      usedTriples: this.state.getUsedTriples(),
      usedPatterns: this.state.getUsedPatterns()
    };
  }
}

module.exports = { LlmClient, parseLlmResponse, validateQuestion };
