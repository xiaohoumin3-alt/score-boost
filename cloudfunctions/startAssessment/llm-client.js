/**
 * LLM客户端 - 封装MiniMax API调用
 */

class LlmClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.MINIMAX_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.minimaxi.com/v1';
    this.model = config.model || 'MiniMax-M2.7';
    this.timeout = config.timeout || 30000;
  }

  /**
   * 生成题目
   * @param {Object} params - 参数
   * @param {string} params.kp_name - 知识点名称
   * @param {string} params.difficulty - 难度 easy/medium/hard
   * @param {string} params.chapter - 章节
   * @param {string} params.subject - 科目 math/biology/geography
   * @returns {Promise<{content: string}>}
   */
  async generate(params) {
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY not configured');
    }

    const prompt = this._buildPrompt(params);

    try {
      const response = await fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          tokens_to_generate: 500,
          temperature: 0.7,
          top_p: 0.95,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的初中学科题目生成助手，支持数学、生物、地理三科。请严格按照用户要求的JSON格式返回题目，不要添加任何其他文字或说明。'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MiniMax API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      if (data.base_resp?.status_code !== 0) {
        throw new Error(`MiniMax API error: ${data.base_resp?.status_msg}`);
      }

      // MiniMax返回OpenAI兼容格式
      const content = data.choices?.[0]?.message?.content ||
                      data.choices?.[0]?.messages?.[0]?.text;

      if (!content) {
        throw new Error('Empty response from MiniMax');
      }

      return { content, usage: data.usage };

    } catch (error) {
      throw error;
    }
  }

  _buildPrompt(params) {
    const { kp_name, difficulty, chapter, subject } = params;
    const difficultyText = {
      easy: '简单',
      medium: '中等',
      hard: '困难'
    }[difficulty] || '中等';

    // 科目映射
    const subjectText = {
      math: '数学',
      mathematics: '数学',
      biology: '生物',
      bio: '生物',
      geography: '地理',
      geo: '地理'
    }[subject] || '数学';

    // 根据难度提供具体指导
    const difficultyGuidance = {
      easy: '难度要求（简单）：直接考查基础概念和公式，答案可以通过直接计算或基本推理得出，不需要复杂步骤。',
      medium: '难度要求（中等）：需要2-3个推理步骤，涉及知识点的综合运用，需要对概念有深入理解。',
      hard: '难度要求（困难）：需要多个知识点串联，涉及复杂推理、综合分析或创新思维，计算步骤较多，需要仔细思考。'
    }[difficulty] || '难度要求（中等）';

    const subjectGuidance = {
      math: '题目应符合初中数学水平，包含二次根式、勾股定理、一次函数等知识点',
      biology: '题目应符合初中生物水平，涉及动物的主要类群、动物的运动和行为、动物在生物圈中的作用等知识点',
      geography: '题目应符合初中地理水平，涉及中国的疆域与行政区划、中国的人口与民族、中国的地形和气候等知识点'
    }[subject] || '题目应符合初中水平';

    return `请为以下知识点生成一道${difficultyText}难度的${subjectText}选择题：

知识点：${kp_name}
科目：${subjectText}
章节：${chapter || '通用'}

${difficultyGuidance}
${subjectGuidance}

要求：
1. 题目清晰明确，符合初中${subjectText}水平
2. 4个选项，只有一个正确
3. **确保题目难度与上述${difficultyText}要求完全匹配**
4. 提供详细解析
5. **只返回纯JSON格式，不要任何其他文字**
6. **如果答案不是精确整数，题目必须标注"约"或"大约"，例如："约多少分钟？"**

JSON格式：
{
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "correct_answer": 0,
  "explanation": "解析内容"
}

请生成题目：`;
  }
}

module.exports = { LlmClient };
