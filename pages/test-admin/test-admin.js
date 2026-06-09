// pages/test-admin/test-admin.js
Page({
  data: {
    result: '等待测试...',
    username: '',
    password: ''
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  async testLogin() {
    if (!this.data.username || !this.data.password) {
      this.setData({ result: '❌ 请输入账号和密码' });
      return;
    }

    this.setData({ result: '正在测试登录...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'adminLogin',
        data: {
          username: this.data.username,
          password: this.data.password
        }
      });

      console.log('[测试] 登录响应:', res);

      if (res.result && res.result.success) {
        const { token, expiresAt } = res.result.data;
        this.setData({
          result: `✅ 登录成功！\nToken: ${token}\n过期时间: ${expiresAt}`
        });
      } else {
        this.setData({
          result: `❌ 登录失败: ${res.result?.error || '未知错误'}`
        });
      }
    } catch (e) {
      console.error('[测试] 登录错误:', e);
      this.setData({
        result: `❌ 网络错误: ${e.errMsg || JSON.stringify(e)}`
      });
    }
  },

  goToMaterialReview() {
    wx.navigateTo({ url: '/pages/admin/material-review/material-review' });
  }
});
