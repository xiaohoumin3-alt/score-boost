/**
 * Extended Assessment Cloud Function
 * 两阶段自适应测评系统
 *
 * 第一阶段：5题快速测评（从 ai_question_pool 获取）
 * 第二阶段：动态扩展测评（基于 Fisher 信息量 + 最大信息量选题）
 */

const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const {
  estimateTheta,
  calculateFisherInformation,
  calculateConfidenceInterval,
  calculateItemInformation,
  selectNextQuestion,
  thetaToScore,
  getInterpretation,
  estimateQuestionsNeeded,
  seToAccuracy,
  calculateProgress,
  generateRecommendation,
  prepareAccuracyMeterData
} = require('./shared/utils/irt-engine');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const VALID_ACTIONS = new Set([
  'startExtendedAssessment',
  'submitPhase1Answers',
  'submitAnswers',
  'getNextQuestion',
  'completeAssessment'
]);

const VALID_SUBJECTS = new Set([
  'math', 'chinese', 'english', 'physics', 'chemistry',
  'biology', 'history', 'geography', 'politics'
]);

const SUBJECT_GRADE_RANGES = {
  math: [1, 9], chinese: [1, 9], english: [1, 9],
  physics: [8, 9], chemistry: [9, 9],
  biology: [7, 9], history: [7, 9], geography: [7, 9], politics: [7, 9]
};

const TARGET_SE = 0.3;
const MAX_TOTAL_QUESTIONS = 15;
const AVG_SECONDS_PER_QUESTION = 60;
const INITIAL_QUESTION_COUNT = 5;

// ========== Generator Support ==========

/**
 * 支持的年级-科目组合
 * 用于验证 questionGenerator 是否支持指定组合
 */
const SUPPORTED_COMBINATIONS = {
  math: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  chinese: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  english: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  physics: [8, 9],
  chemistry: [9],
  biology: [7, 8, 9],
  history: [7, 8, 9],
  geography: [7, 8, 9],
  politics: [7, 8, 9]
};

/**
 * 验证生成器是否支持指定年级-科目组合
 *
 * @param {number} grade - 年级
 * @param {string} subject - 科目
 * @returns {{valid: boolean, error?: string}} 验证结果
 */
function validateGeneratorSupport(grade, subject) {
  const supportedGrades = SUPPORTED_COMBINATIONS[subject];
  if (!supportedGrades) {
    return {
      valid: false,
      error: `科目 ${subject} 暂不支持AI生成`
    };
  }
  if (!supportedGrades.includes(grade)) {
    return {
      valid: false,
      error: `${subject} 科目 ${grade} 年级暂不支持AI生成`
    };
  }
  return { valid: true };
}

// ========== Subject Aliases ==========

/**
 * 获取科目别名列表
 * 用于题池查询时匹配不同的 subject 字段值
 *
 * @param {string} subject - 规范化科目名 (math/chinese/english等)
 * @returns {string[]} 别名列表，第一个元素为规范名
 */
function getSubjectAliases(subject) {
  const aliasMap = {
    math: ['math', '数学', 'mathematics'],
    chinese: ['chinese', '语文', 'yuwen', '语文课程'],
    english: ['english', '英语', 'yingyu'],
    physics: ['physics', '物理', 'wuli'],
    chemistry: ['chemistry', '化学', 'huaxue'],
    biology: ['biology', '生物', 'shengwu'],
    history: ['history', '历史', 'lishi'],
    geography: ['geography', '地理', 'dili'],
    politics: ['politics', '政治', 'zhengzhi']
  };
  return aliasMap[subject] || [subject];
}

// ========== 工具函数 ==========

function normalizeChoice(value) {
  if (typeof value === 'number') return ['A', 'B', 'C', 'D'][value] || null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (/^[0-3]$/.test(normalized)) return ['A', 'B', 'C', 'D'][Number(normalized)];
  return ['A', 'B', 'C', 'D'].includes(normalized) ? normalized : null;
}

function getQuestionId(question = {}) {
  const ids = [question.question_id, question.id, question._id]
    .filter(id => id !== undefined && id !== null)
    .map(id => String(id));
  if (ids.length === 0) return null;
  return ids.every(id => id === ids[0]) ? ids[0] : null;
}

function getAnswerQuestionId(answer = {}) {
  const id = answer.question_id ?? answer.questionId ?? answer.id;
  return id === undefined || id === null ? null : String(id);
}

function getAnswerChoice(answer = {}) {
  return normalizeChoice(answer.user_answer ?? answer.answer ?? answer.selected);
}

function buildQuestionMap(questions) {
  const map = new Map();
  for (const question of questions) {
    const id = getQuestionId(question);
    if (!id || map.has(id)) return null;
    const correctAnswer = normalizeChoice(question.correct_answer);
    if (!correctAnswer) return null;
    map.set(id, { ...question, question_id: id, correct_answer: correctAnswer });
  }
  return map;
}

function sanitizeQuestionForStorage(question = {}) {
  const { correct_answer, explanation, answer, ...safeQuestion } = question;
  return safeQuestion;
}

function sanitizeQuestionForClient(question = {}) {
  const {
    correct_answer,
    explanation,
    answer,
    // 移除IRT参数和敏感字段
    difficulty,
    discrimination,
    guessing,
    irt_a,
    irt_b,
    irt_c,
    ...safeQuestion
  } = question;
  return safeQuestion;
}

function createError(code, message, details) {
  return {
    success: false,
    error: { code, message, details, timestamp: Date.now() }
  };
}

function normalizeParams(event) {
  return event && event.data ? event.data : (event || {});
}

function validateStartParams(params) {
  if (!Number.isInteger(params.grade) || params.grade < 1 || params.grade > 9) {
    return createError('INVALID_PARAMS', '年级参数无效', 'grade must be an integer between 1 and 9');
  }
  if (!VALID_SUBJECTS.has(params.subject)) {
    return createError('INVALID_PARAMS', '科目参数无效');
  }
  const [minGrade, maxGrade] = SUBJECT_GRADE_RANGES[params.subject];
  if (params.grade < minGrade || params.grade > maxGrade) {
    return createError('INVALID_PARAMS', '该年级暂不支持此科目');
  }
  return null;
}

function validateSessionId(params) {
  if (!params.session_id || typeof params.session_id !== 'string') {
    return createError('INVALID_PARAMS', '会话ID无效');
  }
  if (params.session_id.length > 128) {
    return createError('INVALID_PARAMS', '会话ID无效');
  }
  return null;
}

