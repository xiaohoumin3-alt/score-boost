const app = getApp();
const api = require('../../utils/cloudApi.js');
const { resolveKpNames, resolveKpName } = require('../../utils/knowledgeMap.js');

// 节流延迟（10秒内不重复请求）
const THROTTLE_DELAY = 10000;

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
    pendingReviews: [],
    todayTask: null,  // AI原生Phase 2: 今日任务
    signinStreak: 0,
    canSignin: true,
    showTopics: false,  // 是否显示知识点选择
    homeLoaded: false,  // 防止重复加载
    navHeight: 128,  // 导航区域高度(rpx)，onLoad中动态计算
    // 实时学习动态
    onlineCount: 0,
    liveLearners: [],
    lastLiveFetchTime: 0  // 节流控制
  },

  onLoad() {
    // 动态计算导航区域高度（状态栏 + 标题栏）
    try {
      const sysInfo = wx.getSystemInfoSync();
      const statusBarHeight = sysInfo.statusBarHeight || 20;
      // 标题栏高度：iOS 44px, Android 48px
      const titleBarHeight = sysInfo.platform === 'android' ? 48 : 44;
      this.setData({
        navHeight: (statusBarHeight + titleBarHeight) * 2  // px → rpx
      });
    } catch (e) { /* use default */ }

    console.log('[home] onLoad - 首次加载');
    this.setData({ homeLoaded: false });
    this.loadHome();
  },

  onShow() {
    // 检查并修复 studentId
    const app = getApp();
    if (!app.globalData.studentId && app.globalData.openid) {
      console.log('[home] No studentId, using openid as studentId');
      app.saveSession({ studentId: app.globalData.openid });
    }

    // 只在首次加载或数据可能变化时加载
    if (!this.data.homeLoaded) {
      console.log('[home] onShow - 首次加载');
      this.loadHome();
    } else {
      console.log('[home] onShow - 跳过重复加载');
    }
  },

  async loadHome() {
    const currentSubject = app.globalData.subject || '数学';
    const currentGrade = app.globalData.grade || '八年级';

    api.track('page_view', { page: 'home', subject: currentSubject, grade: currentGrade });
    this.setData({
      loading: true,
      subject: currentSubject,
      grade: currentGrade
    });
    try {
      // 按当前科目年级查询最新测评
      const diagnosis = await api.getLatestDiagnosis(currentSubject, currentGrade);

      // 计算当前水平
      let currentScore = 0;
      if (diagnosis && diagnosis.score_percent > 0) {
        currentScore = diagnosis.score_percent;
      }

      // 计算目标差距
      const targetScore = 85;
      const totalGap = Math.max(0, targetScore - currentScore);

      // 确定下一步行动
      let nextAction = null;
      let currentStep = null;

      // 从最新测评中提取真实薄弱点
      const kpStats = diagnosis?.kp_stats || [];
      const weakPoints = api.analyzeWeakPoints(kpStats);

      if (!diagnosis || !diagnosis.score_percent) {
        // 该科目年级从未测评
        nextAction = { type: 'start_assessment', label: '开始测评', desc: '找到你的薄弱点' };
      } else if (currentScore >= 85) {
        // 已达成目标
        nextAction = { type: 'maintain', label: '保持领先', desc: '继续巩固所学' };
      } else {
        // 需要继续练习 —— 从真实薄弱点取最弱的一个
        currentStep = this.getNextStep(weakPoints);
        nextAction = { type: 'practice', label: '继续练习', desc: currentStep ? currentStep.name : '针对性训练' };
      }

      // 最近记录（按当前科目年级）
      let recentAssessments = [];
      try {
        const historyRes = await api.getAssessmentList(currentSubject, currentGrade);
        recentAssessments = (historyRes.assessments || []).slice(0, 3);
      } catch (e) { /* non-critical */ }

      this.setData({
        loading: false,
        currentScore,
        targetScore,
        totalGap,
        currentStep,
        nextAction,
        recentAssessments
      });

      // 加载成就数据
      await this.loadAchievements();
      // 加载待复习知识点
      await this.loadPendingReviews();
      // AI原生Phase 2: 加载今日任务
      await this.loadTodayTask();

      // 加载签到信息
      await this.loadSigninInfo();

      // 加载实时学习动态（带节流）
      await this.loadLiveLearning();

      // 标记为已加载
      this.setData({ homeLoaded: true });
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
      // 获取当前科目年级（与首页其他部分保持一致）
      const currentSubject = app.globalData.subject || '数学';
      const currentGrade = app.globalData.grade || '八年级';

      // 传递科目年级参数，确保只返回当前科目年级的知识点
      const res = await api.getKpProgress(currentSubject, currentGrade);
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

        // 解析 kp_name（数据库可能为空）
        pendingReviews = resolveKpNames(pendingReviews);

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

  getNextStep(weakPoints) {
    if (!weakPoints || weakPoints.length === 0) return null;
    // 返回最薄弱的知识点（analyzeWeakPoints 已按正确率从低到高排序）
    const wp = weakPoints[0];
    return { id: wp.kp_id, name: wp.kp_name || resolveKpName(wp.kp_id), score: 0 };
  },

  handleAction() {
    const { nextAction, currentStep } = this.data;

    if (!nextAction) {
      return;
    }

    if (nextAction.type === 'start_assessment') {
      api.track('assessment_start', { source: 'home_action' });
      wx.navigateTo({ url: '/pages/onboarding/onboarding' });
    } else if (nextAction.type === 'practice') {
      if (currentStep) {
        api.track('practice_start', { source: 'home_action', kp_id: currentStep ? currentStep.id : null });
        // 跳转到路径页，让用户点击具体知识点
        wx.switchTab({ url: '/pages/path/path' });
      } else {
        wx.switchTab({ url: '/pages/practice/practice' });
      }
    } else if (nextAction.type === 'maintain') {
      wx.switchTab({ url: '/pages/practice/practice' });
    }
  },


  viewHistory() {
    wx.navigateTo({ url: '/pages/result/result' });
  },

  startAssessment() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' });
  },


  goReview(e) {
    const kp = e.currentTarget.dataset.kp;
    app.targetKpId = kp.kp_id;
    api.track('review_start', { kp_id: kp.kp_id, kp_name: kp.kp_name });
    app.targetKpName = kp.kp_name || resolveKpName(kp.kp_id);
    wx.switchTab({ url: '/pages/practice/practice' });
  },

  /**
   * 加载今日任务（AI原生Phase 2）
   */
  async loadSigninInfo() {
    try {
      const res = await api.callCloudFunction('pointsManager', { action: 'getPoints' });
      if (res && res.success !== false) {
        const data = res.data || res;
        const today = new Date().toISOString().split('T')[0];
        this.setData({
          signinStreak: data.signin_streak || 0,
          canSignin: data.last_signin !== today
        });
      }
    } catch (e) {
      console.log('[home] loadSigninInfo failed (non-critical):', e.message);
    }
  },


  async loadTodayTask() {
    try {
      const studentId = app.globalData.studentId;
      if (!studentId) {
        console.log('[home] No studentId, skip today task');
        return;
      }

      if (!wx || !wx.cloud) {
        console.log('[home] wx.cloud not available, skip today task');
        return;
      }

      // 获取当前科目年级
      const currentSubject = app.globalData.subject || '数学';
      const currentGrade = app.globalData.grade || '八年级';

      const result = await wx.cloud.callFunction({
        name: 'generateDailyTask',
        data: {
          student_id: studentId,
          subject: currentSubject,
          grade: currentGrade
        }
      });

      if (result.result && result.result.success && result.result.data) {
        this.setData({ todayTask: result.result.data });
        console.log('[home] Today task loaded:', result.result.data);
      }
    } catch (e) {
      console.log('[home] Load today task failed (non-critical):', e.message);
      // 任务加载失败不影响主页显示
    }
  },

  /**
   * 开始今日任务
   */
  startTodayTask() {
    const { todayTask } = this.data;
    if (!todayTask) return;
    api.track('today_task_start', { task_title: todayTask.title, kp_id: todayTask.kp_id });

    // 引导任务：跳转到测评页面
    if (todayTask.action === 'start_assessment') {
      wx.navigateTo({ url: '/pages/onboarding/onboarding' });
      return;
    }

    // 设置目标知识点
    app.targetKpId = todayTask.kp_id;
    app.targetKpName = todayTask.kp_name;

    // 跳转到练习页
    wx.switchTab({ url: '/pages/practice/practice' });
  },

  /**
   * 显示所有知识点（次要入口）
   */
  showAllTopics() {
    wx.switchTab({ url: '/pages/path/path' });
  },

  async quickSignin() {
    if (!this.data.canSignin) {
      wx.showToast({ title: '今天已签到', icon: 'none' });
      return;
    }
    try {
      const res = await api.callCloudFunction('pointsManager', { action: 'signin' });
      if (res && res.success !== false) {
        const pointsEarned = res.points_earned || res.data && res.data.points_earned || 10;
        wx.showToast({ title: `签到成功！+${pointsEarned}积分 连续${(this.data.signinStreak || 0) + 1}天`, icon: 'success' });
        this.setData({ canSignin: false, signinStreak: (this.data.signinStreak || 0) + 1 });
        api.track('signin', { source: 'home', points_earned: pointsEarned });
      }
    } catch (e) {
      wx.showToast({ title: '签到失败', icon: 'none' });
    }
  },

  /**
   * 加载实时学习动态（带节流）
   */
  async loadLiveLearning() {
    const now = Date.now();
    // 节流：10秒内不重复请求（无条件返回）
    if (now - this.data.lastLiveFetchTime < THROTTLE_DELAY) {
      console.log('[home] 节流: 跳过频繁请求');
      return;
    }

    try {
      const liveData = await api.callCloudFunction('getLiveLearningStatus', {});
      // callCloudFunction返回res.result.data，直接是{onlineCount, liveLearners}
      if (liveData && liveData.onlineCount) {
        this.setData({
          onlineCount: liveData.onlineCount || 0,
          liveLearners: liveData.liveLearners || [],
          lastLiveFetchTime: now
        });
        console.log('[home] 实时学习动态加载成功:', liveData);
      }
    } catch (e) {
      console.error('[home] 获取实时动态失败', e);
      // 降级: 使用默认数据（不更新节流时间，允许重试）
      if (this.data.onlineCount === 0) {
        this.setData({
          onlineCount: 1000,  // 默认基数
          liveLearners: []
        });
      }
    }
  },

  /**
   * 跳转到实时排行榜（可选）
   */
  goToLiveRanking() {
    // 未来可扩展：跳转到学习排行榜页面
    console.log('[home] 点击实时学习动态卡片');
  }
});