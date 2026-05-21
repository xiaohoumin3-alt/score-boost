App({
  globalData: {
    backendUrl: 'http://192.168.1.7:8002',
    openid: null,
    studentId: null,
    grade: null,
    subject: null,
    sessionId: null,
  },

  onLaunch() {
    this.loadSession();
  },

  loadSession() {
    try {
      const data = wx.getStorageSync('userSession');
      if (data) {
        this.globalData.openid = data.openid;
        this.globalData.grade = data.grade;
        this.globalData.subject = data.subject;
        this.globalData.studentId = data.studentId;
      }
    } catch (e) {
      // ignore
    }
  },

  saveSession(data) {
    if (data.openid) this.globalData.openid = data.openid;
    if (data.grade) this.globalData.grade = data.grade;
    if (data.subject) this.globalData.subject = data.subject;
    if (data.studentId) this.globalData.studentId = data.studentId;
    wx.setStorageSync('userSession', {
      openid: this.globalData.openid,
      grade: this.globalData.grade,
      subject: this.globalData.subject,
      studentId: this.globalData.studentId,
    });
  },

  // 检查登录状态
  checkLogin() {
    return !!this.globalData.openid;
  },

  // 要求登录
  requireLogin(callback) {
    if (this.checkLogin()) {
      if (callback) callback();
    } else {
      wx.showModal({
        title: '请先登录',
        content: '测评前需要先登录微信账号',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/login' });
          }
        }
      });
    }
  },
})
