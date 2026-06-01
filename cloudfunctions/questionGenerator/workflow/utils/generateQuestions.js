/**
 * 题目生成工具
 *
 * 提供题目生成的核心逻辑，支持中断检测和进度更新
 * 支持 AI 生成失败时题库回退
 * Phase 7: 支持 RAG 上下文注入（专属测评）
 */

const { checkTaskCancelled } = require('./checkTaskCancelled');
const { updateQueueStatus } = require('./updateQueueStatus');
const { isExclusiveMode, getRagChunkIds, buildUserMaterialContext } = require('./context-builder');

/**
 * 从题库获取备用题目（当 AI 生成失败时）
 * @param {Object} db - 数据库实例
 * @param {string} subject - 科目
 * @param {string} difficulty - 难度
 * @param {number} count - 需要的数量
 * @param {string} grade - 年级
 * @returns {Promise<Array>} 题目列表
 */
async function fetchFallbackQuestions(db, subject, difficulty, count, grade) {
  console.log(`[fetchFallbackQuestions] === START ===`);
  console.log(`[fetchFallbackQuestions] INPUT: subject=${subject}, difficulty=${difficulty}, count=${count}, grade=${grade}`);

  try {
    // 尝试从题库查询
    let questions = [];
    try {
      if (db) {
        const checkResult = await db.collection('ai_question_pool').where({ subject: subject }).limit(1).get();
        console.log(`[fetchFallbackQuestions] Pool check: ${checkResult.data?.length || 0} records found`);

        if (checkResult.data && checkResult.data.length > 0) {
          // 题库有数据，执行查询
          const result = await db.collection('ai_question_pool')
            .where({ difficulty: difficulty, subject: subject })
            .limit(count)
            .get();
          questions = result.data || [];
          console.log(`[fetchFallbackQuestions] Query returned ${questions.length} questions`);
        }
      }
    } catch (dbError) {
      console.warn(`[fetchFallbackQuestions] DB query failed:`, dbError.message);
    }

    // 如果题库为空或查询失败，返回默认题目
    if (questions.length === 0) {
      console.warn(`[fetchFallbackQuestions] Pool empty or query failed, using DEFAULT questions`);
      questions = generateDefaultQuestions(subject, difficulty, count);
      console.log(`[fetchFallbackQuestions] Generated ${questions.length} default questions`);
    }

    // 为回退题目添加唯一ID（避免重复键错误）
    return questions.map((q, index) => {
      // 移除 _id 字段，让数据库自动生成
      const { _id, ...rest } = q;
      return {
        ...rest,
        id: q.pool_id || q.id || `fallback_${Date.now()}_${index}`,
        pool_id: q.pool_id || q.id || `fallback_${Date.now()}_${index}`,
        source: q.source || 'fallback'
      };
    });
  } catch (e) {
    console.error(`[fetchFallbackQuestions] Exception:`, e.message);
    // 最后的回退：返回默认题目
    console.warn(`[fetchFallbackQuestions] Exception occurred, using DEFAULT questions`);
    return generateDefaultQuestions(subject, difficulty, count);
  }
}

/**
 * 生成默认题目（当题库为空时）
 * @param {string} subject - 科目
 * @param {string} difficulty - 难度
 * @param {number} count - 数量
 * @returns {Array} 默认题目列表
 */
