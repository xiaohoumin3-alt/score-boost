/**
 * Assessment Depth Page - 深度测评页面
 * 两阶段自适应测评：Phase 1 (5题) → 精度判断 → Phase 2 (动态扩展) → 最终报告
 */

const app = getApp();

const QUEUE_POLL_MAX_ATTEMPTS = 45;
const QUEUE_POLL_INTERVAL_MS = 2000;
const QUEUE_RETRY_DELAY_MS = 500;

Page({
  data: {
    status: 'loading',
    sessionId: '',
    phase: 'first',
    questions: [],
    currentQuestion: null,
    currentOptions: [],
    currentIndex: 0,
    answers: {},
    optionLabels: ['A', 'B', 'C', 'D'],
    phase1Completed: false,
    accuracyMeter: null,
    extensionRecommendation: null,
    currentSE: 1.0,
    progress: null,
    finalResult: null,
    showResult: false,
    grade: '',
    subject: '',
    queueId: '',
    queuePollTimer: null,
    queuePollAttempts: 0,
    queueMessage: '',
    queueRetryTimer: null,
    hasRetriedAfterQueue: false,
    errorMessage: ''
  },

  onLoad(options) {
    // 从 URL 参数获取年级和科目（已经是数字和英文格式）
    // 回退到 globalData（可能是数字字符串或中文格式）
    let grade = options.grade || app.globalData.grade || '3';
    let subject = options.subject || app.globalData.subject || '数学';

    // 如果 grade 已经是数字，直接使用；否则进行映射
    const numericGrade = parseInt(grade) || this.mapGradeToNumber(grade) || 3;

    // 映射科目到英文
    const normalizedSubject = this.mapSubjectToEnglish(subject) || 'math';

    console.log('[assessment-depth] 原始参数:', { grade, subject });
    console.log('[assessment-depth] 映射后:', { numericGrade, normalizedSubject });

    // 更新 data
    this.setData({ grade: numericGrade, subject: normalizedSubject });
    this.startExtendedAssessment();
  },

  /**
   * 将年级转换为数字（支持中文和数字字符串）
   */
  mapGradeToNumber(grade) {
    const gradeMap = {
      '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '一年级': 1, '二年级': 2, '三年级': 3, '四年级': 4, '五年级': 5, '六年级': 6,
      '七年级': 7, '八年级': 8, '九年级': 9
    };
    return gradeMap[String(grade)];
  },

  /**
   * 将科目转换为英文
   */
  mapSubjectToEnglish(subject) {
    const subjectMap = {
      '语文': 'chinese', '数学': 'math', '英语': 'english',
      '物理': 'physics', '化学': 'chemistry', '生物': 'biology',
      '历史': 'history', '地理': 'geography', '政治': 'politics',
      'chinese': 'chinese', 'math': 'math', 'english': 'english',
      'physics': 'physics', 'chemistry': 'chemistry', 'biology': 'biology',
      'history': 'history', 'geography': 'geography', 'politics': 'politics'
    };
    return subjectMap[String(subject)];
  },

  parseQuestionOptions(q) {
    if (q.options && q.options.length > 0) {
      if (typeof q.options[0] === 'object' && q.options[0].value) {
        return { ...q, parsedOptions: q.options.map(o => o.value) };
      }
      if (typeof q.options[0] === 'string') {
        const hasDotPrefix = q.options[0].includes('. ');
        if (hasDotPrefix) {
          return { ...q, parsedOptions: q.options.map(o => o.replace(/^[A-D]\.\s*/, '')) };
        }
        return { ...q, parsedOptions: q.options };
      }
    }
    return { ...q, parsedOptions: q.options || [] };
  },

  buildCurrentQuestionState(questions, currentIndex, answers = this.data.answers) {
    const currentQuestion = questions[currentIndex] || null;
    const parsedOptions = currentQuestion?.parsedOptions || [];
    const currentOptions = parsedOptions.map((text, index) => ({
      label: this.data.optionLabels[index],
      text,
      selected: answers[currentIndex] === this.data.optionLabels[index]
    }));
    return { currentQuestion, currentOptions };
  },

  async startExtendedAssessment(options = {}) {
    try {
      const { grade, subject } = this.data;
      const requestData = { action: 'startExtendedAssessment', grade, subject };
      if (options.after_queue_id) {
        requestData.after_queue_id = options.after_queue_id;
      }

      const result = await wx.cloud.callFunction({
        name: 'extendedAssessment',
        data: requestData
      });

      if (result.result.success) {
        if (result.result.status === 'queued') {
          this.setData({
            status: 'queued',
            queueId: result.result.queue_id,
            queueMessage: result.result.message || '题目生成中，请稍候...',
            errorMessage: ''
          });
          this.startQueuePolling(result.result.queue_id);
          return;
        }

        const { session_id, questions, target_se, estimated_time } = result.result;

        if (!session_id || !questions || questions.length === 0) {
          this.showError('题目生成后仍不足，请稍后再试');
          return;
        }

        // 解析选项格式：将字符串数组或对象数组统一为纯文本数组
        const parsedQuestions = (questions || []).map(q => this.parseQuestionOptions(q));

        const currentState = this.buildCurrentQuestionState(parsedQuestions, 0, {});
        this.setData({
          sessionId: session_id,
          questions: parsedQuestions,
          currentIndex: 0,
          answers: {},
          ...currentState,
          status: 'ready',
          targetSE: target_se,
          estimatedTime: estimated_time,
          errorMessage: ''
        });
      } else {
        const error = result.result.error;
        if (error?.code === 'INSUFFICIENT_QUESTIONS_AFTER_GENERATION') {
          this.showError(error.message || '题目生成后仍不足，请稍后再试');
          return;
        }
        this.showError(error?.message || '启动测评失败');
      }
    } catch (e) {
      console.error('startExtendedAssessment failed:', e);
      this.showError('网络错误，请重试');
    }
  },

  startQueuePolling(queueId) {
    this.stopQueuePolling();
    this.setData({ queueId, queuePollAttempts: 0 });

    const timer = setInterval(async () => {
      const attempts = this.data.queuePollAttempts + 1;
      this.setData({ queuePollAttempts: attempts });

      if (attempts >= QUEUE_POLL_MAX_ATTEMPTS) {
        this.showError('题目生成超时，请稍后重试');
        this.stopQueuePolling();
        return;
      }

      try {
        const result = await wx.cloud.callFunction({
          name: 'checkQueueStatus',
          data: { queue_id: queueId }
        });
        const payload = result.result || {};
        if (payload.success === false) {
          this.showError(payload.error || '队列状态查询失败，请重试');
          this.stopQueuePolling();
          return;
        }
        const queue = payload.data || {};
        const status = queue.status;

        if (status === 'pending' || status === 'processing') {
          this.setData({ queueMessage: queue.message || '题目生成中，请稍候...' });
          return;
        }

        if (status === 'completed') {
          const questionIds = queue.question_ids || [];
          if (questionIds.length === 0) {
            this.showError('题目生成完成但没有可用题目，请重试');
            this.stopQueuePolling();
            return;
          }

          this.stopQueuePolling();
          if (this.data.hasRetriedAfterQueue) {
            this.showError('题目生成后仍不足，请稍后再试');
            return;
          }

      const retryTimer = setTimeout(() => {
            this.startExtendedAssessment({ after_queue_id: queueId });
          }, QUEUE_RETRY_DELAY_MS);
          this.queueRetryTimer = retryTimer;
          this.setData({ hasRetriedAfterQueue: true });
          return;
        }

        if (status === 'failed' || status === 'cancelled' || status === 'timeout') {
          const fallbackMessage = status === 'timeout' ? '题目生成超时，请重试' : '题目生成失败，请重试';
          this.showError(queue.error || queue.message || fallbackMessage);
          this.stopQueuePolling();
        }
      } catch (e) {
        console.error('checkQueueStatus failed:', e);
      }
    }, QUEUE_POLL_INTERVAL_MS);

    this.queuePollTimer = timer;
  },

  stopQueuePolling() {
    if (this.queuePollTimer) {
      clearInterval(this.queuePollTimer);
    }
    if (this.queueRetryTimer) {
      clearTimeout(this.queueRetryTimer);
    }
    this.queuePollTimer = null;
    this.queueRetryTimer = null;
    this.setData({ queuePollTimer: null, queueRetryTimer: null });
  },

  onAnswerSelect(e) {
    const { questionIndex } = e.currentTarget.dataset;
    const { option } = e.currentTarget.dataset;
    const answers = { ...this.data.answers };
    answers[questionIndex] = option;
    const currentState = this.buildCurrentQuestionState(this.data.questions, this.data.currentIndex, answers);
    this.setData({ answers, ...currentState });
  },

  async onSubmitPhase1() {
    const { sessionId, questions, answers } = this.data;

    if (Object.keys(answers).length !== questions.length) {
      wx.showToast({ title: '请完成所有题目', icon: 'none' });
      return;
    }

    this.setData({ status: 'submitting' });

    try {
      const answerList = questions.map((q, i) => ({
        question_id: q.question_id || q.id,
        answer: answers[i]
      }));

      const result = await wx.cloud.callFunction({
        name: 'extendedAssessment',
        data: { action: 'submitPhase1Answers', session_id: sessionId, answers: answerList }
      });

      if (result.result.success) {
        const { data } = result.result;
        this.setData({
          phase1Completed: true,
          accuracyMeter: data.accuracy_meter,
          extensionRecommendation: data.extension_recommendation,
          currentSE: data.ability_estimate?.se || 1.0,
          status: 'phase1_completed'
        });
      } else {
        this.showError(result.result.error?.message || '提交失败');
      }
    } catch (e) {
      console.error('submitPhase1Answers failed:', e);
      this.showError('网络错误，请重试');
    }
  },

  async onContinueAssessment() {
    this.setData({ status: 'loading' });

    try {
      const result = await wx.cloud.callFunction({
        name: 'extendedAssessment',
        data: { action: 'getNextQuestion', session_id: this.data.sessionId }
      });

      if (result.result.success) {
        const { question, current_se, progress } = result.result;
        const parsedQuestion = this.parseQuestionOptions(question);
        const nextQuestions = [...this.data.questions, parsedQuestion];
        const nextIndex = this.data.questions.length;
        const currentState = this.buildCurrentQuestionState(nextQuestions, nextIndex);
        this.setData({
          questions: nextQuestions,
          currentIndex: nextIndex,
          ...currentState,
          currentSE: current_se,
          progress,
          phase: 'second',
          status: 'ready'
        });
      } else if (result.result.error?.code === 'TARGET_REACHED' || result.result.error?.code === 'MAX_QUESTIONS_REACHED') {
        this.onCompleteAssessment();
      } else {
        this.showError(result.result.error?.message || '获取下一题失败');
      }
    } catch (e) {
      console.error('getNextQuestion failed:', e);
      this.showError('网络错误，请重试');
    }
  },

  async onSubmitPhase2() {
    const { sessionId, questions, currentIndex, answers } = this.data;
    const question = questions[currentIndex];

    if (!answers[currentIndex]) {
      wx.showToast({ title: '请选择答案', icon: 'none' });
      return;
    }

    this.setData({ status: 'submitting' });

    try {
      const result = await wx.cloud.callFunction({
        name: 'extendedAssessment',
        data: {
          action: 'submitAnswers',
          session_id: sessionId,
          answers: [{ question_id: question.question_id || question.id, answer: answers[currentIndex] }]
        }
      });

      if (result.result.success) {
        const { data } = result.result;
        this.setData({
          accuracyMeter: data.accuracy_meter,
          extensionRecommendation: data.recommendation,
          currentSE: data.current_se
        });

        if (data.recommendation?.should_extend) {
          this.onContinueAssessment();
        } else {
          this.onCompleteAssessment();
        }
      } else {
        this.showError(result.result.error?.message || '提交失败');
      }
    } catch (e) {
      console.error('submitAnswers failed:', e);
      this.showError('网络错误，请重试');
    }
  },

  async onCompleteAssessment() {
    this.setData({ status: 'completing' });

    try {
      const result = await wx.cloud.callFunction({
        name: 'extendedAssessment',
        data: { action: 'completeAssessment', session_id: this.data.sessionId }
      });

      if (result.result.success) {
        this.setData({
          finalResult: result.result.data,
          showResult: true,
          status: 'completed'
        });
      } else {
        this.showError(result.result.error?.message || '完成测评失败');
      }
    } catch (e) {
      console.error('completeAssessment failed:', e);
      this.showError('网络错误，请重试');
    }
  },

  showError(msg) {
    this.setData({ status: 'error', errorMessage: msg });
    wx.showToast({ title: msg, icon: 'none' });
  },

  onRetry() {
    this.stopQueuePolling();
    this.setData({
      status: 'loading',
      sessionId: '',
      phase: 'first',
      questions: [],
      currentQuestion: null,
      currentOptions: [],
      currentIndex: 0,
      answers: {},
      phase1Completed: false,
      accuracyMeter: null,
      extensionRecommendation: null,
      currentSE: 1.0,
      progress: null,
      finalResult: null,
      showResult: false,
      queueId: '',
      queuePollAttempts: 0,
      queueMessage: '',
      hasRetriedAfterQueue: false,
      errorMessage: ''
    });
    this.startExtendedAssessment();
  },

  onUnload() {
    this.stopQueuePolling();
  }
});
