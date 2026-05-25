const app = getApp();

Page({
  data: {
    category: '',
    content: '',
    contact: '',
    submitting: false
  },

  selectCategory(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ category });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  async submitFeedback() {
    const { category, content, contact, submitting } = this.data;

    if (submitting) {
      return;
    }

    // 校验分类
    if (!category) {
      wx.showToast({ title: '请选择反馈类型', icon: 'none' });
      return;
    }

    // 校验内容
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' });
      return;
    }

    if (trimmedContent.length < 2) {
      wx.showToast({ title: '反馈内容至少2个字', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      console.log('[feedback] 开始提交:', { category, content: trimmedContent, contact });
      const res = await wx.cloud.callFunction({
        name: 'submitFeedback',
        data: {
          content: trimmedContent,
          contact: contact.trim(),
          category
        }
      });

      console.log('[feedback] 云函数响应:', res);

      if (res.result && res.result.success) {
        wx.showModal({
          title: '提交成功',
          content: '反馈已提交，感谢您的建议！',
          showCancel: false,
          confirmText: '查看我的反馈',
          success: () => {
            wx.navigateTo({ url: '/pages/feedback-list/feedback-list' });
          }
        });
      } else {
        console.error('[feedback] 业务错误:', res.result);
        wx.showToast({ title: res.result?.error || '提交失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[feedback] 网络错误:', e);
      wx.showToast({ title: e.errMsg || '网络错误', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
