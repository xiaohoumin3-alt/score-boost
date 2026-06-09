/**
 * 题库 - 预置题目，支持离线快速出题
 * 当题库中没有目标难度题目时，回退到AI生成，确保题目难度符合预期
 */

const { createLLMClient } = require('./llm-core');

// LLM客户端实例（按需初始化）
let llmClient = null;

function getLlmClient() {
  if (!llmClient) {
    llmClient = createLLMClient();
  }
  return llmClient;
}

const QUESTION_BANK = {};


function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 使用AI生成题目（当题库中无匹配难度时回退）
 * @param {Object} params - 生成参数
 * @param {string} params.kp_name - 知识点名称
 * @param {string} params.difficulty - 难度 easy/medium/hard
 * @param {string} params.chapter - 章节
 * @returns {Promise<Object|null>} 生成的题目对象，失败返回null
 */
async function generateQuestionWithAI(params) {
  try {
    const llm = getLlmClient();
    const result = await llm.complete({
      systemPrompt: '你是一个专业的数学题目生成助手。请严格按照用户要求的JSON格式返回题目。',
      userPrompt: `请为以下知识点生成一道${params.difficulty === 'easy' ? '简单' : params.difficulty === 'medium' ? '中等' : '困难'}难度的选择题：

知识点：${params.kp_name}
章节：${params.chapter || '通用'}

要求：
1. 题目清晰明确
2. 4个选项，只有一个正确
3. 提供详细解析
4. **只返回纯JSON格式，不要任何其他文字**

JSON格式：
{
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "correct_answer": 0,
  "explanation": "解析内容"
}`,
      temperature: 0.7,
      maxTokens: 500
    });

    // 解析AI返回的JSON
    let aiQuestion;
    try {
      // 清理可能的markdown代码块标记
      let content = result.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      aiQuestion = JSON.parse(content);
    } catch (parseError) {
      console.error('[question_bank] AI返回解析失败:', parseError, 'raw:', result.content);
      return null;
    }

    // 转换为统一格式
    return {
      content: aiQuestion.question || aiQuestion.content,
      options: aiQuestion.options || [],
      correct_answer: typeof aiQuestion.correct_answer === 'number'
        ? ['A', 'B', 'C', 'D'][aiQuestion.correct_answer]
        : aiQuestion.correct_answer,
      difficulty: params.difficulty,
      ai_generated: true,
    };
  } catch (error) {
    console.error('[question_bank] AI生成失败:', error.message);
    return null;
  }
}

async function generateQuestions(plan, numQuestions = 5) {
  const questions = [];
  const kpCount = {};

  for (let i = 0; i < Math.min(numQuestions, plan.length); i++) {
    const item = plan[i];
    const kpId = item.kp.kp_id;
    const difficulty = item.difficulty;

    if (!kpCount[kpId]) kpCount[kpId] = 0;

    const bank = QUESTION_BANK[kpId];
    if (bank) {
      // 先尝试从题库中找匹配难度的题目
      const matching = bank.filter(q => q.difficulty === difficulty);

      let q;
      let usedFallback = false;

      if (matching.length > 0) {
        // 题库中有匹配难度，直接使用
        q = randomChoice(matching);
      } else {
        // 题库中没有匹配难度，回退到AI生成
        console.log(`[question_bank] 题库${kpId}中无${difficulty}难度题目，使用AI生成`);
        const aiQuestion = await generateQuestionWithAI({
          kp_name: item.kp.kp_name,
          difficulty: difficulty,
          chapter: item.kp.chapter_name,
        });

        if (aiQuestion) {
          q = aiQuestion;
          usedFallback = true;
        } else {
          // AI生成失败，回退到题库中任意题目
          console.warn(`[question_bank] AI生成失败，使用题库任意题目`);
          q = randomChoice(bank);
        }
      }

      questions.push({
        id: `q${kpCount[kpId] + 1}_${kpId}`,
        type: 'choice',
        content: q.content,
        options: q.options,
        correct_answer: q.correct_answer,
        knowledge_point: item.kp.kp_name,
        knowledge_point_id: kpId,
        difficulty: difficulty, // 始终使用目标难度
        chapter: item.kp.chapter_name,
        ai_generated: usedFallback,
      });
      kpCount[kpId]++;
    }
  }

  return questions;
}

function getAllKpIds() {
  return Object.keys(QUESTION_BANK);
}

module.exports = {
  QUESTION_BANK,
  generateQuestions,
  getAllKpIds,
};
