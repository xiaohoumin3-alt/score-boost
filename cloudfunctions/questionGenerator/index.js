/**
 * questionGenerator 云函数
 * 功能：后台定时处理question_queue中的待生成任务
 * 触发：定时触发（每分钟检查一次）
 * TDD: Red-Green-Refactor
 */

let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  cloud = null;
}

// ========== 工作流引擎导入 ==========
const { TaskWorkflow } = require('./workflow/TaskWorkflow');
const { InitStateStep } = require('./workflow/steps/InitStateStep');
const { GenerateStep } = require('./workflow/steps/GenerateStep');
const { SaveQuestionsStep } = require('./workflow/steps/SaveQuestionsStep');
const { CreateAssessmentStep } = require('./workflow/steps/CreateAssessmentStep');
const { CompleteStep } = require('./workflow/steps/CompleteStep');

// ========== 辅助函数导入 ==========
const { updateQueueStatus } = require('./workflow/utils/updateQueueStatus');

/**
 * 统一选项格式
 * 输入可能是：空数组、字符串数组、对象数组、undefined
 * 输出统一为字符串数组 ["A", "B", "C", "D"]
 */
function normalizeOptions(options) {
  if (!options || !Array.isArray(options) || options.length === 0) {
    return [];
  }
  return options.map((opt, idx) => {
    if (typeof opt === 'string') return opt;
    if (typeof opt === 'object' && opt !== null) {
      return opt.value || opt.text || opt.content || String(opt);
    }
    return String(opt);
  });
}

/**
 * 验证题目内容是否匹配目标科目
 * 防止数学题混入地理/生物测评
 */
const SUBJECT_KEYWORDS = {
  geography: /地理位置|气候|地形|行政区划|省级|地球|大洲|大洋|自然资源|人口|疆域|板块|等高线|经纬度|季风|西北地区|青藏|南方地区|北方地区|河流|湖泊|山脉|高原|盆地|平原|工业|农业|交通|城市化|区域发展/,
  biology: /细胞|光合|呼吸作用|遗传|生态|消化|血液循环|神经|免疫|DNA|基因|染色体|显微镜|组织|器官|蒸腾|分裂|蛋白质|酶|激素|反射弧|抗体|抗原|微生物|细菌|病毒|真菌/,
  math: /二次根式|勾股定理|一次函数|平行四边形|三角形|方程|因式分解|不等式|概率|圆的|直径|半径|面积|周长|平方根|绝对值|整式|分式|全等|轴对称|相似|一元二次|韦达|完全平方|平方差|直角|锐角|钝角|内角|外角/
};

function validateSubject(content, expectedSubject) {
  if (!content || !expectedSubject) return true;
  const kw = SUBJECT_KEYWORDS[expectedSubject];
  if (!kw) return true;
  // 如果内容匹配其他科目关键词但不匹配本科目，说明是脏数据
  const matchesExpected = kw.test(content);
  const matchesOther = Object.entries(SUBJECT_KEYWORDS)
    .filter(([k]) => k !== expectedSubject)
    .some(([, v]) => v.test(content));
  return matchesExpected || !matchesOther;
}
const { checkTaskCancelled } = require('./workflow/utils/checkTaskCancelled');
const { cleanupPartialQuestionsByTask } = require('./workflow/utils/cleanupPartialQuestionsByTask');
const { generateQuestionsForTask } = require('./workflow/utils/generateQuestions');

// 导入队列管理器（支持两种队列）
const { fetchPendingTasks: fetchQueueTasks, updateTaskStatus } = require('./queue-manager');

/**
 * 获取待处理的队列任务
 * @param {Object} db - 数据库实例
 * @param {number} maxTasks - 最大处理任务数
 * @returns {Promise<Array>} 待处理任务列表
 */
