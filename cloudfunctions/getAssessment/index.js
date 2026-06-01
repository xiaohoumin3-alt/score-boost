/**
 * 获取测评详情云函数
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

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

    // 优先从 assessments.questions 字段读取（startAssessment 直接保存的）
    // 如果没有 questions 字段，再从 ai_question_pool 加载
    let questions = session.questions || [];
    console.log('[getAssessment] session.questions length:', questions.length);
    if (questions.length > 0) {
      console.log('[getAssessment] session question keys:', Object.keys(questions[0]));
      console.log('[getAssessment] session question sample:', JSON.stringify(questions[0]).substring(0, 300));
    }

    // 如果 assessments 没有 questions 字段，从 ai_question_pool 加载
    if (questions.length === 0 && session.question_ids && session.question_ids.length > 0) {
      try {
        console.log('[getAssessment] Loading from pool, question_ids count:', session.question_ids.length);
        const questionsResult = await db.collection('ai_question_pool')
          .where({
            _id: db.command.in(session.question_ids)
          })
          .get();
        questions = questionsResult.data || [];
        console.log('[getAssessment] Pool loaded:', questions.length, 'questions');
        if (questions.length > 0) {
          console.log('[getAssessment] Pool question keys:', Object.keys(questions[0]));
          console.log('[getAssessment] Pool question sample:', JSON.stringify(questions[0]).substring(0, 300));
        }
      } catch (e) {
        console.error('[getAssessment] Failed to load questions from pool:', e.message);
      }
    }

    if (questions.length === 0) {
      console.error('[getAssessment] No questions found! session keys:', Object.keys(session));
    }

    const isCompleted = session.status === 'completed';
    const assessmentSubject = session.subject || 'math';

    // 内容验证关键词
    const SUBJECT_KW = {
      geography: /地理位置|气候|地形|行政区划|省级|地球|大洲|大洋|自然资源|人口|疆域|板块|等高线|经纬度|季风|西北地区|青藏|南方地区|北方地区|河流|湖泊|山脉|高原|盆地|平原|工业|农业|交通|城市化|区域发展/,
      biology: /细胞|光合|呼吸作用|遗传|生态|消化|血液循环|神经|免疫|DNA|基因|染色体|显微镜|组织|器官|蒸腾|分裂|蛋白质|酶|激素|反射弧|抗体|抗原|微生物|细菌|病毒|真菌/,
      math: /二次根式|勾股定理|一次函数|平行四边形|三角形|方程|因式分解|不等式|概率|圆的|直径|半径|面积|周长|平方根|绝对值|整式|分式|全等|轴对称|相似|一元二次|韦达|完全平方|平方差|直角|锐角|钝角|内角|外角/
    };

    // 过滤掉内容不匹配科目的题目
    const validQuestions = questions.filter(q => {
      const text = q.content || q.question || q.text || '';
      const kw = SUBJECT_KW[assessmentSubject];
      if (!kw) return true;
      // 如果内容匹配其他科目关键词，直接过滤掉
      const matchesOther = Object.entries(SUBJECT_KW)
        .filter(([k]) => k !== assessmentSubject)
        .some(([, v]) => v.test(text));
      return !matchesOther;
    });

    if (validQuestions.length < questions.length) {
      console.log(`[getAssessment] Filtered ${questions.length - validQuestions.length} questions with wrong subject`);
    }

    // 标准化选项格式：统一为字符串数组 ["A. 选项1", "B. 选项2", ...]
    const normalizeOptions = (options) => {
      if (!options || options.length === 0) return [];
      return options.map((opt, idx) => {
        if (typeof opt === 'string') return opt;
        if (typeof opt === 'object' && opt !== null) {
          // 对象格式：{key: "A", value: "选项1"} → "A. 选项1"
          const key = opt.key || String.fromCharCode(65 + idx);
          const value = opt.value || opt.text || '';
          return value.includes(`${key}. `) ? value : `${key}. ${value}`;
        }
        return String(opt);
      });
    };

    return {
      success: true,
      data: {
        assessment_id: assessmentId,
        status: session.status || 'in_progress',
        questions: validQuestions.map(q => ({
          id: q.id || q._id,  // 优先使用 id，回退到 _id（保持与 startAssessment 一致）
          type: q.type || 'choice',
          content: q.content || q.question || q.text || q.title || '',
          options: normalizeOptions(q.options),
          knowledge_point: q.knowledge_point || q.kp_name,
          knowledge_point_id: q.knowledge_point_id || q.kp_id,
          difficulty: q.difficulty,
          explanation: q.explanation,
        })),
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