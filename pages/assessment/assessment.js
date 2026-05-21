const app = getApp();

// 使用云函数API（USE_CLOUD = true 时启用云函数）
// 开发调试时改为 false 使用本地后端
const USE_CLOUD = true;
const api = USE_CLOUD ? require('../../utils/cloudApi.js') : require('../../utils/api.js');

Page({
  data: {
    assessmentId: null,
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    selectedOption: null,
    answers: {},
    loading: true,
    submitted: false,
    startTime: null,
    questionStartTime: null,
    totalQuestions: 0,
    isRetest: false,
    isBrowsingHistory: false
  },

  onLoad(options) {
    // 检查登录状态
    if (!app.checkLogin()) {
      app.requireLogin();
      return;
    }

    // 复测模式：仅记录标志，不信任任何参数
    // 复测资格由云函数通过 openid 查询历史成绩验证
    if (options.retest === 'true') {
      this.setData({ isRetest: true });
    }

    // 优先从 URL params 获取 assessmentId，否则从 storage 恢复
    if (options.assessmentId) {
      this.setData({ assessmentId: options.assessmentId });
    } else {
      const savedId = wx.getStorageSync('currentAssessmentId');
      if (savedId) {
        this.setData({ assessmentId: savedId });
      }
    }

    this.initAssessment();
  },

  async initAssessment() {
    if (!app.globalData.grade || !app.globalData.subject) {
      wx.redirectTo({ url: '/pages/onboarding/onboarding' });
      return;
    }

    wx.showLoading({ title: '正在生成测评...' });
    try {
      // 复测模式：不传任何参数，由云函数自行验证资格
      const mode = this.data.isRetest ? 'retest' : 'quick';
      const res = await api.startAssessment(
        app.globalData.grade,
        app.globalData.subject,
        mode,
        null  // 不传任何复测参数
      );
      wx.hideLoading();

      // 后端返回 assessment_id（不是 session_id）
      var assessmentId = res.assessment_id;
      var questions = res.questions || [];

      // 解析 options: "A. 5" → {key:"A", value:"5"}; "60°" → {key:"A", value:"60°"}
      questions.forEach(function(q) {
        if (q.options && typeof q.options[0] === 'string') {
          var keys = ['A', 'B', 'C', 'D', 'E', 'F'];
          q.parsedOptions = q.options.map(function(opt, idx) {
            var dotIdx = opt.indexOf('. ');
            if (dotIdx > 0) {
              return { key: opt.substring(0, dotIdx), value: opt.substring(dotIdx + 2) };
            }
            // 纯字符串格式：使用 A/B/C/D 作为 key，避免重复显示
            return { key: keys[idx] || String.fromCharCode(65 + idx), value: opt };
          });
        }
      });

      if (!assessmentId || questions.length === 0) {
        wx.showToast({ title: '题目生成失败', icon: 'none' });
        setTimeout(function() { wx.navigateBack(); }, 1500);
        return;
      }

      // 持久化 assessmentId 到 storage，用于页面销毁后恢复
      wx.setStorageSync('currentAssessmentId', assessmentId);

      this.setData({
        assessmentId: assessmentId,
        questions: questions,
        totalQuestions: questions.length,
        currentQuestion: questions[0],
        loading: false,
        startTime: Date.now(),
        questionStartTime: Date.now()
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误: ' + (e.message || '未知'), icon: 'none', duration: 3000 });
      setTimeout(function() { wx.navigateBack(); }, 3000);
    }
  },

  selectOption(e) {
    var option = e.currentTarget.dataset.option;
    var currentQuestion = this.data.currentQuestion;
    var currentIndex = this.data.currentIndex;
    var answers = Object.assign({}, this.data.answers);

    // 记录答案
    answers[currentQuestion.id] = {
      question_id: currentQuestion.id,
      answer: option,
      time_spent_seconds: Math.round((Date.now() - this.data.questionStartTime) / 1000)
    };

    this.setData({ selectedOption: option, answers: answers });

    // 如果处于历史浏览模式，修改答案后清除浏览模式（但仍不自动跳转）
    if (this.data.isBrowsingHistory) {
      this.setData({ isBrowsingHistory: false, answers: answers, selectedOption: option });
      return;
    }

    // 自动跳转下一题
    var nextIndex = currentIndex + 1;
    if (nextIndex < this.data.totalQuestions) {
      setTimeout(() => {
        this.setData({
          currentIndex: nextIndex,
          currentQuestion: this.data.questions[nextIndex],
          selectedOption: null,
          questionStartTime: Date.now(),
          isBrowsingHistory: false
        });
      }, 300);
    } else {
      // 最后一题：清除浏览模式标志
      this.setData({ isBrowsingHistory: false });
    }
  },

  goPrevQuestion() {
    var currentIndex = this.data.currentIndex;
    if (currentIndex > 0) {
      var prevIndex = currentIndex - 1;
      var prevQuestion = this.data.questions[prevIndex];
      var savedAnswer = this.data.answers[prevQuestion.id];

      this.setData({
        currentIndex: prevIndex,
        currentQuestion: prevQuestion,
        selectedOption: savedAnswer ? savedAnswer.answer : null,
        questionStartTime: Date.now(),
        isBrowsingHistory: true
      });
    }
  },

  goNextQuestion() {
    var currentIndex = this.data.currentIndex;
    var nextIndex = currentIndex + 1;
    if (nextIndex < this.data.totalQuestions) {
      var nextQuestion = this.data.questions[nextIndex];
      var savedAnswer = this.data.answers[nextQuestion.id];

      this.setData({
        currentIndex: nextIndex,
        currentQuestion: nextQuestion,
        selectedOption: savedAnswer ? savedAnswer.answer : null,
        questionStartTime: Date.now()
        // goNextQuestion 不设置浏览模式，让用户可以退出浏览
      });
    }
  },

  async submitAll() {
    this.setData({ submitted: true });
    try {
      // 一次性提交所有答案（与原版后端一致）
      var allAnswers = Object.values(this.data.answers).map(function(a) {
        return {
          question_id: a.question_id,
          answer: a.answer,
          time_spent_seconds: a.time_spent_seconds || 0
        };
      });

      var result = await api.submitAssessmentAnswer(
        this.data.assessmentId,
        allAnswers
      );

      var total_correct = result.total_correct || 0;
      var total_questions = result.total_questions || this.data.totalQuestions;
      var score_percent = result.score_percent || 0;

      wx.redirectTo({
        url: '/pages/result/result?assessmentId=' + this.data.assessmentId +
             '&score=' + total_correct +
             '&total=' + total_questions +
             '&accuracy=' + score_percent
      });
    } catch (e) {
      wx.showToast({ title: '提交失败', icon: 'none' });
      setTimeout(function() { wx.navigateBack(); }, 1500);
    }
  }
});
