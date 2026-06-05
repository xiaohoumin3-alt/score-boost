/**
 * 积分中心页面
 * 功能：查看积分、签到、邀请好友、积分记录
 */

const app = getApp();

Page({
  data: {
    points: 0,
    total_earned: 0,
    total_spent: 0,
    invite_code: '',
    invite_count: 0,
    signin_streak: 0,
    last_signin: '',
    can_signin: true,
    records: [],
    loading: true,
    showInviteInput: false,
    invite_code_input: ''
  },

  onLoad() {
    this.loadPoints();
  },

  onShow() {
    this.loadPoints();
  },

  /**
   * 加载积分信息
   */
  async loadPoints() {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'pointsManager',
        data: { action: 'getPoints' }
      });

      console.log('[points] getPoints result:', res.result);

      if (res.result.success) {
        const data = res.result.data;
        const today = new Date().toISOString().split('T')[0];

        this.setData({
          points: data.points,
          total_earned: data.total_earned,
          total_spent: data.total_spent,
          invite_code: data.invite_code,
          invite_count: data.invite_count,
          signin_streak: data.signin_streak,
          last_signin: data.last_signin,
          can_signin: data.last_signin !== today,
          loading: false
        });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: res.result.error, icon: 'none' });
      }
    } catch (e) {
      console.error('[points] loadPoints error:', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /**
   * 签到
   */
  async signin() {
    if (!this.data.can_signin) {
      wx.showToast({ title: '今天已签到', icon: 'none' });
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'pointsManager',
        data: { action: 'signin' }
      });

      console.log('[points] signin result:', res.result);

      if (res.result.success) {
        const data = res.result.data;
        wx.showToast({
          title: data.message || `签到成功，+${data.points_earned}积分`,
          icon: 'success'
        });

        // 刷新积分
        this.loadPoints();
      } else {
        wx.showToast({ title: res.result.error, icon: 'none' });
      }
    } catch (e) {
      console.error('[points] signin error:', e);
      wx.showToast({ title: '签到失败', icon: 'none' });
    }
  },

  /**
   * 复制邀请码
   */
  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.invite_code,
      success: () => {
        wx.showToast({ title: '邀请码已复制', icon: 'success' });
      }
    });
  },

  /**
   * 分享邀请码
   */
  onShareAppMessage() {
    return {
      title: `我在用提分神器，邀请你一起学习！邀请码：${this.data.invite_code}`,
      path: `/pages/points/points?invite_code=${this.data.invite_code}`
    };
  },

  /**
   * 显示邀请码输入框
   */
  showInviteInput() {
    this.setData({ showInviteInput: true });
  },

  /**
   * 隐藏邀请码输入框
   */
  hideInviteInput() {
    this.setData({ showInviteInput: false, invite_code_input: '' });
  },

  /**
   * 输入邀请码
   */
  onInviteCodeInput(e) {
    this.setData({ invite_code_input: e.detail.value.toUpperCase() });
  },

  /**
   * 使用邀请码
   */
  async useInviteCode() {
    const { invite_code_input } = this.data;

    if (!invite_code_input || invite_code_input.length !== 6) {
      wx.showToast({ title: '请输入6位邀请码', icon: 'none' });
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'pointsManager',
        data: {
          action: 'useInviteCode',
          invite_code: invite_code_input
        }
      });

      console.log('[points] useInviteCode result:', res.result);

      if (res.result.success) {
        wx.showToast({
          title: res.result.data.message,
          icon: 'success'
        });

        this.hideInviteInput();
        this.loadPoints();
      } else {
        wx.showToast({ title: res.result.error, icon: 'none' });
      }
    } catch (e) {
      console.error('[points] useInviteCode error:', e);
      wx.showToast({ title: '使用邀请码失败', icon: 'none' });
    }
  },

  /**
   * 查看积分记录
   */
  async viewRecords() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'pointsManager',
        data: { action: 'getPointRecords', page: 1, limit: 50 }
      });

      console.log('[points] getPointRecords result:', res.result);

      if (res.result.success) {
        this.setData({ records: res.result.data.records });
        // 可以跳转到记录页面，或者弹窗显示
      }
    } catch (e) {
      console.error('[points] viewRecords error:', e);
    }
  },

  /**
   * 跳转到积分说明
   */
  goToPointsGuide() {
    // 可以跳转到说明页面，或者弹窗显示
    wx.showModal({
      title: '积分说明',
      content: '积分获取：\n- 注册：+100\n- 签到：+10/天\n- 邀请好友：+50\n- 好友注册：+30\n\n积分消耗：\n- AI测评：-30\n- AI练习：-20\n- 家长测评：-50',
      showCancel: false
    });
  }
});
