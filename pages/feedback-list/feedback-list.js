const app = getApp();

Page({
  data: {
    loading: true,
    list: []
  },

  onLoad() {
    this.loadFeedbackList();
  },

  onShow() {
    this.loadFeedbackList();
  },

  onPullDownRefresh() {
    this.loadFeedbackList().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadFeedbackList() {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyFeedback'
      });

      if (res.result && res.result.success) {
        const list = (res.result.data.list || []).map(item => ({
          ...item,
          createdAt: this.formatDate(item.createdAt)
        }));
        this.setData({ list });
      } else {
        wx.showToast({ title: res.result?.error || '加载失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[feedback-list] load error:', e);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/feedback-detail/feedback-detail?id=${id}` });
  },

  goToSubmit() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  }
});
