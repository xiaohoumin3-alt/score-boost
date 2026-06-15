/**
 * 家长测评云函数
 * 功能：让家长先做题，再让孩子做题，最后对比结果
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 知识点数据（按年级组织）
const knowledgePoints = {
  math: {
    '1': ['20以内加减法', '认识图形', '认识时间', '比较大小', '分类整理'],
    '2': ['100以内加减法', '乘法口诀', '除法初步', '长度单位', '认识角'],
    '3': ['万以内加减法', '多位数乘一位数', '除数是一位数的除法', '分数初步认识', '长方形正方形'],
    '4': ['大数的认识', '三位数乘两位数', '除数是两位数的除法', '角的度量', '四则混合运算'],
    '5': ['小数的意义和性质', '小数加减法', '小数乘除法', '简易方程', '多边形的面积'],
    '6': ['分数乘法', '分数除法', '分数混合运算', '比和比例', '圆的周长和面积'],
    '7': ['有理数', '整式的加减', '一元一次方程', '图形的初步认识', '数据的收集与整理'],
    '8': ['实数', '整式的乘法', '因式分解', '分式', '二次根式', '勾股定理', '一次函数', '平行四边形', '全等三角形', '轴对称', '数据的分析'],
    '9': ['一元二次方程', '二次函数', '旋转', '圆', '概率初步', '相似三角形', '锐角三角函数', '投影与视图']
  },
  chinese: {
    '1': ['拼音', '识字', '笔画笔顺', '偏旁部首', '简单标点'],
    '2': ['词语理解', '句子结构', '看图写话', '古诗背诵', '标点符号'],
    '3': ['词语积累', '句式变换', '段落理解', '作文基础', '修辞手法'],
    '4': ['修辞手法', '病句修改', '概括段意', '作文技巧', '文学常识'],
    '5': ['词语辨析', '句子排序', '阅读理解', '记叙文写作', '说明方法'],
    '6': ['文言文入门', '议论文阅读', '作文结构', '表达方式', '文体知识'],
    '7': ['文言文阅读', '古诗词鉴赏', '现代文阅读', '写作技巧', '语法知识'],
    '8': ['文言文实词', '文言文虚词', '古诗文默写', '阅读理解', '作文表达'],
    '9': ['文言文翻译', '诗词赏析', '现代文阅读', '写作技法', '文学常识']
  },
  english: {
    '1': ['字母认知', '简单单词', '日常问候', '数字颜色', '简单指令'],
    '2': ['基础词汇', '简单对话', '颜色形状', '家庭成员', '日常用品'],
    '3': ['字母组合', '基础句型', '现在进行时', '一般现在时', '情态动词can'],
    '4': ['一般过去时', '比较级', '方位介词', 'there be句型', '情态动词'],
    '5': ['现在完成时', '一般将来时', '条件状语从句', '被动语态', '动词短语'],
    '6': ['过去进行时', '过去完成时', '定语从句', '间接引语', '被动语态']
  }
};

/**
 * Fisher-Yates 洗牌算法
 * @param {Array} array - 要洗牌的数组
 * @returns {Array} 洗牌后的数组
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * 从题库中获取题目（应用层随机抽样）
 */
async function fetchQuestionsFromPool(db, grade, subject, count) {
  try {
    // 获取所有符合条件的题目
    const result = await db.collection('ai_question_pool')
      .where({
        grade: String(grade),
        subject: subject
      })
      .get();

    console.log('[fetchQuestionsFromPool] 总题数:', result.data?.length || 0);

    // 过滤并格式化题目
    let allQuestions = (result.data || [])
      .filter(q => {
        const hasContent = !!(q.content || q.question);
        const hasOptions = q.options && Array.isArray(q.options) && q.options.length >= 2;
        return hasContent && hasOptions;
      })
      .map(q => ({
        id: q._id,
        content: q.content || q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        knowledge_point: q.knowledge_point || q.kp_name || '未知',
        difficulty: q.difficulty || 'medium'
      }));

    console.log('[fetchQuestionsFromPool] 有效题数:', allQuestions.length);

    // Fisher-Yates 洗牌算法，真正随机
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }

    // 取前count道题
    const questions = allQuestions.slice(0, count);
    console.log('[fetchQuestionsFromPool] 返回题数:', questions.length);

    return questions;
  } catch (e) {
    console.error('[fetchQuestionsFromPool] Error:', e);
    return [];
  }
}

