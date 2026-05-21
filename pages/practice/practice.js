console.log('=== [CLOUD] practice.js LOADED ===');
const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    sessionId: null,
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    loading: true,
    submitted: false,
    questionStartTime: null,
    selectedOption: null,
    answers: {},
    questionResults: {},
    kpName: '',
    progress: 0,
    weakPoints: [],
    assessmentId: null,
    isBrowsingHistory: false
  },

  onLoad(query) {
    // 优先从 URL 参数获取
    let kpName = query.kpName || null;
    let kpId = query.kpId || null;
    let assessmentId = query.assessmentId || null;
    let weakPoints = null;

    // 从 path 页面 switchTab 过来时，读取 weakPoints 和 assessmentId
    if (app.targetWeakPoints) {
      weakPoints = app.targetWeakPoints;
      app.targetWeakPoints = null;
      console.log('[practice] using targetWeakPoints:', weakPoints);
    }

    // 读取 assessment_id
    if (app.targetAssessmentId) {
      assessmentId = app.targetAssessmentId;
      app.targetAssessmentId = null;
      console.log('[practice] using targetAssessmentId:', assessmentId);
    }

    // 兼容旧逻辑：如果没有 weakPoints，尝试读取 targetKpId
    if (!weakPoints && !kpId && app.targetKpId) {
      kpId = app.targetKpId;
      kpName = app.targetKpName || '专项练习';
      app.targetKpId = null;
      app.targetKpName = null;
      console.log('[practice] using targetKpId:', kpId, kpName);
    }

    if (!kpName) {
      kpName = weakPoints ? weakPoints[0]?.kp_name : '专项练习';
    }

    this.setData({ kpName, kpId, weakPoints, assessmentId }, () => {
      this.initPractice();
    });
  },

  onShow() {
    // 当从 path 页面 switchTab 过来时，可能需要重新初始化
    if (app.targetWeakPoints && !this.data.sessionId) {
      const weakPoints = app.targetWeakPoints;
      app.targetWeakPoints = null;
      const assessmentId = app.targetAssessmentId || null;
      if (app.targetAssessmentId) {
        app.targetAssessmentId = null;
      }
      console.log('[practice] onShow: using targetWeakPoints:', weakPoints);
      console.log('[practice] onShow: using targetAssessmentId:', assessmentId);

      this.setData({
        weakPoints: weakPoints,
        kpName: weakPoints[0]?.kp_name || '专项练习',
        kpId: weakPoints[0]?.kp_id || null,
        assessmentId: assessmentId,
      }, () => {
        this.initPractice();
      });
    }
  },

  async initPractice() {
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await api.startPractice(
        this.data.kpId,
        this.data.kpName,
        5,
        this.data.weakPoints
      );
      console.log('[practice] init result:', res);

      const questions = res.questions || [];
      if (questions.length === 0) {
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      // 解析 options: 支持两种格式
      // 1. 字符串数组: ["A. 5", "B. 10", ...] 或 ["5", "10", ...]
      // 2. 对象数组: [{key: "A", value: "5"}, {key: "B", value: "10"}, ...]
      const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
      questions.forEach(function(q) {
        if (!q.options) {
          q.parsedOptions = [];
          return;
        }
        if (typeof q.options[0] === 'string') {
          // 字符串数组格式
          q.parsedOptions = q.options.map(function(opt, idx) {
            var dotIdx = opt.indexOf('. ');
            if (dotIdx > 0) {
              return { key: opt.substring(0, dotIdx), value: opt.substring(dotIdx + 2) };
            }
            // 纯字符串格式：使用 A/B/C/D 作为 key
            return { key: keys[idx] || String.fromCharCode(65 + idx), value: opt };
          });
        } else if (typeof q.options[0] === 'object') {
          // 对象数组格式: [{key: "A", value: "5"}, ...]
          q.parsedOptions = q.options.map(function(opt) {
            return { key: opt.key || opt.label || '', value: opt.value || opt.text || '' };
          });
        }
      });

      this.setData({
        sessionId: res.session_id,
        questions: questions,
        currentQuestion: questions[0],
        loading: false,
        questionStartTime: Date.now(),
        kpName: this.data.kpName,
        progress: 0
      });
      console.log('[practice] first question:', questions[0]);
      console.log('[practice] options format:', JSON.stringify(questions[0].options, null, 2));
      console.log('[practice] options type:', typeof questions[0].options);
      console.log('[practice] options is array:', Array.isArray(questions[0].options));
      console.log('[practice] options length:', questions[0].options?.length);
      console.log('[practice] options[0]:', questions[0].options?.[0]);
      console.log('[practice] correct_answer:', questions[0].correct_answer);
      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      console.error('[practice] init error:', e);
      wx.showToast({ title: '网络错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  selectOption(e) {
    const option = e.currentTarget.dataset.option;
    const { currentQuestion, currentIndex, questions, answers, questionResults } = this.data;
    const isCorrect = option === currentQuestion.correct_answer;

    // 记录答案
    answers[currentQuestion.id] = {
      question_id: currentQuestion.id,
      answer: option,
      is_correct: isCorrect
    };

    // 记录结果用于显示标记
    questionResults[currentQuestion.id] = {
      isCorrect: isCorrect,
      correctAnswer: currentQuestion.correct_answer
    };

    this.setData({ selectedOption: option, answers, questionResults });

    // 显示反馈
    if (isCorrect) {
      wx.showToast({ title: '正确!', icon: 'success', duration: 800 });
    } else {
      wx.showToast({ title: '错误: ' + currentQuestion.correct_answer, icon: 'none', duration: 1500 });
    }

    // 如果处于历史浏览模式，不自动跳转
    if (this.data.isBrowsingHistory) {
      return;
    }

    // 跳转下一题
    const nextIndex = currentIndex + 1;
    if (nextIndex >= questions.length) {
      // 最后一题，等待反馈后留在当前页面，由用户点击提交
      return;
    }

    setTimeout(() => {
      this.setData({
        currentIndex: nextIndex,
        currentQuestion: questions[nextIndex],
        selectedOption: null,
        questionStartTime: Date.now(),
        progress: Math.round(((nextIndex + 1) / questions.length) * 100),
        isBrowsingHistory: false
      });
    }, isCorrect ? 800 : 1500);
  },

  goPrevQuestion() {
    const { currentIndex, questions, answers, questionResults } = this.data;
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      const prevQuestion = questions[prevIndex];
      const savedAnswer = answers[prevQuestion.id];

      this.setData({
        currentIndex: prevIndex,
        currentQuestion: prevQuestion,
        selectedOption: savedAnswer ? savedAnswer.answer : null,
        questionStartTime: Date.now(),
        progress: Math.round((prevIndex / questions.length) * 100),
        isBrowsingHistory: true
      });
    }
  },

  goNextQuestion() {
    const { currentIndex, questions, answers, questionResults } = this.data;
    const nextIndex = currentIndex + 1;
    if (nextIndex < questions.length) {
      const nextQuestion = questions[nextIndex];
      const savedAnswer = answers[nextQuestion.id];

      this.setData({
        currentIndex: nextIndex,
        currentQuestion: nextQuestion,
        selectedOption: savedAnswer ? savedAnswer.answer : null,
        questionStartTime: Date.now(),
        progress: Math.round(((nextIndex + 1) / questions.length) * 100),
        isBrowsingHistory: true
      });
    }
  },

  submitAll() {
    this.setData({ loading: true });

    // 批量提交答案到 kp_progress
    const submitPromises = [];
    const answersArray = Object.values(this.data.answers);

    for (const answer of answersArray) {
      const question = this.data.questions.find(q => q.id === answer.question_id);
      if (question) {
        submitPromises.push(
          api.submitPracticeResult({
            kp_id: question.knowledge_point_id,
            difficulty: question.difficulty || 'easy',
            is_correct: answer.is_correct,
            assessment_id: this.data.assessmentId,
          }).catch(e => {
            console.error('[practice] submitPracticeResult error:', e);
          })
        );
      }
    }

    // 等待所有提交完成
    Promise.all(submitPromises).then(() => {
      // 修复：answers 是对象不是数组，必须使用 answersArray
      const correctCount = answersArray.filter(a => a.is_correct).length;
      const total = this.data.questions.length;

      // 计算知识点统计（参考 assessment 的 submitAnswer 逻辑）
      const kpStats = {};
      for (const answer of answersArray) {
        const question = this.data.questions.find(q => q.id === answer.question_id);
        if (!question) continue;

        const kpId = question.knowledge_point_id || 'unknown';
        const kpName = question.knowledge_point || '未知知识点';

        if (!kpStats[kpId]) {
          kpStats[kpId] = { kp_id: kpId, kp_name: kpName, correct: 0, total: 0 };
        }
        kpStats[kpId].total++;
        if (answer.is_correct) {
          kpStats[kpId].correct++;
        }
      }

      // 将 kpStats 转为数组并编码为 URL 参数
      const kpStatsArray = Object.values(kpStats);
      const kpStatsParam = encodeURIComponent(JSON.stringify(kpStatsArray));

      wx.redirectTo({
        url: `/pages/result/result?mode=practice&correct=${correctCount}&total=${total}&kpStats=${kpStatsParam}`
      });
    });
  }
});