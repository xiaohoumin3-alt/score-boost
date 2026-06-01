/**
 * 开始测评云函数
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { loadKnowledgeTree, loadHuikaoTree, generateQuestionPlan, generateHuikaoPlan } = require('./knowledge_tree');
const { fetchQuestionsFromPool, fetchQuestionsBatch } = require('./question_pool');
const { LlmClient, parseLlmResponse, validateQuestion } = require('./llm_client');
const { logKpRequest } = require('./kp-request-logger');
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
      '数学': 'math',
      'math': 'math',
      '生物': 'biology',
      'biology': 'biology',
      '地理': 'geography',
      'geography': 'geography'
    };

    const rawSubject = params.subject || 'math';
    const subject = subjectMap[rawSubject] || rawSubject;
    const grade = String(params.grade || '8');
    const semester = params.semester || '下';
    const mode = params.mode || 'pre_test';
    const numQuestions = parseInt(params.num_questions || params.numQuestions || 5);
    const studentId = params.student_id || params.studentId;

    // 会考模式默认50题
    const finalNumQuestions = mode === 'huikao' ? parseInt(params.num_questions || 50) : numQuestions;

    console.log('[startAssessment] 最终参数:', { rawSubject, subject, grade, semester, mode, finalNumQuestions });

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
    const apiKey = process.env.MINIMAX_API_KEY;
    const llm = apiKey ? new LlmClient(apiKey) : null;
    if (!apiKey) {
      console.warn('[startAssessment] MINIMAX_API_KEY not configured, AI fallback disabled');
    }

    // 收集所有知识点ID
    const kpIds = plan.map(p => p.kp?.kp_id).filter(Boolean);
    const uniqueKpIds = [...new Set(kpIds)];

    // 批量查询题池（一次查询获取所有知识点的题目）
    let allPoolQuestions = {};

    // 1. 先尝试获取 verified 题目
    console.log('[startAssessment] 批量查询 verified 题目，知识点数:', uniqueKpIds.length);
    const verifiedPool = await fetchQuestionsBatch(db, uniqueKpIds, null, true, excludeIds);
    allPoolQuestions = { ...allPoolQuestions, ...verifiedPool };

    // 2. 回退到 unverified 题目
    console.log('[startAssessment] 批量查询 unverified 题目');
    const unverifiedPool = await fetchQuestionsBatch(db, uniqueKpIds, null, false, excludeIds);

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
          questions.push({
            id: pq._id || pq.id || `ai_${Date.now()}`,
            type: 'choice',
            content: pq.question || pq.content,
            options: pq.options || [],
            correct_answer: typeof pq.correct_answer === 'number'
              ? String.fromCharCode(65 + pq.correct_answer)
              : String(pq.correct_answer || ''),
            knowledge_point: pq.kp_name || kpName,
            knowledge_point_id: pq.kp_id || kpId,
            difficulty: pq.difficulty || difficulty,
          });
          excludeIds.push(pq._id || pq.id);
        }
      } catch (e) {
        console.error(`[startAssessment] Failed to fetch/generate question for ${kpId}:`, e.message);
      }
    }

    console.log('[startAssessment] Generated questions:', {
      count: questions.length,
      sampleQuestions: questions.slice(0, 2).map(q => ({ id: q.id, kp_id: q.knowledge_point_id, kp: q.knowledge_point, difficulty: q.difficulty }))
    });

    // ========== 队列模式检查 ==========
    // 1. 检查学生是否有活跃的队列任务
    const { checkQueueForStudent, createQueueTask } = require('./queue_manager');
    const queueCheck = await checkQueueForStudent(db, studentId);
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
        // 任务还在进行中，返回queued
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

    // 3. 题目不足且无队列时，创建新队列任务
    if (questions.length < finalNumQuestions) {
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

    // 如果题目数量不足，调用异步生成
    if (questions.length < finalNumQuestions) {
      console.log('[startAssessment] Questions insufficient, calling async generation');

      // 收集缺失题目的知识点
      const missingKpItems = [];
      for (const item of plan) {
        if (questions.length >= finalNumQuestions) break;
        const kpId = item.kp?.kp_id || 'unknown';
        const kpName = item.kp?.kp_name || '';
        const difficulty = item.difficulty || 'medium';

        // 检查是否已有该知识点的题目
        const hasKpQuestion = questions.some(q => q.knowledge_point_id === kpId);
        if (!hasKpQuestion) {
          missingKpItems.push({ kp_id: kpId, kp_name: kpName, difficulty });
        }
      }

      // 调用异步生成（取第一个缺失知识点作为生成目标）
      let taskId = null;
      if (missingKpItems.length > 0) {
        const firstKp = missingKpItems[0];
        const genResult = await startAsyncGeneration({
          kp_id: firstKp.kp_id,
          kp_name: firstKp.kp_name,
          difficulty: firstKp.difficulty,
          count: finalNumQuestions - questions.length
        });

        if (genResult.success) {
          taskId = genResult.task_id;
          console.log('[startAssessment] 异步生成任务已创建:', taskId);
        }
      }

      // 题池完全为空时，需要检查异步生成是否成功
      if (questions.length === 0) {
        if (!taskId) {
          // 异步生成失败且无题目，返回错误
          return {
            success: false,
            error: '题库无题目且异步生成失败，请稍后重试'
          };
        }
        return {
          success: true,
          data: {
            task_id: taskId,
            status: 'generating',
            message: '题目生成中，请稍后刷新'
          }
        };
      }

      // 返回已有题目 + 生成状态
      return {
        success: true,
        data: {
          task_id: taskId,
          status: 'generating',
          questions: questions,
          message: `${questions.length} 道题目已就绪，剩余题目生成中`
        }
      };
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

    return {
      _id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      question: parsed.question || parsed.content,
      options: (parsed.options || []).map((opt, idx) => ({
        key: String.fromCharCode(65 + idx),
        value: typeof opt === 'string' ? opt.replace(/^[A-D]\.\s*/, '') : (opt.value || opt)
      })),
      correct_answer: typeof parsed.correct_answer === 'number'
        ? String.fromCharCode(65 + parsed.correct_answer)
        : String(parsed.correct_answer),
      kp_id: kpId,
      kp_name: kpName,
      difficulty,
      source: 'ai'
    };
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