function generateDefaultQuestions(subject, difficulty, count) {
  console.log(`[generateDefaultQuestions] START subject=${subject} difficulty=${difficulty} count=${count}`);

  const defaultQuestions = {
    math: {
      easy: [
        {
          content: "计算：√16 的值是？",
          options: ["2", "4", "8", "16"],
          correct_answer: 1,
          explanation: "√16 = 4，因为 4² = 16",
          type: 'choice',
          difficulty: 'easy',
          subject: 'math',
          knowledge_point: '平方根'
        },
        {
          content: "计算：| -5 | 的值是？",
          options: ["-5", "5", "±5", "0"],
          correct_answer: 1,
          explanation: "绝对值表示数轴上的距离，|-5| = 5",
          type: 'choice',
          difficulty: 'easy',
          subject: 'math',
          knowledge_point: '绝对值'
        },
        {
          content: "下列哪个数是无理数？",
          options: ["√4", "√9", "√7", "√16"],
          correct_answer: 2,
          explanation: "√7 是无理数，因为它不能表示为两个整数的比",
          type: 'choice',
          difficulty: 'easy',
          subject: 'math',
          knowledge_point: '实数分类'
        },
        {
          content: "计算：(-2)³ 的值是？",
          options: ["-6", "6", "-8", "8"],
          correct_answer: 2,
          explanation: "(-2)³ = (-2) × (-2) × (-2) = -8",
          type: 'choice',
          difficulty: 'easy',
          subject: 'math',
          knowledge_point: '有理数运算'
        },
        {
          content: "下列哪个计算结果是正数？",
          options: ["-3 + 5", "-3 - 5", "-3 × 5", "-3 ÷ 5"],
          correct_answer: 0,
          explanation: "-3 + 5 = 2，是正数",
          type: 'choice',
          difficulty: 'easy',
          subject: 'math',
          knowledge_point: '有理数运算'
        }
      ],
      medium: [
        {
          content: "若 a < 0，则 √(a²) 等于？",
          options: ["a", "-a", "±a", "0"],
          correct_answer: 1,
          explanation: "当 a < 0 时，√(a²) = -a（因为 √(a²) = |a| = -a 当 a<0）",
          type: 'choice',
          difficulty: 'medium',
          subject: 'math',
          knowledge_point: '平方根化简'
        },
        {
          content: "等边三角形的边长为 6，则其高为？",
          options: ["3", "3√3", "6", "12"],
          correct_answer: 1,
          explanation: "等边三角形的高 h = (√3/2) × 边长 = (√3/2) × 6 = 3√3",
          type: 'choice',
          difficulty: 'medium',
          subject: 'math',
          knowledge_point: '等边三角形'
        },
        {
          content: "若 x² = 16，则 x 的值是？",
          options: ["4", "-4", "±4", "0"],
          correct_answer: 2,
          explanation: "x² = 16 的解是 x = ±4，因为 4² = (-4)² = 16",
          type: 'choice',
          difficulty: 'medium',
          subject: 'math',
          knowledge_point: '平方方程'
        }
      ],
      hard: [
        {
          content: "设 a 为实数，下列说法正确的是？",
          options: ["-a 一定是负数", "a² 一定是正数", "|a| 一定非负", "a 一定大于 -a"],
          correct_answer: 2,
          explanation: "|a| 表示绝对值，恒大于等于 0。注意：a² = 0 时不是正数",
          type: 'choice',
          difficulty: 'hard',
          subject: 'math',
          knowledge_point: '实数性质'
        },
        {
          content: "若 √(x-1) + √(x+2) 有意义，则 x 的取值范围是？",
          options: ["x ≥ 1", "x ≥ -2", "-2 ≤ x ≤ 1", "x ≥ -2"],
          correct_answer: 1,
          explanation: "需要 x-1 ≥ 0 且 x+2 ≥ 0，即 x ≥ 1 且 x ≥ -2，取交集得 x ≥ 1",
          type: 'choice',
          difficulty: 'hard',
          subject: 'math',
          knowledge_point: '平方根定义域'
        }
      ]
    },
    biology: {
      easy: [
        {
          content: "细胞的基本结构包括？",
          options: ["细胞膜、细胞质、细胞核", "细胞壁、叶绿体、线粒体", "核糖体、内质网、高尔基体", "液泡、溶酶体、中心体"],
          correct_answer: 0,
          explanation: "细胞的基本结构包括细胞膜、细胞质和细胞核，其他是细胞器",
          type: 'choice',
          difficulty: 'easy',
          subject: 'biology',
          knowledge_point: '细胞结构'
        },
        {
          content: "光合作用发生的场所是？",
          options: ["线粒体", "叶绿体", "核糖体", "液泡"],
          correct_answer: 1,
          explanation: "叶绿体是光合作用的场所，其中含有叶绿素",
          type: 'choice',
          difficulty: 'easy',
          subject: 'biology',
          knowledge_point: '光合作用'
        }
      ],
      medium: [
        {
          content: "呼吸作用的主要产物是？",
          options: ["氧气和葡萄糖", "二氧化碳和水", "氨基酸和蛋白质", "淀粉和氧气"],
          correct_answer: 1,
          explanation: "有氧呼吸主要产生二氧化碳和水，释放能量",
          type: 'choice',
          difficulty: 'medium',
          subject: 'biology',
          knowledge_point: '呼吸作用'
        }
      ],
      hard: [
        {
          content: "孟德尔遗传定律的细胞学基础是？",
          options: ["基因位于染色体上", "DNA 是遗传物质", "基因控制蛋白质合成", "细胞通过分裂繁殖"],
          correct_answer: 0,
          explanation: "孟德尔遗传定律的实质是基因在染色体上呈线性排列，随染色体传递",
          type: 'choice',
          difficulty: 'hard',
          subject: 'biology',
          knowledge_point: '遗传规律'
        }
      ]
    },
    geography: {
      easy: [
        {
          content: "中国的地理位置位于？",
          options: ["东半球、北半球", "西半球、北半球", "东半球、南半球", "西半球、南半球"],
          correct_answer: 0,
          explanation: "中国位于亚洲东部，太平洋西岸，属于东半球和北半球",
          type: 'choice',
          difficulty: 'easy',
          subject: 'geography',
          knowledge_point: '地理位置'
        }
      ],
      medium: [
        {
          content: "中国地势的主要特点是？",
          options: ["东高西低，呈阶梯状", "西高东低，呈阶梯状", "南高北低，呈阶梯状", "中间高四周低"],
          correct_answer: 1,
          explanation: "中国地势西高东低，呈三级阶梯状分布",
          type: 'choice',
          difficulty: 'medium',
          subject: 'geography',
          knowledge_point: '地形特点'
        }
      ],
      hard: [
        {
          content: "秦岭-淮河一线是重要的地理分界线，它大致是？",
          options: ["热带与亚热带分界线", "亚热带与暖温带分界线", "暖温带与中温带分界线", "半湿润与半干旱区分界线"],
          correct_answer: 1,
          explanation: "秦岭-淮河一线大致是1月0℃等温线，也是亚热带与暖温带的分界线",
          type: 'choice',
          difficulty: 'hard',
          subject: 'geography',
          knowledge_point: '秦岭淮河'
        }
      ]
    }
  };

  // 获取对应科目的题目
  const subjectQuestions = defaultQuestions[subject];
  if (!subjectQuestions) {
    console.error(`[generateDefaultQuestions] ❌ Invalid subject: "${subject}". Valid values:`, Object.keys(defaultQuestions));
    // 返回空数组让调用方处理错误
    return [];
  }
  const difficultyQuestions = subjectQuestions[difficulty] || subjectQuestions.easy;

  console.log(`[generateDefaultQuestions] subjectQuestions exists:`, !!subjectQuestions);
  console.log(`[generateDefaultQuestions] difficultyQuestions exists:`, !!difficultyQuestions);
  console.log(`[generateDefaultQuestions] difficultyQuestions.length:`, difficultyQuestions?.length);

  // 循环生成题目（如果需要更多题目）
  const result = [];
  for (let i = 0; i < count; i++) {
    const q = difficultyQuestions[i % difficultyQuestions.length];
    // 添加唯一 ID 和时间戳
    result.push({
      ...q,
      _id: `default_${Date.now()}_${i}`,
      created_at: new Date().toISOString(),
      is_default: true
    });
  }

  console.log(`[generateDefaultQuestions] Generated ${result.length} questions`);
  return result;
}

