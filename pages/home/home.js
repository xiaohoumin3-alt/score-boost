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
    grade: '',
    streak: 0,
    achievements: [],
    hasPendingReviews: false,
    pendingReviews: []
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

      // 加载成就数据
      await this.loadAchievements();
      // 加载待复习知识点
      await this.loadPendingReviews();
    } catch (e) {
      console.error('[home] load error:', e);
      this.setData({ loading: false });
    }
  },

  async loadAchievements() {
    try {
      const res = await api.getKpProgress();
      if (res.success && res.data) {
        const kpList = Array.isArray(res.data) ? res.data : [res.data];

        let maxStreak = 0;
        kpList.forEach(kp => {
          ['easy', 'medium', 'hard'].forEach(diff => {
            if (kp[diff] && kp[diff].consecutive_correct > maxStreak) {
              maxStreak = kp[diff].consecutive_correct;
            }
          });
        });

        const achievements = [];
        // 所有已解锁的成就（通过条件判断的都是已解锁的）
        if (maxStreak >= 3) achievements.push({ id: 'streak_3', name: '连续3题', icon: '🔥', unlocked: true });
        if (maxStreak >= 7) achievements.push({ id: 'streak_7', name: '连续7题', icon: '💎', unlocked: true });
        if (maxStreak >= 30) achievements.push({ id: 'streak_30', name: '连续30题', icon: '👑', unlocked: true });

        const hasMastery = kpList.some(kp => kp.current_difficulty === 'easy');
        if (hasMastery) achievements.push({ id: 'first_mastery', name: '首次掌握', icon: '🎯', unlocked: true });

        const localAchievements = wx.getStorageSync('achievements') || {};
        if (localAchievements['perfect_practice']) {
          achievements.push({ id: 'perfect_practice', name: '满分练习', icon: '⭐', unlocked: true });
        }

        // 如果成就不足3个，显示下一个待解锁成就作为预览
        const allAchievements = [
          { id: 'streak_3', name: '连续3题', icon: '🔥', threshold: 3 },
          { id: 'streak_7', name: '连续7题', icon: '💎', threshold: 7 },
          { id: 'streak_30', name: '连续30题', icon: '👑', threshold: 30 }
        ];

        for (const ach of allAchievements) {
          if (achievements.length >= 3) break;
          if (!achievements.find(a => a.id === ach.id)) {
            achievements.push({ ...ach, unlocked: false });
          }
        }

        this.setData({
          streak: maxStreak,
          achievements: achievements.slice(0, 3)
        });
      }
    } catch (e) {
      console.error('[home] loadAchievements error:', e);
    }
  },

  async loadPendingReviews() {
    try {
      const res = await api.getKpProgress();
      if (res.success && res.data) {
        const kpList = Array.isArray(res.data) ? res.data : [res.data];
        const now = new Date();

        let pendingReviews = kpList.filter(kp => {
          if (!kp.next_review_at) return false;
          return new Date(kp.next_review_at) <= now;
        });

        pendingReviews.sort((a, b) => {
          const aTime = new Date(a.next_review_at || 0).getTime();
          const bTime = new Date(b.next_review_at || 0).getTime();
          if (aTime !== bTime) return aTime - bTime;
          const diffOrder = { hard: 1, medium: 2, easy: 3, unknown: 4 };
          const aOrder = diffOrder[a.current_difficulty] || diffOrder.unknown;
          const bOrder = diffOrder[b.current_difficulty] || diffOrder.unknown;
          return aOrder - bOrder;
        });

        if (pendingReviews.length > 0) {
          this.setData({
            pendingReviews,
            hasPendingReviews: true
          });
        }
      }
    } catch (e) {
      console.error('[home] loadPendingReviews error:', e);
      wx.showToast({ title: '加载复习数据失败', icon: 'none' });
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
  },

  viewProgress() {
    wx.navigateTo({ url: '/pages/progress/progress' });
  },

  goReview(e) {
    const kp = e.currentTarget.dataset.kp;
    app.targetKpId = kp.kp_id;
    app.targetKpName = kp.kp_name || kp.kp_id;
    wx.switchTab({ url: '/pages/practice/practice' });
  }
});