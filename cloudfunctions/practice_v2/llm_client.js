/**
 * LLM客户端 - 内嵌到practice_v2，避免云函数间调用超时
 * 集成 SubjectLoader 和 GenerationState 实现配置驱动的多样化生成
 */

const http = require('http');
const SubjectLoader = require('./subject_loader');
const GenerationState = require('./generation_state');
const QuestionValidator = require('./question_validator');

class LlmClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.MINIMAX_API_KEY;
    this.baseUrl = 'https://api.minimax.chat/v1';
    this.model = 'MiniMax-M2.7';
    this.timeout = 30000;
    this.loader = new SubjectLoader();
    this.state = new GenerationState();
    this.validator = new QuestionValidator();
  }

  async generate(params) {
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY not configured');
    }

    const prompt = this._buildPrompt(params);
    console.log('[LLM] Starting request to MiniMax API...');
    console.log('[LLM] API Key present:', !!this.apiKey, 'Length:', this.apiKey?.length);

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        model: this.model,
        stream: false,
        tokens_to_generate: 500,
        temperature: 0.9,
        top_p: 0.95,
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: prompt }
        ]
      });

      const options = {
        hostname: 'api.minimax.chat',
        path: '/v1/text/chatcompletion_v2',
        method: 'POST',
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      console.log('[LLM] Sending HTTP request...');
      const startTime = Date.now();

      const req = http.request(options, (res) => {
        console.log('[LLM] Response received, status:', res.statusCode);
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const elapsed = Date.now() - startTime;
          console.log('[LLM] Response complete, elapsed:', elapsed, 'ms, data length:', data.length);
          try {
            const result = JSON.parse(data);
            console.log('[LLM] Parsed result, keys:', Object.keys(result));
            if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
            if (result.base_resp?.status_code !== 0) throw new Error(result.base_resp?.status_msg);
            const content = result.choices?.[0]?.message?.content;
            console.log('[LLM] Content length:', content?.length);
            if (!content) throw new Error('Empty response from LLM');
            resolve({ content, usage: result.usage });
          } catch (e) {
            console.log('[LLM] Error parsing response:', e.message);
            reject(e);
          }
        });
      });

      req.on('error', (e) => {
        console.log('[LLM] Request error:', e.message);
        reject(e);
      });
      req.on('timeout', () => {
        console.log('[LLM] Request timeout after 30s');
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.write(postData);
      req.end();
      console.log('[LLM] Request sent, waiting for response...');
    });
  }

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

    // 减少重试次数，避免超时
    const maxAttempts = 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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

        // 记录状态
        question.scenario_used = this._detectScenario(question.question);
        question.triple_used = this._detectTriple(question.question);
        question.question_pattern = this._detectPattern(question.question);

        this.state.recordQuestion(question);

        return question;
      } catch (e) {
        console.error(`AI generation attempt ${attempt + 1} failed:`, e.message);
        if (attempt === maxAttempts - 1) throw e;
      }
    }

    throw new Error('Failed to generate valid question');
  }

  /**
   * 检测题目使用的场景
   * @param {string} questionText - 题目文本
   * @returns {string} 场景ID
   */
  _detectScenario(questionText) {
    // 场景ID到检测关键词的映射
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
   * 检测题目使用的勾股数
   * @param {string} questionText - 题目文本
   * @returns {Array<number>} 勾股数或null
   */
  _detectTriple(questionText) {
    const numbers = questionText.match(/\d+/g)?.map(Number) || [];
    const triples = [
      [3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [7, 24, 25],
      [9, 12, 15], [10, 24, 26], [12, 16, 20], [12, 35, 37], [15, 20, 25]
    ];

    // 长度单位/几何关键词 - 用于验证数字确实是长度而非其他量
    const lengthUnits = ['米', '海里', 'cm', '厘米', 'mm', '毫米', '英寸', 'km', '千米'];
    const geometryKeywords = ['边', '长', '宽', '高', '斜', '直角', '梯形', '三角形'];
    const hasGeometryContext = geometryKeywords.some(kw => questionText.includes(kw));
    const hasLengthUnit = lengthUnits.some(unit => questionText.includes(unit));

    // 完全匹配：所有三个数字都在题目中
    for (const triple of triples) {
      if (triple.every(n => numbers.includes(n))) {
        return triple;
      }
    }

    // 部分匹配：要求有几何上下文或长度单位，避免误报
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
   * 检测题目使用的问法类型
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

function parseLlmResponse(content) {
  if (!content || typeof content !== 'string') return null;
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : (content.match(/\{[\s\S]*\}/)?.[0] || content);
  try {
    const parsed = JSON.parse(jsonStr);
    return (parsed && Object.keys(parsed).length > 0) ? parsed : null;
  } catch { return null; }
}

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
