const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    reviews: [],
    loading: true,
    statusFilter: 'pending',
    statusOptions: [
      { value: 'pending', label: '待审核' },
      { value: 'approved', label: '已通过' },
      { value: 'rejected', label: '已拒绝' }
    ]
  },

  onLoad() {
    this.loadReviews();
  },

  onShow() {
    this.loadReviews();
  },

  onStatusChange(e) {
    this.setData({ statusFilter: this.data.statusOptions[e.detail.value].value });
    this.loadReviews();
  },

  async loadReviews() {
    this.setData({ loading: true });
    try {
      const res = await api.callFunction('adminReviewMaterial', {
        action: 'list',
        status: this.data.statusFilter
      });
      if (res.success) {
        this.setData({ reviews: res.reviews || [], loading: false });
      }
    } catch (err) {
      console.error('加载审核列表失败:', err);
      this.setData({ loading: false });
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/admin/material-review-detail/material-review-detail?id=${id}`
    });
  }
});
