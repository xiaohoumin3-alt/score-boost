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
    retestReason: '',
    perfectShown: false,
    nextReviewAt: null,
    nextReviewText: '',
    showReviewTip: false
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

      // M6: 获取复习时间
      this.loadNextReviewTime();
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
      this.checkAndUnlockPerfectAchievement();
      this.triggerConfetti();
    }
  },

  async loadNextReviewTime() {
    try {
      const res = await api.getKpProgress();
      if (res && res.length > 0) {
        // 找到最近的复习时间
        const upcomingReviews = res
          .filter(kp => kp.next_review_at)
          .map(kp => ({ kp, time: new Date(kp.next_review_at).getTime() }))
          .filter(item => item.time > Date.now())
          .sort((a, b) => a.time - b.time);

        if (upcomingReviews.length > 0) {
          const nextTime = upcomingReviews[0].time;
          const now = Date.now();
          const diffMs = nextTime - now;
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

          let reviewText = '';
          if (diffDays > 0) {
            reviewText = `${diffDays}天后复习`;
          } else if (diffHours > 0) {
            reviewText = `${diffHours}小时后复习`;
          } else {
            reviewText = '即将复习';
          }

          this.setData({
            nextReviewAt: upcomingReviews[0].time,
            nextReviewText: reviewText,
            showReviewTip: true
          });
        }
      }
    } catch (e) {
      // 静默失败，不影响主流程
    }
  },

  checkAndUnlockPerfectAchievement() {
    const correctCount = this.data.score;
    const totalCount = this.data.total;

    // 满分且至少5题
    const isPerfect = correctCount === totalCount && totalCount >= 5;

    if (isPerfect) {
      const achievements = wx.getStorageSync('achievements') || {};
      const achievementId = 'perfect_practice';

      if (!achievements[achievementId] && !this.data.perfectShown) {
        achievements[achievementId] = {
          unlockedAt: new Date().toISOString(),
          count: 1
        };
        wx.setStorageSync('achievements', achievements);
        this.setData({ perfectShown: true });

        setTimeout(() => {
          wx.showModal({
            title: '🎉 满分表现！',
            content: '太棒了！继续保持！\n⭐ 满分成就已解锁',
            showCancel: false,
            confirmText: '继续'
          });
        }, 1000);
      }
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
