/**
 * 家长测评云函数
 * 功能：让家长先做题，再让孩子做题，最后对比结果
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const http = require('http');
const https = require('https');

// Fetch polyfill for Node.js environment (微信云函数可能没有全局fetch)
let fetchPolyfill = null;
try {
  // 尝试使用内置的 fetch（Node 18+）
  if (typeof fetch !== 'undefined') {
    fetchPolyfill = fetch;
    console.log('[Fetch] Using native fetch');
  } else {
    // 使用 node-fetch 或 undici
    fetchPolyfill = require('node-fetch');
    console.log('[Fetch] Using node-fetch polyfill');
  }
} catch (e) {
  console.error('[Fetch] Failed to load fetch:', e.message);
  console.error('[Fetch] Will use https module as fallback');
}

// 统一的fetch接口（带超时控制）
function safeFetch(url, options) {
  if (fetchPolyfill) {
    // 为原生fetch添加AbortController超时控制
    const controller = new AbortController();
    const timeout = options.timeout || 60000;

    // 设置超时
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.error('[safeFetch] Request timeout after', timeout, 'ms');
    }, timeout);

    return fetchPolyfill(url, {
      ...options,
      signal: controller.signal
    }).finally(() => {
      clearTimeout(timeoutId);
    });
  }
  // Fallback to https module
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const headers = {};
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, options.headers);
      }
    }

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (protocol === https ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: headers
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

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
  }
};

/**
 * 从题库中获取题目
 */
async function fetchQuestionsFromPool(db, grade, subject, count) {
  try {
    const result = await db.collection('ai_question_pool')
      .where({
        grade: String(grade),
        subject: subject
      })
      .limit(count * 2) // 多取一些，过滤掉可能的脏数据
      .get();

    // 过滤并格式化题目
    const questions = (result.data || [])
      .filter(q => {
        const hasContent = !!(q.content || q.question);
        const hasOptions = q.options && Array.isArray(q.options) && q.options.length >= 2;
        return hasContent && hasOptions;
      })
      .slice(0, count)
      .map(q => ({
        id: q._id,
        content: q.content || q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        knowledge_point: q.knowledge_point || q.kp_name || '未知',
        difficulty: q.difficulty || 'medium'
      }));

    return questions;
  } catch (e) {
    console.error('[fetchQuestionsFromPool] Error:', e);
    return [];
  }
}

/**
 * 使用AI生成题目
 */
