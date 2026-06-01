/**
 * LLM客户端 - startAssessment 薄包装层
 * 基于 llm-core 统一 LLM 调用层
 */

const { createLLMClient } = require('./llm-core');

/**
 * LlmClient 类 - llm-core 的薄包装
 * 保留原有 API 以兼容现有调用
 */
class LlmClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.MINIMAX_API_KEY;
    this.model = process.env.MINIMAX_MODEL || 'mimo-v2-flash';
    this.timeout = 45000;

    // 创建 llm-core 客户端
    this._client = createLLMClient({
      apiKey: this.apiKey,
      model: this.model,
      timeout: this.timeout,
      maxRetries: 3
    });
  }

  /**
   * 生成题目
   * @param {Object} params - 题目参数
   * @returns {Promise<Object>} { content, usage }
   */
  async generate(params) {
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY not configured');
    }

    const prompt = this._buildPrompt(params);

    const result = await this._client.complete({
      systemPrompt: '你是一个专业的题目生成助手。请严格按照用户要求的JSON格式返回题目。',
      userPrompt: prompt,
      temperature: 0.9,
      maxTokens: 500
    });

    return result;
  }

  /**
   * 带超时的调用（兼容旧 API）
   * @param {string} prompt - 提示词
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<Object>} { content, usage }
   */
  async callWithTimeout(prompt, timeout) {
    // llm-core 已内置超时控制，这里只是包装
    const result = await this._client.complete({
      systemPrompt: '你是一个专业的题目难度评估专家。',
      userPrompt: prompt,
      temperature: 0.7,
      maxTokens: 500
    });

    return result;
  }

  /**
   * 构建提示词（业务逻辑）
   */
  _buildPrompt(params) {
    const { kp_name, difficulty, subject = 'math' } = params;
    const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty] || '中等';

    const subjectConfig = {
      biology: {
        guidance: '题目应符合初中生物水平，涉及动物的主要类群',
        topics: ['腔肠动物', '扁形动物', '线形动物', '环节动物', '鱼类', '两栖类', '爬行类', '鸟类', '哺乳类']
      },
      math: {
        guidance: '题目应符合初中数学水平，涉及二次根式、勾股定理等知识点',
        scenarios: ['梯子靠墙', '航海航行', '测量距离'],
        triples: [[3, 4, 5], [5, 12, 13]]
      },
      geography: {
        guidance: '题目应符合初中地理水平',
        topics: ['中国的地理位置', '中国的行政区划', '中国的人口与民族', '中国的地形', '中国的气候']
      }
    };

    const config = subjectConfig[subject] || subjectConfig.biology;
    let prompt = `请为以下知识点生成一道${difficultyText}难度的选择题：知识点：${kp_name}`;

    prompt += `\n\n【科目指导】${config.guidance}`;

    if (config.topics) {
      prompt += `\n【话题要求】请选择相关知识：${config.topics.join('、')}`;
    }
    if (config.scenarios) {
      prompt += `\n【场景要求】从以下场景选择：${config.scenarios.join('、')}`;
    }
    if (config.triples) {
      prompt += `\n【数值要求】使用勾股数：${config.triples.map(t => t.join('-')).join('、')}`;
    }

    prompt += `\n\n【质量要求】禁止生成需要图片/图形的题目`;
    prompt += `\n\nJSON格式：{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}`;

    return prompt;
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
