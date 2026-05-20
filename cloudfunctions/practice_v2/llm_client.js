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

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        model: this.model,
        stream: false,
        tokens_to_generate: 500,
        temperature: 0.9,
        top_p: 0.95,
        messages: [
          { role: 'system', content: '你是一个专业的数学题目生成助手。请严格按照用户要求的JSON格式返回题目。' },
          { role: 'user', content: prompt }
        ]
      });

      const options = {
        hostname: 'api.minimax.chat',
        path: '/v1/text/chatcompletion_v2',
        method: 'POST',
        timeout: 45000,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
            if (result.base_resp?.status_code !== 0) throw new Error(result.base_resp?.status_msg);
            const content = result.choices?.[0]?.message?.content;
            if (!content) throw new Error('Empty response from LLM');
            resolve({ content, usage: result.usage });
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(postData);
      req.end();
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

    let prompt = `请为以下知识点生成一道${difficultyText}难度的${questionTypeText}：知识点：${kp_name}`;

    if (knowledge_context) prompt += `\n知识上下文：\n${knowledge_context}`;
    if (related_concepts.length > 0) prompt += `\n相关概念：${related_concepts.join('、')}`;
    if (typical_mistakes.length > 0) prompt += `\n典型错误：${typical_mistakes.join('；')}`;

    // 配置驱动的多样化约束
    const config = this.loader.loadConfig(subject, knowledge_point);

    if (config) {
      const usedScenarios = this.state.getUsedScenarios();
      const usedTriples = this.state.getUsedTriples();
      const usedPatterns = this.state.getUsedPatterns();

      const availableScenarios = this.loader.getAvailableScenarios(config, usedScenarios);
      const availableTriples = this.loader.getAvailableTriples(config, usedTriples);

      const scenario = availableScenarios.length > 0
        ? this.loader.getRandomFromList(availableScenarios)
        : this.loader.getRandomScenario(config);

      const triple = availableTriples.length > 0
        ? this.loader.getRandomFromList(availableTriples)
        : this.loader.getRandomTriple(config);

      const pattern = this.loader.getRandomQuestionPattern(config);

      prompt += `\n\n【场景要求】`;
      prompt += `\n场景类型：${scenario.name}`;
      prompt += `\n推荐模板：${scenario.templates[0]}`;

      prompt += `\n\n【数值要求】`;
      prompt += `\n使用勾股数：${triple.join('-')}`;
      prompt += `\n注意：不要直接写"3-4-5直角三角形"，要融入场景`;

      prompt += `\n\n【问法建议】`;
      prompt += `\n问法类型：${pattern.type}`;
      prompt += `\n参考表达：${pattern.templates[0]}`;

      if (usedScenarios.length > 0) {
        prompt += `\n\n【已使用，请避开】`;
        prompt += `\n场景：${usedScenarios.join('、')}`;
        prompt += `\n数值：${usedTriples.map(t => t.join('-')).join('、')}`;
        prompt += `\n问法：${usedPatterns.join('、')}`;
      }
    } else {
      // 降级方案：使用硬编码场景
      const scenarios = ['梯子靠墙', '航海航行', '建筑施工', '测量距离', '运动路径', '矩形对角线', '最短路径'];
      const triples = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [7, 24, 25]];

      prompt += `\n\n【场景要求】从以下场景选择：${scenarios.join('、')}`;
      prompt += `\n【数值要求】使用勾股数：${triples.map(t => t.join('-')).join('、')}`;
    }

    prompt += `\n\n【质量要求】`;
    prompt += `\n1. 选项长度均衡，不要让正确答案明显长于干扰项`;
    prompt += `\n2. 避免模板化表达（如"一个3-4-5的直角三角形"）`;
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

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const response = await this.generate(params);
      const question = parseLlmResponse(response.content);

      if (!question || !validateQuestion(question, params.question_type)) {
        attempts++;
        continue;
      }

      // 质量验证
      const validationResult = this.validator.validate(question, {});

      if (!validationResult.pass) {
        console.log(`Question validation failed, retrying (${attempts + 1}/${maxAttempts})`, validationResult.errors);
        attempts++;
        continue;
      }

      // 记录状态
      question.scenario_used = this._detectScenario(question.question);
      question.triple_used = this._detectTriple(question.question);
      question.question_pattern = this._detectPattern(question.question);

      this.state.recordQuestion(question);

      return question;
    }

    throw new Error(`Failed to generate valid question after ${maxAttempts} attempts`);
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

    // 完全匹配：所有三个数字都在题目中
    for (const triple of triples) {
      if (triple.every(n => numbers.includes(n))) {
        return triple;
      }
    }

    // 部分匹配：勾股数中的任意两个数字在题目中
    for (const triple of triples) {
      const matchedCount = triple.filter(n => numbers.includes(n)).length;
      if (matchedCount >= 2) {
        return triple;
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
    if (questionText.includes('计算')) return '计算';
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
