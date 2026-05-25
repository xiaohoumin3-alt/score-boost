/**
 * 批量生成题库 - 使用GLM-5.1
 * 运行: node scripts/generate-question-bank.js
 */

const https = require('https');

const GLM_CONFIG = {
  apiKey: '4f353f881ce04ea0be6e2abceb20e59d.2xxen4uJes1Z3hXo',
  baseUrl: 'open.bigmodel.cn',
  model: 'glm-5.1'
};

// 知识点定义
const KNOWLEDGE_POINTS = [
  // 第一章 二次根式
  { id: 'kp1_1', name: '二次根式的概念', chapter: '二次根式' },
  { id: 'kp1_2', name: '二次根式的性质', chapter: '二次根式' },
  { id: 'kp1_3', name: '二次根式的运算', chapter: '二次根式' },
  // 第二章 勾股定理
  { id: 'kp2_1', name: '勾股定理', chapter: '勾股定理' },
  { id: 'kp2_2', name: '勾股定理的逆定理', chapter: '勾股定理' },
  { id: 'kp2_3', name: '勾股定理的应用', chapter: '勾股定理' },
  // 第三章 平行四边形
  { id: 'kp3_1', name: '平行四边形的性质', chapter: '平行四边形' },
  { id: 'kp3_2', name: '平行四边形的判定', chapter: '平行四边形' },
  { id: 'kp3_3', name: '特殊的平行四边形', chapter: '平行四边形' },
  // 第四章 一次函数
  { id: 'kp4_1', name: '函数的概念', chapter: '一次函数' },
  { id: 'kp4_2', name: '一次函数的图像', chapter: '一次函数' },
  { id: 'kp4_3', name: '一次函数的应用', chapter: '一次函数' },
  // 第五章 数据的分析
  { id: 'kp5_1', name: '数据的集中趋势', chapter: '数据的分析' },
  { id: 'kp5_2', name: '数据的波动程度', chapter: '数据的分析' },
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const QUESTIONS_PER_KP_PER_DIFFICULTY = 5; // 每个知识点每个难度生成5题

function buildPrompt(kpName, difficulty, chapter) {
  const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty];

  return `请为以下知识点生成一道${difficultyText}难度的初中数学选择题：

知识点：${kpName}
章节：${chapter}

要求：
1. 题目清晰明确，符合初中数学水平
2. 4个选项（A/B/C/D），只有一个正确
3. 确保题目难度与${difficultyText}要求匹配
4. 只返回纯JSON格式，不要任何其他文字
5. 如果答案不是精确整数，题目必须标注"约"或"大约"

JSON格式：
{
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "correct_answer": 0,
  "explanation": "解析内容"
}`;
}

async function callGLM(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: GLM_CONFIG.model,
      messages: [
        {
          role: 'user',
          content: '你是一个专业的数学题目生成助手。请严格按照用户要求的JSON格式返回题目，不要添加任何其他文字或说明。\n\n' + prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const options = {
      hostname: GLM_CONFIG.baseUrl,
      port: 443,
      path: '/api/anthropic/v1/messages',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GLM_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.error) {
            reject(new Error(`GLM API error: ${response.error.message}`));
          } else {
            resolve(response.content[0].text);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}, body: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function generateQuestion(kp, difficulty) {
  const prompt = buildPrompt(kp.name, difficulty, kp.chapter);

  try {
    const content = await callGLM(prompt);

    // 清理可能的markdown标记
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    return {
      content: parsed.question || parsed.content,
      options: parsed.options || [],
      correct_answer: typeof parsed.correct_answer === 'number'
        ? ['A', 'B', 'C', 'D'][parsed.correct_answer]
        : parsed.correct_answer,
      difficulty: difficulty,
      explanation: parsed.explanation || ''
    };
  } catch (error) {
    console.error(`生成失败 [${kp.id} ${difficulty}]:`, error.message);
    return null;
  }
}

async function generateAll() {
  console.log('开始批量生成题库...\n');
  console.log(`知识点: ${KNOWLEDGE_POINTS.length}个`);
  console.log(`难度: ${DIFFICULTIES.join(', ')}`);
  console.log(`每组: ${QUESTIONS_PER_KP_PER_DIFFICULTY}题`);
  console.log(`预计总数: ${KNOWLEDGE_POINTS.length * DIFFICULTIES.length * QUESTIONS_PER_KP_PER_DIFFICULTY}题\n`);

  const questionBank = {};
  let successCount = 0;
  let failCount = 0;

  for (const kp of KNOWLEDGE_POINTS) {
    console.log(`\n=== ${kp.id}: ${kp.name} ===`);
    questionBank[kp.id] = [];

    for (const difficulty of DIFFICULTIES) {
      console.log(`  难度: ${difficulty}`);

      for (let i = 0; i < QUESTIONS_PER_KP_PER_DIFFICULTY; i++) {
        process.stdout.write(`    生成第${i + 1}题... `);

        const question = await generateQuestion(kp, difficulty);

        if (question) {
          questionBank[kp.id].push(question);
          console.log('✓');
          successCount++;
        } else {
          console.log('✗ 失败');
          failCount++;
        }

        // 避免API限流，延迟500ms
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  console.log(`\n\n生成完成！`);
  console.log(`成功: ${successCount}题`);
  console.log(`失败: ${failCount}题`);

  // 保存到文件
  const outputPath = '/tmp/generated_question_bank.js';
  const fs = require('fs');

  let output = '// 自动生成的题库 - GLM-5.1\n';
  output += '// 生成时间: ' + new Date().toISOString() + '\n\n';
  output += 'const QUESTION_BANK = {\n';

  for (const [kpId, questions] of Object.entries(questionBank)) {
    if (questions.length === 0) continue;

    const kp = KNOWLEDGE_POINTS.find(k => k.id === kpId);
    output += `  // ${kpId}: ${kp ? kp.name : ''}\n`;
    output += `  ${kpId}: [\n`;
    for (const q of questions) {
      // 转义单引号
      const escapedContent = q.content.replace(/'/g, "\\'").replace(/\n/g, "\\n");
      output += `    { content: '${escapedContent}', options: ${JSON.stringify(q.options)}, correct_answer: '${q.correct_answer}', difficulty: '${q.difficulty}' },\n`;
    }
    output += '  ],\n';
  }

  output += '};\n\nmodule.exports = { QUESTION_BANK };';

  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`\n题库已保存到: ${outputPath}`);
  console.log(`文件大小: ${Math.round(output.length / 1024)}KB`);
}

generateAll().catch(console.error);
