var app = getApp();
var api = require('../../utils/cloudApi.js');

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

  onLoad: function(query) {
    // 检查登录状态
    if (!app.checkLogin()) {
      app.requireLogin();
      return;
    }

    // 优先从 URL 参数获取
    var kpName = query.kpName || null;
    var kpId = query.kpId || null;
    var assessmentId = query.assessmentId || null;
    var weakPoints = null;

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
      kpName = weakPoints && weakPoints[0] ? weakPoints[0].kp_name : '专项练习';
    }

    this.setData({ kpName, kpId, weakPoints, assessmentId }, function() {
      this.initPractice();
    });
  },

  onShow: function() {
    // 当从 path 页面 switchTab 过来时，可能需要重新初始化
    if (app.targetWeakPoints && !this.data.sessionId) {
      var weakPoints = app.targetWeakPoints;
      app.targetWeakPoints = null;
      var assessmentId = app.targetAssessmentId || null;
      if (app.targetAssessmentId) {
        app.targetAssessmentId = null;
      }

      this.setData({
        weakPoints: weakPoints,
        kpName: weakPoints[0] ? weakPoints[0].kp_name : '专项练习',
        kpId: weakPoints[0] ? weakPoints[0].kp_id : null,
        assessmentId: assessmentId,
      }, function() {
        this.initPractice();
      });
    }
  },

  /**
   * 获取学生画像（AI原生核心）
   * 从Memory系统获取或使用默认值
   */
  getStudentProfile: function() {
    var self = this;
    return new Promise(function(resolve, reject) {
      wx.cloud.callFunction({
        name: 'studentMemory',
        data: { action: 'get', student_id: app.globalData.studentId }
      }).then(function(memoryResult) {
        if (memoryResult.result && memoryResult.result.success && memoryResult.result.data) {
          var memory = memoryResult.result.data;
          console.log('[Practice] Memory loaded:', memory);
          var weakPoints = memory.summary && memory.summary.weak_points || [];
          var weakPointsList = [];
          for (var i = 0; i < weakPoints.length; i++) {
            weakPointsList.push(weakPoints[i].kp_name);
          }
          var errorPatterns = [];
          for (var i = 0; i < weakPoints.length; i++) {
            if (weakPoints[i].pattern) {
              errorPatterns.push(weakPoints[i].pattern);
            }
          }
          resolve({
            weak_points: weakPointsList,
            mastered: memory.summary && memory.summary.mastered || [],
            learning_style: memory.profile && memory.profile.learning_style || 'visual',
            error_patterns: errorPatterns,
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
  },

  initPractice: function() {
    var self = this;
    wx.showLoading({ title: '加载中...' });
    console.log('[Practice] initPractice called with:', {
      kpId: self.data.kpId,
      kpName: self.data.kpName,
      weakPoints: self.data.weakPoints
    });

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
      console.log('[Practice] startPractice response:', res);
      var questions = res.questions || [];
      console.log('[Practice] questions count:', questions.length);
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
      console.error('[initPractice] Error stack:', e.stack);
      wx.showToast({ title: '加载失败: ' + (e.message || '未知错误'), icon: 'none', duration: 2000 });
      setTimeout(function() {
        wx.navigateBack();
      }, 2000);
    });
  },

  selectOption: function(e) {
    var option = e.currentTarget.dataset.option;
    var currentQuestion = this.data.currentQuestion;
    var currentIndex = this.data.currentIndex;
    var questions = this.data.questions;
    var answers = this.data.answers;
    var questionResults = this.data.questionResults;
    var isCorrect = option === currentQuestion.correct_answer;

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
      var mistakes = currentQuestion.typical_mistakes || [];
      if (mistakes.length > 0) {
        setTimeout(function() {
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
    var nextIndex = currentIndex + 1;
    if (nextIndex >= questions.length) {
      // 最后一题：清除浏览模式标志，等待反馈后留在当前页面
      this.setData({ isBrowsingHistory: false });
      return;
    }

    setTimeout(function() {
      this.setData({
        currentIndex: nextIndex,
        currentQuestion: questions[nextIndex],
        selectedOption: null,
        questionStartTime: Date.now(),
        progress: Math.round(((nextIndex + 1) / questions.length) * 100),
        isBrowsingHistory: false
      });
    }.bind(this), isCorrect ? 800 : 1500);
  },

  previewImage: function(e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({
        current: url,
        urls: [url]
      });
    }
  },

  goPrevQuestion: function() {
    var currentIndex = this.data.currentIndex;
    var questions = this.data.questions;
    var answers = this.data.answers;
    var questionResults = this.data.questionResults;
    if (currentIndex > 0) {
      var prevIndex = currentIndex - 1;
      var prevQuestion = questions[prevIndex];
      var savedAnswer = answers[prevQuestion.id];

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

  goNextQuestion: function() {
    var currentIndex = this.data.currentIndex;
    var questions = this.data.questions;
    var answers = this.data.answers;
    var questionResults = this.data.questionResults;
    var nextIndex = currentIndex + 1;
    if (nextIndex < questions.length) {
      var nextQuestion = questions[nextIndex];
      var savedAnswer = answers[nextQuestion.id];

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

  submitAll: function() {
    this.setData({ loading: true });

    // 批量提交答案到 kp_progress
    var submitPromises = [];
    var answersArray = [];
    for (var key in this.data.answers) {
      if (this.data.answers.hasOwnProperty(key)) {
        answersArray.push(this.data.answers[key]);
      }
    }

    for (var i = 0; i < answersArray.length; i++) {
      var answer = answersArray[i];
      var questions = this.data.questions;
      var question = null;
      for (var j = 0; j < questions.length; j++) {
        if (questions[j].id === answer.question_id) {
          question = questions[j];
          break;
        }
      }
      if (question) {
        submitPromises.push(
          api.submitPracticeResult({
            kp_id: question.knowledge_point_id,
            difficulty: question.difficulty || 'easy',
            is_correct: answer.is_correct,
            assessment_id: this.data.assessmentId,
          }).catch(function() {})
        );
      }
    }

    // 等待所有提交完成，收集复习时间
    var self = this;
    Promise.all(submitPromises).then(function(results) {
      // 修复：answers 是对象不是数组，必须使用 answersArray
      var correctCount = 0;
      for (var i = 0; i < answersArray.length; i++) {
        if (answersArray[i].is_correct) {
          correctCount++;
        }
      }
      var total = self.data.questions.length;

      // 计算知识点统计（参考 assessment 的 submitAnswer 逻辑）
      var kpStats = {};
      for (var i = 0; i < answersArray.length; i++) {
        var answer = answersArray[i];
        var question = null;
        for (var j = 0; j < self.data.questions.length; j++) {
          if (self.data.questions[j].id === answer.question_id) {
            question = self.data.questions[j];
            break;
          }
        }
        if (!question) continue;

        var kpId = question.knowledge_point_id || 'unknown';
        var kpName = question.knowledge_point || '未知知识点';

        if (!kpStats[kpId]) {
          kpStats[kpId] = { kp_id: kpId, kp_name: kpName, correct: 0, total: 0 };
        }
        kpStats[kpId].total++;
        if (answer.is_correct) {
          kpStats[kpId].correct++;
        }
      }

      // 获取最早的复习时间（取所有知识点中最近的复习时间）
      var nextReviewDates = [];
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (r.result && r.result.data && r.result.data.data && r.result.data.data.next_review_at) {
          nextReviewDates.push(new Date(r.result.data.data.next_review_at).getTime());
        }
      }

      var nextReviewAt = null;
      if (nextReviewDates.length > 0) {
        nextReviewAt = Math.min.apply(Math, nextReviewDates);
      }

      // 将 kpStats 转为数组并编码为 URL 参数
      var kpStatsArray = [];
      for (var key in kpStats) {
        if (kpStats.hasOwnProperty(key)) {
          kpStatsArray.push(kpStats[key]);
        }
      }
      var kpStatsParam = encodeURIComponent(JSON.stringify(kpStatsArray));

      var params = [
        'mode=practice',
        'correct=' + correctCount,
        'total=' + total,
        'kpStats=' + kpStatsParam
      ];

      if (nextReviewAt) {
        params.push('nextReviewAt=' + nextReviewAt);
      }

      wx.redirectTo({
        url: '/pages/result/result?' + params.join('&')
      });
    });
  }
});