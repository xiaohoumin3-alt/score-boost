/**
 * 练习云函数 - 内嵌AI生成，消除云函数间调用超时问题
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { generateQuestions: generateMixedQuestions } = require('./question_generator');
const { LlmClient, parseLlmResponse, validateQuestion } = require('./llm_client');
const { loadKnowledgeTree, loadKnowledgeTreeFromDb, generateQuestionPlan } = require('./shared/knowledge_tree');
const { normalizeQuestion } = require('./shared/question-normalizer');

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 内嵌AI生成函数 - 直接调用MiniMax API，不经过云函数间调用
 */
async function getKnowledgeContext(kpId) {
  if (!kpId || kpId === 'unknown') {
    return { knowledge_context: '', related_concepts: [], typical_mistakes: [] };
  }
  try {
    const db = cloud.database();
    const result = await db.collection('knowledge_points').where({ kp_id: kpId }).limit(1).get();
    if (result.data && result.data.length > 0) {
      const kp = result.data[0];
      return {
        knowledge_context: kp.knowledge_context || '',
        related_concepts: kp.related_concepts || [],
        typical_mistakes: kp.typical_mistakes || []
      };
    }
  } catch (e) {
    console.log('[RAG] Failed to fetch kp context:', e.message);
  }
  return { knowledge_context: '', related_concepts: [], typical_mistakes: [] };
}

async function getExistingQuestions(kpId, limit = 5) {
  if (!kpId || kpId === 'unknown') return [];
  try {
    const db = cloud.database();
    const result = await db.collection('ai_question_pool').where({ kp_id: kpId }).orderBy('created_at', 'desc').limit(limit).get();
    return result.data.map(q => q.question || '');
  } catch (e) {
    return [];
  }
}

async function generateQuestionWithAI(kpId, kpName, difficulty, questionType, llm, subject = 'math', knowledgePoint = 'kp2_3') {
  // 获取RAG知识上下文和已有题目（防重复）
  const [kc, existingQuestions] = await Promise.all([
    getKnowledgeContext(kpId),
    getExistingQuestions(kpId)
  ]);

  console.log(`[RAG] kpId=${kpId}, knowledge_context=${kc.knowledge_context ? 'present' : 'empty'}, existing=${existingQuestions.length}`);

  const params = {
    kp_name: kpName,
    difficulty,
    question_type: questionType,
    knowledge_context: kc.knowledge_context,
    related_concepts: kc.related_concepts || [],
    typical_mistakes: kc.typical_mistakes || [],
    exclude_questions: existingQuestions,
    subject: subject,
    knowledge_point: knowledgePoint
  };

  // 使用带状态跟踪的生成方法
  const parsed = await llm.generateQuestion(params);

  if (!validateQuestion(parsed, questionType)) {
    throw new Error('Invalid question structure from LLM');
  }

  const result = {
    id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: questionType || 'choice',
    question: parsed.question,
    explanation: parsed.explanation || '',
    source: 'ai',
    kp_id: kpId,
    kp_name: kpName,
    difficulty,
    created_at: new Date().toISOString(),
    // 元数据：记录使用的场景、勾股数、问法
    scenario_used: parsed.scenario_used,
    triple_used: parsed.triple_used,
    question_pattern: parsed.question_pattern,
    // 深度反馈：典型错误和知识上下文
    typical_mistakes: kc.typical_mistakes || [],
    knowledge_context: kc.knowledge_context || ''
  };

  if (questionType === 'choice' || !questionType) {
    result.options = (parsed.options || []).map((opt, idx) => ({
      key: String.fromCharCode(65 + idx),
      value: opt.replace(/^[A-D]\.\s*/, '')
    }));
    result.correct_answer = typeof parsed.correct_answer === 'number'
      ? String.fromCharCode(65 + parsed.correct_answer)
      : String(parsed.correct_answer);
  } else {
    result.sample_answer = parsed.sample_answer || '';
    result.correct_answer = parsed.sample_answer || '';
  }

  return result;
}

