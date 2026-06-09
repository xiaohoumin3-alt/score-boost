/**
 * 错题本页面
 * 功能：展示用户做错过的题目，按知识点分组，支持重做
 */

const api = require('../../utils/cloudApi.js');
const app = getApp();
const { resolveKpName } = require('../../utils/knowledgeMap.js');

Page({
  data: {
    loading: true,
    grouped: [],       // [{kp_name, kp_id, mistakes: [...]}]
    currentTab: 'all', // all | review | mastered
    emptyText: '暂无错题记录',
  },

  onLoad() {
    api.track('page_view', { page: 'mistakes' });
  },

  onShow() {
    this.loadMistakes();
  },

  async loadMistakes() {
    this.setData({ loading: true });
    try {
      const res = await api.callCloudFunction('practice_v2', {
        action: 'getMistakes',
        subject: app.globalData.subject || '数学',
        grade: app.globalData.grade || '八年级'
      });

      if (res && res.success) {
        const mistakes = res.data || [];

        // Group by kp_id
        const groupMap = {};
        mistakes.forEach(m => {
          const kpId = m.kp_id || 'unknown';
          if (!groupMap[kpId]) {
            groupMap[kpId] = {
              kp_id: kpId,
              kp_name: m.kp_name || resolveKpName(kpId) || '未知知识点',
              mistakes: []
            };
          }
          groupMap[kpId].mistakes.push(m);
        });

        // Sort by mistake count (most mistakes first)
        const grouped = Object.values(groupMap).sort((a, b) => b.mistakes.length - a.mistakes.length);

        this.setData({
          loading: false,
          grouped: grouped,
          emptyText: grouped.length === 0 ? '太棒了，没有错题！继续保持' : '暂无错题记录'
        });
      } else {
        this.setData({ loading: false, grouped: [] });
      }
    } catch (e) {
      console.error('[mistakes] loadMistakes error:', e);
      this.setData({ loading: false, grouped: [] });
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  retryMistake(e) {
    const kpId = e.currentTarget.dataset.kpId;
    const kpName = e.currentTarget.dataset.kpName;

    app.targetKpId = kpId;
    app.targetKpName = kpName;

    api.track('mistake_retry', { kp_id: kpId, kp_name: kpName });

    wx.switchTab({ url: '/pages/practice/practice' });
  },

  goBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    return {
      title: '我用AI错题本复习，提分超快！',
      path: '/pages/home/home'
    };
  }
});