function validateAnswers(params) {
  const sessionError = validateSessionId(params);
  if (sessionError) return sessionError;
  if (!Array.isArray(params.answers)) {
    return createError('INVALID_ANSWER_FORMAT', '答案格式无效');
  }
  if (params.answers.length === 0 || params.answers.length > MAX_TOTAL_QUESTIONS) {
    return createError('INVALID_ANSWER_FORMAT', '答案数量无效');
  }
  return null;
}

/**
 * 构建扩展测评题目计划
 * 根据年级和学期从知识点数据文件中生成题目计划
 *
 * @param {number} grade - 年级（1-9）
 * @param {string} subject - 科目（math/chinese/english等）
 * @param {string} semester - 学期（up/down）
 * @returns {Promise<object>} 题目计划，包含知识点列表和难度分配
 */
async function buildExtendedQuestionPlan(grade, subject, semester) {
  try {
    const fs = require('fs');
    const path = require('path');

    // 规范化学年参数（只读取同年级数据）
    const normalizedGrade = String(grade);

    // 构建文件路径
    const semesterMap = { up: '上', down: '下' };
    const semesterSuffix = semester === 'up' ? 'up' : 'down';
    const fileName = `${subject}-grade${normalizedGrade}-${semesterSuffix}.json`;
    const filePath = path.join(__dirname, 'data', fileName);

    console.log(`[buildExtendedQuestionPlan] 读取知识点文件: ${fileName}`);

    // 读取知识点文件
    if (!fs.existsSync(filePath)) {
      throw new Error(`知识点文件不存在: ${fileName}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const knowledgeData = JSON.parse(content);

    if (!knowledgeData.chapters || !Array.isArray(knowledgeData.chapters) || knowledgeData.chapters.length === 0) {
      throw new Error(`知识点文件无效: ${fileName}，缺少chapters`);
    }

    // 提取所有知识点
    const target_kps = [];
    knowledgeData.chapters.forEach(chapter => {
      const chapterName = chapter.name || chapter.title || chapter.chapter_name || '';

      if (chapter.knowledge_points && Array.isArray(chapter.knowledge_points)) {
        chapter.knowledge_points.forEach(kp => {
          target_kps.push({
            kp_id: kp.id || kp.kp_id || '',
            kp_name: kp.name || kp.kp_name || kp.text || '',
            chapter: chapterName,
            section: ''
          });
        });
      }

      if (chapter.sections && Array.isArray(chapter.sections)) {
        chapter.sections.forEach(section => {
          if (section.knowledge_points && Array.isArray(section.knowledge_points)) {
            section.knowledge_points.forEach(kp => {
              target_kps.push({
                kp_id: kp.id || kp.kp_id || '',
                kp_name: kp.name || kp.kp_name || kp.text || '',
                chapter: chapterName,
                section: section.name || section.title || ''
              });
            });
          }
        });
      }
    });

    if (target_kps.length === 0) {
      throw new Error(`无可用知识点: ${fileName}`);
    }

    // 5题精确难度分配: 2 easy, 2 medium, 1 hard
    const difficulty_distribution = [
      { difficulty: 'easy', count: 2 },
      { difficulty: 'medium', count: 2 },
      { difficulty: 'hard', count: 1 }
    ];

    console.log(`[buildExtendedQuestionPlan] 成功: ${target_kps.length}个知识点, 难度分配=${JSON.stringify(difficulty_distribution)}`);

    return {
      target_kps,
      difficulty_distribution,
      total_questions: 5,
      semester: semesterMap[semester] || semester
    };
  } catch (e) {
    console.error('[buildExtendedQuestionPlan] 失败:', e.message);
    throw e;
  }
}

// ========== 题目获取 ==========

/**
 * 带 fallback 的题池查询
 * 6级fallback策略：verified:true → verified:false → exists(false)，每级遍历所有别名
 *
 * @param {object} db - 数据库实例
 * @param {number|string} grade - 年级（1-9），会规范化为字符串
 * @param {string} subject - 科目（math/chinese等）
 * @param {number} count - 需要的题目数量
 * @param {string[]} excludeIds - 要排除的题目ID列表
 * @returns {Promise<object[]>} 题目列表
 * @throws {Error} 当所有fallback级别都失败时抛出 queryFailedAll
 */
async function fetchQuestionsWithFallback(db, grade, subject, count, excludeIds = []) {
  const normalizedGrade = String(grade);
  const subjectAliases = getSubjectAliases(subject);
  const excludeSet = new Set(excludeIds.map(id => String(id)));

  console.log(`[fetchQuestionsWithFallback] grade=${normalizedGrade}, subject=${subject}, count=${count}, excludeIds=${excludeIds.length}`);

  // 6级fallback策略
  // Level 1-3: verified=true，遍历所有别名
  // Level 4-6: verified=false，遍历所有别名
  const fallbackLevels = [
    { verified: true, description: 'verified:true' },
    { verified: false, description: 'verified:false' }
  ];

  let allQuestions = [];
  let seenIds = new Set();

  for (const level of fallbackLevels) {
    for (const alias of subjectAliases) {
      if (allQuestions.length >= count) break;

      try {
        console.log(`[fetchQuestionsWithFallback] 查询: subject=${alias}, verified=${level.verified}`);

        const result = await db.collection('ai_question_pool')
          .where({
            grade: normalizedGrade,
            subject: alias,
            verified: level.verified
          })
          .orderBy('correct_rate', 'desc')
          .limit(count * 2) // 多取一些用于去重
          .get();

        const questions = (result.data || [])
          .filter(q => {
            const qid = String(q._id || q.question_id || '');
            return !excludeSet.has(qid) && !seenIds.has(qid);
          })
          .map(q => {
            const qid = String(q._id || q.question_id || '');
            seenIds.add(qid);
            return {
              question_id: q._id || q.question_id || `pool_${crypto.randomBytes(4).toString('hex')}`,
              content: q.question || q.content || '',
              options: q.options || [],
              correct_answer: normalizeChoice(q.correct_answer),
              difficulty: typeof q.difficulty === 'string'
                ? { easy: -1, medium: 0, hard: 1 }[q.difficulty] || 0
                : (q.difficulty || q.irt_b || 0),
              discrimination: q.discrimination || q.irt_a || 1.0,
              guessing: q.guessing || q.irt_c || 0.25,
              kp_id: q.kp_id || '',
              kp_name: q.kp_name || q.knowledge_point || '',
              knowledge_point_id: q.kp_id || ''
            };
          });

        console.log(`[fetchQuestionsWithFallback] 别名 ${alias} 找到 ${questions.length} 题`);
        allQuestions.push(...questions);
      } catch (e) {
        console.error(`[fetchQuestionsWithFallback] 查询失败: ${alias}, verified=${level.verified}, error=${e.message}`);
        // 继续尝试下一个别名
      }
    }

    if (allQuestions.length >= count) break;
  }

  // 最后尝试：exists(false) - 即 verified 字段不存在或为 false 的记录
  if (allQuestions.length < count) {
    for (const alias of subjectAliases) {
      if (allQuestions.length >= count) break;

      try {
        console.log(`[fetchQuestionsWithFallback] 查询: subject=${alias}, verified不存在`);

        // 使用 exists(false) 查询 verified 字段不存在或不为 true 的记录
        const result = await db.collection('ai_question_pool')
          .where({
            grade: normalizedGrade,
            subject: alias
          })
          .field({
            // 排除 verified:true 的记录（因为前两轮已经查过）
          })
          .orderBy('created_at', 'desc')
          .limit(count * 2)
          .get();

        const questions = (result.data || [])
          .filter(q => {
            const qid = String(q._id || q.question_id || '');
            const isNotVerifiedTrue = q.verified !== true;
            return !excludeSet.has(qid) && !seenIds.has(qid) && isNotVerifiedTrue;
          })
          .map(q => {
            const qid = String(q._id || q.question_id || '');
            seenIds.add(qid);
            return {
              question_id: q._id || q.question_id || `pool_${crypto.randomBytes(4).toString('hex')}`,
              content: q.question || q.content || '',
              options: q.options || [],
              correct_answer: normalizeChoice(q.correct_answer),
              difficulty: typeof q.difficulty === 'string'
                ? { easy: -1, medium: 0, hard: 1 }[q.difficulty] || 0
                : (q.difficulty || q.irt_b || 0),
              discrimination: q.discrimination || q.irt_a || 1.0,
              guessing: q.guessing || q.irt_c || 0.25,
              kp_id: q.kp_id || '',
              kp_name: q.kp_name || q.knowledge_point || '',
              knowledge_point_id: q.kp_id || ''
            };
          });

        console.log(`[fetchQuestionsWithFallback] exists(false) 别名 ${alias} 找到 ${questions.length} 题`);
        allQuestions.push(...questions);
      } catch (e) {
        console.error(`[fetchQuestionsWithFallback] exists(false) 查询失败: ${alias}, error=${e.message}`);
      }
    }
  }

  if (allQuestions.length === 0) {
    const error = new Error('题库查询失败：同年级所有别名和验证级别均无可用题目');
    error.code = 'QUERY_FAILED_ALL';
    throw error;
  }

  // 去重并返回
  const finalQuestions = [];
  const finalSeenIds = new Set();

  for (const q of allQuestions) {
    if (!finalSeenIds.has(q.question_id) && finalQuestions.length < count) {
      finalSeenIds.add(q.question_id);
      finalQuestions.push(q);
    }
  }

  console.log(`[fetchQuestionsWithFallback] 最终返回 ${finalQuestions.length} 题`);
  return finalQuestions;
}

/**
 * 从 ai_question_pool 获取题目（已废弃，保留用于兼容）
 * 优先从题池获取，题池不足时返回已有题目
 * @deprecated 使用 fetchQuestionsWithFallback 替代
 */
async function fetchQuestionsFromPool(db, grade, subject, count) {
  try {
    const result = await db.collection('ai_question_pool')
      .where({
        grade: String(grade),
        subject,
        verified: true
      })
      .orderBy('correct_rate', 'desc')
      .limit(count * 2)
      .get();

    const questions = result.data || [];
    if (questions.length === 0) return [];

    const shuffled = questions.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(q => ({
      question_id: q._id || q.question_id || `pool_${crypto.randomBytes(4).toString('hex')}`,
      content: q.question || q.content || '',
      options: q.options || [],
      correct_answer: normalizeChoice(q.correct_answer),
      difficulty: typeof q.difficulty === 'string'
        ? { easy: -1, medium: 0, hard: 1 }[q.difficulty] || 0
        : (q.difficulty || q.irt_b || 0),
      discrimination: q.discrimination || q.irt_a || 1.0,
      guessing: q.guessing || q.irt_c || 0.25,
      kp_id: q.kp_id || '',
      kp_name: q.kp_name || q.knowledge_point || '',
      knowledge_point_id: q.kp_id || ''
    }));
  } catch (e) {
    console.error('[fetchQuestionsFromPool] 查询失败:', e.message);
    return [];
  }
}

/**
 * 创建深度测评生成队列
 * 当题池题目不足时，调用此函数创建生成任务
 *
 * @param {object} db - 数据库实例
 * @param {object} params - 队列参数
 * @param {string} params.student_id - 学生ID
 * @param {number} params.grade - 年级
 * @param {string} params.subject - 科目
 * @param {string} params.semester - 学期 (up/down)
 * @returns {Promise<{queue_id: string}>} 创建的队列ID
 */
async function createExtendedAssessmentQueue(db, params) {
  const { student_id, grade, subject, semester } = params;

  console.log(`[createExtendedAssessmentQueue] student=${student_id}, grade=${grade}, subject=${subject}, semester=${semester}`);

  // 生成同年级知识点计划
  const questionPlan = await buildExtendedQuestionPlan(grade, subject, semester);

  // 5题精确难度分配: 2 easy, 2 medium, 1 hard
  const difficulty_distribution = [
    { difficulty: 'easy', count: 2 },
    { difficulty: 'medium', count: 2 },
    { difficulty: 'hard', count: 1 }
  ];

  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10分钟过期

  const queueData = {
    student_id,
    type: 'extended_assessment',
    source: 'extendedAssessment',
    grade: String(grade),
    subject,
    semester,
    num_questions: 5,
    question_plan: {
      target_kps: questionPlan.target_kps,
      total_questions: questionPlan.total_questions,
      semester: questionPlan.semester
    },
    target_kps: questionPlan.target_kps,
    difficulty_distribution,
    status: 'pending',
    timeline: {
      queued_at: now,
      processing_started_at: null,
      completed_at: null,
      failed_at: null
    },
    expires_at: expiresAt,
    result: {
      question_ids: [],
      generated_count: 0,
      error: null
    },
    created_at: now,
    updated_at: now
  };

  try {
    const result = await db.collection('question_queue').add({ data: queueData });
    const queue_id = result.id || result._id;

    console.log(`[createExtendedAssessmentQueue] 队列创建成功: ${queue_id}`);
    return { queue_id };
  } catch (error) {
    console.error('[createExtendedAssessmentQueue] 队列创建失败:', error);
    throw new Error('队列创建失败: ' + error.message);
  }
}

// ========== Phase 1: startExtendedAssessment ==========

/**
 * 启动深度测评
 * 支持题池兜底和队列生成闭环
 *
 * @param {object} params - 参数
 * @param {number} params.grade - 年级
 * @param {string} params.subject - 科目
 * @param {string} [params.semester] - 学期 (up/down，默认up)
 * @param {string} [params.after_queue_id] - 完成的队列ID，用于获取已生成题目
 * @param {string} userOpenid - 用户openid
 */
async function startExtendedAssessment(params, userOpenid) {
  const validationError = validateStartParams(params);
  if (validationError) return validationError;

  const { grade, subject, semester = 'up', after_queue_id } = params;
  const now = Date.now();
  const QUEUE_STUCK_THRESHOLD = 5 * 60 * 1000; // 5分钟
  const QUEUE_STALE_THRESHOLD = 2 * 60 * 1000; // 2分钟

  console.log(`[startExtendedAssessment] grade=${grade}, subject=${subject}, semester=${semester}, after_queue_id=${after_queue_id}`);

  // === Step 1: 查询现有active队列（防重复）===
  const existingQueuesResult = await db.collection('question_queue')
    .where({
      student_id: userOpenid,
      source: 'extendedAssessment',
      type: 'extended_assessment',
      grade: String(grade),
      subject: subject,
      semester: semester
    })
    .orderBy('created_at', 'desc')
    .limit(3)
    .get();

  const existingQueues = existingQueuesResult.data || [];

  // 检查是否有可复用的队列
  for (const queue of existingQueues) {
    const isProcessing = queue.status === 'processing';
    const isPending = queue.status === 'pending';
    const age = now - (queue.created_at || 0);
    const updatedAge = now - (queue.updated_at || 0);

    // Stuck processing: 超过5分钟未更新
    if (isProcessing && updatedAge > QUEUE_STUCK_THRESHOLD) {
      console.log(`[startExtendedAssessment] 发现stuck队列，将被忽略: ${queue._id}`);
      continue; // 跳过stuck队列
    }

    // Stale pending: 超过2分钟未开始处理
    if (isPending && age > QUEUE_STALE_THRESHOLD) {
      console.log(`[startExtendedAssessment] 发现stale队列，将被忽略: ${queue._id}`);
      continue; // 跳过stale队列
    }

    // 有效队列：复用queue_id
    if (isPending || isProcessing) {
      console.log(`[startExtendedAssessment] 复用现有队列: ${queue._id}, status=${queue.status}`);
      return {
        success: true,
        status: 'queued',
        queue_id: queue._id,
        message: '题目生成中，请稍候...'
      };
    }
  }

  // === Step 2: 处理after_queue_id（队列完成后重试）===
  if (after_queue_id) {
    // 六要素校验
    const queueCheckResult = await db.collection('question_queue')
      .where({
        _id: after_queue_id,
        student_id: userOpenid,
        grade: String(grade),
        subject: subject,
        source: 'extendedAssessment',
        type: 'extended_assessment',
        status: 'completed'
      })
      .get();

    const completedQueue = queueCheckResult.data && queueCheckResult.data[0];

    if (!completedQueue) {
      return createError(
        'QUEUE_NOT_FOUND_OR_INVALID',
        '队列不存在或已完成，请重新启动测评'
      );
    }

    // 队列已完成，获取生成的题目
    const resultQuestionIds = completedQueue.result?.question_ids;
    const generatedQuestionIds = Array.isArray(resultQuestionIds) && resultQuestionIds.length > 0
      ? resultQuestionIds
      : (completedQueue.question_ids || []);

    if (generatedQuestionIds.length === 0) {
      return createError(
        'INSUFFICIENT_QUESTIONS_AFTER_GENERATION',
        '题目生成后仍不足，请稍后再试或选择其他科目'
      );
    }

    // 从题池获取生成的题目
    const generatedQuestions = await fetchQuestionsFromIds(db, generatedQuestionIds);

    if (generatedQuestions.length < INITIAL_QUESTION_COUNT) {
      return createError(
        'INSUFFICIENT_QUESTIONS_AFTER_GENERATION',
        `题目生成后仍不足（${generatedQuestions.length}/${INITIAL_QUESTION_COUNT}），请稍后再试`
      );
    }

    // 创建session并返回ready
    return await createExtendedSession(generatedQuestions, grade, subject, userOpenid, after_queue_id);
  }

  // === Step 3: 尝试从题池获取题目 ===
  let questions = [];
  try {
    questions = await fetchQuestionsWithFallback(db, grade, subject, INITIAL_QUESTION_COUNT, []);
  } catch (error) {
    if (error.code !== 'QUERY_FAILED_ALL') {
      throw error;
    }
    console.warn('[startExtendedAssessment] 同年级题池为空，继续创建生成队列');
  }

  // === Step 4: 题数判断 ===
  if (questions.length >= INITIAL_QUESTION_COUNT) {
    // 题池充足，直接创建session
    console.log(`[startExtendedAssessment] 题池充足: ${questions.length}题`);
    return await createExtendedSession(questions, grade, subject, userOpenid);
  }

  // === Step 5: 题池不足，创建生成队列 ===
  console.log(`[startExtendedAssessment] 题池不足: ${questions.length}/${INITIAL_QUESTION_COUNT}，创建队列`);

  // 验证生成器支持
  const generatorSupport = validateGeneratorSupport(grade, subject);
  if (!generatorSupport.valid) {
    return createError(
      'SUBJECT_NOT_SUPPORTED',
      generatorSupport.error || '该年级科目暂不支持AI生成'
    );
  }

  try {
    const queueResult = await createExtendedAssessmentQueue(db, {
      student_id: userOpenid,
      grade,
      subject,
      semester
    });

    return {
      success: true,
      status: 'queued',
      queue_id: queueResult.queue_id,
      message: '当前题库题目不足，正在为你生成专属题目，预计需要10-30秒'
    };
  } catch (error) {
    console.error('[startExtendedAssessment] 队列创建失败:', error);
    return createError('QUEUE_CREATE_FAILED', '队列创建失败，请稍后再试');
  }
}

/**
 * 从题池根据ID列表获取题目
 */
async function fetchQuestionsFromIds(db, questionIds) {
  if (!questionIds || questionIds.length === 0) return [];

  try {
    const result = await db.collection('ai_question_pool')
      .where({
        _id: db.command.in(questionIds)
      })
      .get();

    return (result.data || []).map(q => ({
      question_id: q._id || q.question_id || '',
      content: q.question || q.content || '',
      options: q.options || [],
      correct_answer: normalizeChoice(q.correct_answer),
      difficulty: typeof q.difficulty === 'string'
        ? { easy: -1, medium: 0, hard: 1 }[q.difficulty] || 0
        : (q.difficulty || q.irt_b || 0),
      discrimination: q.discrimination || q.irt_a || 1.0,
      guessing: q.guessing || q.irt_c || 0.25,
      kp_id: q.kp_id || '',
      kp_name: q.kp_name || q.knowledge_point || '',
      knowledge_point_id: q.kp_id || ''
    }));
  } catch (e) {
    console.error('[fetchQuestionsFromIds] 查询失败:', e.message);
    return [];
  }
}

/**
 * 创建深度测评会话
 */
async function createExtendedSession(questions, grade, subject, userOpenid, queueId = null) {
  const session_id = `ext_${crypto.randomBytes(16).toString('hex')}`;
  const now = Date.now();

  const sessionData = {
    _id: session_id,
    user_openid: userOpenid,
    session_id,
    grade,
    subject,
    assessment_type: 'extended',
    phase: 'first',
    current_question_index: 0,
    phase1: {
      questions: questions.map(sanitizeQuestionForStorage),
      answers: [],
      completed_at: null
    },
    phase2: {
      enabled: false,
      questions: [],
      answers: [],
      started_at: null
    },
    responses: [],
    theta_estimate: 0,
    std_error: 1.0,
    fisher_information: 0,
    confidence_interval: null,
    score: { raw: 50, percentile: 50, interpretation: '中等' },
    extension_recommendation: null,
    detailed_report: null,
    status: 'initialized',
    queue_id: queueId, // 关联队列ID（如果有）
    created_at: now,
    updated_at: now
  };

  try {
    await db.collection('extended_sessions').add({ data: sessionData });

    const clientQuestions = questions.map(sanitizeQuestionForClient);

    return {
      success: true,
      status: 'ready',
      session_id,
      questions: clientQuestions,
      phase: 'first',
      target_se: TARGET_SE,
      estimated_time: INITIAL_QUESTION_COUNT * AVG_SECONDS_PER_QUESTION
    };
  } catch (error) {
    console.error('[createExtendedSession] 创建会话失败', error);
    return createError('DATABASE_ERROR', '会话创建失败');
  }
}

// ========== Phase 1: submitPhase1Answers ==========

async function submitPhase1Answers(params, userOpenid) {
  const validationError = validateAnswers(params);
  if (validationError) return validationError;

  try {
    const sessionResult = await db.collection('extended_sessions')
      .where({ session_id: params.session_id, user_openid: userOpenid })
      .limit(1)
      .get();
    const session = sessionResult.data && sessionResult.data[0];

    if (!session) {
      return createError('SESSION_NOT_FOUND', '测评会话不存在或已过期');
    }

    if (session.status === 'phase1_completed' || session.status === 'extending' || session.status === 'completed') {
      return buildCompletedResponse(session);
    }

    if (session.status !== 'initialized') {
      return createError('INVALID_STATUS', '当前测评状态不允许提交答案');
    }

    let trustedQuestions = (session.phase1 && session.phase1.questions) || [];

    if (trustedQuestions.length === 0) {
      return createError('PHASE1_QUESTIONS_NOT_READY', '第一阶段题目尚未准备好');
    }

    const questionMap = buildQuestionMap(trustedQuestions);
    if (!questionMap) {
      return createError('PHASE1_QUESTIONS_NOT_READY', '题目数据格式异常');
    }

    if (params.answers.length !== trustedQuestions.length) {
      return createError('INVALID_ANSWER_FORMAT', `答案数量(${params.answers.length})与题目数量(${trustedQuestions.length})不一致`);
    }

    const now = Date.now();
    const seenAnswerIds = new Set();
    const gradedAnswers = [];

    for (const answer of params.answers) {
      const questionId = getAnswerQuestionId(answer);
      const userAnswer = getAnswerChoice(answer);

      if (!questionId || !userAnswer) {
        return createError('INVALID_ANSWER_FORMAT', '答案格式无效');
      }
      if (seenAnswerIds.has(questionId)) {
        return createError('INVALID_ANSWER_FORMAT', '存在重复题目答案');
      }
      seenAnswerIds.add(questionId);

      const question = questionMap.get(questionId);
      if (!question) {
        return createError('INVALID_PARAMS', '答案包含未知题目');
      }

      gradedAnswers.push({
        question_id: questionId,
        user_answer: userAnswer,
        is_correct: userAnswer === question.correct_answer,
        answered_at: now
      });
    }

    const responses = gradedAnswers.map(answer => ({
      item: questionMap.get(answer.question_id),
      is_correct: answer.is_correct
    }));

    const thetaResult = estimateTheta(responses);
    const fisherInfo = calculateFisherInformation(thetaResult.theta, responses.map(r => r.item));
    const se = thetaResult.se;
    const score = thetaToScore(thetaResult.theta);
    const extensionRecommendation = buildExtensionRecommendation(se, trustedQuestions.length, fisherInfo);

    const allResponses = [...(session.responses || []), ...gradedAnswers.map((a, i) => ({
      question_id: a.question_id,
      is_correct: a.is_correct,
      difficulty: responses[i].item.difficulty || 0,
      answered_at: a.answered_at
    }))];

    const storedQuestions = trustedQuestions.map(sanitizeQuestionForStorage);
    const updateData = {
      phase: 'first',
      current_question_index: trustedQuestions.length,
      'phase1.answers': gradedAnswers,
      'phase1.summary': {
        total: trustedQuestions.length,
        correct_count: gradedAnswers.filter(a => a.is_correct).length,
        accuracy: gradedAnswers.filter(a => a.is_correct).length / trustedQuestions.length,
        completed_at: now
      },
      'phase1.completed_at': now,
      'phase1.questions': storedQuestions,
      responses: allResponses,
      theta_estimate: thetaResult.theta,
      std_error: se,
      fisher_information: fisherInfo,
      confidence_interval: calculateConfidenceInterval(thetaResult.theta, se),
      score: { raw: score, percentile: score, interpretation: getInterpretation(score) },
      extension_recommendation: extensionRecommendation,
      status: 'phase1_completed',
      updated_at: now
    };

    const updateResult = await db.collection('extended_sessions')
      .where({ session_id: session.session_id, user_openid: userOpenid, status: 'initialized' })
      .update({ data: updateData });

    if (updateResult && updateResult.stats && updateResult.stats.updated === 0) {
      return createError('CONFLICT', '测评状态已变更，请刷新后重试');
    }

    const progressInfo = calculateProgress(se, TARGET_SE, trustedQuestions.length);
    const accuracyMeter = prepareAccuracyMeterData({
      currentAccuracy: progressInfo.current_accuracy,
      targetAccuracy: progressInfo.target_accuracy,
      progressRatio: progressInfo.progress_percentage / 100
    });

    return {
      success: true,
      data: {
        session_id: session.session_id,
        status: 'phase1_completed',
        phase1_summary: updateData['phase1.summary'],
        ability_estimate: {
          theta: thetaResult.theta,
          se,
          fisher_info: fisherInfo,
          confidence_interval: calculateConfidenceInterval(thetaResult.theta, se)
        },
        score: updateData.score,
        extension_recommendation: extensionRecommendation,
        accuracy_meter: accuracyMeter
      }
    };
  } catch (error) {
    console.error('[extendedAssessment] 答案提交失败', error);
    return createError('DATABASE_ERROR', '答案提交失败');
  }
}

function buildExtensionRecommendation(se, totalQuestions, fisherInfo) {
  const targetInfo = 1 / (TARGET_SE * TARGET_SE);

  if (totalQuestions >= MAX_TOTAL_QUESTIONS) {
    return {
      should_extend: false,
      reason: 'MAX_REACHED',
      estimated_questions: 0,
      estimated_time: 0,
      current_info: fisherInfo,
      target_info: targetInfo
    };
  }

  const estimatedQuestions = Math.min(
    MAX_TOTAL_QUESTIONS - totalQuestions,
    estimateQuestionsNeeded(se, TARGET_SE)
  );

  return {
    should_extend: se > TARGET_SE && estimatedQuestions > 0,
    reason: se <= TARGET_SE ? 'TARGET_REACHED' : 'NEED_MORE_INFO',
    estimated_questions: se <= TARGET_SE ? 0 : estimatedQuestions,
    estimated_time: se <= TARGET_SE ? 0 : estimatedQuestions * AVG_SECONDS_PER_QUESTION,
    current_info: fisherInfo,
    target_info: targetInfo
  };
}

function buildCompletedResponse(session) {
  return {
    success: true,
    data: {
      session_id: session.session_id,
      status: session.status,
      phase1_summary: session.phase1 && session.phase1.summary,
      ability_estimate: {
        theta: session.theta_estimate,
        se: session.std_error,
        fisher_info: session.fisher_information,
        confidence_interval: session.confidence_interval
      },
      score: session.score,
      extension_recommendation: session.extension_recommendation,
      accuracy_meter: session.accuracy_meter || null
    }
  };
}

// ========== Phase 2: getNextQuestion ==========

async function getNextQuestion(params, userOpenid) {
  const validationError = validateSessionId(params);
  if (validationError) return validationError;

  try {
    const sessionResult = await db.collection('extended_sessions')
      .where({ session_id: params.session_id, user_openid: userOpenid })
      .limit(1)
      .get();
    const session = sessionResult.data && sessionResult.data[0];

    if (!session) {
      return createError('SESSION_NOT_FOUND', '测评会话不存在或已过期');
    }

    if (session.status === 'completed') {
      return createError('ASSESSMENT_COMPLETED', '测评已完成');
    }

    if (session.status !== 'phase1_completed' && session.status !== 'extending') {
      return createError('INVALID_STATUS', '当前状态不允许获取下一题');
    }

    // === 幂等性检查：查找phase2中未答題 ===
    const phase2Questions = session.phase2?.questions || [];
    const phase2Answers = session.phase2?.answers || [];
    const answeredQuestionIds = new Set(phase2Answers.map(a => String(a.question_id)));

    // 查找phase2中已分配但未答的题目
    const outstandingQuestion = phase2Questions.find(q => {
      const qid = String(q.question_id || q.id || '');
      return qid && !answeredQuestionIds.has(qid);
    });

    // 幂等返回：如果存在未答題，直接返回
    if (outstandingQuestion) {
      console.log(`[getNextQuestion] 幂等返回未答題: ${outstandingQuestion.question_id}`);
      return {
        success: true,
        question: sanitizeQuestionForClient(outstandingQuestion),
        is_idempotent: true,
        current_se: session.std_error || 1.0
      };
    }

    const currentTheta = session.theta_estimate || 0;
    const allUsedIds = [
      ...(session.phase1?.questions || []).map(q => q.question_id || q.id),
      ...(phase2Questions.map(q => q.question_id || q.id))
    ];

    const totalAnswered = (session.phase1?.answers?.length || 0) + phase2Answers.length;

    if (totalAnswered >= MAX_TOTAL_QUESTIONS) {
      return createError('MAX_QUESTIONS_REACHED', '已达到最大题数');
    }

    const currentSE = session.std_error || 1.0;
    if (currentSE <= TARGET_SE) {
      return createError('TARGET_REACHED', '已达到目标精度');
    }

    // 使用新的 fallback 函数查询题池
    const candidates = await fetchQuestionsWithFallback(
      db,
      session.grade,
      session.subject,
      100, // 获取更多候选
      allUsedIds
    );

    if (candidates.length === 0) {
      return createError('INSUFFICIENT_QUESTIONS', '题库中无更多可用题目');
    }

    // 二次检查：确保没有重复
    const usedIdSet = new Set(allUsedIds);
    const filteredCandidates = candidates.filter(q => {
      const qid = String(q.question_id || '');
      return !usedIdSet.has(qid);
    });

    if (filteredCandidates.length === 0) {
      return createError('INSUFFICIENT_QUESTIONS', '题库中无更多可用题目（去重后）');
    }

    const existingResponses = (session.responses || []).map(r => ({
      item: { difficulty: r.difficulty || 0, discrimination: 1.0, guessing: 0.25 },
      is_correct: r.is_correct
    }));

    // IRT选题
    const nextQuestion = selectNextQuestion(currentTheta, filteredCandidates, allUsedIds);

    if (!nextQuestion) {
      return createError('NO_SUITABLE_QUESTION', '无法选出合适题目');
    }

    // 写入前检查重复（最终安全检查）
    const nextQid = String(nextQuestion.question_id);
    if (usedIdSet.has(nextQid) || answeredQuestionIds.has(nextQid)) {
      console.error(`[getNextQuestion] 选题重复: ${nextQid}`);
      return createError('DUPLICATE_QUESTION', '选题重复，请重试');
    }

    // 先写入 phase2.questions，再返回
    const updateData = {
      'phase2.questions': db.command.push([nextQuestion]),
      updated_at: Date.now()
    };

    if (session.status === 'phase1_completed') {
      updateData.status = 'extending';
      updateData.phase = 'second';
      updateData['phase2.enabled'] = true;
      updateData['phase2.started_at'] = Date.now();
    }

    await db.collection('extended_sessions')
      .where({ session_id: session.session_id, user_openid: userOpenid })
      .update({ data: updateData });

    const totalQuestions = totalAnswered + 1;
    const progress = calculateProgress(currentSE, TARGET_SE, totalQuestions);

    return {
      success: true,
      question: sanitizeQuestionForClient(nextQuestion),
      is_idempotent: false,
      current_se: currentSE,
      progress: {
        current_question: totalQuestions,
        estimated_total: totalQuestions + progress.questions_needed,
        phase: 'extending',
        accuracy_percentage: Math.round(seToAccuracy(currentSE) * 100)
      }
    };
  } catch (error) {
    if (error.code === 'QUERY_FAILED_ALL') {
      return createError('INSUFFICIENT_QUESTIONS', '题库中无更多可用题目');
    }
    console.error('[extendedAssessment] 获取下一题失败', error);
    return createError('DATABASE_ERROR', '获取下一题失败');
  }
}

// ========== Phase 2: submitAnswers ==========

async function submitAnswers(params, userOpenid) {
  const validationError = validateAnswers(params);
  if (validationError) return validationError;

  try {
    const sessionResult = await db.collection('extended_sessions')
      .where({ session_id: params.session_id, user_openid: userOpenid })
      .limit(1)
      .get();
    const session = sessionResult.data && sessionResult.data[0];

    if (!session) {
      return createError('SESSION_NOT_FOUND', '测评会话不存在或已过期');
    }

    if (session.status === 'completed') {
      return createError('ASSESSMENT_COMPLETED', '测评已完成');
    }

    if (session.status !== 'extending') {
      return createError('INVALID_STATUS', '当前状态不允许提交答案');
    }

    const phase2Questions = session.phase2?.questions || [];
    const questionMap = buildQuestionMap(phase2Questions);

    if (!questionMap) {
      return createError('PHASE2_QUESTIONS_NOT_READY', '第二阶段题目数据异常');
    }

    const now = Date.now();
    const seenAnswerIds = new Set();
    const gradedAnswers = [];

    for (const answer of params.answers) {
      const questionId = getAnswerQuestionId(answer);
      const userAnswer = getAnswerChoice(answer);

      if (!questionId || !userAnswer) {
        return createError('INVALID_ANSWER_FORMAT', '答案格式无效');
      }
      if (seenAnswerIds.has(questionId)) {
        return createError('INVALID_ANSWER_FORMAT', '存在重复题目答案');
      }
      seenAnswerIds.add(questionId);

      const question = questionMap.get(questionId);
      if (!question) {
        return createError('QUESTION_NOT_IN_SESSION', `未知题目ID: ${questionId}`);
      }

      // 验证服务端题目包含correct_answer
      if (question.correct_answer === undefined || question.correct_answer === null) {
        return createError('QUESTION_ANSWER_MISSING', `题目答案缺失: ${questionId}`);
      }

      // 幂等处理：检查是否已提交过
      const existingAnswer = (session.phase2?.answers || []).find(
        a => String(a.question_id) === String(questionId)
      );
      if (existingAnswer) {
        continue;
      }

      gradedAnswers.push({
        question_id: questionId,
        user_answer: userAnswer,
        is_correct: userAnswer === question.correct_answer,
        answered_at: now
      });
    }

    if (gradedAnswers.length === 0) {
      return {
        success: true,
        data: {
          session_id: session.session_id,
          current_score: session.score?.raw || 0,
          current_theta: session.theta_estimate || 0,
          current_se: session.std_error || 0,
          current_accuracy: seToAccuracy(session.std_error || 0),
          recommendation: session.extension_recommendation,
          accuracy_meter: session.accuracy_meter
        }
      };
    }

    const newResponses = gradedAnswers.map((a, i) => ({
      question_id: a.question_id,
      is_correct: a.is_correct,
      difficulty: phase2Questions[i]?.difficulty || 0,
      answered_at: a.answered_at
    }));

    const allResponses = [...(session.responses || []), ...newResponses];

    const responseItems = allResponses.map(r => ({
      item: { difficulty: r.difficulty || 0, discrimination: 1.0, guessing: 0.25 },
      is_correct: r.is_correct
    }));

    const thetaResult = estimateTheta(responseItems);
    const fisherInfo = calculateFisherInformation(thetaResult.theta, responseItems.map(r => r.item));
    const se = thetaResult.se;
    const score = thetaToScore(thetaResult.theta);
    const extensionRecommendation = buildExtensionRecommendation(
      se,
      (session.phase1?.answers?.length || 0) + (session.phase2?.answers?.length || 0) + gradedAnswers.length,
      fisherInfo
    );

    const progressInfo = calculateProgress(se, TARGET_SE, allResponses.length);
    const accuracyMeter = prepareAccuracyMeterData({
      currentAccuracy: progressInfo.current_accuracy,
      targetAccuracy: progressInfo.target_accuracy,
      progressRatio: progressInfo.progress_percentage / 100
    });

    const updatedPhase2Answers = [...(session.phase2?.answers || []), ...gradedAnswers];

    const updateData = {
      current_question_index: allResponses.length,
      responses: allResponses,
      theta_estimate: thetaResult.theta,
      std_error: se,
      fisher_information: fisherInfo,
      confidence_interval: calculateConfidenceInterval(thetaResult.theta, se),
      score: { raw: score, percentile: score, interpretation: getInterpretation(score) },
      extension_recommendation: extensionRecommendation,
      accuracy_meter: accuracyMeter,
      'phase2.answers': updatedPhase2Answers,
      updated_at: now
    };

    await db.collection('extended_sessions')
      .where({ session_id: session.session_id, user_openid: userOpenid, status: 'extending' })
      .update({ data: updateData });

    return {
      success: true,
      data: {
        session_id: session.session_id,
        current_score: score,
        current_theta: thetaResult.theta,
        current_se: se,
        current_accuracy: seToAccuracy(se),
        recommendation: extensionRecommendation,
        accuracy_meter: accuracyMeter
      }
    };
  } catch (error) {
    console.error('[extendedAssessment] 提交答案失败', error);
    return createError('DATABASE_ERROR', '提交答案失败');
  }
}

// ========== completeAssessment ==========

async function completeAssessment(params, userOpenid) {
  const validationError = validateSessionId(params);
  if (validationError) return validationError;

  try {
    const sessionResult = await db.collection('extended_sessions')
      .where({ session_id: params.session_id, user_openid: userOpenid })
      .limit(1)
      .get();
    const session = sessionResult.data && sessionResult.data[0];

    if (!session) {
      return createError('SESSION_NOT_FOUND', '测评会话不存在或已过期');
    }

    if (session.status === 'completed') {
      return buildFinalResponse(session);
    }

    if (session.status !== 'phase1_completed' && session.status !== 'extending') {
      return createError('INVALID_STATUS', '当前状态不允许完成测评');
    }

    const now = Date.now();
    const allResponses = session.responses || [];
    const totalQuestions = allResponses.length;
    const correctCount = allResponses.filter(r => r.is_correct).length;
    const theta = session.theta_estimate || 0;
    const se = session.std_error || 1.0;
    const fisherInfo = session.fisher_information || 0;
    const score = thetaToScore(theta);

    const difficultyDistribution = { easy: 0, medium: 0, hard: 0 };
    for (const r of allResponses) {
      const d = r.difficulty || 0;
      if (d < -1) difficultyDistribution.easy++;
      else if (d > 1) difficultyDistribution.hard++;
      else difficultyDistribution.medium++;
    }

    const responseTimes = allResponses
      .filter(r => r.answered_at)
      .map((r, i, arr) => i > 0 ? (r.answered_at - arr[i - 1].answered_at) / 1000 : AVG_SECONDS_PER_QUESTION);
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : AVG_SECONDS_PER_QUESTION;

    const detailedReport = {
      total_questions: totalQuestions,
      correct_count: correctCount,
      extended_questions: Math.max(0, totalQuestions - (session.phase1?.questions?.length || INITIAL_QUESTION_COUNT)),
      fisher_information: fisherInfo,
      response_time_avg: Math.round(avgResponseTime),
      difficulty_distribution: difficultyDistribution,
      improvement_suggestion: generateImprovementSuggestion(theta, se, difficultyDistribution)
    };

    const completionData = {
      status: 'completed',
      phase: 'completed',
      completed_at: now,
      updated_at: now,
      detailed_report: detailedReport,
      final_score: score,
      final_theta: theta,
      final_se: se
    };

    await db.collection('extended_sessions')
      .where({ session_id: session.session_id, user_openid: userOpenid })
      .update({ data: completionData });

    try {
      await db.collection('assessments').add({
        data: {
          _id: `ext_${session.session_id}`,
          user_openid: userOpenid,
          openid: userOpenid,
          grade: session.grade,
          subject: session.subject,
          assessment_type: 'extended',
          score: score,
          theta: theta,
          se: se,
          fisher_info: fisherInfo,
          confidence_interval: session.confidence_interval,
          total_questions: totalQuestions,
          correct_count: correctCount,
          session_id: session.session_id,
          questions: (session.phase1?.questions || []).map(sanitizeQuestionForStorage),
          created_at: now,
          status: 'completed'
        }
      });
    } catch (syncError) {
      console.error('[completeAssessment] assessments 同步失败:', syncError.message);
    }

    return buildFinalResponse({ ...session, ...completionData, detailed_report: detailedReport });
  } catch (error) {
    console.error('[extendedAssessment] 完成测评失败', error);
    return createError('DATABASE_ERROR', '完成测评失败');
  }
}

function buildFinalResponse(session) {
  return {
    success: true,
    data: {
      session_id: session.session_id,
      status: 'completed',
      final_score: session.final_score || session.score?.raw || 0,
      final_theta: session.final_theta || session.theta_estimate || 0,
      final_se: session.final_se || session.std_error || 0,
      confidence_interval: session.confidence_interval,
      detailed_report: session.detailed_report
    }
  };
}

function generateImprovementSuggestion(theta, se, distribution) {
  const total = distribution.easy + distribution.medium + distribution.hard;
  if (total === 0) return '继续练习以获得更准确的评估';

  if (theta > 1.5) {
    return '基础扎实，建议挑战更高难度题目以进一步提升';
  }
  if (theta < -1) {
    if (distribution.easy < total * 0.3) {
      return '建议先巩固基础知识，多做简单题型';
    }
    return '建议从基础题目开始，逐步提升难度';
  }
  if (distribution.hard > total * 0.5 && distribution.easy < total * 0.2) {
    return '难题表现良好，可适当降低难度巩固中等题型';
  }
  return '各难度表现均衡，建议针对薄弱知识点加强练习';
}

// ========== 入口 ==========

// 导出供测试使用
exports.SUPPORTED_COMBINATIONS = SUPPORTED_COMBINATIONS;
exports.validateGeneratorSupport = validateGeneratorSupport;
exports.getSubjectAliases = getSubjectAliases;
exports.fetchQuestionsWithFallback = fetchQuestionsWithFallback;
exports.buildExtendedQuestionPlan = buildExtendedQuestionPlan;
exports.createExtendedAssessmentQueue = createExtendedAssessmentQueue;

exports.main = async (event, context) => {
  const params = normalizeParams(event);
  const { action } = params;

  if (!VALID_ACTIONS.has(action)) {
    return createError('INVALID_PARAMS', `未知操作: ${action || 'undefined'}`);
  }

  try {
    const wxContext = cloud.getWXContext();
    const userOpenid = wxContext.OPENID;

    if (!userOpenid) {
      return createError('INVALID_PARAMS', '无法获取用户身份');
    }

    switch (action) {
      case 'startExtendedAssessment':
        return await startExtendedAssessment(params, userOpenid);
      case 'submitPhase1Answers':
        return await submitPhase1Answers(params, userOpenid);
      case 'submitAnswers':
        return await submitAnswers(params, userOpenid);
      case 'getNextQuestion':
        return await getNextQuestion(params, userOpenid);
      case 'completeAssessment':
        return await completeAssessment(params, userOpenid);
      default:
        return createError('INVALID_PARAMS', `未知操作: ${action}`);
    }
  } catch (error) {
    console.error('[extendedAssessment] 云函数执行错误', error);
    return createError('DATABASE_ERROR', '数据库操作失败');
  }
};