/**
 * 为任务生成题目
 * @param {Object} task - 队列任务
 * @param {Function} generateAi - AI生成函数
 * @param {Object} db - 数据库实例（用于中断检测）
 * @param {Object} _ - 数据库命令对象（可选，用于 RAG 上下文）
 * @returns {Promise<Array>} 生成的题目列表
 */
async function generateQuestionsForTask(task, generateAi, db = null, _ = null) {
  console.log(`[generateQuestionsForTask] === START ===`);
  console.log(`[generateQuestionsForTask] task._id: ${task._id}`);
  console.log(`[generateQuestionsForTask] task.subject: ${task.subject}`);
  console.log(`[generateQuestionsForTask] task.grade: ${task.grade}`);
  console.log(`[generateQuestionsForTask] task.num_questions: ${task.num_questions}`);
  console.log(`[generateQuestionsForTask] task.mode: ${task.mode}`);

  const { num_questions, difficulty_distribution, subject, grade, semester, _id } = task;

  // Phase 7: 检查是否为专属测评模式
  const exclusiveMode = isExclusiveMode(task);
  let ragContext = { hasContext: false, chunks: [], summary: '' };

  if (exclusiveMode && db && _) {
    console.log(`[generateQuestionsForTask] Exclusive mode detected, building RAG context...`);
    const chunkIds = getRagChunkIds(task);

    if (chunkIds.length > 0) {
      try {
        ragContext = await buildUserMaterialContext(db, _, task.openid || task.student_id, chunkIds, 50);
        console.log(`[generateQuestionsForTask] RAG context built: ${ragContext.chunkCount} chunks`);
      } catch (error) {
        console.warn(`[generateQuestionsForTask] RAG context build failed:`, error.message);
      }
    }
  }

  // 将 RAG 上下文注入到任务中，供 generateAi 使用
  const enrichedTask = {
    ...task,
    ragContext: ragContext.hasContext ? ragContext : undefined
  };

  // 断点续跑：检查已有进度
  const existingProgress = (task.progress && task.progress.generated) || 0;
  const allQuestions = [];

  if (existingProgress > 0) {
    console.log(`[generateQuestionsForTask] Resuming from progress: ${existingProgress}/${num_questions}`);
  }

  // 计算每个难度的题目数量，处理缺失 difficulty_distribution
  const dist = difficulty_distribution || { easy: 0.5, medium: 0.3, hard: 0.2 };
  const easyCount = Math.round(num_questions * (typeof dist.easy === 'number' ? dist.easy : 0.5));
  const mediumCount = Math.round(num_questions * (typeof dist.medium === 'number' ? dist.medium : 0.3));
  const hardCount = num_questions - easyCount - mediumCount;

  console.log(`[generateQuestionsForTask] Distribution: easy=${easyCount}, medium=${mediumCount}, hard=${hardCount}`);

  const difficulties = [
    { level: 'easy', count: easyCount },
    { level: 'medium', count: mediumCount },
    { level: 'hard', count: hardCount }
  ];

  // 断点续跑：计算每个难度已生成的数量，跳过已完成的
  let questionsToSkip = existingProgress;

  for (const { level, count } of difficulties) {
    console.log(`[generateQuestionsForTask] Processing difficulty: ${level}, count: ${count}`);

    if (count <= 0) {
      console.log(`[generateQuestionsForTask] Skipping ${level} (count=0)`);
      continue;
    }

    // 断点续跑：跳过已完成的难度
    if (questionsToSkip >= count) {
      console.log(`[generateQuestionsForTask] Skipping ${level} (already generated ${count})`);
      questionsToSkip -= count;
      // 填充占位，保持总数一致
      for (let i = 0; i < count; i++) {
        allQuestions.push({ _placeholder: true, difficulty: level });
      }
      continue;
    }

    // 断点续跑：部分完成的难度，只生成剩余数量
    const actualCount = questionsToSkip > 0 ? count - questionsToSkip : count;
    if (questionsToSkip > 0) {
      console.log(`[generateQuestionsForTask] ${level}: skipping ${questionsToSkip}, generating ${actualCount}`);
      questionsToSkip = 0;
      // 填充已跳过的占位
      for (let i = 0; i < count - actualCount; i++) {
        allQuestions.push({ _placeholder: true, difficulty: level });
      }
    }

    // 中断检测：检查任务是否被取消
    if (db && _id) {
      const cancelled = await checkTaskCancelled(db, _id);
      if (cancelled) {
        console.log(`[generateQuestionsForTask] Task ${_id} was cancelled, stopping generation`);
        throw new Error('TASK_CANCELLED');
      }
    }

    try {
      console.log(`[generateQuestionsForTask] Calling AI generate for ${level} (need ${actualCount})...`);
      const questions = await generateAi(enrichedTask, level, actualCount);
      console.log(`[generateQuestionsForTask] AI returned ${questions?.length || 0} questions for ${level}`);

      // 检查 AI 生成结果
      if (!Array.isArray(questions) || questions.length === 0) {
        console.warn(`[generateQuestionsForTask] AI generation failed for ${level}, trying pool fallback`);
        // 题库回退
        const fallbackQuestions = await fetchFallbackQuestions(db, subject, level, actualCount, grade);
        console.log(`[generateQuestionsForTask] Fallback returned ${fallbackQuestions.length} questions for ${level}`);
        allQuestions.push(...fallbackQuestions);
      } else if (questions.length < actualCount) {
        console.warn(`[generateQuestionsForTask] AI generated ${questions.length}/${actualCount} for ${level}, supplementing from pool`);
        // 部分回退：补充题库题目
        const needed = actualCount - questions.length;
        const fallbackQuestions = await fetchFallbackQuestions(db, subject, level, needed, grade);
        console.log(`[generateQuestionsForTask] Fallback returned ${fallbackQuestions.length} questions for ${level}`);
        allQuestions.push(...questions, ...fallbackQuestions);
      } else {
        allQuestions.push(...questions);
        console.log(`[generateQuestionsForTask] AI generation succeeded for ${level}`);
      }

      // 更新进度前先检查状态，防止覆盖 cancelled 状态
      if (db && _id) {
        const cancelled = await checkTaskCancelled(db, _id);
        if (cancelled) {
          console.log(`[generateQuestionsForTask] Task ${_id} was cancelled before progress update`);
          throw new Error('TASK_CANCELLED');
        }

        const generatedCount = allQuestions.length;
        console.log(`[generateQuestionsForTask] Progress: ${generatedCount}/${num_questions}`);
        await updateQueueStatus(db, _id, 'processing', {
          progress: {
            generated: generatedCount,
            total: num_questions,
            percent: Math.floor((generatedCount / num_questions) * 100)
          }
        });
      }
    } catch (e) {
      if (e.message === 'TASK_CANCELLED') {
        throw e; // 重新抛出取消错误
      }
      console.error(`[generateQuestionsForTask] Error generating ${level} questions:`, e.message);
      console.error(`[generateQuestionsForTask] Stack:`, e.stack);

      // 即使出错，也尝试从题库获取
      console.warn(`[generateQuestionsForTask] Error occurred, trying pool fallback for ${level}`);
      const fallbackQuestions = await fetchFallbackQuestions(db, subject, level, count, grade);
      console.log(`[generateQuestionsForTask] Fallback returned ${fallbackQuestions.length} questions for ${level}`);
      allQuestions.push(...fallbackQuestions);
    }
  }

  console.log(`[generateQuestionsForTask] === FINAL RESULT ===`);
  console.log(`[generateQuestionsForTask] Total questions: ${allQuestions.length}`);
  console.log(`[generateQuestionsForTask] Requested: ${num_questions}`);
  console.log(`[generateQuestionsForTask] Success: ${allQuestions.length >= num_questions}`);

  if (allQuestions.length === 0) {
    console.error(`[generateQuestionsForTask] CRITICAL: No questions generated or fetched from pool!`);
  }

  return allQuestions;
}

module.exports = { generateQuestionsForTask };