async function fetchPendingTasks(db, maxTasks = 3) {
  try {
    // 诊断：查询最近20个任务
    const allTasks = await db.collection('question_queue')
      .orderBy('created_at', 'desc')
      .limit(20)
      .get();
    console.log('[fetchPendingTasks] Recent 20 tasks count:', allTasks.data?.length || 0);

    // 统计各状态数量
    const statusCount = {};
    const targetId = '669eebf36a17092800eea1aa0a8c721b';
    let targetFound = false;

    allTasks.data?.forEach(t => {
      statusCount[t.status] = (statusCount[t.status] || 0) + 1;
      if (t._id === targetId) {
        targetFound = true;
        console.log('[fetchPendingTasks] *** TARGET TASK FOUND ***:', t._id, 'Status:', t.status, 'created:', t.created_at);
      }
    });

    console.log('[fetchPendingTasks] Status distribution:', JSON.stringify(statusCount));
    if (!targetFound) {
      console.log('[fetchPendingTasks] *** TARGET TASK NOT FOUND in recent 20 ***');
    }

    const result = await db.collection('question_queue')
      .where({ status: 'pending' })
      .orderBy('priority', 'desc')  // 高优先级先处理
      .orderBy('created_at', 'asc')  // 同优先级按创建时间
      .limit(maxTasks)
      .get();

    console.log('[fetchPendingTasks] Pending tasks count:', result.data?.length || 0);
    return result.data || [];
  } catch (e) {
    console.error('[fetchPendingTasks] Error:', e);
    return [];
  }
}

/**
 * 清理部分生成的题目（使用 assessment_id，未迁移）
 * @param {Object} db - 数据库实例
 * @param {string} assessmentId - 评估ID
 */
async function cleanupPartialQuestions(db, assessmentId) {
  try {
    // 删除ai_question_pool中关联的未验证题目
    await db.collection('ai_question_pool')
      .where({ assessment_id, verified: false })
      .remove();

    // 删除assessment记录
    await db.collection('assessments').doc(assessmentId).remove();

    console.log('[cleanup] Partial questions cleaned up for assessment:', assessmentId);
  } catch (e) {
    console.error('[cleanup] Error:', e);
  }
}

/**
 * 获取默认工作流步骤
 * @param {Object} options - 选项
 * @returns {Array<WorkflowStep>} 工作流步骤列表
 */
function getDefaultSteps(options = {}) {
  const { generateAi } = options;

  return [
    new InitStateStep(),
    new GenerateStep(generateAi),
    new SaveQuestionsStep(),
    new CreateAssessmentStep(),
    new CompleteStep()
  ];
}

/**
 * 处理单个队列任务（适配器：使用工作流引擎）
 * @param {Object} db - 数据库实例
 * @param {Object} task - 队列任务
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 处理结果
 */
