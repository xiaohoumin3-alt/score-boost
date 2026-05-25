const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    loading: true,
    kpList: [],
    totalKp: 15,
    masteredKp: 0,
    learningKp: 0,
    weakKp: 0,
    currentScore: 0,
    targetScore: 85
  },

  onLoad() {
    this.loadProgress();
  },

  async loadProgress() {
    wx.showLoading({ title: '加载中...' });

    try {
      const res = await api.getKpProgress();
      let kpList = [];
      if (res.success && res.data) {
        kpList = Array.isArray(res.data) ? res.data : [res.data];
      }

      const masteredKp = kpList.filter(kp => kp.current_difficulty === 'easy').length;
      const learningKp = kpList.filter(kp => kp.current_difficulty === 'medium').length;
      const weakKp = kpList.filter(kp => kp.current_difficulty === 'hard').length;

      const targetScore = 85;
      const currentScore = this.estimateScore(kpList, targetScore);

      this.setData({
        loading: false,
        kpList,
        totalKp: kpList.length || 15,
        masteredKp,
        learningKp,
        weakKp,
        currentScore,
        targetScore
      });

      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  estimateScore(kpList, targetScore) {
    if (!kpList || kpList.length === 0) return 0;
    const weights = { easy: 1.0, medium: 0.6, hard: 0.2, unknown: 0.1 };
    const totalWeight = kpList.reduce((sum, kp) => {
      const diff = kp.current_difficulty || 'unknown';
      return sum + (weights[diff] !== undefined ? weights[diff] : weights.unknown);
    }, 0);
    const maxWeight = kpList.length;
    return Math.round((totalWeight / maxWeight) * targetScore);
  },

  goPractice(e) {
    const kp = e.currentTarget.dataset.kp;
    app.targetKpId = kp.kp_id;
    app.targetKpName = kp.kp_name || kp.kp_id;
    wx.switchTab({ url: '/pages/practice/practice' });
  }
});
