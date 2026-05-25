const app = getApp();

Page({
  data: {
    loading: false,
    agreed: false,
  },

  onLoad() {
    if (app.checkLogin()) {
      this.redirectAfterLogin();
    }
  },

  onAgreementChange(e) {
    this.setData({ agreed: e.detail.value.length > 0 });
  },

  onViewUserAgreement() {
    wx.navigateTo({ url: '/pages/user-agreement/user-agreement' });
  },

  onViewPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/privacy-policy/privacy-policy' });
  },

  onLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意用户协议和隐私政策', icon: 'none' });
      return;
    }

    if (this.data.loading) return;

    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'login',
      data: {},
      success: (res) => {
        console.log('[login] success:', res);
        if (res.result && res.result.success) {
          const user = res.result.user;

          app.saveSession({
            openid: user.openid,
            grade: user.grade,
            subject: user.subject,
          });

          wx.showToast({ title: '登录成功', icon: 'success' });

          setTimeout(() => {
            this.redirectAfterLogin();
          }, 1500);
        } else {
          wx.showToast({ title: res.result?.error || '登录失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('[login] fail:', err);
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  redirectAfterLogin() {
    if (app.globalData.grade && app.globalData.subject) {
      wx.reLaunch({ url: '/pages/home/home' });
    } else {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
    }
  },
});