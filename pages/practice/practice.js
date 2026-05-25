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
    // 检查登录状态
    if (!app.checkLogin()) {
      app.requireLogin();
      return;
    }

    // 优先从 URL 参数获取
    let kpName = query.kpName || null;
    let kpId = query.kpId || null;
    let assessmentId = query.assessmentId || null;
    let weakPoints = null;

    // 从 path 页面 switchTab 过来时，读取 weakPoints 和 assessmentId
    if (app.targetWeakPoints) {
      weakPoints = app.targetWeakPoints;
      app.targetWeakPoints = null;
    }

    // 读取 assessment_id
    if (app.targetAssessmentId) {
      assessmentId = app.targetAssessmentId;
      app.targetAssessmentId = null;
    }

    // 兼容旧逻辑：如果没有 weakPoints，尝试读取 targetKpId
    if (!weakPoints && !kpId && app.targetKpId) {
      kpId = app.targetKpId;
      kpName = app.targetKpName || '专项练习';
      app.targetKpId = null;
      app.targetKpName = null;
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

  /**
   * 获取学生画像（AI原生核心）
   * 从Memory系统获取或使用默认值
   */
  getStudentProfile() {
    var self = this;
    return new Promise(function(resolve, reject) {
      wx.cloud.callFunction({
        name: 'studentMemory',
        data: { action: 'get', student_id: app.globalData.studentId }
      }).then(function(memoryResult) {
        if (memoryResult.result && memoryResult.result.success && memoryResult.result.data) {
          var memory = memoryResult.result.data;
          console.log('[Practice] Memory loaded:', memory);
          resolve({
            weak_points: (memory.summary && memory.summary.weak_points || []).map(function(wp) { return wp.kp_name; }),
            mastered: memory.summary && memory.summary.mastered || [],
            learning_style: memory.profile && memory.profile.learning_style || 'visual',
            error_patterns: (memory.summary && memory.summary.weak_points || []).map(function(wp) { return wp.pattern; }).filter(Boolean),
            recent_mistakes: [],
            avg_time_per_question: memory.profile && memory.profile.avg_time_per_question || 90
          });
        } else {
          resolve({
            weak_points: [],
            mastered: [],
            learning_style: 'visual',
            error_patterns: [],
            recent_mistakes: [],
            avg_time_per_question: 90
          });
        }
      }).catch(function(e) {
        console.log('[Practice] Get memory failed (non-critical):', e.message);
        resolve({
          weak_points: [],
          mastered: [],
          learning_style: 'visual',
          error_patterns: [],
          recent_mistakes: [],
          avg_time_per_question: 90
        });
      });
    });
  }

  initPractice() {
    var self = this;
    wx.showLoading({ title: '加载中...' });

    // 新增：获取学生画像（AI原生核心）
    this.getStudentProfile().then(function(studentProfile) {
      console.log('[Practice] Student profile loaded:', studentProfile);

      return api.startPractice(
        self.data.kpId,
        self.data.kpName,
        5,
        self.data.weakPoints,
        null,
        studentProfile
      );
    }).then(function(res) {
      var questions = res.questions || [];
      if (questions.length === 0) {
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
        setTimeout(function() {
          wx.navigateBack();
        }, 1500);
        return;
      }

      // 解析 options: 支持两种格式
      var keys = ['A', 'B', 'C', 'D', 'E', 'F'];
      questions.forEach(function(q) {
        if (!q.options) {
          q.parsedOptions = [];
          return;
        }
        if (typeof q.options[0] === 'string') {
          q.parsedOptions = q.options.map(function(opt, idx) {
            var dotIdx = opt.indexOf('. ');
            if (dotIdx > 0) {
              return { key: opt.substring(0, dotIdx), value: opt.substring(dotIdx + 2) };
            }
            return { key: keys[idx] || String.fromCharCode(65 + idx), value: opt };
          });
        } else if (typeof q.options[0] === 'object') {
          q.parsedOptions = q.options.map(function(opt) {
            return { key: opt.key || opt.label || '', value: opt.value || opt.text || '' };
          });
        }
      });

      self.setData({
        sessionId: res.session_id,
        questions: questions,
        currentQuestion: questions[0],
        loading: false,
        questionStartTime: Date.now(),
        kpName: self.data.kpName,
        progress: 0
      });
      wx.hideLoading();
    }).catch(function(e) {
      wx.hideLoading();
      console.error('[initPractice] Error:', e);
      wx.showToast({ title: '网络错误', icon: 'none' });
      setTimeout(function() {
        wx.navigateBack();
      }, 1500);
    });
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

      // 显示典型错误
      const mistakes = currentQuestion.typical_mistakes || [];
      if (mistakes.length > 0) {
        setTimeout(() => {
          wx.showModal({
            title: '💡 常见错误',
            content: mistakes.slice(0, 2).join('\n'),
            showCancel: false,
            confirmText: '知道了'
          });
        }, 1600);
      }
    }

    // 如果处于历史浏览模式，修改答案后清除浏览模式（但仍不自动跳转）
    if (this.data.isBrowsingHistory) {
      this.setData({ isBrowsingHistory: false });
      return;
    }

    // 跳转下一题
    const nextIndex = currentIndex + 1;
    if (nextIndex >= questions.length) {
      // 最后一题：清除浏览模式标志，等待反馈后留在当前页面
      this.setData({ isBrowsingHistory: false });
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

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({
        current: url,
        urls: [url]
      });
    }
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
        progress: Math.round(((nextIndex + 1) / questions.length) * 100)
        // goNextQuestion 不设置浏览模式，让用户可以退出浏览
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
          }).catch(() => {})
        );
      }
    }

    // 等待所有提交完成，收集复习时间
    Promise.all(submitPromises).then((results) => {
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

      // 获取最早的复习时间（取所有知识点中最近的复习时间）
      const nextReviewDates = results
        .filter(r => r.result?.data?.data?.next_review_at)
        .map(r => new Date(r.result.data.data.next_review_at).getTime());

      const nextReviewAt = nextReviewDates.length > 0
        ? Math.min(...nextReviewDates)
        : null;

      // 将 kpStats 转为数组并编码为 URL 参数
      const kpStatsArray = Object.values(kpStats);
      const kpStatsParam = encodeURIComponent(JSON.stringify(kpStatsArray));

      const params = [
        `mode=practice`,
        `correct=${correctCount}`,
        `total=${total}`,
        `kpStats=${kpStatsParam}`
      ];

      if (nextReviewAt) {
        params.push(`nextReviewAt=${nextReviewAt}`);
      }

      wx.redirectTo({
        url: `/pages/result/result?${params.join('&')}`
      });
    });
  }
});