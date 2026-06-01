const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    review: null,
    loading: true,
    knowledgePoints: [],
    reviewNotes: '',
    processing: false,
    error: ''
  },

  onLoad(options) {
    this.reviewId = options.id;
    this.loadDetail();
  },

  async loadDetail() {
    try {
      const res = await api.callFunction('adminReviewMaterial', {
        action: 'detail',
        review_id: this.reviewId
      });
      if (res.success) {
        this.setData({
          review: res.review,
          knowledgePoints: res.review.knowledge_points || [],
          loading: false
        });
      }
    } catch (err) {
      this.setData({ error: err.message, loading: false });
    }
  },

  onNotesInput(e) {
    this.setData({ reviewNotes: e.detail.value });
  },

  onEditKP(e) {
    const idx = e.currentTarget.dataset.idx;
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const kp = `knowledgePoints[${idx}].${field}`;
    this.setData({ [kp]: value });
  },

  onDeleteKP(e) {
    const idx = e.currentTarget.dataset.idx;
    const kps = [...this.data.knowledgePoints];
    kps.splice(idx, 1);
    this.setData({ knowledgePoints: kps });
  },

  async onApprove() {
    this.setData({ processing: true, error: '' });
    try {
      const res = await api.callFunction('adminReviewMaterial', {
        action: 'approve',
        review_id: this.reviewId,
        knowledge_points: this.data.knowledgePoints,
        review_notes: this.data.reviewNotes
      });
      if (res.success) {
        wx.showToast({ title: '已通过', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        this.setData({ error: res.error || '操作失败' });
      }
    } catch (err) {
      this.setData({ error: err.message });
    } finally {
      this.setData({ processing: false });
    }
  },

  async onReject() {
    if (!this.data.reviewNotes) {
      this.setData({ error: '拒绝时必须填写审核意见' });
      return;
    }
    this.setData({ processing: true, error: '' });
    try {
      const res = await api.callFunction('adminReviewMaterial', {
        action: 'reject',
        review_id: this.reviewId,
        review_notes: this.data.reviewNotes
      });
      if (res.success) {
        wx.showToast({ title: '已拒绝', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (err) {
      this.setData({ error: err.message });
    } finally {
      this.setData({ processing: false });
    }
  }
});
