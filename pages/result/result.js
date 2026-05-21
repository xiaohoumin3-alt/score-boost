const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    score: 0,
    total: 0,
    accuracy: 0,
    mode: 'assessment',
    isPerfect: false,
    assessmentId: '',
    retestEligible: false,
    targetDifficulty: '',
    showRetestCheck: false,
    retestReason: ''
  },

  onLoad(query) {
    const mode = query.mode || 'assessment';

    if (mode === 'practice') {
      const correct = parseInt(query.correct) || 0;
      const total = parseInt(query.total) || 0;
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
      const isPerfect = correct === total && total > 0;

      // 解析知识点统计
      let kpStats = [];
      if (query.kpStats) {
        try {
          kpStats = JSON.parse(decodeURIComponent(query.kpStats));
        } catch (e) {
          // ignore parse error
        }
      }

      this.setData({ score: correct, total, accuracy, mode: 'practice', isPerfect, kpStats });
    } else {
      const assessmentId = query.assessmentId || '';
      const score = parseInt(query.score) || 0;
      const total = parseInt(query.total) || 5;
      const isPerfect = score === total;

      this.setData({
        score,
        total,
        accuracy: parseInt(query.accuracy) || 0,
        mode: 'assessment',
        isPerfect,
        assessmentId
      });

      // 检查复测资格（有assessmentId即可，包括满分）
      if (assessmentId) {
        this.checkRetestEligibility();
      }
    }

    if (this.data.isPerfect) {
      this.triggerConfetti();
    }
  },

  triggerConfetti() {
    wx.showToast({
      title: '完美表现！',
      icon: 'success',
      duration: 2000
    });
  },

  async checkRetestEligibility() {
    wx.showLoading({ title: '检查中...' });

    try {
      const data = await api.checkRetestEligibility(this.data.assessmentId, this.data.score);
      wx.hideLoading();

      this.setData({
        retestEligible: data.eligible,
        targetDifficulty: data.targetDifficulty || data.target_difficulty || 'easy',
        showRetestCheck: true,
        retestReason: data.reason || ''
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '检查失败', icon: 'none' });
    }
  },

  goToPractice() {
    wx.navigateTo({ url: '/pages/practice/practice' });
  },

  goToRetest() {
    // 传递复测所需参数：原测评ID、分数、目标难度
    const params = [`retest=true`];
    if (this.data.assessmentId) {
      params.push(`assessmentId=${this.data.assessmentId}`);
    }
    if (this.data.score > 0) {
      params.push(`previousScore=${this.data.score}`);
    }
    if (this.data.targetDifficulty) {
      params.push(`targetDifficulty=${this.data.targetDifficulty}`);
    }
    wx.navigateTo({ url: '/pages/assessment/assessment?' + params.join('&') });
  },

  continuePractice() {
    wx.switchTab({ url: '/pages/practice/practice' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  }
});
