const app = getApp();

const USE_CLOUD = true;
const api = USE_CLOUD ? require('../../utils/cloudApi.js') : require('../../utils/api.js');

Page({
  data: {
    loading: true,
    assessments: [],
    trendData: [],
    linePoints: [],
    subject: '',
    stats: {
      total: 0,
      average: 0,
      latest: null,
      improvement: null
    }
  },

  onLoad() {
    this.loadProgress();
  },

  onShow() {
    this.loadProgress();
  },

  async loadProgress() {
    this.setData({
      loading: true,
      subject: app.globalData.subject || '数学'
    });
    try {
      const currentSubject = app.globalData.subject || '数学';
      const currentGrade = app.globalData.grade || '八年级';
      const res = await api.getAssessmentList(currentSubject, currentGrade);
      const list = res.assessments || [];

      if (list.length === 0) {
        this.setData({ assessments: [], linePoints: [], loading: false, stats: { total: 0, average: 0, latest: null, improvement: null } });
        return;
      }

      // 按时间排序
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // 计算统计数据
      const total = list.length;
      const scores = list.map(a => a.score_percent || 0);
      const average = scores.reduce((sum, s) => sum + s, 0) / total;
      const latest = list[0]?.score_percent || 0;

      // 计算进步
      let improvement = null;
      if (list.length >= 2) {
        improvement = (list[0]?.score_percent || 0) - (list[1]?.score_percent || 0);
      }

      // 趋势数据
      const trendData = list.slice(0, 10).reverse();

      // 计算每个点的位置（百分比，基准是100分）
      const linePoints = trendData.map((item, index) => {
        const score = item.score_percent || 0;
        const heightPercent = (score / 100) * 120; // 最高120rpx
        return {
          score,
          leftPercent: (index / Math.max(trendData.length - 1, 1)) * 100,
          heightPercent,
          isLatest: index === trendData.length - 1
        };
      });

      this.setData({
        assessments: list,
        trendData,
        linePoints,
        loading: false,
        stats: { total, average: Math.round(average), latest, improvement }
      });
    } catch (e) {
      console.error('[analyze] load error:', e);
      this.setData({ loading: false });
    }
  },

  formatDate(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    } catch {
      return '';
    }
  }
});
