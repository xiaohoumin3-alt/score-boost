#!/usr/bin/env node
/**
 * 批量生成真实题目脚本
 * 使用 DeepSeek API 为所有知识点生成真实题目
 * 替换占位符种子数据
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const API_KEY = process.env.LLM_API_KEY;
const API_URL = 'https://api.deepseek.com/chat/completions';

// 知识点数据
const KP_FILE = path.join(__dirname, '..', 'cloudfunctions', 'startAssessment', 'data', '_all_knowledge_points.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'real-questions-batch.json');

// 每个知识点生成的题目数量
const QUESTIONS_PER_KP = 3;

// 速率限制：每请求间隔 1 秒
const DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadKnowledgePoints() {
  return JSON.parse(fs.readFileSync(KP_FILE, 'utf-8'));
}

async function generateQuestion(kpName, difficulty, subject) {
  const subjectName = subject || '数学';
  const diffText = difficulty === 'easy' ? '简单' : difficulty === 'hard' ? '困难' : '中等';

  const prompt = `为初中生生成1道${diffText}难度的${subjectName}选择题。

知识点：${kpName}

要求：
1. 题目清晰明确，适合初中生水平
2. 4个选项，只有1个正确答案
3. 干扰项要合理，能反映常见错误
4. 提供详细解析

严格返回纯JSON格式，不要任何其他文字：
{"question":"题目内容","options":["选项A","选项B","选项C","选项D"],"correct_answer":0,"explanation":"解析内容"}`;

  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: `你是${subjectName}题目生成专家，严格按JSON格式返回。` },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          if (r.choices && r.choices[0]) {
            const content = r.choices[0].message.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              resolve(JSON.parse(jsonMatch[0]));
            } else {
              reject(new Error('No JSON found in response'));
            }
          } else {
            reject(new Error('Invalid API response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function generateIRTParams(kp, difficulty) {
  // 基于教育研究的 IRT 参数
  const DIFFICULTY_PARAMS = {
    easy: { bDefault: -1.5, aDefault: 1.0 },
    medium: { bDefault: 0.0, aDefault: 1.2 },
    hard: { bDefault: 1.5, aDefault: 1.5 },
  };

  const params = DIFFICULTY_PARAMS[difficulty] || DIFFICULTY_PARAMS.medium;

  // 年级修正
  const grade = parseInt(kp.grade) || 8;
  const gradeAdj = (grade - 7) * 0.1;  // 7年级为基准

  // 随机扰动
  const b = params.bDefault + gradeAdj + (Math.random() - 0.5) * 0.6;
  const a = params.aDefault + (Math.random() - 0.5) * 0.4;

  return {
    irt_a: Math.round(Math.max(0.5, Math.min(2.5, a)) * 100) / 100,
    irt_b: Math.round(Math.max(-3, Math.min(3, b)) * 100) / 100,
  };
}

async function main() {
  console.log('=== 批量生成真实题目 ===\n');

  const kps = loadKnowledgePoints();
  console.log(`Loaded ${kps.length} knowledge points`);

  // 只处理前 50 个知识点（避免 API 费用过高）
  const targetKps = kps.slice(0, 50);
  console.log(`Generating for first ${targetKps.length} knowledge points\n`);

  const results = [];
  const errors = [];

  for (let i = 0; i < targetKps.length; i++) {
    const kp = targetKps[i];
    const dw = kp.difficulty_weight || { easy: 0.4, medium: 0.4, hard: 0.2 };
    const totalWeight = (dw.easy || 0) + (dw.medium || 0) + (dw.hard || 0);

    // 根据 difficulty_weight 分配各难度
    const easyCount = Math.round(QUESTIONS_PER_KP * (dw.easy || 0) / totalWeight);
    const mediumCount = Math.round(QUESTIONS_PER_KP * (dw.medium || 0) / totalWeight);
    const hardCount = QUESTIONS_PER_KP - easyCount - mediumCount;

    const difficulties = [
      ...Array(easyCount).fill('easy'),
      ...Array(mediumCount).fill('medium'),
      ...Array(Math.max(0, hardCount)).fill('hard'),
    ];

    for (const difficulty of difficulties) {
      try {
        process.stdout.write(`[${i + 1}/${targetKps.length}] ${kp.kp_name} (${difficulty})... `);
        const question = await generateQuestion(kp.kp_name, difficulty, kp.subject);
        const irt = generateIRTParams(kp, difficulty);

        results.push({
          kp_id: kp.kp_id,
          kp_name: kp.kp_name,
          subject: kp.subject,
          grade: String(kp.grade),
          chapter: kp.chapter || '',
          difficulty,
          question: question.question,
          options: question.options,
          correct_answer: ['A', 'B', 'C', 'D'][question.correct_answer] || 'A',
          explanation: question.explanation,
          ...irt,
          irt_source: 'ai_generated',
        });

        console.log('✓');
        await sleep(DELAY_MS);
      } catch (e) {
        console.log(`✗ ${e.message}`);
        errors.push({ kp_id: kp.kp_id, kp_name: kp.kp_name, difficulty, error: e.message });
        await sleep(2000);  // 失败后等待更久
      }
    }
  }

  // 保存结果
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');

  console.log('\n=== 完成 ===');
  console.log(`生成题目: ${results.length}`);
  console.log(`失败: ${errors.length}`);
  console.log(`保存到: ${OUTPUT_FILE}`);
}

main().catch(console.error);
