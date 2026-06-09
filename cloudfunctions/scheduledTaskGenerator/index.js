/**
 * 定时任务云函数 - 每小时生成一批题目
 * 配置: 在腾讯云控制台设置定时触发器，cron: 0 * * * *
 * 
 * 动态从 knowledge_tree 加载全科知识点，不硬编码
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { loadKnowledgeTree } = require('./shared/knowledge_tree');
const { createLLMClient } = require('../shared/llm-core');
const { getConfig, loadConfig } = require('../shared/llm-core/config');
const { normalizeQuestion } = require('./shared/question-normalizer');

const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * 动态加载全科知识点
 * 遍历 1-9 年级所有科目的知识点树
 * @returns {Array<{id: string, name: string, chapter: string, subject: string}>}
 */
function loadAllKnowledgePoints() {
  const subjects = [
    'math', 'biology', 'geography', 'chinese', 'english',
    'physics', 'chemistry', 'history', 'politics'
  ];
  const grades = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const semesters = ['上', '下'];

  const allKps = [];

  for (const subject of subjects) {
    for (const grade of grades) {
      for (const semester of semesters) {
        try {
          const tree = loadKnowledgeTree(subject, grade, semester);
          if (tree && tree.chapters) {
            for (const chapter of tree.chapters) {
              const chapterName = chapter.name || chapter.chapter_name || '';
              if (chapter.knowledge_points) {
                for (const kp of chapter.knowledge_points) {
                  allKps.push({
                    id: kp.id,
                    name: kp.name,
                    chapter: chapterName,
                    subject: subject
                  });
                }
              }
            }
          }
        } catch (e) {
          // 跳过不存在的文件
        }
      }
    }
  }

  return allKps;
}

function buildPrompt(kpName, difficulty, chapter, subject) {
  const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty] || '中等';

  const subjectNames = {
    math: '数学', biology: '生物', geography: '地理',
    chinese: '语文', english: '英语', physics: '物理',
    chemistry: '化学', history: '历史', politics: '政治'
  };
  const subjectText = subjectNames[subject] || subject || '数学';

  return `请为以下知识点生成一道${difficultyText}难度的初中${subjectText}选择题：

知识点：${kpName}
科目：${subjectText}
章节：${chapter}

题目应符合初中${subjectText}水平。

要求：
1. 题目清晰明确，符合初中${subjectText}水平
2. 4个选项（A/B/C/D），只有一个正确
3. 确保题目难度与${difficultyText}要求匹配
4. 只返回纯JSON格式，不要任何其他文字
5. 禁止生成需要图片/图形的题目

JSON格式：
{
  "question": "题目标题",
  "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
  "correct_answer": 0,
  "explanation": "解析内容",
  "difficulty": "${difficulty}"
}`;
}

/**
 * 解析LLM响应的JSON
 */
function parseLlmResponse(content) {
  if (!content || typeof content !== 'string') return null;
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : (content.match(/\{[\s\S]*\}/)?.[0] || content);
  try {
    const parsed = JSON.parse(jsonStr);
    return (parsed && Object.keys(parsed).length > 0) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 验证题目结构
 */
function validateQuestion(q) {
  if (!q || typeof q !== 'object') return false;
  if (!q.question && !q.content) return false;
  if (!Array.isArray(q.options) || q.options.length < 2) return false;
  const answer = q.correct_answer;
  if (typeof answer === 'number') {
    return answer >= 0 && answer < q.options.length;
  }
  if (typeof answer === 'string') {
    return ['A', 'B', 'C', 'D'].includes(answer.toUpperCase());
  }
  return false;
}

/**
 * 生成单题
 */
async function generateSingleQuestion(kp, difficulty) {
  const subjectText = { math: '数学', biology: '生物', geography: '地理' }[kp.subject] || kp.subject;
  const prompt = buildPrompt(kp.name, difficulty, kp.chapter, kp.subject);

  try {
    const client = createLLMClient();

    const result = await client.complete({
      systemPrompt: `你是一个专业的${subjectText}题目生成助手。请严格按照JSON格式返回。`,
      userPrompt: prompt,
      temperature: 0.9,
      maxTokens: 800
    });

    const content = result && result.content ? result.content : (typeof result === 'string' ? result : '');
    const parsed = parseLlmResponse(content);

    if (parsed && validateQuestion(parsed)) {
      const now = new Date().toISOString();
      const db = cloud.database();

      const normalized = normalizeQuestion({
        question: parsed.question || parsed.content || '',
        content: parsed.question || parsed.content || '',
        options: parsed.options,
        correct_answer: parsed.correct_answer,
        explanation: parsed.explanation || '',
        difficulty: difficulty,
        subject: kp.subject,
        knowledge_point: kp.name,
        kp_name: kp.name,
        kp_id: kp.id,
        source: 'scheduled-task',
        verified: false,
        created_at: now,
        updated_at: now,
      });

      await db.collection('ai_question_pool').add({ data: normalized });

      return { success: true, kp_id: kp.id, difficulty };
    }

    return { success: false, kp_id: kp.id, difficulty, error: '解析或验证失败' };
  } catch (e) {
    console.error(`[generateSingleQuestion] ${kp.id}/${difficulty}:`, e.message);
    return { success: false, kp_id: kp.id, difficulty, error: e.message };
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const startTime = Date.now();

  try {
    console.log('[scheduledTaskGenerator] 开始执行');

    // 动态加载所有知识点
    const KNOWLEDGE_POINTS = loadAllKnowledgePoints();
    console.log(`[scheduledTaskGenerator] 动态加载知识点: ${KNOWLEDGE_POINTS.length} 个`);

    if (KNOWLEDGE_POINTS.length === 0) {
      console.warn('[scheduledTaskGenerator] 未加载到知识点，跳过本次运行');
      return { success: true, data: { successCount: 0, failCount: 0, duration: '0' } };
    }

    const db = cloud.database();
    await loadConfig(db);

    let successCount = 0;
    let failCount = 0;

    // 生成题目：每个知识点每个难度一道
    for (const kp of KNOWLEDGE_POINTS) {
      for (const difficulty of DIFFICULTIES) {
        try {
          const result = await generateSingleQuestion(kp, difficulty);

          if (result.success) {
            successCount++;

            // 标记知识点和难度已生成过
            await db.collection('generation_tasks').add({
              data: {
                kp_id: kp.id,
                difficulty: difficulty,
                status: 'completed',
                created_at: new Date().toISOString()
              }
            });
          } else {
            failCount++;
            console.error(`[scheduledTaskGenerator] 失败: ${kp.id}/${difficulty} - ${result.error}`);

            // 记录失败信息
            await db.collection('generation_tasks').add({
              data: {
                kp_id: kp.id,
                difficulty: difficulty,
                status: 'failed',
                error: result.error,
                created_at: new Date().toISOString()
              }
            });
          }
        } catch (e) {
          failCount++;
          console.error(`[scheduledTaskGenerator] 异常: ${kp.id}/${difficulty} - ${e.message}`);
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[scheduledTaskGenerator] 完成 - 成功:${successCount} 失败:${failCount} 耗时:${duration}秒`);

    return {
      success: true,
      data: { successCount, failCount, duration: `${duration}秒` }
    };

  } catch (error) {
    console.error('[scheduledTaskGenerator] 执行失败:', error);
    return { success: false, error: error.message };
  }
};
