/**
 * "我的"页面
 * 功能：个人中心、签到、成就、亲子互动、积分入口
 */

const api = require('../../utils/cloudApi');

Page({
  data: {
    loading: true,
    points: 0,
    streak: 0,
    achievementCount: 0,
    signin_streak: 0,
    can_signin: true,
    score_percent: 0,
    invite_code: '',
    achievements: []
  },

  onLoad() {
    this.loadMineData();
  },

  onShow() {
    this.loadMineData();
  },

  /**
   * 并行加载个人数据
   */
  async loadMineData() {
    this.setData({ loading: true });

    try {
      const [diagRes, kpRes, pointsRes] = await Promise.allSettled([
        api.getLatestDiagnosis(),
        api.getKpProgress(),
        api.callCloudFunction('pointsManager', { action: 'getPoints' })
      ]);

      const diagData = diagRes.status === 'fulfilled' ? diagRes.value : {};
      const kpResData = kpRes.status === 'fulfilled' ? kpRes.value : {};
      const pointsData = pointsRes.status === 'fulfilled' && pointsRes.value ? pointsRes.value : {};

      // 从知识点进度中提取连续正确
      let maxStreak = 0;
      if (kpResData.success && Array.isArray(kpResData.data)) {
        kpResData.data.forEach(function (kp) {
          if (kp.streak > maxStreak) {
            maxStreak = kp.streak;
          }
        });
      }

      // 成就数：基于知识点完成数
      const achievementCount = kpResData.success ? (kpResData.data || []).length : 0;

      const today = new Date().toISOString().split('T')[0];

      this.setData({
        loading: false,
        score_percent: diagData.score_percent || 0,
        streak: maxStreak,
        achievementCount: achievementCount,
        points: pointsData.points || 0,
        signin_streak: pointsData.signin_streak || 0,
        can_signin: pointsData.last_signin !== today,
        invite_code: pointsData.invite_code || ''
      });
    } catch (e) {
      console.error('[mine] loadMineData error:', e);
      this.setData({ loading: false });
    }
  },

  /**
   * 签到
   */
  async signin() {
    if (!this.data.can_signin) {
      wx.showToast({ title: '今天已签到', icon: 'none' });
      return;
    }

    try {
      const res = await api.callCloudFunction('pointsManager', {
        action: 'signin'
      });

      if (res && res.points_earned !== undefined) {
        wx.showToast({
          title: '签到成功 +' + res.points_earned + '积分',
          icon: 'success'
        });
        this.loadMineData();
      } else {
        wx.showToast({ title: '签到成功', icon: 'success' });
        this.loadMineData();
      }
    } catch (e) {
      console.error('[mine] signin error:', e);
      wx.showToast({ title: '签到失败', icon: 'none' });
    }
  },

  /**
   * 跳转到家长测评
   */
  goToParentAssessment() {
    wx.navigateTo({ url: '/pages/parent-assessment/parent-assessment' });
  },

  /**
   * 跳转到学习进度
   */
  goToProgress() {
    wx.navigateTo({ url: '/pages/progress/progress' });
  },

  /**
   * 跳转到积分中心
   */
  goToPoints() {
    wx.navigateTo({ url: '/pages/points/points' });
  },

  /**
   * 跳转到反馈
   */
  goToFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  /**
   * 分享邀请码
   */
  onShareAppMessage() {
    return {
      title: '我在用提分神器，邀请你一起学习！',
      path: '/pages/home/home'
    };
  }
});
