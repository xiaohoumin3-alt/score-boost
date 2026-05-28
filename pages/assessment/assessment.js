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

    // 检查是否有未完成的队列任务
    // ⚠️ 重要：如果已有 assessmentId，说明是从 waiting 页面跳转来的，不要再走队列流程
    const savedQueueId = wx.getStorageSync('currentQueueId');
    if (savedQueueId && !this.data.assessmentId) {
      this.resumeQueuedAssessment(savedQueueId);
      return;
    }

    this.initAssessment();
  },

  /**
   * 恢复队列中的测评
   */
  async resumeQueuedAssessment(queueId) {
    console.log('[assessment] 恢复队列任务, queue_id:', queueId);

    wx.showLoading({ title: '正在恢复...' });

    try {
      const pollResult = await api.pollQueueStatus(queueId, {
        maxAttempts: 60,
        intervalMs: 5000,
        onProgress: (progress) => {
          console.log('[assessment] 恢复进度:', progress);
        }
      });

      if (pollResult.status === 'completed' && pollResult.assessment_id) {
        wx.removeStorageSync('currentQueueId');
        await this.loadAssessment(pollResult.assessment_id);
      } else if (pollResult.status === 'failed') {
        wx.hideLoading();
        wx.removeStorageSync('currentQueueId');
        wx.showToast({ title: '题目生成失败', icon: 'none', duration: 3000 });
        setTimeout(function() { wx.navigateBack(); }, 3000);
      } else if (pollResult.exceededMaxAttempts) {
        wx.hideLoading();
        wx.removeStorageSync('currentQueueId');
        wx.showToast({ title: '题目生成超时', icon: 'none', duration: 3000 });
        setTimeout(function() { wx.navigateBack(); }, 3000);
      } else {
        // 仍在处理中，继续等待
        await this.handleQueuedResponse({ queue_id: queueId, message: '继续生成中...' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '恢复失败: ' + (e.message || '未知'), icon: 'none', duration: 3000 });
      setTimeout(function() { wx.navigateBack(); }, 3000);
    }
  },

  async initAssessment() {
    // 会考模式只需要科目，年级测评模式需要年级和科目
    const examMode = app.globalData.examMode || this.data.examMode || 'grade';
    const isHuikao = examMode === 'huikao';

    if (!app.globalData.subject) {
      wx.redirectTo({ url: '/pages/onboarding/onboarding' });
      return;
    }
    if (!isHuikao && !app.globalData.grade) {
      wx.redirectTo({ url: '/pages/onboarding/onboarding' });
      return;
    }

    console.log('[assessment] initAssessment - globalData:', {
      grade: app.globalData.grade,
      subject: app.globalData.subject,
      examMode: examMode
    });
    console.log('[assessment] initAssessment - storage:', JSON.stringify(wx.getStorageSync('userSession')));

    wx.showLoading({ title: isHuikao ? '正在生成会考题目...' : '正在生成测评...' });
    try {
      // 确定模式：复测、会考、或普通测评
      let mode;
      if (this.data.isRetest) {
        mode = 'retest';
      } else if (isHuikao) {
        mode = 'huikao';
      } else {
        mode = 'quick';
      }

      console.log('[assessment] 调用 startAssessment, 参数:', {
        grade: app.globalData.grade,
        subject: app.globalData.subject,
        mode,
        isHuikao
      });

      const res = await api.startAssessment(
        isHuikao ? null : app.globalData.grade,  // 会考模式不需要年级
        app.globalData.subject,
        mode,
        null
      );
      console.log('[assessment] startAssessment 返回:', res);

      // 处理队列模式响应
      if (res.status === 'queued') {
        wx.hideLoading();
        // 保存queue_id并跳转到等待页面
        wx.setStorageSync('currentQueueId', res.queue_id);
        wx.redirectTo({
          url: '/pages/waiting/waiting?queueId=' + res.queue_id
        });
        return;
      }

      // 处理ready响应（已有assessment_id）
      if (res.status === 'ready' && res.assessment_id) {
        await this.loadAssessment(res.assessment_id);
        return;
      }

      // 兼容原有直接返回assessment_id的响应
      wx.hideLoading();

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

  /**
   * 处理队列模式响应
   */
  async handleQueuedResponse(queuedRes) {
    const queueId = queuedRes.queue_id;
    console.log('[assessment] 进入队列模式, queue_id:', queueId);

    // 保存queue_id用于页面恢复
    wx.setStorageSync('currentQueueId', queueId);

    // 更新loading提示
    wx.showLoading({ title: queuedRes.message || '题目正在生成中...' });

    try {
      // 轮询队列状态
      const pollResult = await api.pollQueueStatus(queueId, {
        maxAttempts: 60,  // 最多5分钟
        intervalMs: 5000,  // 每5秒查询一次
        onProgress: (progress) => {
          console.log('[assessment] 队列进度:', progress);
          // 可选：更新UI显示进度
        }
      });

      console.log('[assessment] 轮询结果:', pollResult);

      if (pollResult.status === 'completed' && pollResult.assessment_id) {
        // 清除queue_id
        wx.removeStorageSync('currentQueueId');
        // 加载测评
        await this.loadAssessment(pollResult.assessment_id);
      } else if (pollResult.status === 'failed') {
        wx.hideLoading();
        const errorMsg = pollResult.error || '题目生成失败';
        wx.showToast({ title: errorMsg, icon: 'none', duration: 3000 });
        setTimeout(function() { wx.navigateBack(); }, 3000);
      } else if (pollResult.exceededMaxAttempts) {
        wx.hideLoading();
        wx.showToast({ title: '题目生成超时，请重试', icon: 'none', duration: 3000 });
        setTimeout(function() { wx.navigateBack(); }, 3000);
      } else {
        wx.hideLoading();
        wx.showToast({ title: '题目生成异常', icon: 'none', duration: 3000 });
        setTimeout(function() { wx.navigateBack(); }, 3000);
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误: ' + (e.message || '未知'), icon: 'none', duration: 3000 });
      setTimeout(function() { wx.navigateBack(); }, 3000);
    }
  },

  /**
   * 加载测评题目
   */
  async loadAssessment(assessmentId) {
    console.log('[assessment] 加载测评, assessment_id:', assessmentId);

    wx.showLoading({ title: '正在加载题目...' });

    try {
      // 从数据库获取测评数据
      const db = wx.cloud.database();
      const res = await db.collection('assessments').where({
        assessment_id: assessmentId
      }).get();

      if (!res.data || res.data.length === 0) {
        wx.hideLoading();
        wx.showToast({ title: '测评不存在', icon: 'none' });
        setTimeout(function() { wx.navigateBack(); }, 1500);
        return;
      }

      const assessment = res.data[0];
      const questions = assessment.questions || [];

      // 解析 options
      questions.forEach(function(q) {
        if (q.options && typeof q.options[0] === 'string') {
          var keys = ['A', 'B', 'C', 'D', 'E', 'F'];
          q.parsedOptions = q.options.map(function(opt, idx) {
            var dotIdx = opt.indexOf('. ');
            if (dotIdx > 0) {
              return { key: opt.substring(0, dotIdx), value: opt.substring(dotIdx + 2) };
            }
            return { key: keys[idx] || String.fromCharCode(65 + idx), value: opt };
          });
        }
      });

      wx.hideLoading();

      // 持久化 assessmentId
      wx.setStorageSync('currentAssessmentId', assessmentId);
      wx.removeStorageSync('currentQueueId');

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
      wx.showToast({ title: '加载失败: ' + (e.message || '未知'), icon: 'none', duration: 3000 });
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