/**
 * 使用AI生成题目 - 调用现有的 generateAiQuestion 云函数
 * @deprecated 应该使用队列系统，保留作为降级方案
 */
async function generateQuestionsWithAI(db, grade, subject, count) {
  try {
    console.log(`[generateQuestionsWithAI] Calling generateAiQuestion cloud function for ${count} questions...`);

    // 获取知识点列表
    const kpList = knowledgePoints[subject]?.[grade] || knowledgePoints.math['1'];

    // 构建批量生成任务
    const shuffledKpList = shuffle([...kpList]);
    const questions = shuffledKpList.slice(0, count).map((kpName, idx) => ({
      kp_id: `${subject}_${grade}_${idx}`,
      kp_name: kpName,
      chapter: `${grade}年级`,
      difficulty: 'easy',
      question_type: 'choice'
    }));

    // 调用 generateAiQuestion 云函数
    const result = await cloud.callFunction({
      name: 'generateAiQuestion',
      data: {
        questions: questions,
        skip_image: true,
        batch_mode: true
      }
    });

    console.log('[generateQuestionsWithAI] generateAiQuestion result:', result);

    if (result.result && result.result.success && result.result.data) {
      return result.result.data.map(q => ({
        id: q.id || `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: q.content || q.question,
        options: q.options || [],
        correct_answer: q.correct_answer,
        knowledge_point: q.knowledge_point || q.kp_name || '未知',
        difficulty: q.difficulty || 'easy'
      }));
    }

    console.error('[generateQuestionsWithAI] generateAiQuestion failed:', result.result);
    return [];
  } catch (e) {
    console.error('[generateQuestionsWithAI] Error:', e.message);
    return [];
  }
}

/**
 * 通过队列系统生成孩子题目
 * 创建队列任务并等待完成（内部轮询）
 */
async function generateChildQuestionsViaQueue(db, grade, subject, count, timeoutMs = 15000) {
  const taskId = `child_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[generateChildQuestionsViaQueue] Creating queue task: ${taskId}`);

  try {
    // 创建队列任务
    await db.collection('question_queue').add({
      data: {
        _id: taskId,
        type: 'child_assessment',
        grade: String(grade),
        subject: subject,
        num_questions: count,
        difficulty_distribution: {
          easy: 0.6,
          medium: 0.4,
          hard: 0
        },
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });

    console.log(`[generateChildQuestionsViaQueue] Queue task created, waiting for completion...`);

    // 内部轮询等待队列完成
    const startTime = Date.now();
    const pollInterval = 1000; // 1秒轮询间隔

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      // 检查队列状态
      const taskResult = await db.collection('question_queue').doc(taskId).get();

      if (!taskResult.data) {
        console.error(`[generateChildQuestionsViaQueue] Task ${taskId} not found`);
        break;
      }

      const task = taskResult.data;

      if (task.status === 'completed' && task.question_ids) {
        console.log(`[generateChildQuestionsViaQueue] Task completed, fetching ${task.question_ids.length} questions...`);

        // 获取题目详情
        const questionsResult = await db.collection('ai_question_pool')
          .where({
            _id: db.command.in(task.question_ids)
          })
          .get();

        const questions = (questionsResult.data || []).map(q => ({
          id: q._id,
          content: q.content || q.question,
          options: q.options || [],
          correct_answer: q.correct_answer,
          knowledge_point: q.knowledge_point || q.kp_name || '未知',
          difficulty: q.difficulty || 'medium'
        }));

        console.log(`[generateChildQuestionsViaQueue] Retrieved ${questions.length} questions`);
        return questions;
      }

      if (task.status === 'failed') {
        console.error(`[generateChildQuestionsViaQueue] Task failed:`, task.error);
        break;
      }

      console.log(`[generateChildQuestionsViaQueue] Still ${task.status}... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    }

    console.warn(`[generateChildQuestionsViaQueue] Timeout after ${timeoutMs}ms, falling back to pool`);
    return null; // 超时，调用者回退到题库

  } catch (e) {
    console.error('[generateChildQuestionsViaQueue] Error:', e);
    return null; // 出错，调用者回退到题库
  }
}

/**
 * 生成家长测评（使用队列系统）
 * 创建队列任务，由 questionGenerator 处理
 */
async function startParentAssessment(event) {
  const { grade, subject = 'math', openid } = event;

  if (!grade) {
    return { success: false, error: '请提供年级参数' };
  }

  console.log(`[startParentAssessment] grade=${grade}, subject=${subject}, openid=${openid}`);

  // 创建队列任务ID
  const taskId = `parent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 先生成 assessment_id（需要同时保存到队列任务和测评记录）
  const assessmentId = `parent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // 创建队列任务到 question_queue
    await db.collection('question_queue').add({
      data: {
        _id: taskId,
        type: 'parent_assessment',        // 新类型标识
        grade: String(grade),
        subject: subject,
        openid: openid,
        student_id: openid,              // 复用字段
        assessment_id: assessmentId,      // 关联测评记录
        num_questions: 5,                 // 5道题
        difficulty_distribution: {        // 难度分布（比例）
          easy: 0.6,
          medium: 0.4,
          hard: 0
        },
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });

    console.log(`[startParentAssessment] Queue task created: ${taskId}`);

    // 创建测评记录（初始状态，等队列完成后更新题目）
    await db.collection('parent_assessments').add({
      data: {
        assessment_id: assessmentId,
        grade: String(grade),
        subject: subject,
        openid: openid,
        status: 'generating',              // 生成中状态
        parent_questions: [],
        parent_answers: [],
        parent_score: null,
        parent_duration: 0,
        child_questions: [],
        child_answers: [],
        child_score: null,
        child_duration: 0,
        task_id: taskId,                   // 关联队列任务
        created_at: new Date().toISOString()
      }
    });

    console.log(`[startParentAssessment] Assessment created: ${assessmentId}`);

    return {
      success: true,
      data: {
        task_id: taskId,                    // 返回任务ID用于轮询
        assessment_id: assessmentId,
        message: '题目生成中，请稍候...',
        status: 'generating'
      }
    };
  } catch (e) {
    console.error('[startParentAssessment] Error creating queue task:', e);
    return { success: false, error: '创建测评任务失败，请稍后重试' };
  }
}

/**
 * 提交家长答案
 * 使用队列系统生成孩子题目
 */
async function submitParentAnswers(event) {
  const { assessment_id, answers, duration } = event;

  if (!assessment_id || !answers) {
    return { success: false, error: '缺少必要参数' };
  }

  try {
    // 获取测评记录
    const result = await db.collection('parent_assessments')
      .where({ assessment_id })
      .get();

    if (result.data.length === 0) {
      return { success: false, error: '测评记录不存在' };
    }

    const assessment = result.data[0];

    // 验证家长题目是否存在
    const parentQuestions = assessment.parent_questions;

    console.log('[submitParentAnswers] Scoring - questions:', parentQuestions?.length || 0, 'answers:', answers);

    // 边界检查：如果家长题目不存在或为空，说明题目生成未完成
    if (!parentQuestions || !Array.isArray(parentQuestions) || parentQuestions.length === 0) {
      console.error('[submitParentAnswers] Invalid parent_questions:', {
        exists: !!parentQuestions,
        isArray: Array.isArray(parentQuestions),
        length: parentQuestions?.length || 0
      });
      return { success: false, error: '题目尚未生成完成，请稍后重试' };
    }

    // 边界检查：答案数量应该与题目数量匹配
    if (!Array.isArray(answers) || answers.length !== parentQuestions.length) {
      console.error('[submitParentAnswers] Answer count mismatch:', {
        expected: parentQuestions.length,
        actual: answers?.length || 0
      });
      return { success: false, error: '答案数量不正确，请重新提交' };
    }

    // 计算分数
    let correctCount = 0;

    for (let i = 0; i < parentQuestions.length; i++) {
      const question = parentQuestions[i];
      const userAnswer = answers[i];
      const correctAnswer = question.correct_answer;

      console.log(`[submitParentAnswers] Q${i+1} RAW - user="${userAnswer}" (${typeof userAnswer}), correct="${correctAnswer}" (${typeof correctAnswer}), options=`, question.options);

      // 优先按索引比较（如果都是数字）
      const userAnswerNum = parseInt(userAnswer);
      const correctAnswerNum = typeof correctAnswer === 'number' ? correctAnswer : parseInt(correctAnswer);

      let isCorrect = false;
      if (!isNaN(userAnswerNum) && !isNaN(correctAnswerNum)) {
        // 都是数字，直接比较索引
        isCorrect = userAnswerNum === correctAnswerNum;
      } else {
        // 否则按字母或文本比较
        isCorrect = String(userAnswer).toUpperCase() === String(correctAnswer).toUpperCase();
      }

      console.log(`[submitParentAnswers] Q${i+1}: user=${userAnswer}(${userAnswerNum}), correct=${correctAnswer}(${correctAnswerNum}), match=${isCorrect}`);

      if (isCorrect) {
        correctCount++;
      }
    }

    const score = Math.round((correctCount / parentQuestions.length) * 100);

    // 生成孩子的题目（使用队列系统）
    console.log(`[submitParentAnswers] Generating child questions via queue system`);
    let childQuestions = await generateChildQuestionsViaQueue(db, assessment.grade, assessment.subject, 5);

    // 如果队列系统失败或超时，回退到题库获取
    if (!childQuestions || childQuestions.length === 0) {
      console.warn(`[submitParentAnswers] Queue system failed, falling back to question pool`);
      childQuestions = await fetchQuestionsFromPool(db, assessment.grade, assessment.subject, 5);
    }

    // 如果题库也不够，尝试旧版AI生成（最后降级）
    if (childQuestions.length < 5) {
      console.warn(`[submitParentAnswers] Pool insufficient, trying legacy AI generation`);
      const aiQuestions = await generateQuestionsWithAI(db, assessment.grade, assessment.subject, 5 - childQuestions.length);
      childQuestions = [...childQuestions, ...aiQuestions];
    }

    console.log(`[submitParentAnswers] Final child questions: ${childQuestions.length}`);

    // 更新测评记录
    await db.collection('parent_assessments').doc(assessment._id).update({
      data: {
        status: 'child_pending',
        parent_answers: answers,
        parent_score: score,
        parent_duration: duration || 0,
        parent_correct_count: correctCount,
        parent_completed_at: new Date().toISOString(),
        child_questions: childQuestions
      }
    });

    console.log(`[submitParentAnswers] Parent score: ${score}, child questions: ${childQuestions.length}`);

    return {
      success: true,
      data: {
        assessment_id: assessment_id,
        parent_score: score,
        parent_correct_count: correctCount,
        total_questions: parentQuestions.length,
        questions: childQuestions,
        role: 'child'
      }
    };
  } catch (e) {
    console.error('[submitParentAnswers] Error:', e);
    return { success: false, error: '提交答案失败，请稍后重试' };
  }
}

/**
 * 提交孩子答案
 */
async function submitChildAnswers(event) {
  const { assessment_id, answers, duration } = event;

  if (!assessment_id || !answers) {
    return { success: false, error: '缺少必要参数' };
  }

  try {
    // 获取测评记录
    const result = await db.collection('parent_assessments')
      .where({ assessment_id })
      .get();

    if (result.data.length === 0) {
      return { success: false, error: '测评记录不存在' };
    }

    const assessment = result.data[0];

    // 计算分数
    let correctCount = 0;
    const childQuestions = assessment.child_questions;

    console.log('[submitChildAnswers] Scoring - questions:', childQuestions.length, 'answers:', answers);

    for (let i = 0; i < childQuestions.length; i++) {
      const question = childQuestions[i];
      const userAnswer = answers[i];
      const correctAnswer = question.correct_answer;

      // 优先按索引比较（如果都是数字）
      const userAnswerNum = parseInt(userAnswer);
      const correctAnswerNum = typeof correctAnswer === 'number' ? correctAnswer : parseInt(correctAnswer);

      let isCorrect = false;
      if (!isNaN(userAnswerNum) && !isNaN(correctAnswerNum)) {
        // 都是数字，直接比较索引
        isCorrect = userAnswerNum === correctAnswerNum;
      } else {
        // 否则按字母或文本比较
        isCorrect = String(userAnswer).toUpperCase() === String(correctAnswer).toUpperCase();
      }

      console.log(`[submitChildAnswers] Q${i+1}: user=${userAnswer}(${userAnswerNum}), correct=${correctAnswer}(${correctAnswerNum}), match=${isCorrect}`);

      if (isCorrect) {
        correctCount++;
      }
    }

    const score = Math.round((correctCount / childQuestions.length) * 100);

    // 更新测评记录
    await db.collection('parent_assessments').doc(assessment._id).update({
      data: {
        status: 'completed',
        child_answers: answers,
        child_score: score,
        child_duration: duration || 0,
        child_correct_count: correctCount,
        child_completed_at: new Date().toISOString()
      }
    });

    // 生成对比结果
    const parentScore = assessment.parent_score;
    const parentDuration = assessment.parent_duration;
    const childDuration = duration || 0;

    let comparison = {};
    let message = '';

    if (parentScore > score) {
      comparison = { winner: 'parent', diff: parentScore - score };
      message = `您比孩子高${parentScore - score}分，但孩子在某些题上可能更快`;
    } else if (parentScore < score) {
      comparison = { winner: 'child', diff: score - parentScore };
      message = `您的孩子比您高${score - parentScore}分！`;
    } else {
      comparison = { winner: 'tie', diff: 0 };
      message = `你们不相上下！但孩子用时更短`;
    }

    // 计算家长相当于几年级
    let parentGradeLevel = '未知';
    if (parentScore >= 90) {
      parentGradeLevel = `${assessment.grade}年级`;
    } else if (parentScore >= 80) {
      parentGradeLevel = `${Math.max(1, assessment.grade - 1)}年级`;
    } else if (parentScore >= 70) {
      parentGradeLevel = `${Math.max(1, assessment.grade - 2)}年级`;
    } else if (parentScore >= 60) {
      parentGradeLevel = `${Math.max(1, assessment.grade - 3)}年级`;
    } else {
      parentGradeLevel = `小学`;
    }

    console.log(`[submitChildAnswers] Child score: ${score}, comparison: ${comparison.winner}`);

    return {
      success: true,
      data: {
        assessment_id: assessment_id,
        parent: {
          score: parentScore,
          correct_count: assessment.parent_correct_count,
          total_questions: assessment.parent_questions.length,
          duration: parentDuration,
          grade_level: parentGradeLevel
        },
        child: {
          score: score,
          correct_count: correctCount,
          total_questions: childQuestions.length,
          duration: childDuration
        },
        comparison: comparison,
        message: message
      }
    };
  } catch (e) {
    console.error('[submitChildAnswers] Error:', e);
    return { success: false, error: '提交答案失败，请稍后重试' };
  }
}

/**
 * 获取测评结果
 */
async function getAssessmentResult(event) {
  const { assessment_id } = event;

  if (!assessment_id) {
    return { success: false, error: '缺少测评ID' };
  }

  try {
    const result = await db.collection('parent_assessments')
      .where({ assessment_id })
      .get();

    if (result.data.length === 0) {
      return { success: false, error: '测评记录不存在' };
    }

    const assessment = result.data[0];

    if (assessment.status !== 'completed') {
      return { success: false, error: '测评尚未完成' };
    }

    // 生成对比结果
    const parentScore = assessment.parent_score;
    const childScore = assessment.child_score;

    let comparison = {};
    let message = '';

    if (parentScore > childScore) {
      comparison = { winner: 'parent', diff: parentScore - childScore };
      message = `您比孩子高${parentScore - childScore}分，但孩子在某些题上可能更快`;
    } else if (parentScore < childScore) {
      comparison = { winner: 'child', diff: childScore - parentScore };
      message = `您的孩子比您高${childScore - parentScore}分！`;
    } else {
      comparison = { winner: 'tie', diff: 0 };
      message = `你们不相上下！但孩子用时更短`;
    }

    // 计算家长相当于几年级
    let parentGradeLevel = '未知';
    if (parentScore >= 90) {
      parentGradeLevel = `${assessment.grade}年级`;
    } else if (parentScore >= 80) {
      parentGradeLevel = `${Math.max(1, assessment.grade - 1)}年级`;
    } else if (parentScore >= 70) {
      parentGradeLevel = `${Math.max(1, assessment.grade - 2)}年级`;
    } else if (parentScore >= 60) {
      parentGradeLevel = `${Math.max(1, assessment.grade - 3)}年级`;
    } else {
      parentGradeLevel = `小学`;
    }

    return {
      success: true,
      data: {
        assessment_id: assessment_id,
        parent: {
          score: parentScore,
          correct_count: assessment.parent_correct_count,
          total_questions: assessment.parent_questions.length,
          duration: assessment.parent_duration,
          grade_level: parentGradeLevel
        },
        child: {
          score: childScore,
          correct_count: assessment.child_correct_count,
          total_questions: assessment.child_questions.length,
          duration: assessment.child_duration
        },
        comparison: comparison,
        message: message
      }
    };
  } catch (e) {
    console.error('[getAssessmentResult] Error:', e);
    return { success: false, error: '获取结果失败，请稍后重试' };
  }
}

/**
 * 获取队列生成的题目
 * 当 questionGenerator 完成题目生成后调用此接口
 */
async function getGeneratedQuestions(event) {
  const { task_id, assessment_id } = event;

  if (!task_id) {
    return { success: false, error: '缺少 task_id' };
  }

  try {
    // 检查队列任务状态
    const taskResult = await db.collection('question_queue').doc(task_id).get();

    if (!taskResult.data) {
      return { success: false, error: '队列任务不存在' };
    }

    const task = taskResult.data;

    if (task.status === 'pending' || task.status === 'processing') {
      return {
        success: true,
        data: {
          status: task.status,
          message: task.status === 'pending' ? '排队中...' : '生成中...'
        }
      };
    }

    if (task.status === 'failed') {
      return {
        success: false,
        error: task.error || '题目生成失败',
        retry_count: task.retry_count
      };
    }

    if (task.status === 'completed' && task.question_ids) {
      // 从题库获取生成的题目
      const questionsResult = await db.collection('ai_question_pool')
        .where({
          _id: db.command.in(task.question_ids)
        })
        .get();

      const questions = (questionsResult.data || []).map(q => ({
        id: q._id,
        content: q.content || q.question,
        options: q.options || [],
        correct_answer: q.correct_answer,
        knowledge_point: q.knowledge_point || q.kp_name || '未知',
        difficulty: q.difficulty || 'medium'
      }));

      // 更新测评记录
      if (assessment_id) {
        // 查找测评记录（通过 task_id 或 assessment_id）
        const assessmentResult = await db.collection('parent_assessments')
          .where({
            $or: [
              { task_id: task_id },
              { assessment_id: assessment_id }
            ]
          })
          .get();

        if (assessmentResult.data && assessmentResult.data.length > 0) {
          const assessment = assessmentResult.data[0];
          await db.collection('parent_assessments').doc(assessment._id).update({
            data: {
              status: 'parent_pending',
              parent_questions: questions,
              updated_at: new Date().toISOString()
            }
          });
        }
      }

      return {
        success: true,
        data: {
          status: 'completed',
          questions: questions,
          role: 'parent',
          assessment_id: assessment_id
        }
      };
    }

    return { success: false, error: '未知的队列状态' };
  } catch (e) {
    console.error('[getGeneratedQuestions] Error:', e);
    return { success: false, error: '获取题目失败' };
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || 'start';

  console.log(`[parentAssessment] action=${action}, openid=${openid}`);

  try {
    switch (action) {
      case 'start':
        return await startParentAssessment({ ...event, openid });
      case 'submitParent':
        return await submitParentAnswers(event);
      case 'submitChild':
        return await submitChildAnswers(event);
      case 'getResult':
        return await getAssessmentResult(event);
      case 'getQuestions':
        return await getGeneratedQuestions(event);
      default:
        return { success: false, error: `未知操作: ${action}` };
    }
  } catch (e) {
    console.error('[parentAssessment] Error:', e);
    return { success: false, error: e.message || '服务器错误' };
  }
};
