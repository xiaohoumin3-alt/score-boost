/**
 * 开始测评云函数
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { loadKnowledgeTree, loadHuikaoTree, generateQuestionPlan, generateHuikaoPlan } = require('./knowledge_tree');
const { fetchQuestionsFromPool, fetchQuestionsBatch } = require('./question_pool');
const { LlmClient, parseLlmResponse, validateQuestion } = require('./llm_client');
const { logKpRequest } = require('./kp-request-logger');
const { formatQuestionForApi, normalizeQuestion } = require('./question-normalizer');
const { startAsyncGeneration } = require('./async-generator');

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 计算队列任务优先级
 * 基于知识点热度（可后续接入 heat-calculator）
 */
function calculatePriority(kpIds) {
  // 简单实现：返回中等优先级
  // 后续可接入 heat-calculator.getHeatLevel()
  return 5;
}

/**
 * 检查题库是否已迁移到云数据库
 * @param {Object} db - 数据库实例
 * @returns {Promise<boolean>}
 */
async function isSeedMigrated(db) {
  try {
    const result = await db.collection('ai_question_pool')
      .where({ source: 'seed' })
      .count();
    return result.total >= 50;  // 阈值：至少迁移50条认为迁移完成
  } catch (e) {
    console.error('[isSeedMigrated] error:', e);
    return false;
  }
}

