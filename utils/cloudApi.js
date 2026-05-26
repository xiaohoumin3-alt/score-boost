/**
 * 云函数 API - 微信云开发
 */

const app = getApp();

// 云环境ID
const CLOUD_ENV = 'cloud1-7gg9y9tjb2b867b6';

let cloudInitialized = false;

/**
 * 初始化云开发
 */
function initCloud() {
  if (!cloudInitialized) {
    wx.cloud.init({
      env: CLOUD_ENV,
      traceUser: true,
    });
    cloudInitialized = true;
  }
}

/**
 * 调用云函数
 */
function callCloudFunction(name, data) {
  return new Promise((resolve, reject) => {
    console.log(`[cloudApi] calling ${name}:`, data);
    initCloud();

    wx.cloud.callFunction({
      name: name,
      data: data,
      success: res => {
        console.log(`[cloudApi] ${name} success:`, res);
        if (res.errMsg && res.errMsg.includes('ok')) {
          if (res.result && res.result.success) {
            resolve(res.result.data);
          } else if (res.result && res.result.error) {
            reject(new Error(res.result.error));
          } else if (res.result && !res.result.success) {
            // 处理 success: false 的情况
            reject(new Error(res.result.error || '云函数返回失败'));
          } else {
            resolve(res.result);
          }
        } else {
          reject(new Error(res.errMsg || '云函数调用失败'));
        }
      },
      fail: err => {
        console.error(`[cloudApi] ${name} failed:`, err);
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  });
}

// ========== 测评 API ==========

function startAssessment(grade, subject, mode, retestOptions) {
  console.log('[cloudApi] startAssessment:', grade, subject, mode, retestOptions);

  // 会考模式不需要年级
  const isHuikao = mode === 'huikao';
  if (!isHuikao && (!grade || !subject)) {
    return Promise.reject(new Error('请先设置年级和科目'));
  }
  if (isHuikao && !subject) {
    return Promise.reject(new Error('请先设置科目'));
  }

  const gradeMap = { '七年级': '7', '八年级': '8', '九年级': '9' };
  const subjectMap = { '数学': 'math', '生物': 'biology', '地理': 'geography' };

  // 会考模式固定参数
  const payload = {
    subject: subjectMap[subject] || subject,
    grade: isHuikao ? '7-8' : (gradeMap[grade] || String(grade)),
    semester: isHuikao ? 'all' : '下',
    mode: mode || 'quick',
    num_questions: isHuikao ? 50 : 20,
    student_id: app.globalData.studentId || null,
  };

  // 复测模式：传递额外参数
  if (retestOptions) {
    payload.previousScore = retestOptions.previousScore;
    payload.targetDifficulty = retestOptions.targetDifficulty;
  }

  return callCloudFunction('startAssessment', payload);
}

function submitAssessmentAnswer(assessmentId, answersOrQuestionId, answer, timeSpent) {
  // 支持两种调用方式：
  // 1. submitAssessmentAnswer(assessmentId, questionId, answer, timeSpent) - 单个答案
  // 2. submitAssessmentAnswer(assessmentId, answersArray) - 所有答案
  var answers;
  if (Array.isArray(answersOrQuestionId)) {
    answers = answersOrQuestionId;
  } else {
    answers = [{
      question_id: answersOrQuestionId,
      answer: answer,
      time_spent_seconds: timeSpent,
    }];
  }
  return callCloudFunction('submitAnswer', {
    assessment_id: assessmentId,
    answers: answers
  });
}

function finishAssessment(assessmentId) {
  return new Promise((resolve, reject) => {
    initCloud();
    const db = wx.cloud.database();
    db.collection('assessments').where({ assessment_id: assessmentId }).get()
      .then(res => {
        const doc = res.data && res.data[0];
        if (doc && doc.status === 'completed' && doc.score) {
          resolve({
            status: 'completed',
            score: doc.score,
            total_correct: doc.score.total_correct || 0,
            total_questions: doc.score.total_questions || 0,
            score_percent: doc.score.score_percent || 0,
            results: doc.results || [],
            kp_stats: doc.kp_stats || [],
          });
        } else {
          resolve({ status: doc?.status || 'unknown' });
        }
      })
      .catch(err => reject(new Error(err.errMsg || '获取结果失败')));
  });
}

// ========== 练习 API ==========

function startPractice(knowledgePointId, knowledgePointName, numQuestions, weakPoints, assessmentId, studentProfile) {
  // 科目映射：显示名→存储名
  const subjectMapDb = { '生物': 'biology', '地理': 'geography', '数学': 'math' };
  const currentSubject = app.globalData.subject || '数学';
  const dbSubject = subjectMapDb[currentSubject] || currentSubject;

  const payload = {
    knowledge_point_id: knowledgePointId || null,
    kp_name: knowledgePointName || '',
    num_questions: numQuestions || 20,
    grade: app.globalData.grade || '8',
    subject: dbSubject,
    weak_points: weakPoints || [],
    student_id: app.globalData.studentId || null,
    assessment_id: assessmentId || null,
    student_profile: studentProfile || null,  // 新增：学生画像（AI原生核心）
  };

  console.log('[cloudApi] startPractice payload:', JSON.stringify(payload));
  return callCloudFunction('practice_v2', payload);
}

function finishPractice(sessionId) {
  return Promise.resolve({ session_id: sessionId, status: 'completed' });
}

/**
 * 提交练习答案并更新进度
 */
function submitPracticeResult(data) {
  return callCloudFunction('submitPracticeResult', {
    student_id: app.globalData.studentId,
    kp_id: data.kp_id,
    difficulty: data.difficulty,
    is_correct: data.is_correct,
    assessment_id: data.assessment_id || null,
  });
}

/**
 * 检查复测条件
 */
function checkRetestEligibility(assessmentId, score) {
  return callCloudFunction('checkRetestEligibility', {
    assessment_id: assessmentId,
    score: score,
  });
}

/**
 * 获取知识点进度
 */
function getKpProgress() {
  return new Promise((resolve, reject) => {
    initCloud();
    const db = wx.cloud.database();

    console.log('[cloudApi] getKpProgress fetching...');

    db.collection('kp_progress')
      .where({
        student_id: app.globalData.studentId || null,
      })
      .get()
      .then(res => {
        console.log('[cloudApi] getKpProgress result:', res.data);
        resolve({
          success: true,
          data: res.data || [],
        });
      })
      .catch(err => {
        console.error('[cloudApi] getKpProgress error:', err);
        resolve({
          success: false,
          data: [],
          error: err.errMsg || '获取进度失败',
        });
      });
  });
}

// ========== 诊断 API ==========

/**
 * 分析薄弱知识点
 * @param {Array} kpStats - 知识点统计 [{kp_id, kp_name, correct, total}]
 * @returns {Array} 薄弱点列表 [{kp_id, kp_name, chapter: ''}]
 */
function analyzeWeakPoints(kpStats) {
  console.log('[cloudApi] analyzeWeakPoints input:', JSON.stringify(kpStats));
  if (!kpStats || kpStats.length === 0) return [];

  const result = kpStats
    .filter(kp => {
      const rate = kp.correct / kp.total;
      return rate < 0.8 || kp.total - kp.correct >= 1;  // 正确率<80% 或 错>=1题
    })
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total))  // 从低到高排
    .map(kp => ({
      kp_id: kp.kp_id,
      kp_name: kp.kp_name,
      chapter: '',
    }));

  console.log('[cloudApi] analyzeWeakPoints output:', JSON.stringify(result));
  // 检查第一个结果是否有 kp_id
  if (result[0]) {
    console.log('[cloudApi] analyzeWeakPoints output[0].kp_id:', result[0].kp_id || 'MISSING!');
  }
  return result;
}

function getLatestDiagnosis(subject, grade) {
  return new Promise((resolve, reject) => {
    initCloud();
    const db = wx.cloud.database();

    // 科目映射：显示名→存储名
    const subjectMapDb = { '生物': 'biology', '地理': 'geography', '数学': 'math' };
    // 年级映射：显示名→存储名
    const gradeMapDb = { '七年级': '7', '八年级': '8', '九年级': '9' };

    const dbSubject = subject ? (subjectMapDb[subject] || subject) : null;
    const dbGrade = grade ? (gradeMapDb[grade] || grade) : null;

    console.log('[cloudApi] getLatestDiagnosis:', { subject, grade, dbSubject, dbGrade });

    // 构建查询条件
    const query = { status: 'completed' };
    if (dbGrade) query.grade = dbGrade;
    if (dbSubject) query.subject = dbSubject;

    console.log('[cloudApi] getLatestDiagnosis query:', query);

    db.collection('assessments')
      .where(query)
      .orderBy('created_at', 'desc')
      .limit(1)
      .get()
      .then(res => {
        const doc = res.data && res.data[0];
        console.log('[cloudApi] getLatestDiagnosis result:', doc ? doc.assessment_id : 'none');
        if (doc && doc.kp_stats) {
          // 详细日志：检查 kp_stats 的数据结构
          console.log('[cloudApi] getLatestDiagnosis kp_stats:', JSON.stringify(doc.kp_stats));
          console.log('[cloudApi] getLatestDiagnosis kp_stats[0]:', JSON.stringify(doc.kp_stats[0] || 'no data'));
          // 检查第一个元素是否有 kp_id
          if (doc.kp_stats[0]) {
            console.log('[cloudApi] getLatestDiagnosis kp_stats[0].kp_id:', doc.kp_stats[0].kp_id || 'MISSING!');
          }
          resolve({
            kp_stats: doc.kp_stats,
            assessment_id: doc.assessment_id,
            score_percent: doc.score?.score_percent || 0,
          });
        } else {
          resolve({ kp_stats: [], assessment_id: null, score_percent: 0 });
        }
      })
      .catch(err => {
        console.error('[cloudApi] getLatestDiagnosis error:', err);
        resolve({ kp_stats: [], assessment_id: null, score_percent: 0 });
      });
  });
}

// ========== 历史记录 API ==========

function getAssessmentList(subject, grade) {
  return new Promise((resolve, reject) => {
    initCloud();
    const db = wx.cloud.database();

    // 科目映射：显示名→存储名
    const subjectMapDb = { '生物': 'biology', '地理': 'geography', '数学': 'math' };
    // 年级映射：显示名→存储名
    const gradeMapDb = { '七年级': '7', '八年级': '8', '九年级': '9' };

    const dbSubject = subject ? (subjectMapDb[subject] || subject) : null;
    const dbGrade = grade ? (gradeMapDb[grade] || grade) : null;

    // 调试日志
    console.log('[cloudApi] getAssessmentList input:', { subject, grade, dbSubject, dbGrade });

    // 如果没有过滤条件，返回全量数据
    if (!dbSubject && !dbGrade) {
      console.log('[cloudApi] getAssessmentList: no filter, returning all');
      db.collection('assessments')
        .where({ status: 'completed' })
        .orderBy('created_at', 'desc')
        .limit(20)
        .get()
        .then(res => resolve({ assessments: res.data || [] }))
        .catch(err => { console.error('[cloudApi] getAssessmentList error:', err); resolve({ assessments: [] }); });
      return;
    }

    // 构建查询
    const query = { status: 'completed' };
    if (dbGrade) query.grade = dbGrade;
    if (dbSubject) query.subject = dbSubject;

    console.log('[cloudApi] getAssessmentList query:', query);

    db.collection('assessments')
      .where(query)
      .orderBy('created_at', 'desc')
      .limit(20)
      .get()
      .then(res => {
        resolve({
          assessments: (res.data || []).map(doc => ({
            assessment_id: doc.assessment_id,
            score_percent: doc.score?.score_percent || 0,
            total_correct: doc.score?.total_correct || 0,
            total_questions: doc.score?.total_questions || 0,
            created_at: doc.created_at,
            subject: doc.subject,
            grade: doc.grade,
            kp_stats: doc.kp_stats || [],
          }))
        });
      })
      .catch(err => {
        console.error('[cloudApi] getAssessmentList error:', err);
        resolve({ assessments: [] });
      });
  });
}

// ========== 导出 ==========

module.exports = {
  // 核心 API
  startAssessment,
  submitAssessmentAnswer,
  finishAssessment,
  startPractice,
  finishPractice,
  getAssessmentList,

  // 诊断 API
  analyzeWeakPoints,
  getLatestDiagnosis,

  // 练习 API
  submitPracticeResult,
  checkRetestEligibility,

  // 进度 API
  getKpProgress,

  // 直接调用云函数
  callCloudFunction,
};