async function generateQuestionsWithAI(db, grade, subject, count) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  if (!apiKey) {
    console.error('[generateQuestionsWithAI] LLM_API_KEY not set!');
    return [];
  }

  const gradeText = `${grade}年级`;
  const subjectText = { math: '数学', biology: '生物', geography: '地理' }[subject] || '数学';
  const kpList = knowledgePoints[subject]?.[grade] || knowledgePoints.math['8'];

  const prompt = `请为${gradeText}${subjectText}生成${count}道选择题。

知识点覆盖（均匀分布）：${kpList.join('、')}

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

  try {
    console.log(`[generateQuestionsWithAI] Calling DeepSeek API for ${count} questions...`);

    const response = await safeFetch(`${baseUrl}/chat/completions`, {
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
      }),
      timeout: 45000
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[generateQuestionsWithAI] API error: ${response.status} ${errText.substring(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      console.error('[generateQuestionsWithAI] Empty response from API');
      return [];
    }

    console.log(`[generateQuestionsWithAI] Response length: ${content.length} chars`);

    // 解析 JSON 数组
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[generateQuestionsWithAI] No JSON array found in response');
      return [];
    }

    const questions = JSON.parse(jsonMatch[0]);

    // 格式化题目
    return questions
      .filter(q => q.options && Array.isArray(q.options) && q.options.length >= 2)
      .map((q, i) => ({
        id: `ai_${Date.now()}_${i}`,
        content: q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        knowledge_point: q.knowledge_point || kpList[i % kpList.length],
        difficulty: 'medium'
      }));
  } catch (e) {
    console.error('[generateQuestionsWithAI] Error:', e.message);
    return [];
  }
}

/**
 * 生成家长测评
 */
async function startParentAssessment(event) {
  const { grade, subject = 'math', openid } = event;

  if (!grade) {
    return { success: false, error: '请提供年级参数' };
  }

  console.log(`[startParentAssessment] grade=${grade}, subject=${subject}, openid=${openid}`);

  // 1. 先从题库中获取题目
  let questions = await fetchQuestionsFromPool(db, grade, subject, 5);
  console.log(`[startParentAssessment] Pool has ${questions.length} questions`);

  // 2. 如果题库不足，使用AI生成
  if (questions.length < 5) {
    console.log(`[startParentAssessment] Pool has ${questions.length} questions, generating with AI`);
    const aiQuestions = await generateQuestionsWithAI(db, grade, subject, 5 - questions.length);
    console.log(`[startParentAssessment] AI generated ${aiQuestions.length} questions`);
    questions = [...questions, ...aiQuestions];
  }

  if (questions.length === 0) {
    console.error('[startParentAssessment] No questions available');
    return { success: false, error: '无法生成题目，请稍后重试' };
  }

  // 3. 创建测评记录
  const assessmentId = `parent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    await db.collection('parent_assessments').add({
      data: {
        assessment_id: assessmentId,
        grade: String(grade),
        subject: subject,
        openid: openid,
        status: 'parent_pending', // parent_pending -> child_pending -> completed
        parent_questions: questions,
        parent_answers: [],
        parent_score: null,
        parent_duration: 0,
        child_questions: [],
        child_answers: [],
        child_score: null,
        child_duration: 0,
        created_at: new Date().toISOString()
      }
    });

    console.log(`[startParentAssessment] Assessment created: ${assessmentId}`);

    return {
      success: true,
      data: {
        assessment_id: assessmentId,
        questions: questions,
        role: 'parent'
      }
    };
  } catch (e) {
    console.error('[startParentAssessment] Error saving assessment:', e);
    return { success: false, error: '创建测评失败，请稍后重试' };
  }
}

/**
 * 提交家长答案
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

    // 计算分数
    let correctCount = 0;
    const parentQuestions = assessment.parent_questions;

    for (let i = 0; i < parentQuestions.length; i++) {
      const question = parentQuestions[i];
      const userAnswer = answers[i];

      // 正确答案可能是数字索引或字母
      let correctAnswer = question.correct_answer;
      if (typeof correctAnswer === 'number') {
        correctAnswer = String.fromCharCode(65 + correctAnswer); // 0->A, 1->B, ...
      }

      if (String(userAnswer).toUpperCase() === String(correctAnswer).toUpperCase()) {
        correctCount++;
      }
    }

    const score = Math.round((correctCount / parentQuestions.length) * 100);

    // 生成孩子的题目（同一年级，不同题目）
    let childQuestions = await fetchQuestionsFromPool(db, assessment.grade, assessment.subject, 5);
    console.log(`[submitParentAnswers] Child pool has ${childQuestions.length} questions`);

    // 如果题库不足，使用AI生成
    if (childQuestions.length < 5) {
      const aiQuestions = await generateQuestionsWithAI(db, assessment.grade, assessment.subject, 5 - childQuestions.length);
      console.log(`[submitParentAnswers] AI generated ${aiQuestions.length} questions for child`);
      childQuestions = [...childQuestions, ...aiQuestions];
    }

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

    for (let i = 0; i < childQuestions.length; i++) {
      const question = childQuestions[i];
      const userAnswer = answers[i];

      // 正确答案可能是数字索引或字母
      let correctAnswer = question.correct_answer;
      if (typeof correctAnswer === 'number') {
        correctAnswer = String.fromCharCode(65 + correctAnswer); // 0->A, 1->B, ...
      }

      if (String(userAnswer).toUpperCase() === String(correctAnswer).toUpperCase()) {
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
      default:
        return { success: false, error: `未知操作: ${action}` };
    }
  } catch (e) {
    console.error('[parentAssessment] Error:', e);
    return { success: false, error: e.message || '服务器错误' };
  }
};