exports.main = async (event, context) => {
  try {
    // 微信小程序云函数调用时，data 参数会直接作为 event 传入
    // 所以 event 就是 { knowledge_point_id, kp_name, num_questions, ... }
    const params = event || {};
    const kpId = params.knowledge_point_id || params.kpId;
    const weakPoints = params.weak_points || [];
    const numQuestions = parseInt(params.num_questions || params.numQuestions || 5);
    const grade = String(params.grade || '8');
    const subject = params.subject || 'math';
    const studentId = params.student_id;

    console.log('[Practice] params:', JSON.stringify({
      kpId, weakPoints: weakPoints.length, numQuestions, grade, subject, studentId
    }));

    console.log('[Practice] params:', JSON.stringify({
      kpId, weakPoints: weakPoints.length, numQuestions, grade, subject, studentId
    }));

    const sessionId = generateUUID();

    // 初始化LLM客户端
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
      console.error('[Practice] LLM_API_KEY not configured');
    }
    const llm = new LlmClient(apiKey);

    // 查询 kp_progress 获取当前难度
    let kpCurrentDifficulty = {};
    if (studentId) {
      try {
        const progressRes = await cloud.callFunction({
          name: 'getKpProgress',
          data: { student_id: studentId }
        });
        if (progressRes.result && progressRes.result.success && progressRes.result.data) {
          const progressList = Array.isArray(progressRes.result.data)
            ? progressRes.result.data
            : [progressRes.result.data];
          progressList.forEach(p => {
            // 防御：确保 p 存在且有 kp_id
            if (p && p.kp_id) {
              kpCurrentDifficulty[p.kp_id] = p.current_difficulty;
            }
          });
        }
      } catch (e) {
        console.error('getKpProgress error:', e);
      }
    }

    // 决定练习的知识点了
    let plan = [];

    // 初始化数据库（需要在 knowledge tree fallback 之前）
    const db = cloud.database();

    // 根据目标难度生成难度分布
    function getDifficultyDistribution(targetDifficulty) {
      // 目标难度占60%，其他各占20%
      const distributions = {
        easy: ['easy', 'easy', 'easy', 'medium', 'medium'],
        medium: ['medium', 'medium', 'medium', 'easy', 'hard'],
        hard: ['hard', 'hard', 'hard', 'easy', 'medium']
      };
      return distributions[targetDifficulty] || distributions.easy;
    }

    console.log('[Practice] weakPoints received:', JSON.stringify(weakPoints));

    if (weakPoints && weakPoints.length > 0) {
      for (const wp of weakPoints) {
        const wpKpId = wp.kp_id || wp.id;
        console.log(`[Practice] Processing weakPoint: kp_id=${wpKpId}, kp_name=${wp.kp_name || wp.name}, full_obj=`, JSON.stringify(wp));

        // 过滤无效的 kp_id：空字符串、'unknown'、null、undefined
        if (!wpKpId || wpKpId === '' || wpKpId === 'unknown') {
          console.error('[Practice] weakPoint has invalid kp_id:', wp);
          continue;  // 跳过没有有效 kp_id 的薄弱点
        }

        const savedDifficulty = kpCurrentDifficulty[wpKpId] || 'easy';
        // 混合难度而非单一难度
        const difficultyMix = getDifficultyDistribution(savedDifficulty);
        for (let i = 0; i < numQuestions; i++) {
          plan.push({
            kp: { kp_id: wpKpId, kp_name: wp.kp_name || wp.name, chapter_name: wp.chapter || '' },
            difficulty: difficultyMix[i] || 'easy',
          });
        }
      }
    } else if (kpId) {
      const kpName = params.kp_name || params.kpName || '';
      const chapter = params.chapter || '';
      const savedDifficulty = kpCurrentDifficulty[kpId] || 'easy';
      // 混合难度而非单一难度
      const difficultyMix = getDifficultyDistribution(savedDifficulty);
      for (let i = 0; i < numQuestions; i++) {
        plan.push({
          kp: { kp_id: kpId, kp_name: kpName, chapter_name: chapter },
          difficulty: difficultyMix[i] || 'easy'
        });
      }
    } else {
      let tree = loadKnowledgeTree(subject, grade, '下');
      // 如果内嵌数据为空（新科目），从数据库动态加载
      if (!tree.chapters || tree.chapters.length === 0) {
        console.log('[Practice] No embedded data for', subject, '- trying DB');
        const dbTree = await loadKnowledgeTreeFromDb(db, subject, grade);
        if (dbTree && dbTree.chapters && dbTree.chapters.length > 0) {
          tree = dbTree;
        }
      }
      plan = generateQuestionPlan(tree, numQuestions);
    }

    // 内嵌AI生成函数
    const questionType = params.question_type || 'choice';
    const callAiGenerate = async (kpId, kpName, difficulty) => {
      // 将 kpId 映射到 knowledge_point
      // kp2_3 -> kp2_3 (勾股定理)
      const knowledgePoint = kpId || 'kp2_3';
      return generateQuestionWithAI(kpId, kpName, difficulty, questionType, llm, subject, knowledgePoint);
    };

    // 检查 plan 是否为空（所有薄弱点都被过滤的情况）
    if (plan.length === 0) {
      console.warn('[Practice] plan is empty! Falling back to knowledge tree.');
      // Fallback: 从知识树生成题目
      try {
        let tree = loadKnowledgeTree(subject, grade, '下');
        // 内嵌数据为空时从数据库加载
        if (!tree.chapters || tree.chapters.length === 0) {
          const dbTree = await loadKnowledgeTreeFromDb(db, subject, grade);
          if (dbTree) tree = dbTree;
        }
        plan = generateQuestionPlan(tree, numQuestions);
        console.log('[Practice] Fallback plan generated:', plan.length, 'items');
      } catch (e) {
        console.error('[Practice] Fallback failed:', e);
        return {
          success: false,
          error: '无法生成题目：薄弱点数据无效且知识树加载失败。'
        };
      }
    }

    if (plan.length === 0) {
      console.error('[Practice] plan still empty after fallback!');
      return {
        success: false,
        error: '无法生成题目：请尝试重新测评以获取有效的薄弱点数据。'
      };
    }

    console.log('[Practice] Generated plan:', JSON.stringify(plan));

    // 生成题目（题池优先，Practice模式：10% verified + 60% unverified + 30% AI）
    const questions = await generateMixedQuestions(plan, numQuestions, callAiGenerate, {
      db,
      userId: studentId || 'anonymous',
      mode: 'practice'
    });

    console.log(`[Practice] Generated ${questions.length} questions total`);

    // 如果题目为空，返回明确错误
    if (!questions || questions.length === 0) {
      console.error('[Practice] No questions generated! Plan had', plan.length, 'items, subject:', subject, 'grade:', grade);
      return {
        success: false,
        error: '暂无可用题目，请稍后重试。如果持续出现此问题，请联系老师。',
        data: { session_id: sessionId, questions: [] }
      };
    }

    // 保存练习会话
    await db.collection('practices').add({
      data: {
        session_id: sessionId,
        questions: questions,
        status: 'in_progress',
        answers: [],
        created_at: new Date().toISOString(),
      }
    });

    // 将AI生成的题目保存到题池（带查重）
    const aiQuestions = questions.filter(q => q.source === 'ai');
    if (aiQuestions.length > 0) {
      try {
        const poolRecords = [];
        const skippedCount = { duplicate: 0, error: 0 };

        for (const q of aiQuestions) {
          const questionText = q.content || q.question;
          try {
            // 查重：检查题目是否已存在
            const existing = await db.collection('ai_question_pool')
              .where({ question: questionText })
              .limit(1)
              .get();

            if (existing.data && existing.data.length > 0) {
              console.log(`[Practice] Question already exists, skipping: ${questionText.substring(0, 30)}...`);
              skippedCount.duplicate++;
              // 更新 usage_count
              await db.collection('ai_question_pool')
                .doc(existing.data[0]._id)
                .update({
                  usage_count: db.command.inc(1),
                  updated_at: new Date().toISOString()
                });
            } else {
              // 新题目，添加到批量保存列表
              poolRecords.push(normalizeQuestion({
                question: questionText,
                options: q.options || [],
                correct_answer: q.correct_answer,
                kp_id: q.knowledge_point_id || q.kp_id,
                kp_name: q.knowledge_point || q.kp_name,
                chapter: q.chapter || '',
                difficulty: q.difficulty,
                subject: subject,
                source: 'ai',
                verified: false,
                correct_rate: 0.5,
                usage_count: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }));
            }
          } catch (e) {
            console.error('[Practice] Error checking question existence:', e.message);
            skippedCount.error++;
          }
        }

        // 批量保存新题目
        if (poolRecords.length > 0) {
          await db.collection('ai_question_pool').add({ data: poolRecords });
          console.log(`[Practice] Saved ${poolRecords.length} new AI questions to pool`);
        }

        console.log(`[Practice] Skipped ${skippedCount.duplicate} duplicates, ${skippedCount.error} errors`);
      } catch (e) {
        console.error('[Practice] Failed to save AI questions to pool:', e.message);
      }
    }

    return {
      success: true,
      data: {
        session_id: sessionId,
        questions: questions.map(q => ({
          id: q.id,
          type: q.type,
          content: q.question || q.content,
          options: q.options,
          correct_answer: typeof q.correct_answer === 'number'
            ? String.fromCharCode(65 + q.correct_answer)
            : q.correct_answer,
          knowledge_point: q.knowledge_point || q.kp_name,
          knowledge_point_id: q.knowledge_point_id || q.kp_id,
          difficulty: q.difficulty,
          image_url: q.image_url || null,
          typical_mistakes: q.typical_mistakes || [],
          knowledge_context: q.knowledge_context || ''
        })),
      }
    };

  } catch (e) {
    console.error('practice error:', e);
    return { success: false, error: e.message || String(e) };
  }
};