const app = getApp();
const api = require('../../utils/cloudApi.js');

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
  },

  onLoad() {
    this.loadPath();
  },

  async loadPath() {
    const targetScore = 85;

    // 默认值：没有历史记录时显示 0
    this.setData({
      loading: false,
      currentScore: 0,
      targetScore: targetScore,
      totalGap: targetScore,
      completedSteps: 0,
      subject: app.globalData.subject || '数学',
      grade: app.globalData.grade || '八年级',
    });

    try {
      // 获取当前科目和年级的最新诊断结果
      const currentSubject = app.globalData.subject || '数学';
      const currentGrade = app.globalData.grade || '八年级';
      console.log('[path] loadPath:', currentSubject, currentGrade);

      const diagnosis = await api.getLatestDiagnosis(currentSubject, currentGrade);
      console.log('[path] diagnosis result:', JSON.stringify(diagnosis));

      let currentScore = 0;
      let totalGap = targetScore;

      if (diagnosis && diagnosis.score_percent > 0) {
        currentScore = diagnosis.score_percent;
        totalGap = Math.max(0, targetScore - currentScore);
      }

      // 分析薄弱点
      const weakPoints = api.analyzeWeakPoints(diagnosis?.kp_stats || []);
      console.log('[path] weakPoints:', JSON.stringify(weakPoints));

      // 保存 assessment_id 到全局数据
      app.targetAssessmentId = diagnosis?.assessment_id;

      // 用真实薄弱点生成路径
      const steps = weakPoints.map((wp, index) => ({
        id: wp.kp_id,
        name: wp.kp_name,
        score: 5,
        status: index === 0 ? 'current' : index < 0 ? 'completed' : 'pending',
        icon: this.getIconForKp(wp.kp_id),
      }));

      const currentStep = steps[0] || null;
      const completedSteps = 0;

      this.setData({
        currentScore,
        totalGap,
        path: steps,
        currentStep: currentStep,
        completedSteps: completedSteps,
        weakPoints: weakPoints,
      });
    } catch (e) {
      console.error('[path] loadPath error:', e);
      // 错误时保持 currentScore = 0
    }
  },

  getIconForKp(kpId) {
    const iconMap = {
      'kp1': '🔢',
      'kp2': '📐',
      'kp3': '⬜',
      'kp4': '📈',
      'kp5': '📊',
    };
    const prefix = kpId.substring(0, 3);
    return iconMap[prefix] || '📚';
  },

  startStep() {
    const { currentStep, weakPoints } = this.data;
    if (!currentStep) {
      return;
    }

    // 找到当前知识点对应的完整 weakPoint
    const targetKp = weakPoints.find(wp => wp.kp_id === currentStep.id);
    if (!targetKp) {
      return;
    }

    // 存储目标知识点和 assessment_id 到全局数据
    const app = getApp();
    app.targetWeakPoints = [targetKp];
    // assessment_id 已在 loadPath 中保存到 app.targetAssessmentId

    wx.switchTab({
      url: '/pages/practice/practice'
    });
  },

  viewDetail() {
    wx.navigateTo({ url: '/pages/result/result' });
  }
});