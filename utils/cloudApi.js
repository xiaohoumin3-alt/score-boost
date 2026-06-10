/**
 * 云函数 API - 微信云开发
 */

// 兼容测试环境：getApp可能不存在
let app;
try {
  app = getApp();
} catch (e) {
  app = { globalData: {} };
}

// 云环境ID
const CLOUD_ENV = 'cloud1-7gg9y9tjb2b867b6';

// 云函数超时配置（单位：毫秒）
// 与云函数实际超时配置保持一致，避免前端超时而云函数仍在执行
const FUNCTION_TIMEOUTS = {
  // 默认超时（简单查询操作）
  default: 15000,

  // AI相关操作（需要等待LLM响应）
  startAssessment: 60000,       // 启动评估，可能触发AI生成
  submitAnswer: 60000,           // 提交答案，可能需要AI分析
  submitPracticeResult: 60000,  // 提交练习结果

  // 队列操作
  checkQueueStatus: 30000,      // 检查队列状态，可能需要等待
  cancelQueueTask: 15000,        // 取消队列任务

  // 查询操作
  checkRetestEligibility: 15000, // 检查重测资格
  analytics: 15000,              // 统计分析
};

let cloudInitialized = false;

// 兼容测试环境：wx可能不存在
// 使用函数延迟获取，避免模块加载时wx未定义的时序问题
function getWx() {
  if (typeof wx !== 'undefined') return wx;
  if (typeof global !== 'undefined' && global.wx) return global.wx;
  return null;
}

/**
 * 初始化云开发
 */
function initCloud() {
  const _wx = getWx();
  if (!cloudInitialized && _wx && _wx.cloud) {
    _wx.cloud.init({
      env: CLOUD_ENV,
      traceUser: true,
    });
    cloudInitialized = true;
  }
}

/**
 * 调用云函数
 */
function callCloudFunction(name, data, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    console.log(`[cloudApi] calling ${name}:`, data);

    const _wx = getWx();
    // 测试环境：如果没有wx对象，直接抛出（由mock处理）
    if (!_wx || !_wx.cloud) {
      console.error('[cloudApi] wx.cloud not available, _wx:', _wx);
      reject(new Error('wx.cloud not available'));
      return;
    }

    initCloud();

    // 超时保护
    let timeoutHit = false;
    const timeoutId = setTimeout(() => {
      timeoutHit = true;
      console.error(`[cloudApi] ${name} timeout after ${timeoutMs}ms`);
      reject(new Error('请求超时，请检查网络连接'));
    }, timeoutMs);

    _wx.cloud.callFunction({
      name: name,
      data: data,
      success: res => {
        if (timeoutHit) return;
        clearTimeout(timeoutId);
        console.log(`[cloudApi] ${name} success - errMsg:`, res.errMsg);
        console.log(`[cloudApi] ${name} success - result:`, JSON.stringify(res.result));
        if (res.errMsg && res.errMsg.includes('ok')) {
          if (res.result && res.result.success === true) {
            console.log(`[cloudApi] ${name} resolving with res.result.data:`, JSON.stringify(res.result.data));
            resolve(res.result.data);
          } else if (res.result && res.result.error) {
            console.log(`[cloudApi] ${name} rejecting with error:`, res.result.error);
            reject(new Error(res.result.error));
          } else if (res.result && res.result.success === false) {
            console.log(`[cloudApi] ${name} success=false, rejecting`);
            // 处理 success: false 的情况
            reject(new Error(res.result.error || '云函数返回失败'));
          } else {
            console.log(`[cloudApi] ${name} unexpected format, resolving with res.result:`, JSON.stringify(res.result));
            resolve(res.result);
          }
        } else {
          console.log(`[cloudApi] ${name} errMsg not ok, rejecting:`, res.errMsg);
          reject(new Error(res.errMsg || '云函数调用失败'));
        }
      },
      fail: err => {
        if (timeoutHit) return;
        clearTimeout(timeoutId);
        console.error(`[cloudApi] ${name} failed:`, err);
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  });
}

// ========== 测评 API ==========

function startAssessment(grade, subject, mode, retestOptions, options) {
  console.log('[cloudApi] startAssessment:', grade, subject, mode, retestOptions, options);

  // 会考模式不需要年级
  const isHuikao = mode === 'huikao';
  if (!isHuikao && (!grade || !subject)) {
    return Promise.reject(new Error('请先设置年级和科目'));
  }
  if (isHuikao && !subject) {
    return Promise.reject(new Error('请先设置科目'));
  }

  const gradeMap = { '一年级': '1', '二年级': '2', '三年级': '3', '四年级': '4', '五年级': '5', '六年级': '6', '七年级': '7', '八年级': '8', '九年级': '9' };
  const subjectMap = { '语文': 'chinese', '数学': 'math', '英语': 'english', '物理': 'physics', '化学': 'chemistry', '生物': 'biology', '历史': 'history', '地理': 'geography', '政治': 'politics' };

  // 根据当前月份判断学期：2-7月=下学期，8-1月=上学期
  const currentMonth = new Date().getMonth() + 1;
  const semester = (currentMonth >= 2 && currentMonth <= 7) ? '下' : '上';

  // 会考模式固定参数
  const payload = {
    subject: subjectMap[subject] || subject,
    grade: isHuikao ? '7-8' : (gradeMap[grade] || String(grade)),
    semester: isHuikao ? 'all' : semester,
    mode: mode || 'quick',
    num_questions: isHuikao ? 50 : 20,
    student_id: app.globalData.studentId || null,
  };

  // 复测模式：传递额外参数
  if (retestOptions) {
    payload.previousScore = retestOptions.previousScore;
    payload.targetDifficulty = retestOptions.targetDifficulty;
  }

  // 强制同步模式（跳过队列直接生成）
  if (options && options.forceSync) {
    payload.force_sync = true;
  }

  return callCloudFunction('startAssessment', payload, FUNCTION_TIMEOUTS.startAssessment);
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
  }, FUNCTION_TIMEOUTS.submitAnswer);
}

