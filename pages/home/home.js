const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    loading: true,
    currentScore: 0,
    targetScore: 85,
    totalGap: 0,
    currentStep: null,
    nextAction: null,
    recentAssessments: [],
    subject: '',
    grade: ''
  },

  onLoad() {
    this.loadHome();
  },

  onShow() {
    this.loadHome();
  },

  async loadHome() {
    this.setData({
      loading: true,
      subject: app.globalData.subject || '数学',
      grade: app.globalData.grade || '八年级'
    });
    try {
      // 传入当前选择的科目和年级用于过滤
      const currentSubject = app.globalData.subject || '数学';
      const currentGrade = app.globalData.grade || '八年级';
      const res = await api.getAssessmentList(currentSubject, currentGrade);
      const list = res.assessments || [];

      // 计算当前水平
      let currentScore = 0;
      if (list.length > 0) {
        currentScore = list[0].score_percent || 0;
      }

      // 计算目标差距
      const targetScore = 85;
      const totalGap = Math.max(0, targetScore - currentScore);

      // 确定下一步行动
      let nextAction = null;
      let currentStep = null;

      if (list.length === 0) {
        // 从未测评
        nextAction = { type: 'start_assessment', label: '开始测评', desc: '找到你的薄弱点' };
      } else if (currentScore >= 85) {
        // 已达成目标
        nextAction = { type: 'maintain', label: '保持领先', desc: '继续巩固所学' };
      } else {
        // 需要继续练习
        currentStep = this.getNextStep(currentScore);
        nextAction = { type: 'practice', label: '继续练习', desc: currentStep ? currentStep.name : '针对性训练' };
      }

      this.setData({
        loading: false,
        currentScore,
        targetScore,
        totalGap,
        currentStep,
        nextAction,
        recentAssessments: list.slice(0, 3)
      });
    } catch (e) {
      console.error('[home] load error:', e);
      this.setData({ loading: false });
    }
  },

  getNextStep(score) {
    // 根据分数确定下一步
    if (score < 60) {
      return { id: 1, name: '二次根式', score: 8 };
    } else if (score < 70) {
      return { id: 2, name: '勾股定理', score: 5 };
    } else if (score < 80) {
      return { id: 3, name: '平行四边形', score: 4 };
    } else {
      return { id: 4, name: '一次函数', score: 3 };
    }
  },

  handleAction() {
    const { nextAction, currentStep } = this.data;

    if (!nextAction) {
      return;
    }

    if (nextAction.type === 'start_assessment') {
      wx.navigateTo({ url: '/pages/onboarding/onboarding' });
    } else if (nextAction.type === 'practice') {
      if (currentStep) {
        // 跳转到路径页，让用户点击具体知识点
        wx.switchTab({ url: '/pages/path/path' });
      } else {
        wx.switchTab({ url: '/pages/practice/practice' });
      }
    } else if (nextAction.type === 'maintain') {
      wx.switchTab({ url: '/pages/practice/practice' });
    }
  },

  viewPath() {
    wx.switchTab({ url: '/pages/path/path' });
  },

  viewHistory() {
    wx.navigateTo({ url: '/pages/result/result' });
  },

  startAssessment() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' });
  },

  goToFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  }
});