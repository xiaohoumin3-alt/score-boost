/**
 * 获取测评详情云函数
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { formatQuestionForApi, normalizeOptions, normalizeQuestion } = require('./shared/question-normalizer');
const { CURRENT_SCHEMA_VERSION } = require('./shared/schema-version');
const { success, error } = require('./shared/response-helper');

exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const assessmentId = params.assessment_id || params.assessmentId;

    if (!assessmentId) {
      return { success: false, error: 'assessment_id is required' };
    }

    const db = cloud.database();
    const doc = await db.collection('assessments').where({ assessment_id: assessmentId }).get();

    if (!doc.data || doc.data.length === 0) {
      return { success: false, error: 'Assessment not found' };
    }

    const session = doc.data[0];

    // 优先读取内嵌题目（startAssessment 同步路径保存的）
    let questions = session.questions || [];
    console.log('[getAssessment] session.questions length:', questions.length);
    console.log('[getAssessment] session.question_ids:', session.question_ids);
    console.log('[getAssessment] session.question_ids length:', session.question_ids?.length || 0);

    // 回退：从 question_ids 引用加载（questionGenerator 队列路径创建的）
    if (questions.length === 0 && session.question_ids && Array.isArray(session.question_ids) && session.question_ids.length > 0) {
      console.log('[getAssessment] No embedded questions, loading from question_ids:', session.question_ids.length);
      try {
        const _ = db.command;
        const poolQuery = await db.collection('ai_question_pool')
          .where({ _id: _.in(session.question_ids) })
          .get();
        console.log('[getAssessment] Pool query result:', poolQuery.data?.length || 0);
        questions = (poolQuery.data || []).map(q => {
          // Re-normalize if schema_version doesn't match current
          if (!q.schema_version || q.schema_version !== CURRENT_SCHEMA_VERSION) {
            const normalized = normalizeQuestion(q);
            return formatQuestionForApi(normalized);
          }
          return formatQuestionForApi(q);
        });
        console.log('[getAssessment] Loaded questions from pool:', questions.length);
      } catch (e) {
        console.error('[getAssessment] Error loading from question_ids:', e);
        questions = [];
      }
    } else {
      console.log('[getAssessment] Skip fallback, conditions:', {
        questionsEmpty: questions.length === 0,
        hasQuestionIds: !!(session.question_ids),
        isArray: Array.isArray(session.question_ids),
        questionIdsLength: session.question_ids?.length || 0
      });
    }

    // 内容验证关键词（防止跨科目题目）
    const SUBJECT_KW = {
      geography: /地理位置|气候|地形|行政区划|省级|地球|大洲|大洋|自然资源|人口|疆域|板块|等高线|经纬度|季风|西北地区|青藏|南方地区|北方地区|河流|湖泊|山脉|高原|盆地|平原|工业|农业|交通|城市化|区域发展/,
      biology: /细胞|光合|呼吸作用|遗传|生态|消化|血液循环|神经|免疫|DNA|基因|染色体|显微镜|组织|器官|蒸腾|分裂|蛋白质|酶|激素|反射弧|抗体|抗原|微生物|细菌|病毒|真菌/,
      math: /二次根式|勾股定理|一次函数|平行四边形|三角形|方程|因式分解|不等式|概率|圆的|直径|半径|面积|周长|平方根|绝对值|整式|分式|全等|轴对称|相似|一元二次|韦达|完全平方|平方差|直角|锐角|钝角|内角|外角/
    };

    const assessmentSubject = session.subject || 'math';

    // 过滤掉内容不匹配科目的题目
    const validQuestions = questions.filter(q => {
      const text = q.content || q.question || q.text || '';
      const kw = SUBJECT_KW[assessmentSubject];
      if (!kw) return true;
      const matchesOther = Object.entries(SUBJECT_KW)
        .filter(([k]) => k !== assessmentSubject)
        .some(([, v]) => v.test(text));
      return !matchesOther;
    });

    if (validQuestions.length < questions.length) {
      console.log(`[getAssessment] Filtered ${questions.length - validQuestions.length} questions with wrong subject`);
    }

    const isCompleted = session.status === 'completed';

    return {
      success: true,
      data: {
        assessment_id: assessmentId,
        status: session.status || 'in_progress',
        questions: validQuestions.map(q => formatQuestionForApi(q)),
        time_limit_minutes: session.time_limit_minutes || 45,
        created_at: session.created_at,
        // 返回分数（如果有）
        ...(isCompleted && session.score ? {
          score: session.score,
          total_correct: session.score.total_correct || 0,
          total_questions: session.score.total_questions || 0,
          score_percent: session.score.score_percent || 0,
          results: session.results || [],
          kp_stats: session.kp_stats || [],
        } : {}),
      }
    };

  } catch (e) {
    console.error('getAssessment error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
