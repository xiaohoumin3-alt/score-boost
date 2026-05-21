const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    loading: false,
    currentScore: 80,
    targetScore: 85,
    totalGap: 5,
    path: [],
    currentStep: null,
    completedSteps: 0,
    weakPoints: [],
  },

  onLoad() {
    this.loadPath();
  },

  async loadPath() {
    const defaultScore = 80;
    const targetScore = 85;

    this.setData({
      loading: false,
      currentScore: defaultScore,
      targetScore: targetScore,
      totalGap: Math.max(0, targetScore - defaultScore),
      completedSteps: 0
    });

    try {
      // 获取最新诊断结果
      const diagnosis = await api.getLatestDiagnosis();

      let currentScore = defaultScore;
      if (diagnosis.score_percent > 0) {
        currentScore = diagnosis.score_percent;
      }

      // 分析薄弱点
      const weakPoints = api.analyzeWeakPoints(diagnosis.kp_stats || []);

      // 保存 assessment_id 到全局数据
      const app = getApp();
      app.targetAssessmentId = diagnosis.assessment_id;

      // 用真实薄弱点生成路径
      const steps = weakPoints.map((wp, index) => ({
        id: wp.kp_id,
        name: wp.kp_name,
        score: 5,
        status: index === 0 ? 'current' : index < 0 ? 'completed' : 'pending',
        icon: this.getIconForKp(wp.kp_id),
      }));

      const totalGap = Math.max(0, targetScore - currentScore);
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
      // use default values on error
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