/**
 * LLM 客户端 - 统一薄包装层
 * 基于 llm-core 统一 LLM 调用层
 */

const { createLLMClient } = require('./llm-core');

/**
 * LlmClient 类 - llm-core 的薄包装
 * 保留原有 API 以兼容现有调用
 */
class LlmClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.LLM_API_KEY;
    this.baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
    this.model = process.env.LLM_MODEL || 'deepseek-chat';
    this.timeout = 45000;

    this._client = createLLMClient({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: this.model,
      timeout: this.timeout,
      maxRetries: 2
    });
  }

  /**
   * 生成题目
   */
  async generate(params) {
    if (!this.apiKey) {
      throw new Error('LLM_API_KEY not configured');
    }

    const prompt = this._buildPrompt(params);

    const result = await this._client.complete({
      systemPrompt: '你是一个专业的题目生成助手。请严格按照用户要求的JSON格式返回题目。',
      userPrompt: prompt,
      temperature: 0.9,
      maxTokens: 800
    });

    return result;
  }

  /**
   * 带超时的调用
   */
  async callWithTimeout(prompt, timeout) {
    const result = await this._client.complete({
      systemPrompt: '你是一个专业的题目难度评估专家。',
      userPrompt: prompt,
      temperature: 0.7,
      maxTokens: 500
    });

    return result;
  }

  /**
   * 构建提示词
   */
  _buildPrompt(params) {
    const {
      kp_name, difficulty, subject = 'math', grade = null,
      question_type = 'choice', knowledge_context = '',
      related_concepts = [], typical_mistakes = []
    } = params;

    const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty] || '中等';

    const gradeMap = {
      '1': '一年级', '2': '二年级', '3': '三年级',
      '4': '四年级', '5': '五年级', '6': '六年级',
      '7': '七年级', '8': '八年级', '9': '九年级'
    };
    const gradeText = gradeMap[grade] || grade || '';

    const subjectConfig = {
      math: { guidance: '题目应符合对应年级数学水平' },
      biology: { guidance: '题目应符合对应年级生物水平' },
      geography: { guidance: '题目应符合对应年级地理水平' },
      chinese: { guidance: '题目应符合对应年级语文水平' },
      english: { guidance: '题目应符合对应年级英语水平' },
      physics: { guidance: '题目应符合对应年级物理水平' },
      chemistry: { guidance: '题目应符合对应年级化学水平' },
      history: { guidance: '题目应符合对应年级历史水平' },
      politics: { guidance: '题目应符合对应年级政治水平' },
    };

    const config = subjectConfig[subject] || subjectConfig.math;
    let prompt = `请为以下知识点生成一道${difficultyText}难度的选择题：

知识点：${kp_name}
科目：${subject}${gradeText ? ' 年级：' + gradeText : ''}

${config.guidance}

要求：
1. 题目清晰明确
2. 4个选项（A/B/C/D），只有一个正确
3. 确保题目难度与${difficultyText}要求匹配
4. 只返回纯JSON格式，不要任何其他文字
5. 禁止生成需要图片/图形的题目`;

    if (knowledge_context) {
      prompt += `\n\n参考知识：${knowledge_context}`;
    }

    prompt += `\n\nJSON格式：{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}`;

    return prompt;
  }
}

/**
 * 解析LLM响应
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
 * 验证题目结构
 */
function validateQuestion(q, question_type = 'choice') {
  if (!q || typeof q !== 'object') return false;
  if (!q.question && !q.content) return false;

  if (question_type === 'choice') {
    if (!Array.isArray(q.options) || q.options.length < 2) return false;
    const answer = q.correct_answer;
    if (typeof answer === 'number') {
      if (answer < 0 || answer >= q.options.length) return false;
    } else if (typeof answer === 'string') {
      const upper = answer.toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(upper)) return false;
    } else {
      return false;
    }
  }
  return true;
}

module.exports = { LlmClient, parseLlmResponse, validateQuestion };
