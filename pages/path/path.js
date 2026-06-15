const app = getApp();
const api = require('../../utils/cloudApi.js');
const { resolveKpName } = require('../../utils/knowledgeMap.js');

Page({
  data: {
    loading: false,
    currentScore: 0,
    targetScore: 85,
    totalGap: 85,
    path: [],
    currentStep: null,
    completedSteps: 0,
    weakPoints: [],
    subject: '',
    grade: '',
    navHeight: 128,
    hasAssessment: false,
  },

  onLoad() {
    try {
      const sysInfo = wx.getSystemInfoSync();
      const statusBarHeight = sysInfo.statusBarHeight || 20;
      const titleBarHeight = sysInfo.platform === 'android' ? 48 : 44;
      this.setData({ navHeight: (statusBarHeight + titleBarHeight) * 2 });
    } catch (e) { /* use default */ }
    this.loadPath();
  },

  async loadPath() {
    const targetScore = 85;
    api.track('page_view', { page: 'path' });

    const currentSubject = app.globalData.subject || '数学';
    const currentGrade = app.globalData.grade || '八年级';

    this.setData({
      loading: true,
      currentScore: 0,
      targetScore: targetScore,
      totalGap: targetScore,
      completedSteps: 0,
      subject: currentSubject,
      grade: currentGrade,
    });

    try {
      const diagnosis = await api.getLatestDiagnosis(currentSubject, currentGrade);

      let currentScore = 0;
      let totalGap = targetScore;
      let hasAssessment = false;

      if (diagnosis && diagnosis.score_percent > 0) {
        currentScore = diagnosis.score_percent;
        totalGap = Math.max(0, targetScore - currentScore);
        hasAssessment = true;
      }

      const weakPoints = api.analyzeWeakPoints(diagnosis?.kp_stats || []);

      app.targetAssessmentId = diagnosis?.assessment_id;

      // If kp_stats are all empty (common bug), build a fallback from assessment metadata
      let steps;
      if (weakPoints.length === 0 && hasAssessment) {
        // No per-KP breakdown — use generateDailyTask 逻辑获取具体知识点
        const taskResult = await wx.cloud.callFunction({
          name: 'generateDailyTask',
          data: {
            student_id: app.globalData.studentId || app.globalData.openid,
            subject: currentSubject,
            grade: app.globalData.grade || '八年级'
          }
        });
        
        const dailyTask = taskResult?.result?.data;
        if (dailyTask && dailyTask.kp_name) {
          steps = [{
            id: dailyTask.kp_id || 'overall',
            name: dailyTask.kp_name,
            wrongCount: 0,
            accuracy: currentScore,
            status: 'current',
          }];
        } else {
          steps = [{
            id: 'overall',
            name: currentSubject + '综合练习',
            wrongCount: Math.round((100 - currentScore) / 5),
            accuracy: currentScore,
            status: 'current',
          }];
        }
      } else if (weakPoints.length > 0 && weakPoints.every(wp => !wp.kp_name && !wp.kp_id) || (weakPoints.length === 1 && (!weakPoints[0].kp_name || weakPoints[0].kp_name === weakPoints[0].kp_id))) {
        // All kp_stats collapsed into one empty entry — the submitAnswer fallback bug
        const total = weakPoints[0].total || 0;
        const correct = weakPoints[0].correct || 0;
        steps = [{
          id: 'overall',
          name: currentSubject + '薄弱点强化',
          wrongCount: total - correct,
          accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
          status: 'current',
        }];
      } else {
        // Normal case — build path from weak points
        steps = weakPoints.map((wp, index) => ({
          id: wp.kp_id || 'kp_' + index,
          name: this.resolveName(wp, currentSubject),
          wrongCount: wp.total ? (wp.total - wp.correct) : 0,
          accuracy: wp.total ? Math.round((wp.correct / wp.total) * 100) : 0,
          status: index === 0 ? 'current' : 'pending',
        }));
      }

      this.setData({
        loading: false,
        currentScore,
        totalGap,
        path: steps,
        currentStep: steps[0] || null,
        completedSteps: 0,
        weakPoints: weakPoints,
        hasAssessment: hasAssessment,
      });
    } catch (e) {
      console.error('[path] loadPath error:', e);
      this.setData({ loading: false });
    }
  },

  resolveName(wp, subject) {
    // 1. Use kp_name from assessment if it's a real name
    if (wp.kp_name && wp.kp_name !== '' && wp.kp_name !== 'unknown' && wp.kp_name !== wp.kp_id) {
      return wp.kp_name;
    }

    // 2. Try knowledgeMap
    if (wp.kp_id) {
      const mapped = resolveKpName(wp.kp_id);
      if (mapped && mapped !== wp.kp_id) {
        return mapped;
      }
    }

    // 3. Format kp_id
    if (wp.kp_id && wp.kp_id !== 'unknown' && wp.kp_id !== '') {
      return this.formatKpId(wp.kp_id);
    }

    // 4. Fallback: can't determine
    return (subject || '') + '练习';
  },

  formatKpId(kpId) {
    if (!kpId) return '未知知识点';

    const subjectNames = {
      'math': '数学', 'chinese': '语文', 'english': '英语',
      'physics': '物理', 'chemistry': '化学', 'biology': '生物',
      'history': '历史', 'geography': '地理', 'politics': '政治',
    };

    const match = kpId.match(/^([a-z]+)_kp/);
    if (match) {
      const subject = subjectNames[match[1]] || match[1];
      return subject + ' #' + kpId.replace(match[1] + '_kp', '').replace(/_/g, '.');
    }

    return kpId;
  },

  startStep() {
    const { currentStep, weakPoints } = this.data;
    if (!currentStep) return;

    api.track('path_step_start', { kp_id: currentStep.id, kp_name: currentStep.name });

    // Only navigate to practice if we have real weak point data
    if (weakPoints.length > 0) {
      const targetKp = weakPoints.find(wp => wp.kp_id === currentStep.id);
      if (targetKp) {
        app.targetWeakPoints = [targetKp];
      }
    }

    wx.switchTab({ url: '/pages/practice/practice' });
  },

  startAssessment() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' });
  },

  viewDetail() {
    wx.navigateTo({ url: '/pages/result/result' });
  },

  goToUpload() {
    wx.navigateTo({ url: '/pages/material-upload/material-upload' });
  },

  goToExclusiveExam() {
    wx.navigateTo({ url: '/pages/exclusive-exam-start/exclusive-exam-start' });
  }
});
