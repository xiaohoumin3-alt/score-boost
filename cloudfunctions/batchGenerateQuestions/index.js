/**
 * batchGenerateQuestions 云函数
 * 批量生成真实题目，写入 ai_question_pool
 * 每道题自动预设 IRT 参数，消除冷启动等待时间
 *
 * 使用方式：
 * 1. 手动触发：{ action: 'generate', subject: 'math', grade: '8', count: 5 }
 * 2. 查看状态：{ action: 'status' }
 * 3. 按科目批量：{ action: 'generateAll', subject: 'math', questionsPerKp: 2 }
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { normalizeQuestion } = require('../shared/question-normalizer');
const { loadConfig } = require('../shared/llm-core/config');
const { createLLMClient } = require('../shared/llm-core');
const { generateIRTParams } = require('../shared/irt-seed-generator');

// 知识点文件路径映射
const DATA_DIR = '../startAssessment/data';

/**
 * 加载知识点
 */
async function loadKnowledgePoints(db, subject, grade) {
  const _ = db.command;
  const query = {};
  if (subject) query.subject = subject;
  if (grade) query.grade = parseInt(grade);

  const result = await db.collection('knowledge_points')
    .where(query)
    .limit(1000)
    .get();

  return result.data || [];
}

/**
 * 调用 LLM 生成单道题目
 */
async function generateSingleQuestion(llm, kp, difficulty) {
  const subjectName = kp.subject || '数学';
  const safeKpName = (kp.kp_name || '').replace(/[\x00-\x1F\x7F]/g, ' ').trim().substring(0, 100);

  const prompt = `你是一位专业的${subjectName}老师，正在为学生生成练习题。

## 目标知识点
知识点：${safeKpName}
难度：${difficulty}

## 难度说明
- easy：基础题，考察基本概念和简单计算
- medium：中等题，需要理解和应用
- hard：综合题，需要分析和推理

## 生成要求
1. 题目清晰明确，适合初中生水平
2. 4个选项，只有1个正确答案
3. 干扰项要合理，能反映常见错误
4. 提供详细解析

**严格返回纯JSON格式，不要任何其他文字**

{
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "correct_answer": 0,
  "explanation": "解析内容"
}`;

  const result = await llm.complete({
    systemPrompt: `你是${subjectName}题目生成专家，严格按JSON格式返回。`,
    userPrompt: prompt,
    temperature: 0.7,
    maxTokens: 500,
  });

  // 解析 JSON
  let parsed;
  try {
    const content = result.content || result.text || result;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(content);
    }
  } catch (e) {
    throw new Error(`JSON解析失败: ${e.message}`);
  }

  if (!parsed.question || !parsed.options || parsed.correct_answer === undefined) {
    throw new Error('题目格式不完整');
  }

  return parsed;
}

/**
 * 生成一道题目并写入数据库
 */
async function generateAndSave(db, llm, kp, difficulty) {
  // 1. 调用 LLM 生成题目
  const raw = await generateSingleQuestion(llm, kp, difficulty);

  // 2. 归一化（自动添加 IRT 参数）
  const normalized = normalizeQuestion({
    ...raw,
    kp_id: kp.kp_id,
    kp_name: kp.kp_name,
    difficulty,
    subject: kp.subject,
    grade: String(kp.grade),
    chapter: kp.chapter || '',
    source: 'batch_generate',
    difficulty_weight: kp.difficulty_weight,
  });

  // 3. 写入数据库
  const result = await db.collection('ai_question_pool').add({
    data: {
      ...normalized,
      usage_count: 0,
      correct_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  });

  return {
    id: result._id,
    kp_id: kp.kp_id,
    kp_name: kp.kp_name,
    difficulty,
    irt_a: normalized.irt_a,
    irt_b: normalized.irt_b,
  };
}

/**
 * 批量生成题目
 */
async function batchGenerate(db, llm, knowledgePoints, questionsPerKp = 2) {
  const results = [];
  const errors = [];

  for (const kp of knowledgePoints) {
    const dw = kp.difficulty_weight || { easy: 0.4, medium: 0.4, hard: 0.2 };
    const totalWeight = (dw.easy || 0) + (dw.medium || 0) + (dw.hard || 0);

    // 根据 difficulty_weight 分配各难度的题目数量
    const easyCount = Math.round(questionsPerKp * (dw.easy || 0) / totalWeight);
    const mediumCount = Math.round(questionsPerKp * (dw.medium || 0) / totalWeight);
    const hardCount = questionsPerKp - easyCount - mediumCount;

    const difficulties = [
      ...Array(easyCount).fill('easy'),
      ...Array(mediumCount).fill('medium'),
      ...Array(Math.max(0, hardCount)).fill('hard'),
    ];

    for (const difficulty of difficulties) {
      try {
        const result = await generateAndSave(db, llm, kp, difficulty);
        results.push(result);
        console.log(`[batchGenerate] Generated: ${kp.kp_name} (${difficulty})`);

        // 速率限制：每题间隔 500ms
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        errors.push({
          kp_id: kp.kp_id,
          kp_name: kp.kp_name,
          difficulty,
          error: e.message,
        });
        console.error(`[batchGenerate] Failed: ${kp.kp_name} (${difficulty}): ${e.message}`);

        // 失败后等待 1 秒再继续
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  return { results, errors };
}

/**
 * 云函数入口
 */
exports.main = async (event) => {
  const { action = 'generate' } = event;
  const db = cloud.database();

  if (action === 'status') {
    // 查看当前题目库状态
    const total = await db.collection('ai_question_pool').count();
    const withIRT = await db.collection('ai_question_pool')
      .where({ irt_a: cloud.database().command.exists(true) })
      .count();
    const bySubject = await db.collection('ai_question_pool')
      .field({ subject: true })
      .limit(1000)
      .get();

    const subjectCounts = {};
    for (const q of bySubject.data) {
      const s = q.subject || 'unknown';
      subjectCounts[s] = (subjectCounts[s] || 0) + 1;
    }

    return {
      success: true,
      data: {
        totalQuestions: total.total,
        withIRT: withIRT.total,
        subjectCounts,
      }
    };
  }

  if (action === 'generate' || action === 'generateAll') {
    const { subject, grade, questionsPerKp = 2, limit = 20 } = event;

    // 加载 LLM 配置
    let llm;
    try {
      const config = await loadConfig(db);
      llm = createLLMClient(config);
    } catch (e) {
      return { success: false, error: `LLM config failed: ${e.message}` };
    }

    // 加载知识点
    const kps = await loadKnowledgePoints(db, subject, grade);
    if (kps.length === 0) {
      return { success: false, error: 'No knowledge points found' };
    }

    // 限制数量
    const targetKps = kps.slice(0, limit);
    console.log(`[batchGenerate] Generating for ${targetKps.length} knowledge points`);

    // 批量生成
    const { results, errors } = await batchGenerate(db, llm, targetKps, questionsPerKp);

    return {
      success: true,
      data: {
        generated: results.length,
        failed: errors.length,
        total: targetKps.length * questionsPerKp,
        sample: results.slice(0, 5),
        errors: errors.slice(0, 10),
      }
    };
  }

  return { success: false, error: `Unknown action: ${action}` };
};
