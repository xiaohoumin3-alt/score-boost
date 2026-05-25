console.log('=== [FIXED] api.js LOADED - NEW VERSION ===');
const app = getApp();

const BASE = app.globalData.backendUrl; // http://192.168.1.7:8002

function request(path, method = 'GET', data = null, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + '/api/v1/score-boost' + path,
      method,
      data,
      header: { 'Content-Type': 'application/json' },
      timeout: timeoutMs,
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error('错误 ' + res.statusCode));
      },
      fail: err => {
        console.error('[api] request failed:', err);
        if (err.errMsg && err.errMsg.includes('timeout')) {
          reject(new Error('网络超时，请检查后端服务是否启动'));
        } else if (err.errMsg && err.errMsg.includes('fail to connect')) {
          reject(new Error('无法连接到服务器，请检查网络'));
        } else {
          reject(err);
        }
      }
    });
  });
}

// ========== 测评 ==========
var GRADE_MAP = { '七年级': '7', '八年级': '8', '九年级': '9' };

function startAssessment(grade, subject, mode) {
  console.log('[api] startAssessment called with grade:', grade, 'subject:', subject);
  if (!grade || !subject) {
    console.error('[api] startAssessment: missing grade or subject');
    return Promise.reject(new Error('请先设置年级和科目'));
  }
  mode = mode || 'pre_test';
  return request('/assessment/start', 'POST', {
    subject: subject === '数学' ? 'math' : subject,
    grade: GRADE_MAP[grade] || String(grade),
    semester: '下',
    mode: mode,
    num_questions: 5,
    student_id: app.globalData.studentId || null,
  }, 60000);
}

function getAssessmentQuestion(assessmentId) {
  return request('/assessment/' + assessmentId + '/question', 'GET');
}

function submitAssessmentAnswer(assessmentId, questionId, answer, timeSpent) {
  return request('/assessment/' + assessmentId + '/answer', 'POST', {
    question_id: questionId,
    answer: answer,
    time_spent_seconds: timeSpent,
  });
}

function finishAssessment(assessmentId) {
  return request('/assessment/' + assessmentId + '/finish', 'POST');
}

function getAssessmentList() {
  return request('/assessment/list', 'GET');
}

// ========== 练习 ==========
function startPractice(diagnosisId, knowledgePointId, knowledgePointName, subTopics) {
  subTopics = subTopics || [];
  return request('/practice/start', 'POST', {
    diagnosis_id: diagnosisId || null,
    knowledge_point_id: knowledgePointId || null,
    knowledge_point_name: knowledgePointName || null,
    sub_topics: subTopics,
    student_id: app.globalData.studentId || null,
    assessment_id: null,
  });
}

function getPracticeQuestion(sessionId) {
  return request('/practice/' + sessionId + '/question', 'GET');
}

function submitPracticeAnswer(sessionId, roundId, answer) {
  return request('/practice/answer', 'POST', {
    session_id: sessionId,
    round_id: roundId,
    answer: answer,
  });
}

function finishPractice(sessionId) {
  return request('/practice/' + sessionId + '/finish', 'POST');
}

// ========== 诊断 & 报告 ==========
function analyzeAssessment(assessmentId, results, knowledgeTree) {
  return request('/diagnosis/analyze', 'POST', {
    assessment_id: assessmentId,
    results: results,
    knowledge_tree: knowledgeTree,
  });
}

function generateReport(preTestId, postTestId, diagnosisId, planId) {
  return request('/report/generate', 'POST', {
    pre_test_id: preTestId,
    post_test_id: postTestId,
    diagnosis_id: diagnosisId,
    plan_id: planId,
  });
}

module.exports = {
  startAssessment,
  getAssessmentQuestion,
  submitAssessmentAnswer,
  finishAssessment,
  getAssessmentList,
  startPractice,
  getPracticeQuestion,
  submitPracticeAnswer,
  finishPractice,
  analyzeAssessment,
  generateReport,
};
