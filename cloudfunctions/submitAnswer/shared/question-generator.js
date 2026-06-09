/**
 * 统一题目生成接口
 *
 * 所有需要生成题目的云函数应通过此接口调用
 * 内部处理：Prompt构建、LLM调用、格式校验、归一化
 */

const { createLLMClient } = require('../../shared/llm-core');
const { normalizeQuestion } = require('./question-normalizer');
const { parseLlmResponse, validateQuestion } = require('../../shared/llm-client');

const SYSTEM_PROMPTS = {
  math: '你是一个专业的数学题目生成助手。请严格按照用户要求的JSON格式返回题目。',
  biology: '你是一个专业的生物题目生成助手。请严格按照用户要求的JSON格式返回题目。',
  geography: '你是一个专业的地理题目生成助手。请严格按照用户要求的JSON格式返回题目。',
  chinese: '你是一个专业的语文题目生成助手。请严格按照用户要求的JSON格式返回题目。',
  english: '你是一个专业的英语题目生成助手。请严格按照用户要求的JSON格式返回题目。',
  physics: '你是一个专业的物理题目生成助手。请严格按照用户要求的JSON格式返回题目。',
  chemistry: '你是一个专业的化学题目生成助手。请严格按照用户要求的JSON格式返回题目。',
  history: '你是一个专业的历史题目生成助手。请严格按照用户要求的JSON格式返回题目。',
  politics: '你是一个专业的政治题目生成助手。请严格按照用户要求的JSON格式返回题目。',
};

function getSystemPrompt(subject) {
  return SYSTEM_PROMPTS[subject] || SYSTEM_PROMPTS.math;
}

function buildPrompt(params) {
  const {
    kp_name, kp_id, difficulty = 'medium', subject = 'math',
    grade = '', chapter = '', knowledge_context = '',
    exclude_questions = [], question_type = 'choice'
  } = params;

  const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty] || '中等';
  const subjectNames = {
    math: '数学', biology: '生物', geography: '地理', chinese: '语文',
    english: '英语', physics: '物理', chemistry: '化学', history: '历史', politics: '政治'
  };
  const subjectName = subjectNames[subject] || '数学';

  const gradeMap = {
    '1': '一年级', '2': '二年级', '3': '三年级', '4': '四年级', '5': '五年级',
    '6': '六年级', '7': '七年级', '8': '八年级', '9': '九年级'
  };
  const gradeText = gradeMap[String(grade)] || grade || '';

  let prompt = `请为以下知识点生成一道${difficultyText}难度的${gradeText ? gradeText : '初中'}${subjectName}选择题：

知识点：${kp_name}
科目：${subjectName}${chapter ? '\n章节：' + chapter : ''}${gradeText ? '\n年级：' + gradeText : ''}

要求：
1. 题目清晰明确，符合${gradeText || '对应年级'}${subjectName}水平
2. 4个选项（A/B/C/D），只有一个正确
3. 确保题目难度与${difficultyText}要求匹配
4. 只返回纯JSON格式，不要任何其他文字
5. 禁止生成需要图片/图形的题目`;

  if (knowledge_context) {
    prompt += `\n\n参考知识：${knowledge_context}`;
  }

  if (exclude_questions && exclude_questions.length > 0) {
    prompt += `\n\n请勿与以下已有题目重复：`;
    exclude_questions.slice(0, 5).forEach((q, i) => {
      prompt += `\n${i + 1}. ${q.substring(0, 50)}...`;
    });
  }

  prompt += `\n\nJSON格式：{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}`;

  return prompt;
}

/**
 * 生成单道题目
 * @param {Object} params
 * @returns {Promise<Object>} 归一化后的题目
 */
async function generateSingleQuestion(params) {
  const llm = createLLMClient();
  const prompt = buildPrompt(params);

  const response = await llm.complete({
    systemPrompt: getSystemPrompt(params.subject),
    userPrompt: prompt,
    temperature: 0.7,
    maxTokens: 800,
  });

  const parsed = parseLlmResponse(response.content);
  if (!validateQuestion(parsed, params.question_type)) {
    throw new Error('Invalid question from LLM');
  }

  return normalizeQuestion({
    question: parsed.question || parsed.content,
    options: parsed.options,
    correct_answer: parsed.correct_answer,
    explanation: parsed.explanation,
    kp_id: params.kp_id,
    kp_name: params.kp_name,
    chapter: params.chapter,
    difficulty: params.difficulty,
    subject: params.subject,
    grade: params.grade,
    source: 'ai',
  });
}

module.exports = {
  generateSingleQuestion,
  buildPrompt,
  getSystemPrompt,
};
