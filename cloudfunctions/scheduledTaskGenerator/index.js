/**
 * 定时任务云函数 - 每小时生成一批题目
 * 配置: 在腾讯云控制台设置定时触发器，cron: 0 * * * *
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const https = require('https');

const GLM_CONFIG = {
  apiKey: '4f353f881ce04ea0be6e2abceb20e59d.2xxen4uJes1Z3hXo',
  baseUrl: 'open.bigmodel.cn',
  model: 'glm-5.1'
};

// 知识点定义
const KNOWLEDGE_POINTS = [
  // 数学 - 二次根式
  { id: 'kp1_1', name: '二次根式的概念', chapter: '二次根式', subject: 'math' },
  { id: 'kp1_2', name: '二次根式的性质', chapter: '二次根式', subject: 'math' },
  { id: 'kp1_3', name: '二次根式的运算', chapter: '二次根式', subject: 'math' },
  // 数学 - 勾股定理
  { id: 'kp2_1', name: '勾股定理', chapter: '勾股定理', subject: 'math' },
  { id: 'kp2_2', name: '勾股定理的逆定理', chapter: '勾股定理', subject: 'math' },
  { id: 'kp2_3', name: '勾股定理的应用', chapter: '勾股定理', subject: 'math' },
  // 数学 - 平行四边形
  { id: 'kp3_1', name: '平行四边形的性质', chapter: '平行四边形', subject: 'math' },
  { id: 'kp3_2', name: '平行四边形的判定', chapter: '平行四边形', subject: 'math' },
  { id: 'kp3_3', name: '特殊的平行四边形', chapter: '平行四边形', subject: 'math' },
  // 数学 - 一次函数
  { id: 'kp4_1', name: '函数的概念', chapter: '一次函数', subject: 'math' },
  { id: 'kp4_2', name: '一次函数的图像', chapter: '一次函数', subject: 'math' },
  { id: 'kp4_3', name: '一次函数的应用', chapter: '一次函数', subject: 'math' },
  // 数学 - 数据的分析
  { id: 'kp5_1', name: '数据的集中趋势', chapter: '数据的分析', subject: 'math' },
  { id: 'kp5_2', name: '数据的波动程度', chapter: '数据的分析', subject: 'math' },
  // 生物 - 动物的主要类群
  { id: 'bio_kp1_1', name: '腔肠动物', chapter: '动物的主要类群', subject: 'biology' },
  { id: 'bio_kp1_2', name: '扁形动物', chapter: '动物的主要类群', subject: 'biology' },
  { id: 'bio_kp1_3', name: '线形动物', chapter: '动物的主要类群', subject: 'biology' },
  { id: 'bio_kp1_4', name: '环节动物', chapter: '动物的主要类群', subject: 'biology' },
  { id: 'bio_kp2_1', name: '鱼类', chapter: '动物的主要类群', subject: 'biology' },
  { id: 'bio_kp2_2', name: '两栖类', chapter: '动物的主要类群', subject: 'biology' },
  { id: 'bio_kp2_3', name: '爬行类', chapter: '动物的主要类群', subject: 'biology' },
  { id: 'bio_kp2_4', name: '鸟类', chapter: '动物的主要类群', subject: 'biology' },
  { id: 'bio_kp2_5', name: '哺乳类', chapter: '动物的主要类群', subject: 'biology' },
  { id: 'bio_kp3_1', name: '动物的运动', chapter: '动物的运动和行为', subject: 'biology' },
  { id: 'bio_kp3_2', name: '动物的行为', chapter: '动物的运动和行为', subject: 'biology' },
  // 地理 - 中国的疆域与行政区划
  { id: 'geo_kp1_1', name: '中国的地理位置', chapter: '中国的疆域与行政区划', subject: 'geography' },
  { id: 'geo_kp1_2', name: '中国的疆域', chapter: '中国的疆域与行政区划', subject: 'geography' },
  { id: 'geo_kp1_3', name: '中国的行政区划', chapter: '中国的疆域与行政区划', subject: 'geography' },
  { id: 'geo_kp1_4', name: '中国的人口与民族', chapter: '中国的疆域与行政区划', subject: 'geography' },
  // 地理 - 中国的自然环境
  { id: 'geo_kp2_1', name: '中国的地形', chapter: '中国的自然环境', subject: 'geography' },
  { id: 'geo_kp2_2', name: '中国的气候', chapter: '中国的自然环境', subject: 'geography' },
  { id: 'geo_kp2_3', name: '中国的河流与湖泊', chapter: '中国的自然环境', subject: 'geography' },
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];

function buildPrompt(kpName, difficulty, chapter, subject) {
  const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty];
  const subjectText = { math: '数学', biology: '生物', geography: '地理' }[subject] || '数学';

  const subjectGuidance = {
    math: '题目应符合初中数学水平',
    biology: '题目应符合初中生物水平，涉及动物的主要类群、动物的运动和行为等知识点',
    geography: '题目应符合初中地理水平，涉及中国的疆域、行政区划、地形、气候等知识点'
  }[subject] || '题目应符合初中水平';

  return `请为以下知识点生成一道${difficultyText}难度的初中${subjectText}选择题：

知识点：${kpName}
科目：${subjectText}
章节：${chapter}

${subjectGuidance}

要求：
1. 题目清晰明确，符合初中${subjectText}水平
2. 4个选项（A/B/C/D），只有一个正确
3. 确保题目难度与${difficultyText}要求匹配
4. 只返回纯JSON格式，不要任何其他文字
5. 如果答案不是精确整数，题目必须标注"约"或"大约"
6. 【重要】禁止生成需要图片/图形/数轴的题目！所有几何信息必须用文字描述
   - 错误示例："已知实数a在数轴上的对应点如图所示"
   - 正确示例："已知实数a满足-3<a<2，化简:|a+3|+|a-2|"

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
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(data);
    req.end();
  });
}

async function generateQuestion(kp, difficulty) {
  const prompt = buildPrompt(kp.name, difficulty, kp.chapter, kp.subject);

  try {
    const content = await callGLM(prompt);

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
      knowledge_point: kp.name,
      knowledge_point_id: kp.id,
      chapter: kp.chapter,
      subject: kp.subject,
      created_at: new Date().toISOString()
    };
  } catch (error) {
    console.error(`生成失败 [${kp.id} ${difficulty}]:`, error.message);
    return null;
  }
}

exports.main = async (event, context) => {
  const startTime = Date.now();
  console.log('[scheduledTaskGenerator] 开始执行定时任务');

  const db = cloud.database();
  const _ = db.command;

  // 每次生成10题（避免超时）
  const BATCH_SIZE = 10;
  let successCount = 0;
  let failCount = 0;

  try {
    // 获取待生成队列
    const queueResult = await db.collection('question_generation_queue')
      .where({
        status: 'pending',
        retry_count: _.lt(5)
      })
      .limit(BATCH_SIZE)
      .get();

    const queueItems = queueResult.data || [];

    if (queueItems.length === 0) {
      // 如果队列为空，创建新任务
      console.log('[scheduledTaskGenerator] 队列为空，创建新任务');

      for (const kp of KNOWLEDGE_POINTS) {
        for (const difficulty of DIFFICULTIES) {
          await db.collection('question_generation_queue').add({
            data: {
              kp_id: kp.id,
              kp_name: kp.name,
              chapter: kp.chapter,
              subject: kp.subject,
              difficulty: difficulty,
              status: 'pending',
              retry_count: 0,
              created_at: new Date().toISOString()
            }
          });
        }
      }

      const totalTasks = KNOWLEDGE_POINTS.length * DIFFICULTIES.length;
      console.log(`[scheduledTaskGenerator] 已创建${totalTasks}个生成任务`);
      return { success: true, message: '已创建新任务队列' };
    }

    console.log(`[scheduledTaskGenerator] 处理 ${queueItems.length} 个任务`);

    for (const item of queueItems) {
      try {
        const question = await generateQuestion({
          id: item.kp_id,
          name: item.kp_name,
          chapter: item.chapter,
          subject: item.subject || 'math'
        }, item.difficulty);

        if (question) {
          // 存储题目到数据库
          await db.collection('questions').add({
            data: question
          });

          // 更新队列状态
          await db.collection('question_generation_queue').doc(item._id).update({
            data: {
              status: 'completed',
              completed_at: new Date().toISOString()
            }
          });

          successCount++;
          console.log(`[scheduledTaskGenerator] ✓ ${item.kp_id} ${item.difficulty}`);
        } else {
          // 失败，增加重试计数
          await db.collection('question_generation_queue').doc(item._id).update({
            data: {
              retry_count: item.retry_count + 1,
              last_error: 'AI生成失败'
            }
          });

          failCount++;
        }

        // 延迟500ms避免API限流
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`[scheduledTaskGenerator] 处理任务失败:`, error.message);

        await db.collection('question_generation_queue').doc(item._id).update({
          data: {
            retry_count: item.retry_count + 1,
            last_error: error.message
          }
        });

        failCount++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`[scheduledTaskGenerator] 完成 - 成功:${successCount} 失败:${failCount} 耗时:${duration}秒`);

    return {
      success: true,
      data: {
        successCount,
        failCount,
        duration: `${duration}秒`
      }
    };

  } catch (error) {
    console.error('[scheduledTaskGenerator] 执行失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
