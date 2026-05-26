/**
 * 练习云函数 - 内嵌AI生成，消除云函数间调用超时问题
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { generateQuestions: generateMixedQuestions } = require('./question_generator');
const { LlmClient, parseLlmResponse, validateQuestion } = require('./llm_client');
const { loadKnowledgeTree, generateQuestionPlan } = require('./knowledge_tree');

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
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      console.error('[Practice] MINIMAX_API_KEY not configured');
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
        if (progressRes.result?.success && progressRes.result.data) {
          const progressList = Array.isArray(progressRes.result.data)
            ? progressRes.result.data
            : [progressRes.result.data];
          progressList.forEach(p => {
            kpCurrentDifficulty[p.kp_id] = p.current_difficulty;
          });
        }
      } catch (e) {
        console.error('getKpProgress error:', e);
      }
    }

    // 决定练习的知识点了
    let plan = [];

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

        if (!wpKpId) {
          console.error('[Practice] weakPoint missing kp_id and id:', wp);
          continue;  // 跳过没有 kp_id 的薄弱点
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
      const tree = loadKnowledgeTree(subject, grade, '下');
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

    // 检查 plan 是否为空
    if (plan.length === 0) {
      console.error('[Practice] plan is empty! weakPoints:', weakPoints, 'kpId:', kpId);
      return {
        success: false,
        error: '无法生成题目：缺少有效的知识点ID。请检查薄弱点数据是否包含 kp_id 字段。'
      };
    }

    console.log('[Practice] Generated plan:', JSON.stringify(plan));

    // 生成题目（题池优先，Practice模式：10% verified + 60% unverified + 30% AI）
    const db = cloud.database();
    const questions = await generateMixedQuestions(plan, numQuestions, callAiGenerate, {
      db,
      userId: studentId || 'anonymous',
      mode: 'practice'
    });

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

    // 将AI生成的题目保存到题池
    const aiQuestions = questions.filter(q => q.source === 'ai');
    if (aiQuestions.length > 0) {
      try {
        const poolRecords = aiQuestions.map(q => ({
          question: q.content || q.question,
          options: q.options || [],
          correct_answer: q.correct_answer,
          kp_id: q.knowledge_point_id || q.kp_id,
          kp_name: q.knowledge_point || q.kp_name,
          chapter: q.chapter || '',
          difficulty: q.difficulty,
          subject: subject,
          source: 'ai',
          verified: false,
          correct_rate: 0.5,  // 默认0.5，让未验证题目可以被查询到
          usage_count: 1,
          created_at: new Date().toISOString()
        }));
        await db.collection('ai_question_pool').add({ data: poolRecords });
        console.log(`[Practice] Saved ${poolRecords.length} AI questions to pool`);
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
          correct_answer: q.correct_answer,
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