async function processTask(db, task, options = {}) {
  const { generateAi } = options;
  const startTime = Date.now();

  try {
    console.log(`[processTask] START task:${task._id} student:${task.student_id} subject:${task.subject} num:${task.num_questions}`);

    // 使用工作流引擎执行
    const workflow = new TaskWorkflow(getDefaultSteps({ generateAi }));
    const result = await workflow.execute(task, db);

    if (result.success) {
      const { STEP_OUTPUT_KEYS } = require('./workflow/constants');
      const assessmentId = result.data.get(STEP_OUTPUT_KEYS.ASSESSMENT_ID);
      const questionIds = result.data.get(STEP_OUTPUT_KEYS.QUESTION_IDS) || [];

      const duration = Date.now() - startTime;
      console.log(`[processTask] SUCCESS task:${task._id} assessment:${assessmentId} questions:${questionIds.length} duration:${duration}ms`);

      return {
        success: true,
        assessment_id: assessmentId,
        questions_count: questionIds.length
      };
    }

    if (result.cancelled) {
      console.log(`[processTask] CANCELLED task:${task._id} reason:${result.reason}`);
      return {
        success: false,
        cancelled: true,
        reason: result.reason
      };
    }

    // 失败情况
    const duration = Date.now() - startTime;
    console.error(`[processTask] FAILED task:${task._id} duration:${duration}ms error:`, result.error?.message);

    // 更新为failed状态
    await updateQueueStatus(db, task._id, 'failed', {
      error: result.error?.message || 'Unknown error',
      retry_count: (task.retry_count || 0) + 1
    });

    return {
      success: false,
      error: result.error?.message || 'Unknown error'
    };

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`[processTask] EXCEPTION task:${task._id} duration:${duration}ms error:`, e.message, e.stack);

    // 清理可能部分保存的数据
    if (e.message !== 'TASK_CANCELLED') {
      await cleanupPartialQuestionsByTask(db, task._id);
    }

    // 更新为failed状态
    await updateQueueStatus(db, task._id, 'failed', {
      error: e.message,
      retry_count: (task.retry_count || 0) + 1
    });

    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * AI生成函数（调用generateAiQuestion云函数）
 * 优化：使用并行生成 + 跳过图片
 * @param {Object} task - 队列任务
 * @param {string} difficulty - 难度级别
 * @param {number} count - 题目数量
 * @returns {Promise<Array>} 生成的题目
 */
async function generateAi(task, difficulty, count) {
  const startTime = Date.now();
  console.log(`[generateAi] === DIAGNOSTIC LOG START ===`);
  console.log(`[generateAi] task._id: ${task._id}`);
  console.log(`[generateAi] task.subject: ${task.subject} (type: ${typeof task.subject})`);
  console.log(`[generateAi] task.grade: ${task.grade}`);
  console.log(`[generateAi] difficulty: ${difficulty}, count: ${count}`);
  console.log(`[generateAi] === END DIAGNOSTIC LOG ===`);
  console.log(`[generateAi] MIXED START task:${task._id} difficulty:${difficulty} count:${count} at ${new Date().toISOString()}`);

  // === 科目验证：防止科目混入 ===
  if (!task.subject || task.subject === 'undefined' || task.subject === 'null') {
    console.error(`[generateAi] ❌ CRITICAL: task.subject is missing! task._id: ${task._id}`);
    console.error(`[generateAi] ❌ Task data:`, JSON.stringify(task));
    throw new Error(`任务科目参数缺失 (task._id: ${task._id})，无法生成题目`);
  }

  const validSubjects = ['math', 'biology', 'geography', '数学', '生物', '地理'];
  if (!validSubjects.includes(task.subject)) {
    console.error(`[generateAi] ❌ CRITICAL: invalid subject "${task.subject}" for task ${task._id}`);
    throw new Error(`无效的科目参数: "${task.subject}"，有效值为: ${validSubjects.join(', ')}`);
  }

  console.log(`[generateAi] ✅ Subject validated: ${task.subject}`);

  try {
    const db = cloud.database();
    const allQuestions = [];

    // === 混合策略：2题AI + n-2题题库 ===
    // 至少生成2道AI题目（如果count < 2则取count）
    const minAiCount = Math.min(2, count);
    const poolCount = count - minAiCount;  // 从题池取的数量

    console.log(`[generateAi] MIXED STRATEGY: ${minAiCount} AI + ${poolCount} pool (total: ${count})`);

    // 第一步：先从题池取 poolCount 道题目（快速，无需API调用）
    try {
      const poolResult = await db.collection('ai_question_pool')
        .where({ difficulty: difficulty, subject: task.subject })
        .limit(poolCount * 2)  // 多取一些，过滤掉可能的脏数据
        .get();

      const poolQuestions = (poolResult.data || [])
        .filter(q => {
          // 严格验证：subject 必须匹配，content 不能为空，选项 >= 2，内容匹配科目
          const subjectMatch = (q.subject || '') === task.subject;
          const hasContent = !!(q.content || q.question);
          const hasOptions = q.options && Array.isArray(q.options) && q.options.length >= 2;
          const contentMatch = validateSubject(q.content || q.question || '', task.subject);
          return subjectMatch && hasContent && hasOptions && contentMatch;
        })
        .slice(0, poolCount)  // 只取需要的数量
        .map((q, i) => ({
          id: q.pool_id || q._id || `pool_${Date.now()}_${i}`,
          type: 'choice',
          content: q.content || q.question || '',
          options: normalizeOptions(q.options),
          correct_answer: q.correct_answer,
          knowledge_point: q.knowledge_point || q.kp_name || '未知',
          knowledge_point_id: q.kp_id || 'unknown',
          difficulty: q.difficulty || difficulty,
          explanation: q.explanation || '',
          subject: q.subject || task.subject,
          chapter: q.chapter || task.chapter || '',
          source: 'pool'
        }));

      allQuestions.push(...poolQuestions);
      console.log(`[generateAi] Pool: got ${poolQuestions.length}/${poolCount} questions (filtered)`);
    } catch (poolErr) {
      console.warn(`[generateAi] Pool query failed: ${poolErr.message}`);
    }

    // 第二步：生成 minAiCount 道 AI 题目（必须生成）
    // 如果题池不足，增加AI生成数量来补足
    const poolShortfall = Math.max(0, poolCount - allQuestions.filter(q => q.source === 'pool').length);
    const actualAiNeeded = minAiCount + poolShortfall;

    console.log(`[generateAi] Pool got ${allQuestions.filter(q => q.source === 'pool').length}/${poolCount}, AI needed: ${actualAiNeeded} (min:${minAiCount} + shortfall:${poolShortfall})`);

    if (actualAiNeeded <= 0) {
      console.log(`[generateAi] Pool sufficient, no AI needed`);
      return allQuestions.slice(0, count);
    }

    console.log(`[generateAi] Generating ${actualAiNeeded} AI questions...`);

    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
    const model = process.env.LLM_MODEL || 'deepseek-chat';

    if (!apiKey) {
      console.error('[generateAi] LLM_API_KEY not set!');
      return allQuestions;
    }

    const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty] || '中等';
    const gradeText = task.grade ? `${task.grade}年级` : '八年级';
    const subjectText = { math: '数学', biology: '生物', geography: '地理' }[task.subject] || task.subject || '数学';
    const knowledgePoints = {
      math: ['二次根式', '勾股定理', '一次函数', '平行四边形', '数据的分析', '全等三角形', '轴对称', '整式的乘法', '分式', '概率'],
      biology: ['细胞结构', '光合作用', '呼吸作用', '遗传规律', '生态系统', '人体的消化', '人体的呼吸', '血液循环', '神经调节', '免疫与健康'],
      geography: ['中国的地理位置', '中国的地形', '中国的气候', '中国的人口', '中国的自然资源', '地球的运动', '大洲和大洋', '天气与气候', '世界的居民', '发展与合作']
    };
    const kpList = knowledgePoints[task.subject] || knowledgePoints.math;

    // 排除已有题目的知识点（避免重复）
    const existingKps = allQuestions.map(q => q.knowledge_point);
    const availableKps = kpList.filter(kp => !existingKps.includes(kp));
    const targetKps = availableKps.length >= actualAiNeeded ? availableKps.slice(0, actualAiNeeded) : kpList;

    const prompt = `请为${gradeText}${subjectText}生成${actualAiNeeded}道${difficultyText}难度的选择题。

知识点覆盖（均匀分布）：${targetKps.join('、')}

要求：
1. **必须是选择题**，每题恰好4个选项，仅1个正确答案
2. 不要生成填空题、计算题、解答题等非选择题
3. 选项长度均衡，正确选项不要比干扰项更长
4. 提供简短解析
5. 数学符号用Unicode（√ ² ³ ≤ ≥），不用LaTeX
6. 题目之间不要重复或高度相似

返回JSON数组格式（不要添加其他文字）：
[
  {"question":"题目文本","options":["A","B","C","D"],"correct_answer":0,"explanation":"解析","knowledge_point":"知识点"},
  ...
]`;

    console.log(`[generateAi] Calling DeepSeek API for ${actualAiNeeded} questions...`);
    const fetchStart = Date.now();

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: `你是${subjectText}题目生成助手。严格按照要求的JSON数组格式返回，不要添加任何其他文字。` },
          { role: 'user', content: prompt }
        ],
        max_tokens: 8000,
        temperature: 0.8,
        thinking: { type: 'disabled' }
      })
    });

    const fetchDuration = Date.now() - fetchStart;
    console.log(`[generateAi] API response in ${fetchDuration}ms, status: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[generateAi] API error: ${response.status} ${errText.substring(0, 200)}`);
      return allQuestions;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      console.error('[generateAi] Empty response from API');
      return allQuestions;
    }

    console.log(`[generateAi] Response length: ${content.length} chars`);

    // 解析 JSON 数组
    let questions;
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('[generateAi] No JSON array found in response');
        return allQuestions;
      }
      questions = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[generateAi] JSON parse error:', parseErr.message);
      return allQuestions;
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      console.error('[generateAi] Invalid questions array');
      return allQuestions;
    }

    // 格式化 AI 题目，过滤掉无选项的（非选择题）
    const aiQuestions = questions
      .filter(q => q.options && Array.isArray(q.options) && q.options.length >= 2)
      .map((q, i) => ({
      id: `ai_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'choice',
      content: q.question,
      options: q.options || [],
      correct_answer: q.correct_answer,
      knowledge_point: q.knowledge_point || targetKps[i % targetKps.length],
      knowledge_point_id: 'unknown',
      difficulty: difficulty,
      explanation: q.explanation || '',
      subject: task.subject,  // 移除 || 'math' 默认值，已在函数开头验证
      chapter: task.chapter || '',
      source: 'ai'
    }));

    allQuestions.push(...aiQuestions);

    // 去重：根据题目内容去除重复题
    const seen = new Set();
    const uniqueQuestions = [];
    for (const q of allQuestions) {
      const key = q.content || q.question || '';
      if (key && !seen.has(key)) {
        seen.add(key);
        uniqueQuestions.push(q);
      }
    }

    const totalDuration = Date.now() - startTime;
    const finalPoolCount = uniqueQuestions.filter(q => q.source === 'pool').length;
    const finalAiCount = uniqueQuestions.filter(q => q.source === 'ai').length;
    const removedCount = allQuestions.length - uniqueQuestions.length;
    console.log(`[generateAi] MIXED DONE: ${uniqueQuestions.length}/${count} questions (pool:${finalPoolCount} + ai:${finalAiCount}, removed ${removedCount} duplicates) in ${totalDuration}ms`);

    return uniqueQuestions.slice(0, count);
  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`[generateAi] FAILED task:${task._id} difficulty:${difficulty} duration:${duration}ms error:`, e.message);
    return [];
  }
}

/**
 * 生成单道题目
 * @param {string} kpName - 知识点名称
 * @param {string} difficulty - 难度
 * @param {Object} task - 任务对象
 * @returns {Promise<Object|null>} 生成的题目或null
 */
async function generateSingleQuestion(kpName, difficulty, task) {
  const questionStart = Date.now();

  console.log(`[generateSingleQuestion] === START === kpName:${kpName} difficulty:${difficulty}`);
  console.log(`[generateSingleQuestion] task._id:${task._id} subject:${task.subject}`);

  try {
    // 调用generateAiQuestion云函数
    // 跳过图片生成以加快速度
    console.log(`[generateSingleQuestion] Calling generateAiQuestion...`);
    const callStart = Date.now();

    const result = await cloud.callFunction({
      name: 'generateAiQuestion',
      data: {
        kp_name: kpName,
        difficulty: difficulty,
        chapter: task.chapter || '',
        subject: task.subject,  // 移除 || 'math' 默认值，已在函数开头验证
        skip_image: true  // 跳过图片生成以加快速度
      },
      config: {
        timeout: 180000  // 180秒超时，匹配generateAiQuestion云函数的重试机制（最多120秒重试等待 + 60秒LLM调用）
      }
    });

    const callDuration = Date.now() - callStart;
    console.log(`[generateSingleQuestion] cloud.callFunction returned in ${callDuration}ms`);
    console.log(`[generateSingleQuestion] result.errMsg:`, result.errMsg);
    console.log(`[generateSingleQuestion] result.result exists:`, !!result.result);
    console.log(`[generateSingleQuestion] result.result success:`, result.result?.success);

    // 检查结果
    if (result.errMsg && result.errMsg !== 'callFunction:ok') {
      console.error(`[generateSingleQuestion] Call failed for ${kpName}:`, result.errMsg);
      console.error(`[generateSingleQuestion] Full result:`, JSON.stringify(result));
      return null;
    }

    // 解析返回数据
    if (result.result) {
      console.log(`[generateSingleQuestion] result.result keys:`, Object.keys(result.result));
      console.log(`[generateSingleQuestion] result.result.success:`, result.result.success);
      console.log(`[generateSingleQuestion] result.result.data exists:`, !!result.result.data);
    }

    if (result.result && result.result.success && result.result.data) {
      const q = result.result.data;

      // 兼容两种格式：data 是数组（混合模式）或对象（纯AI模式）
      const questionData = Array.isArray(q) ? q[0] : q;

      // 检查 questionData 是否有 question 字段
      if (!questionData || !questionData.question) {
        console.error(`[generateSingleQuestion] No question field in result!`);
        console.error(`[generateSingleQuestion] questionData:`, JSON.stringify(questionData));
        return null;
      }

      const question = {
        id: questionData.pool_id || `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'choice',
        content: questionData.question,
        options: questionData.options || [],
        correct_answer: questionData.correct_answer,
        knowledge_point: questionData.kp_name || kpName,
        knowledge_point_id: questionData.kp_id || 'unknown',
        difficulty: questionData.difficulty || difficulty,
        explanation: questionData.explanation,
        subject: task.subject || 'biology',
        chapter: task.chapter || ''
      };

      console.log(`[generateSingleQuestion] SUCCESS: ${kpName} (total ${Date.now() - questionStart}ms)`);
      return question;
    } else {
      console.log(`[generateSingleQuestion] No valid result for ${kpName}`);
      console.log(`[generateSingleQuestion] result.result:`, JSON.stringify(result.result));
      return null;
    }
  } catch (e) {
    console.error(`[generateSingleQuestion] EXCEPTION (${kpName}):`, e.message);
    console.error(`[generateSingleQuestion] Stack:`, e.stack);
    return null;
  }
}