exports.main = async (event, context) => {
  try {
    console.log('[startAssessment] ========== 开始执行 ==========');
    console.log('[startAssessment] event:', JSON.stringify(event));
    console.log('[startAssessment] context:', JSON.stringify(context));

    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const params = event.data || event || {};

    console.log('[startAssessment] wxContext.OPENID:', openid);
    console.log('[startAssessment] params:', JSON.stringify(params));

    // 科目映射：支持中文和英文
    const subjectMap = {
      '语文': 'chinese', 'chinese': 'chinese',
      '数学': 'math', 'math': 'math',
      '英语': 'english', 'english': 'english',
      '物理': 'physics', 'physics': 'physics',
      '化学': 'chemistry', 'chemistry': 'chemistry',
      '生物': 'biology', 'biology': 'biology',
      '历史': 'history', 'history': 'history',
      '地理': 'geography', 'geography': 'geography',
      '政治': 'politics', 'politics': 'politics'
    };

    const rawSubject = params.subject || 'math';
    const subject = subjectMap[rawSubject] || rawSubject;
    const gradeMap = {
      '一年级': '1', '二年级': '2', '三年级': '3',
      '四年级': '4', '五年级': '5', '六年级': '6',
      '七年级': '7', '八年级': '8', '九年级': '9'
    };
    const rawGrade = params.grade || '8';
    const grade = gradeMap[rawGrade] || String(rawGrade);
    const semesterMap = { '上': 'up', '下': 'down', up: 'up', down: 'down' };
    const semester = semesterMap[params.semester] || params.semester || 'down';
    const mode = params.mode || 'pre_test';
    const numQuestions = parseInt(params.num_questions || params.numQuestions || 20);
    const forceSync = params.force_sync === true;
    const studentId = wxContext.OPENID;

    // 会考模式默认50题
    const finalNumQuestions = mode === 'huikao' ? parseInt(params.num_questions || 50) : numQuestions;

    console.log('[startAssessment] 最终参数:', { rawSubject, subject, grade, semester, mode, finalNumQuestions });

    // 科目-年级兼容性验证（防止二年级选择化学等无效组合）
    const SUBJECT_GRADE_MATRIX = {
      'math': { min: 1, max: 9 },
      'chinese': { min: 1, max: 9 },
      'english': { min: 1, max: 6 },
      'biology': { min: 7, max: 8 },
      'geography': { min: 7, max: 8 },
      'history': { min: 7, max: 9 },
      'politics': { min: 7, max: 9 },
      'physics': { min: 8, max: 9 },
      'chemistry': { min: 9, max: 9 }
    };
    const subjectTextMap = {
      'math': '数学', 'chinese': '语文', 'english': '英语',
      'biology': '生物', 'geography': '地理', 'history': '历史',
      'politics': '政治', 'physics': '物理', 'chemistry': '化学'
    };
    const gradeNum = parseInt(grade, 10);
    const validRange = SUBJECT_GRADE_MATRIX[subject];
    if (!validRange || isNaN(gradeNum) || gradeNum < validRange.min || gradeNum > validRange.max) {
      const subjectName = subjectTextMap[subject] || subject;
      if (validRange) {
        return {
          success: false,
          error: `${subjectName}仅适用于${validRange.min}-${validRange.max}年级，当前选择${gradeNum}年级`
        };
      } else {
        return {
          success: false,
          error: `不支持的科目：${subjectName}`
        };
      }
    }

    // 复测模式下，必须通过 openid 查询服务端最近测评成绩
    let previousScore = undefined;
    const db = cloud.database();  // 提前声明db供整个函数使用

    if (mode === 'retest') {
      const { data: previousAssessments } = await db.collection('assessments')
        .where({
          openid: openid,
          status: 'completed',
          subject: subject,
          grade: grade
        })
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

      if (previousAssessments.length === 0) {
        return {
          success: false,
          error: '无测评历史，无法进行复测'
        };
      }

      const lastAssessment = previousAssessments[0];
      // 从测评结果中获取分数
      previousScore = lastAssessment.score_percent || lastAssessment.total_correct || 0;
    }

    // 计算复测难度分布（基于服务端查询的真实成绩）
    let difficultyDistribution = { easy: 0.5, medium: 0.3, hard: 0.2 };

    if (mode === 'retest' && previousScore !== undefined) {
      // 复测模式：只出目标难度的题目，确保难度升级效果
      let targetDifficulty = 'medium';
      if (previousScore >= 90) {
        targetDifficulty = 'hard';
      } else if (previousScore >= 60) {
        targetDifficulty = 'medium';
      } else {
        targetDifficulty = 'easy';
      }

      if (targetDifficulty === 'easy') {
        difficultyDistribution = { easy: 1.0, medium: 0, hard: 0 };
      } else if (targetDifficulty === 'medium') {
        difficultyDistribution = { easy: 0, medium: 1.0, hard: 0 };
      } else if (targetDifficulty === 'hard') {
        difficultyDistribution = { easy: 0, medium: 0, hard: 1.0 };
      }
    }

    const assessmentId = generateUUID();

    // 加载知识树：会考模式使用跨年级合并
    let tree;
    let plan;
    if (mode === 'huikao') {
      tree = loadHuikaoTree(subject);
      console.log('[startAssessment] Loaded huikao tree:', {
        subject: tree.subject,
        mode: tree.mode,
        grade: tree.grade,
        chapterCount: tree.chapters?.length || 0
      });
      plan = generateHuikaoPlan(tree, finalNumQuestions);
    } else {
      tree = loadKnowledgeTree(subject, grade, semester);
      console.log('[startAssessment] Loaded tree:', {
        subject: tree.subject,
        grade: tree.grade,
        chapterCount: tree.chapters?.length || 0,
        sampleChapters: (tree.chapters || []).slice(0, 2).map(c => ({ id: c.id, name: c.name, kpCount: c.knowledge_points?.length || 0 }))
      });
      plan = generateQuestionPlan(tree, finalNumQuestions, difficultyDistribution);
    }

    console.log('[startAssessment] Generated plan:', {
      planLength: plan.length,
      sampleItems: plan.slice(0, 3).map(p => ({ kp_id: p.kp?.kp_id, kp_name: p.kp?.kp_name, difficulty: p.difficulty }))
    });

    // 记录知识点请求日志（异步，不阻塞主流程）
    for (const item of plan) {
      if (item.kp?.kp_id) {
        logKpRequest(db, {
          kp_id: item.kp.kp_id,
          kp_name: item.kp.kp_name,
          subject,
          student_id: studentId,
          source: 'assessment'
        }).catch(e => console.error('[startAssessment] logKpRequest error:', e.message));
      }
    }

    // 生成题目：题池优先，无题时AI生成补足
    // 优化：批量查询题池，减少网络调用
    const questions = [];
    const excludeIds = [];

    // 初始化LLM客户端
    const apiKey = process.env.LLM_API_KEY;
    const llm = apiKey ? new LlmClient(apiKey) : null;
    if (!apiKey) {
      console.warn('[startAssessment] LLM_API_KEY not configured, AI fallback disabled');
    }

    // 收集所有知识点ID
    const kpIds = plan.map(p => p.kp?.kp_id).filter(Boolean);
    const uniqueKpIds = [...new Set(kpIds)];

    // 批量查询题池（一次查询获取所有知识点的题目）
    let allPoolQuestions = {};

    // 1. 先尝试获取 verified 题目
    console.log('[startAssessment] 批量查询 verified 题目，知识点数:', uniqueKpIds.length);
    const verifiedPool = await fetchQuestionsBatch(db, uniqueKpIds, null, true, excludeIds, { grade, subject });
    allPoolQuestions = { ...allPoolQuestions, ...verifiedPool };

    // 2. 回退到 unverified 题目
    console.log('[startAssessment] 批量查询 unverified 题目');
    const unverifiedPool = await fetchQuestionsBatch(db, uniqueKpIds, null, false, excludeIds, { grade, subject });

    // 合并结果（verified 优先）
    for (const [kpId, qs] of Object.entries(unverifiedPool)) {
      if (!allPoolQuestions[kpId] || allPoolQuestions[kpId].length === 0) {
        allPoolQuestions[kpId] = qs;
      }
    }

    console.log('[startAssessment] 题池查询结果:', {
      totalKps: uniqueKpIds.length,
      foundKps: Object.keys(allPoolQuestions).length,
      totalQuestions: Object.values(allPoolQuestions).flat().length
    });

    // 遍历计划分配题目
    // 优化：只使用题池中的题目，不做同步AI生成（避免超时）
    for (const item of plan) {
      if (questions.length >= finalNumQuestions) break;

      const kpId = item.kp?.kp_id || 'unknown';
      const kpName = item.kp?.kp_name || '';
      const difficulty = item.difficulty || 'medium';

      try {
        const poolQuestions = allPoolQuestions[kpId] || [];

        for (const pq of poolQuestions) {
          if (questions.length >= finalNumQuestions) break;
          questions.push(formatQuestionForApi(pq));
          excludeIds.push(pq._id || pq.id);
        }
      } catch (e) {
        console.error(`[startAssessment] Failed to fetch/generate question for ${kpId}:`, e.message);
      }
    }

    console.log('[startAssessment] Pool questions:', {
      count: questions.length,
      needed: finalNumQuestions
    });

    // 题库不足时不在 startAssessment 内同步调用 AI。
    // startAssessment 是队列入口，必须快速返回，避免前端 15 秒超时。
    if (questions.length < finalNumQuestions) {
      console.log('[startAssessment] Pool insufficient, will create queue task:', {
        count: questions.length,
        needed: finalNumQuestions
      });
    }

    console.log('[startAssessment] Final questions:', {
      count: questions.length,
      needed: finalNumQuestions
    });

    // ========== 题目充足时直接创建评估，跳过队列 ==========
    if (questions.length >= finalNumQuestions) {
      console.log('[startAssessment] Questions sufficient (' + questions.length + '), creating assessment directly');
      // 跳到创建评估的逻辑
      // 注意：下面会检查 questions.length < finalNumQuestions 来决定是否走队列
    }

    // ========== 队列模式检查（仅作为兜底，正常流程不再走队列） ==========
    // 1. 检查学生是否有活跃的队列任务
    const { checkQueueForStudent, createQueueTask } = require('./queue_manager');
    const queueCheck = await checkQueueForStudent(db, studentId, { subject, grade, semester, mode });
    let assessmentResult = null;  // 预声明，供后续判断使用

    if (queueCheck.found) {
      console.log('[startAssessment] Found existing queue:', queueCheck);

      if (queueCheck.status === 'completed' && queueCheck.assessment_id) {
        // 2a. 已完成任务：直接返回assessment
        console.log('[startAssessment] Found completed queue, checking assessment:', queueCheck.assessment_id);

        // 获取assessment详情
        try {
          assessmentResult = await db.collection('assessments')
            .where({ assessment_id: queueCheck.assessment_id })
            .get();

          if (assessmentResult.data.length > 0) {
            const assessment = assessmentResult.data[0];
            // 检查题目是否存在
            if (assessment.questions && assessment.questions.length > 0) {
              console.log('[startAssessment] Assessment found with', assessment.questions.length, 'questions');
              return {
                success: true,
                data: {
                  assessment_id: assessment.assessment_id,
                  status: 'ready',
                  from_cache: true,
                  questions: assessment.questions.map(q => ({
                    id: q.id,
                    type: q.type,
                    content: q.content,
                    options: q.options,
                    knowledge_point: q.knowledge_point,
                    knowledge_point_id: q.knowledge_point_id,
                    difficulty: q.difficulty,
                  })),
                  time_limit_minutes: assessment.time_limit_minutes
                }
              };
            } else {
              console.warn('[startAssessment] Assessment found but questions empty, treating as incomplete');
            }
          } else {
            console.warn('[startAssessment] Queue status=completed but assessment not found! Cleaning up dirty data.');
            // 清理脏数据：删除这个僵尸队列记录
            await db.collection('question_queue').doc(queueCheck.queue_id).update({
              data: { status: 'failed', error: 'Assessment record not found, cleaned up' }
            });
            // 注意：不设置assessmentResult，继续正常流程创建新任务
            assessmentResult = null;  // 重置为null，表示需要重新生成
          }
        } catch (e) {
          console.error('[startAssessment] Error fetching completed assessment:', e.message);
        }
      }

      // 2b. 进行中任务或缓存未命中：返回queued状态
      // 只有当 assessmentResult 有有效数据时才返回 ready
      if (queueCheck.status === 'completed' && assessmentResult?.data?.length > 0) {
        // 上面已经处理了，直接返回（不会到这里）
      } else if (queueCheck.status === 'completed' && !assessmentResult) {
        // 脏数据已清理，assessmentResult为null，继续正常流程（不返回queued）
      } else if (queueCheck.status !== 'completed') {
        // 检查 pending 任务是否超时（超过2分钟视为漏处理）
        const STALE_PENDING_THRESHOLD = 2 * 60 * 1000;
        const taskAge = queueCheck.created_at ? Date.now() - new Date(queueCheck.created_at).getTime() : 0;
        const isStalePending = queueCheck.status === 'pending' && taskAge > STALE_PENDING_THRESHOLD;

        if (isStalePending) {
          // 标记旧任务为 failed，创建新任务（不走队列，直接生成）
          console.warn('[startAssessment] Stale pending task detected, queue_id:', queueCheck.queue_id, 'age:', Math.floor(taskAge / 1000) + 's');
          await db.collection('question_queue').doc(queueCheck.queue_id).update({
            data: { status: 'failed', error: 'Stale pending task, superseded by new request', updated_at: new Date().toISOString() }
          });
          // 不返回 queued，继续往下走创建新任务
        } else if (forceSync) {
          // 前端请求强制同步模式，不走队列
          console.log('[startAssessment] force_sync=true, skipping queue for task:', queueCheck.queue_id);
          await db.collection('question_queue').doc(queueCheck.queue_id).update({
            data: { status: 'cancelled', error: 'Cancelled by force_sync request', updated_at: new Date().toISOString() }
          });
          // 继续往下走直接生成
        } else if (questions.length >= finalNumQuestions) {
          // 已有足够题目，取消旧队列任务，直接返回
          console.log('[startAssessment] Questions sufficient, cancelling stale queue task:', queueCheck.queue_id);
          await db.collection('question_queue').doc(queueCheck.queue_id).update({
            data: { status: 'cancelled', error: 'Cancelled: questions already generated synchronously', updated_at: new Date().toISOString() }
          }).catch(function(e) { console.warn('[startAssessment] Failed to cancel queue:', e.message); });
          // 继续往下走创建评估
        } else {
          // 任务还在进行中且题目不足，返回queued
          return {
            success: true,
            data: {
              status: 'queued',
              queue_id: queueCheck.queue_id,
              message: queueCheck.status === 'pending'
                ? '题目正在排队生成中...'
                : '题目正在生成中...'
            }
          };
        }
      }
    }

    // 3. force_sync 或题目不足且无活跃队列时，创建新队列任务
    if (questions.length < finalNumQuestions && !forceSync) {
      console.log('[startAssessment] Questions insufficient, creating queue task');

      const queueResult = await createQueueTask(db, {
        student_id: studentId,
        subject,
        grade,
        semester,
        mode,
        num_questions: finalNumQuestions,
        difficulty_distribution: difficultyDistribution
      });

      if (queueResult.success) {
        console.log('[startAssessment] Queue task created:', queueResult.queue_id);

        // 不在 startAssessment 内同步触发 questionGenerator。
        // 后台定时触发器负责处理队列，前端通过 waiting 页轮询。

        return {
          success: true,
          data: {
            status: 'queued',
            queue_id: queueResult.queue_id,
            message: '题目已加入生成队列，请稍候...'
          }
        };
      } else {
        console.error('[startAssessment] Failed to create queue task:', queueResult.error);
        // 继续尝试原有逻辑
      }
    }

    // force_sync 模式下题目不足时：创建队列任务（统一走 path A）
    if (questions.length < finalNumQuestions && forceSync) {
      console.log('[startAssessment] force_sync mode, creating queue task for remaining questions');
      const queueResult = await createQueueTask(db, {
        student_id: studentId,
        subject,
        grade,
        semester,
        mode,
        num_questions: finalNumQuestions,
        difficulty_distribution: difficultyDistribution
      });

      if (queueResult.success) {
        return {
          success: true,
          data: {
            status: 'queued',
            queue_id: queueResult.queue_id,
            message: '题目已加入生成队列，请稍候...'
          }
        };
      }
    }

    // 所有路径都无法获取足够题目时，返回已有题目或错误
    if (questions.length === 0) {
      return {
        success: false,
        error: '题库暂无题目，请稍后重试'
      };
    }

    // 题目数量不足但有部分题目，直接返回已有的
    if (questions.length < finalNumQuestions) {
      console.log('[startAssessment] Partial questions available:', questions.length, '/', finalNumQuestions);
    }

    // 题目数量足够，直接返回
    const result = {
      assessment_id: assessmentId,
      status: 'ready',
      mode: mode,
      questions: questions.map(q => ({
        id: q.id,
        type: q.type,
        content: q.content,
        options: q.options,
        knowledge_point: q.knowledge_point,
        knowledge_point_id: q.knowledge_point_id,
        difficulty: q.difficulty,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
      })),
      time_limit_minutes: mode === 'huikao' ? 60 : (mode === 'pre_test' ? 45 : 30),
    };

    // 保存到云数据库
    await db.collection('assessments').add({
      data: {
        assessment_id: assessmentId,
        subject,
        grade: mode === 'huikao' ? '7-8' : grade,
        semester: mode === 'huikao' ? 'all' : semester,
        mode,
        questions: questions,
        time_limit_minutes: result.time_limit_minutes,
        status: 'in_progress',
        answers: [],
        created_at: new Date().toISOString(),
        student_id: studentId,
        openid: wxContext.OPENID,
        previous_score: previousScore,
      }
    });

    return { success: true, data: result };

  } catch (e) {
    console.error('startAssessment error:', e);
    return { success: false, error: e.message || String(e) };
  }
};

