const app = getApp();

Page({
  data: {
    loading: true,
    feedback: null,
    error: null
  },

  onLoad(options) {
    const feedbackId = options.id;
    if (!feedbackId) {
      this.setData({ loading: false, error: '缺少反馈ID' });
      return;
    }
    this.feedbackId = feedbackId;
    this.loadFeedbackDetail();
  },

  onPullDownRefresh() {
    this.loadFeedbackDetail().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadFeedbackDetail() {
    this.setData({ loading: true, error: null });

    try {
      // 先标记已读
      await wx.cloud.callFunction({
        name: 'markAsRead',
        data: { feedbackId: this.feedbackId }
      });

      // 从数据库获取详情
      const db = wx.cloud.database();
      const res = await db.collection('feedback').doc(this.feedbackId).get();

      if (res.data && res.data.length > 0) {
        const feedback = res.data[0];

        // 验证是否属于当前用户
        const wxContext = await wx.cloud.getWXContext();
        if (feedback.openid !== wxContext.OPENID) {
          this.setData({ loading: false, error: '无权访问此反馈' });
          return;
        }

        this.setData({
          feedback: {
            feedbackId: feedback._id,
            content: feedback.content,
            contact: feedback.contact,
            category: feedback.category,
            status: feedback.status,
            hasReply: feedback.hasReply,
            createdAt: this.formatDateTime(feedback.createdAt),
            repliedAt: feedback.repliedAt ? this.formatDateTime(feedback.repliedAt) : null,
            replies: (feedback.replies || []).map(r => ({
              content: r.content,
              isAdmin: r.isAdmin,
              createdAt: this.formatDateTime(r.createdAt)
            }))
          },
          loading: false
        });
      } else {
        this.setData({ loading: false, error: '反馈不存在' });
      }
    } catch (e) {
      console.error('[feedback-detail] load error:', e);
      this.setData({ loading: false, error: '加载失败' });
    }
  },

  formatDateTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  goBack() {
    wx.navigateBack();
  }
});
