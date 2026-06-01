/**
 * LLM客户端 - practice_v2 薄包装层
 * 基于 llm-core 统一 LLM 调用层
 * 保留状态跟踪、场景检测等业务逻辑
 */

const { createLLMClient } = require('./llm-core');
const SubjectLoader = require('./subject_loader');
const GenerationState = require('./generation_state');
const QuestionValidator = require('./question_validator');

/**
 * LlmClient 类 - llm-core 的薄包装
 * 保留原有业务逻辑（状态跟踪、场景检测）
 */
class LlmClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.MINIMAX_API_KEY;
    this.baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1';
    this.model = process.env.MINIMAX_MODEL || 'mimo-v2-flash';
    this.timeout = 30000;

    // 创建 llm-core 客户端
    this._client = createLLMClient({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: this.model,
      timeout: this.timeout,
      maxRetries: 3
    });

    // 业务逻辑组件
    this.loader = new SubjectLoader();
    this.state = new GenerationState();
    this.validator = new QuestionValidator();
  }

  /**
   * 生成题目（底层 LLM 调用）
   * @param {Object} params - 参数
   * @returns {Promise<{content: string, usage?: Object}>}
   */
  async generate(params) {
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY not configured');
    }

    const prompt = this._buildPrompt(params);
    console.log('[LLM] Starting request via llm-core...');

    const result = await this._client.complete({
      systemPrompt: '你是一个专业的题目生成助手。请严格按照用户要求的JSON格式返回题目。',
      userPrompt: prompt,
      temperature: 0.9,
      maxTokens: 500
    });

    console.log('[LLM] Request completed via llm-core');
    return result;
  }

  /**
   * 构建提示词（业务逻辑）
   */
  _buildPrompt(params) {
    const {
      kp_name,
      difficulty,
      question_type = 'choice',
      knowledge_context = '',
      related_concepts = [],
      typical_mistakes = [],
      subject = 'math',
      knowledge_point = 'kp2_3'
    } = params;

    const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty] || '中等';
    const questionTypeText = { choice: '选择题', written: '简答题', coding: '编程题' }[question_type] || '选择题';

    // 科目映射和指导
    const subjectConfig = {
      math: {
        systemPrompt: '你是一个专业的数学题目生成助手。请严格按照用户要求的JSON格式返回题目。',
        guidance: '题目应符合初中数学水平，涉及二次根式、勾股定理、一次函数等知识点',
        fallback: { scenarios: ['梯子靠墙', '航海航行', '建筑施工', '测量距离', '运动路径', '矩形对角线'], triples: [[3, 4, 5], [5, 12, 13], [6, 8, 10]] }
      },
      biology: {
        systemPrompt: '你是一个专业的初中生物题目生成助手。请严格按照用户要求的JSON格式返回题目。',
        guidance: '题目应符合初中生物水平，涉及动物的主要类群、动物的运动和行为、动物在生物圈中的作用等知识点',
        fallback: { topics: ['腔肠动物', '扁形动物', '线形动物', '环节动物', '软体动物', '节肢动物', '鱼类', '两栖类', '爬行类', '鸟类', '哺乳类'] }
      },
      geography: {
        systemPrompt: '你是一个专业的初中地理题目生成助手。请严格按照用户要求的JSON格式返回题目。',
        guidance: '题目应符合初中地理水平，涉及中国的疆域与行政区划、中国的人口与民族、中国的地形和气候等知识点',
        fallback: { topics: ['中国的地理位置', '中国的疆域', '中国的行政区划', '中国的人口与民族', '中国的地形', '中国的气候', '中国的河流与湖泊'] }
      }
    };

    const config = subjectConfig[subject] || subjectConfig.math;
    let prompt = `请为以下知识点生成一道${difficultyText}难度的${questionTypeText}：知识点：${kp_name}`;

    prompt += `\n\n【科目指导】${config.guidance}`;

    if (knowledge_context) prompt += `\n知识上下文：\n${knowledge_context}`;
    if (related_concepts.length > 0) prompt += `\n相关概念：${related_concepts.join('、')}`;
    if (typical_mistakes.length > 0) prompt += `\n典型错误：${typical_mistakes.join('；')}`;

    // 根据科目添加场景/话题约束
    if (subject === 'math' && config.fallback) {
      const { scenarios, triples } = config.fallback;
      prompt += `\n\n【场景要求】从以下场景选择：${scenarios.join('、')}`;
      prompt += `\n【数值要求】使用勾股数：${triples.map(t => t.join('-')).join('、')}`;
    } else if (subject === 'biology' && config.fallback) {
      prompt += `\n\n【话题要求】请选择相关动物类群：${config.fallback.topics.join('、')}`;
    } else if (subject === 'geography' && config.fallback) {
      prompt += `\n\n【话题要求】请选择相关地理知识：${config.fallback.topics.join('、')}`;
    }

    prompt += `\n\n【质量要求】`;
    prompt += `\n1. 选项长度均衡，不要让正确答案明显长于干扰项`;
    prompt += `\n2. 避免模板化表达`;
    prompt += `\n3. 问法多样化，避免连续使用相同的问句模式`;
    prompt += `\n4. 【重要】禁止生成需要图片/图形/数轴的题目！所有几何信息必须用文字描述`;
    prompt += `\n   - 错误示例："已知实数a在数轴上的对应点如图所示"`;
    prompt += `\n   - 正确示例："已知实数a满足-3<a<2，化简:|a+3|+|a-2|"`;

    if (question_type === 'choice') {
      prompt += `\n\nJSON格式：{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}`;
    } else {
      prompt += `\n\nJSON格式：{"question":"...","sample_answer":"...","explanation":"..."}`;
    }

    return prompt;
  }

  /**
   * 生成题目并记录状态
   * @param {Object} params - 生成参数
   * @returns {Promise<Object>} 题目对象
   */
  async generateQuestion(params) {
    const { subject = 'math', knowledge_point = 'kp2_3' } = params;

    // llm-core 已内置重试，这里只需调用一次
    try {
      const response = await this.generate(params);
      const question = parseLlmResponse(response.content);

      if (!question || !validateQuestion(question, params.question_type)) {
        throw new Error('Invalid question structure');
      }

      // 质量验证
      const validationResult = this.validator.validate(question, {});

      if (!validationResult.pass) {
        console.log(`Question validation failed:`, validationResult.errors);
        throw new Error('Question validation failed');
      }

      // 记录状态（业务逻辑）
      question.scenario_used = this._detectScenario(question.question);
      question.triple_used = this._detectTriple(question.question);
      question.question_pattern = this._detectPattern(question.question);

      this.state.recordQuestion(question);

      return question;
    } catch (e) {
      console.error(`AI generation failed:`, e.message);
      throw e;
    }
  }

  /**
   * 检测题目使用的场景（业务逻辑）
   * @param {string} questionText - 题目文本
   * @returns {string} 场景ID
   */
  _detectScenario(questionText) {
    const scenarioPatterns = [
      { id: 'ladder', keywords: ['梯子', '斜靠'] },
      { id: 'sailing', keywords: ['航行', '海里'] },
      { id: 'screen', keywords: ['屏幕', '对角线', '电视', '平板'] },
      { id: 'construction', keywords: ['旗杆', '拉索', '电线杆'] },
      { id: 'shadow', keywords: ['影子', '树影', '建筑物影'] }
    ];

    for (const { id, keywords } of scenarioPatterns) {
      if (keywords.some(kw => questionText.includes(kw))) {
        return id;
      }
    }

    return 'other';
  }

  /**
   * 检测题目使用的勾股数（业务逻辑）
   * @param {string} questionText - 题目文本
   * @returns {Array<number>} 勾股数或null
   */
  _detectTriple(questionText) {
    const numbers = questionText.match(/\d+/g)?.map(Number) || [];
    const triples = [
      [3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [7, 24, 25],
      [9, 12, 15], [10, 24, 26], [12, 16, 20], [12, 35, 37], [15, 20, 25]
    ];

    const lengthUnits = ['米', '海里', 'cm', '厘米', 'mm', '毫米', '英寸', 'km', '千米'];
    const geometryKeywords = ['边', '长', '宽', '高', '斜', '直角', '梯形', '三角形'];
    const hasGeometryContext = geometryKeywords.some(kw => questionText.includes(kw));
    const hasLengthUnit = lengthUnits.some(unit => questionText.includes(unit));

    for (const triple of triples) {
      if (triple.every(n => numbers.includes(n))) {
        return triple;
      }
    }

    if (hasGeometryContext || hasLengthUnit) {
      for (const triple of triples) {
        const matchedCount = triple.filter(n => numbers.includes(n)).length;
        if (matchedCount >= 2) {
          return triple;
        }
      }
    }

    return null;
  }

  /**
   * 检测题目使用的问法类型（业务逻辑）
   * @param {string} questionText - 题目文本
   * @returns {string} 问法类型
   */
  _detectPattern(questionText) {
    if (questionText.includes('求') || questionText.includes('是多少')) return '求值';
    if (questionText.includes('计算') || questionText.includes('算出')) return '计算';
    if (questionText.includes('判断') || questionText.includes('是否')) return '判断';
    if (questionText.includes('哪个正确') || questionText.includes('哪项')) return '选择';
    return '其他';
  }

  /**
   * 重置生成状态
   */
  resetState() {
    this.state.reset();
  }

  /**
   * 获取当前生成状态
   * @returns {Object} 状态对象
   */
  getState() {
    return {
      usedScenarios: this.state.getUsedScenarios(),
      usedTriples: this.state.getUsedTriples(),
      usedPatterns: this.state.getUsedPatterns()
    };
  }
}

/**
 * 解析LLM响应（业务逻辑）
 */
function parseLlmResponse(content) {
  if (!content || typeof content !== 'string') return null;
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : (content.match(/\{[\s\S]*\}/)?.[0] || content);
  try {
    const parsed = JSON.parse(jsonStr);
    return (parsed && Object.keys(parsed).length > 0) ? parsed : null;
  } catch { return null; }
}

/**
 * 验证题目结构（业务逻辑）
 */
function validateQuestion(q, question_type = 'choice') {
  if (!q || typeof q !== 'object') return false;
  if (!q.question) return false;

  if (question_type === 'choice') {
    if (!Array.isArray(q.options) || q.options.length < 2) return false;
    if (typeof q.correct_answer !== 'number' || q.correct_answer < 0 || q.correct_answer >= q.options.length) return false;
  }
  return true;
}

module.exports = { LlmClient, parseLlmResponse, validateQuestion };