function finishAssessment(assessmentId) {
  return new Promise((resolve, reject) => {
    initCloud();
    if (!wx || !wx.cloud) {
      console.error('[cloudApi] finishAssessment: wx.cloud not available');
      reject(new Error('云服务不可用'));
      return;
    }
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
  // 科目/年级映射：显示名→存储名
  const subjectMapDb = { '语文': 'chinese', '数学': 'math', '英语': 'english', '物理': 'physics', '化学': 'chemistry', '生物': 'biology', '历史': 'history', '地理': 'geography', '政治': 'politics' };
  const gradeMapDb = { '一年级': '1', '二年级': '2', '三年级': '3', '四年级': '4', '五年级': '5', '六年级': '6', '七年级': '7', '八年级': '8', '九年级': '9' };
  const currentSubject = app.globalData.subject || '数学';
  const currentGrade = app.globalData.grade || '8';
  const dbSubject = subjectMapDb[currentSubject] || currentSubject;
  const dbGrade = gradeMapDb[currentGrade] || String(currentGrade || '8');

  const payload = {
    knowledge_point_id: knowledgePointId || null,
    kp_name: knowledgePointName || '',
    num_questions: numQuestions || 20,
    grade: dbGrade,
    subject: dbSubject,
    mode: 'practice',  // 区分练习模式 vs 测评模式
    weak_points: weakPoints || [],
    student_id: app.globalData.studentId || null,
    assessment_id: assessmentId || null,
    student_profile: studentProfile || null,  // 新增：学生画像（AI原生核心）
  };

  console.log('[cloudApi] startAssessment payload:', JSON.stringify(payload));
  return callCloudFunction('startAssessment', payload, FUNCTION_TIMEOUTS.startAssessment);
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
  }, FUNCTION_TIMEOUTS.submitPracticeResult);
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
 * @param {string} subject - 可选，科目名称（如 '数学'）
 * @param {string} grade - 可选，年级名称（如 '一年级'）
 *
 * 修复说明：即使 kp_progress 记录缺少 grade/subject 字段，
 * 也会通过 knowledge_points 集合获取权威数据进行过滤
 */
function getKpProgress(subject, grade) {
  return new Promise((resolve, reject) => {
    initCloud();
    if (!wx || !wx.cloud) {
      console.error('[cloudApi] getKpProgress: wx.cloud not available');
      resolve({ success: false, data: [], error: '云服务不可用' });
      return;
    }
    const db = wx.cloud.database();

    // 科目映射：显示名→存储名（1-9年级全科）
    const subjectMapDb = { '语文': 'chinese', '数学': 'math', '英语': 'english', '物理': 'physics', '化学': 'chemistry', '生物': 'biology', '历史': 'history', '地理': 'geography', '政治': 'politics' };
    // 年级映射：显示名→存储名（1-9年级全覆盖）
    const gradeMapDb = { '一年级': '1', '二年级': '2', '三年级': '3', '四年级': '4', '五年级': '5', '六年级': '6', '七年级': '7', '八年级': '8', '九年级': '9' };

    const dbSubject = subject ? (subjectMapDb[subject] || subject) : null;
    const dbGrade = grade ? (gradeMapDb[grade] || grade) : null;

    console.log('[cloudApi] getKpProgress:', { subject, grade, dbSubject, dbGrade });

    // 第一步：查询所有 kp_progress 记录（按 student_id）
    // 不依赖 grade/subject 字段，因为这些字段可能缺失
    const baseQuery = { student_id: app.globalData.studentId || null };
    const query = { ...baseQuery };

    // 从 knowledge_points 获取 grade/subject 信息用于过滤
    if (dbSubject || dbGrade) {
      query.grade = dbGrade;
      query.subject = dbSubject;
    }

    db.collection('kp_progress')
      .where(baseQuery)
      .get()
      .then(res => {
        const allRecords = res.data || [];
        console.log('[cloudApi] getKpProgress 查询到记录数:', allRecords.length);

        // 如果没有提供科目年级过滤条件，返回全部
        if (!dbSubject && !dbGrade) {
          console.log('[cloudApi] getKpProgress 无过滤条件，返回全部');
          resolve({ success: true, data: allRecords });
          return;
        }

        // 第二步：批量查询 knowledge_points 获取权威的 grade/subject 数据
        const kpIds = allRecords.map(r => r.kp_id).filter(Boolean);
        if (kpIds.length === 0) {
          console.log('[cloudApi] getKpProgress 无有效 kp_id');
          resolve({ success: true, data: [] });
          return;
        }

        // 使用 db.command.in 批量查询
        const _ = db.command;
        db.collection('knowledge_points')
          .where({ kp_id: _.in(kpIds) })
          .field({ kp_id: true, grade: true, subject: true })
          .get()
          .then(kpRes => {
            // 构建 kp_id → {grade, subject} 映射
            const kpInfoMap = {};
            (kpRes.data || []).forEach(kp => {
              kpInfoMap[kp.kp_id] = {
                grade: kp.grade,
                subject: kp.subject
              };
            });

            console.log('[cloudApi] getKpProgress knowledge_points 查询结果数:', Object.keys(kpInfoMap).length);

            // 第三步：在内存中过滤，使用 knowledge_points 的权威数据
            const filtered = allRecords.filter(record => {
              const kpInfo = kpInfoMap[record.kp_id];
              if (!kpInfo) {
                console.log('[cloudApi] getKpProgress kp_id 在 knowledge_points 中未找到:', record.kp_id);
                return false;
              }

              // subject 映射：中文名 → 存储名
              const subjectToDb = { '语文': 'chinese', '数学': 'math', '英语': 'english', '物理': 'physics', '化学': 'chemistry', '生物': 'biology', '历史': 'history', '地理': 'geography', '政治': 'politics' };
              const kpSubjectDb = subjectToDb[kpInfo.subject] || kpInfo.subject;

              const gradeMatch = !dbGrade || String(kpInfo.grade) === String(dbGrade);
              const subjectMatch = !dbSubject || kpSubjectDb === dbSubject;

              return gradeMatch && subjectMatch;
            });

            console.log('[cloudApi] getKpProgress 过滤后记录数:', filtered.length);
            resolve({ success: true, data: filtered });
          })
          .catch(err => {
            console.error('[cloudApi] getKpProgress knowledge_points 查询失败:', err);
            // 如果 knowledge_points 查询失败，返回空数组而不是失败
            resolve({ success: true, data: [], error: 'knowledge_points 查询失败' });
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
      correct: kp.correct,
      total: kp.total,
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
    if (!wx || !wx.cloud) {
      console.error('[cloudApi] getLatestDiagnosis: wx.cloud not available');
      resolve({ kp_stats: [], assessment_id: null, score_percent: 0 });
      return;
    }
    const db = wx.cloud.database();

    // 科目映射：显示名→存储名
    const subjectMapDb = { '语文': 'chinese', '数学': 'math', '英语': 'english', '物理': 'physics', '化学': 'chemistry', '生物': 'biology', '历史': 'history', '地理': 'geography', '政治': 'politics' };
    // 年级映射：显示名→存储名（1-9年级全覆盖）
    const gradeMapDb = { '一年级': '1', '二年级': '2', '三年级': '3', '四年级': '4', '五年级': '5', '六年级': '6', '七年级': '7', '八年级': '8', '九年级': '9' };

    const dbSubject = subject ? (subjectMapDb[subject] || subject) : null;
    const dbGrade = grade ? (gradeMapDb[grade] || grade) : null;

    console.log('[cloudApi] getLatestDiagnosis:', { subject, grade, dbSubject, dbGrade });
    console.log('[cloudApi] getLatestDiagnosis - 构建的查询条件详情:', {
      '原始subject': subject,
      '原始grade': grade,
      '映射后subject': dbSubject,
      '映射后grade': dbGrade,
      '最终查询条件': { status: 'completed', ...(dbGrade && { grade: dbGrade }), ...(dbSubject && { subject: dbSubject }) }
    });

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
    if (!wx || !wx.cloud) {
      console.error('[cloudApi] getAssessmentList: wx.cloud not available');
      resolve({ assessments: [] });
      return;
    }
    const db = wx.cloud.database();

    // 科目映射：显示名→存储名
    const subjectMapDb = { '语文': 'chinese', '数学': 'math', '英语': 'english', '物理': 'physics', '化学': 'chemistry', '生物': 'biology', '历史': 'history', '地理': 'geography', '政治': 'politics' };
    // 年级映射：显示名→存储名（1-9年级全覆盖）
    const gradeMapDb = { '一年级': '1', '二年级': '2', '三年级': '3', '四年级': '4', '五年级': '5', '六年级': '6', '七年级': '7', '八年级': '8', '九年级': '9' };

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

// ========== 队列 API ==========

/**
 * 检查队列任务状态
 * @param {string} queueId - 队列任务ID
 * @returns {Promise<Object>} 状态信息
 */
function checkQueueStatus(queueId) {
  if (!queueId) {
    return Promise.reject(new Error('缺少queue_id参数'));
  }
  return callCloudFunction('checkQueueStatus', { queue_id: queueId }, FUNCTION_TIMEOUTS.checkQueueStatus);
}

/**
 * 轮询队列任务状态直到完成
 * @param {string} queueId - 队列任务ID
 * @param {Object} options - 轮询选项
 * @param {number} options.maxAttempts - 最大尝试次数（默认300次，约25分钟）
 * @param {number} options.intervalMs - 轮询间隔（默认5000ms）
 * @param {Function} options.onProgress - 进度回调
 * @returns {Promise<Object>} 最终状态
 */
function pollQueueStatus(queueId, options = {}) {
  const {
    maxAttempts = 300,
    intervalMs = 5000,
    onProgress = null
  } = options;

  let attempts = 0;

  function poll() {
    return checkQueueStatus(queueId)
      .then(result => {
        attempts++;

        // checkQueueStatus已经解包了data，直接访问result
        const status = result.status;

        // 通知进度
        if (onProgress) {
          onProgress({
            attempt: attempts,
            maxAttempts: maxAttempts,
            status: status
          });
        }

        // 检查是否需要继续轮询
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          // 终态：返回结果
          return {
            status: status,
            assessment_id: result.assessment_id,
            error: result.error,
            retry_count: result.retry_count,
            exceededMaxAttempts: false
          };
        }

        // 检查是否超过最大尝试次数
        if (attempts >= maxAttempts) {
          return {
            status: status || 'timeout',
            exceededMaxAttempts: true,
            attempts: attempts
          };
        }

        // 继续轮询
        return new Promise((resolve) => {
          setTimeout(() => {
            poll().then(resolve);
          }, intervalMs);
        });
      });
  }

  return poll();
}

/**
 * 取消队列任务
 * @param {string} queueId - 队列任务ID
 * @returns {Promise<Object>} 取消结果
 */
function cancelQueueTask(queueId) {
  if (!queueId) {
    return Promise.reject(new Error('缺少queue_id参数'));
  }
  return callCloudFunction('cancelQueueTask', { queue_id: queueId });
}

// ========== 导出 ==========


// ========== 数据埋点 API ==========

/**
 * 追踪用户行为事件（非阻塞，静默失败）
 * @param {string} event - 事件名称
 * @param {Object} data - 事件数据
 */
function track(event, data) {
  try {
    const _wx = getWx();
    if (!_wx || !_wx.cloud) return;

    initCloud();

    _wx.cloud.callFunction({
      name: 'analytics',
      data: {
        action: 'track',
        event: event,
        data: data || {}
      },
      success: function() { /* silent */ },
      fail: function() { /* silent */ }
    });
  } catch (e) {
    // 埋点永远不应影响主流程
  }
}

/**
 * 批量追踪事件（非阻塞）
 * @param {Array<{event: string, data: Object}>} events
 */
function trackBatch(events) {
  try {
    const _wx = getWx();
    if (!_wx || !_wx.cloud) return;

    initCloud();

    _wx.cloud.callFunction({
      name: 'analytics',
      data: {
        action: 'batch',
        events: events
      },
      success: function() { /* silent */ },
      fail: function() { /* silent */ }
    });
  } catch (e) {
    // 埋点永远不应影响主流程
  }
}

/**
 * 查询统计数据（管理后台用）
 * @param {Object} params - { start_date, end_date, event, group_by }
 */
function getAnalyticsStats(params) {
  return callCloudFunction('analytics', { action: 'stats', ...params });
}

module.exports = {
  // 核心 API
  startAssessment,
  submitAssessmentAnswer,
  finishAssessment,
  startPractice,
  getAssessmentList,

  // 诊断 API
  analyzeWeakPoints,
  getLatestDiagnosis,

  // 练习 API
  submitPracticeResult,
  checkRetestEligibility,

  // 进度 API
  getKpProgress,

  // 队列 API
  checkQueueStatus,
  pollQueueStatus,
  cancelQueueTask,

  // 直接调用云函数
  callCloudFunction,

  // 数据埋点
  track,
  trackBatch,
  getAnalyticsStats,
};