/**
 * 使用AI生成题目
 */
async function generateQuestionWithAI(kpId, kpName, difficulty, subject, llm) {
  try {
    const prompt = buildPrompt(kpId, kpName, difficulty, subject);
    const response = await llm.generate({ kp_name: kpName, difficulty, subject });
    const parsed = parseLlmResponse(response.content);

    if (!parsed || !validateQuestion(parsed, 'choice')) {
      throw new Error('Invalid question structure from LLM');
    }

    return normalizeQuestion({
      _id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      question: parsed.question || parsed.content,
      options: parsed.options,
      correct_answer: parsed.correct_answer,
      kp_id: kpId,
      kp_name: kpName,
      difficulty,
      source: 'ai'
    });
  } catch (e) {
    console.error(`[startAssessment] AI generation failed for ${kpId}:`, e.message);
    return null;
  }
}

function buildPrompt(kpId, kpName, difficulty, subject) {
  const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty] || '中等';

  const subjectConfig = {
    biology: {
      topics: ['腔肠动物', '扁形动物', '线形动物', '环节动物', '软体动物', '节肢动物', '鱼类', '两栖类', '爬行类', '鸟类', '哺乳类']
    },
    math: {
      scenarios: ['梯子靠墙', '航海航行', '建筑施工', '测量距离'],
      triples: [[3, 4, 5], [5, 12, 13]]
    },
    geography: {
      topics: ['中国的地理位置', '中国的行政区划', '中国的人口与民族', '中国的地形', '中国的气候']
    }
  };

  let prompt = `请为以下知识点生成一道${difficultyText}难度的选择题：知识点：${kpName}`;

  const config = subjectConfig[subject] || subjectConfig.biology;
  if (config.topics) {
    prompt += `\n\n【话题要求】请选择相关知识：${config.topics.join('、')}`;
  }
  if (config.scenarios) {
    prompt += `\n\n【场景要求】从以下场景选择：${config.scenarios.join('、')}`;
  }
  if (config.triples) {
    prompt += `\n【数值要求】使用勾股数：${config.triples.map(t => t.join('-')).join('、')}`;
  }

  prompt += `\n\n【质量要求】禁止生成需要图片/图形的题目`;
  prompt += `\n\nJSON格式：{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}`;

  return prompt;
}
