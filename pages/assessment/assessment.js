console.log('=== [CLOUD] assessment.js LOADED ===');
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
    previousAssessmentId: null,
    previousScore: 0,
    targetDifficulty: 'medium',
    isBrowsingHistory: false
  },

  onLoad(options) {
    // 保存复测参数
    if (options.retest === 'true') {
      this.setData({
        isRetest: true,
        previousAssessmentId: options.assessmentId,
        previousScore: parseInt(options.previousScore) || 0,
        targetDifficulty: options.targetDifficulty || 'medium'
      });
      console.log('[assessment] retest mode:', {
        assessmentId: options.assessmentId,
        score: options.previousScore,
        targetDifficulty: options.targetDifficulty
      });
    }
    this.initAssessment();
  },

  async initAssessment() {
    console.log('[assessment] grade:', app.globalData.grade, 'subject:', app.globalData.subject);
    if (!app.globalData.grade || !app.globalData.subject) {
      console.log('[assessment] missing profile, redirect to onboarding');
      wx.redirectTo({ url: '/pages/onboarding/onboarding' });
      return;
    }

    wx.showLoading({ title: '正在生成测评...' });
    try {
      console.log('[assessment] calling startAssessment API...');
      // 复测模式：传递目标难度参数
      const mode = this.data.isRetest ? 'retest' : 'quick';
      const res = await api.startAssessment(
        app.globalData.grade,
        app.globalData.subject,
        mode,
        this.data.isRetest ? {
          previousScore: this.data.previousScore,
          targetDifficulty: this.data.targetDifficulty
        } : null
      );
      console.log('[assessment] API response:', res);
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
      console.error('initAssessment error', e);
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
      this.setData({ isBrowsingHistory: false });
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
        questionStartTime: Date.now(),
        isBrowsingHistory: true
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
      console.error('submitAll error', e);
      wx.showToast({ title: '提交失败', icon: 'none' });
      setTimeout(function() { wx.navigateBack(); }, 1500);
    }
  }
});