/**
 * 清理卡住的任务 + 优先处理目标任务
 * @param {Object} db - 数据库实例
 * @returns {Promise<Object>} 清理结果
 */
async function cleanupStuckTasks(db) {
  try {
    const STUCK_THRESHOLD = 55 * 1000; // 55秒阈值（函数60秒超时后，下一轮立即清理续跑）
    const FAILED_CLEANUP_THRESHOLD = 60 * 60 * 1000; // 1小时阈值 - 清理旧失败任务
    const TARGET_QUEUE_ID = '669eebf36a17092800eea1aa0a8c721b';
    const now = Date.now();

    let cleanedCount = 0;
    let failedCleanedCount = 0;

    // 1. 查询 processing 状态超过阈值的任务
    const stuckTasks = await db.collection('question_queue')
      .where({ status: 'processing' })
      .limit(50)
      .get();

    for (const task of stuckTasks.data || []) {
      const createdTime = new Date(task.created_at).getTime();
      const stuckDuration = now - createdTime;

      if (stuckDuration > STUCK_THRESHOLD) {
        // 检查是否有部分进度（progress.generated > 0）
        const hasProgress = task.progress && task.progress.generated > 0;
        if (hasProgress) {
          // 有进度的任务：设为pending但保留进度，让下次运行续跑
          console.log(`[cleanup] Task:${task._id} has progress (${task.progress.generated}/${task.progress.total}), resetting to pending for resume`);
          await updateQueueStatus(db, task._id, 'pending', {
            _resumable: true,
            retry_count: (task.retry_count || 0) + 1
          });
          cleanedCount++;
          continue;
        }
        console.log(`[cleanup] Found stuck task:${task._id} (no progress), stuck for ${Math.floor(stuckDuration / 1000)}s`);
        await updateQueueStatus(db, task._id, 'pending', {
          error: `Task stuck in processing for ${Math.floor(stuckDuration / 60000)}min, reset to pending`,
          retry_count: (task.retry_count || 0) + 1
        });
        cleanedCount++;
      }
    }

    // 2. 查询并删除超过1小时的failed任务（避免堆积）
    const failedTasks = await db.collection('question_queue')
      .where({ status: 'failed' })
      .limit(100)
      .get();

    for (const task of failedTasks.data || []) {
      const createdTime = new Date(task.created_at).getTime();
      const age = now - createdTime;

      if (age > FAILED_CLEANUP_THRESHOLD) {
        console.log(`[cleanup] Removing old failed task:${task._id}, age:${Math.floor(age / 60000)}min`);
        await db.collection('question_queue').doc(task._id).remove();
        failedCleanedCount++;
      }
    }

    // 3. 特殊处理：如果目标任务在 pending 队列中，提高它的优先级
    try {
      const targetTask = await db.collection('question_queue').doc(TARGET_QUEUE_ID).get();
      if (targetTask.data && targetTask.data.status === 'pending') {
        console.log(`[priority] Found target task in pending, boosting priority`);
        await updateQueueStatus(db, TARGET_QUEUE_ID, 'pending', {
          priority: 999  // 最高优先级
        });
        return { cleanedCount, failedCleanedCount, targetBoosted: true };
      }
    } catch (e) {
      // 忽略文档不存在错误
      if (!e.message.includes('does not exist')) {
        console.log('[cleanup] Target task check failed (ignoring):', e.message);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[cleanup] Cleaned ${cleanedCount} stuck tasks`);
    }
    if (failedCleanedCount > 0) {
      console.log(`[cleanup] Removed ${failedCleanedCount} old failed tasks`);
    }

    return { cleanedCount, failedCleanedCount, targetBoosted: false };
  } catch (e) {
    console.error('[cleanup] Error:', e);
    return { cleanedCount: 0, failedCleanedCount: 0, targetBoosted: false };
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const startTime = Date.now();
  const db = cloud.database();

  try {
    console.log('=== questionGenerator === started at', new Date().toISOString());

    // 0. 清理卡住的任务
    const result = await cleanupStuckTasks(db);
    if (result && result.cleanedCount > 0) {
      console.log(`[questionGenerator] Cleaned ${result.cleanedCount} stuck tasks before processing`);
    }

    // 1. 获取待处理任务（最多1个，避免429速率限制）- 优先用户队列
    const fetchStart = Date.now();
    let tasks = await fetchQueueTasks(db, 1, 'question_queue');
    let queueSource = 'question_queue';

    // 2. 如果用户队列为空，处理预生成任务
    if (tasks.length === 0) {
      tasks = await fetchQueueTasks(db, 5, 'pregen_queue');
      queueSource = 'pregen_queue';
    }

    const fetchDuration = Date.now() - fetchStart;
    console.log(`[questionGenerator] Fetched ${tasks.length} tasks from ${queueSource} in ${fetchDuration}ms`);

    if (tasks.length === 0) {
      console.log('[questionGenerator] No pending tasks');
      return { success: true, processed: 0, duration: Date.now() - startTime };
    }

    console.log(`[questionGenerator] Found ${tasks.length} pending tasks`);

    // 2. 处理每个任务
    const results = [];
    for (const task of tasks) {
      const taskStart = Date.now();
      console.log(`[questionGenerator] Processing task: ${task._id}, db_id: ${task._id}`);

      const result = await processTask(db, task, { generateAi });
      console.log(`[questionGenerator] Task ${task._id} took ${Date.now() - taskStart}ms, result:`, JSON.stringify(result));
      results.push({ queue_id: task._id, ...result });

      // 每处理完一个任务，检查是否超时
      // 云函数超时限制60秒，预留10秒缓冲
    }

    return {
      success: true,
      processed: results.length,
      results
    };

  } catch (e) {
    console.error('questionGenerator error:', e);
    // 重要：云函数异常退出时，确保队列状态更新为 failed
    // 防止 processing 状态的任务卡住
    try {
      const db = cloud.database();
      const { updateQueueStatus } = require('./workflow/utils/updateQueueStatus');
      // 尝试更新所有 processing 状态的任务为 failed
      const stuckTasks = await db.collection('question_queue')
        .where({ status: 'processing' })
        .limit(10)
        .get();
      for (const task of stuckTasks.data || []) {
        await updateQueueStatus(db, task._id, 'failed', {
          error: `Cloud function error: ${e.message}`
        });
        console.log(`[questionGenerator] Updated stuck task ${task._id} to failed`);
      }
    } catch (updateError) {
      console.error('[questionGenerator] Failed to update stuck tasks:', updateError.message);
    }
    return {
      success: false,
      error: e.message || String(e)
    };
  }
};

// 导出供测试使用（向后兼容）
Object.assign(exports, {
  fetchPendingTasks,
  updateQueueStatus,
  checkTaskCancelled,
  cleanupPartialQuestions,
  cleanupPartialQuestionsByTask,
  generateQuestionsForTask,  // 从独立模块导入
  processTask,
  cleanupStuckTasks
});
