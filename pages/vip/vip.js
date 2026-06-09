const api = require('../../utils/cloudApi.js');

Page({
  data: {
    loading: true,
    points: 0,
    isVip: false,
    vipExpireDate: '',
    plans: [
      { id: 'basic', name: '基础包', points: 200, price: '9.9', desc: '200积分' },
      { id: 'standard', name: '标准包', points: 500, price: '19.9', desc: '500积分+7天VIP', popular: true },
      { id: 'premium', name: '旗舰包', points: 1500, price: '49.9', desc: '1500积分+30天VIP' }
    ],
    selectedPlan: null,
    redeemCode: '',
    redeemResult: '',
    redeemLoading: false
  },

  onLoad() {
    this.loadVipData();
  },

  onShow() {
    this.loadVipData();
    api.track('page_view', { page: 'vip' });
  },

  async loadVipData() {
    this.setData({ loading: true });
    try {
      const res = await api.callCloudFunction('pointsManager', { action: 'getPoints' });
      if (res && res.success !== false) {
        const data = res.data || res;
        this.setData({
          loading: false,
          points: data.points || 0,
          isVip: data.is_vip || false,
          vipExpireDate: data.vip_expire_date || ''
        });
      } else {
        this.setData({ loading: false });
      }
    } catch (e) {
      console.error('[vip] loadVipData error:', e);
      this.setData({ loading: false });
    }
  },

  selectPlan(e) {
    const planId = e.currentTarget.dataset.plan;
    const plan = this.data.plans.find(p => p.id === planId);
    this.setData({ selectedPlan: plan });
  },

  async purchasePlan() {
    const { selectedPlan } = this.data;
    if (!selectedPlan) {
      wx.showToast({ title: '请先选择套餐', icon: 'none' });
      return;
    }

    wx.showToast({ title: '充值码功能开发中，请输入兑换码', icon: 'none' });
  },

  onRedeemCodeInput(e) {
    this.setData({ redeemCode: e.detail.value.toUpperCase(), redeemResult: '' });
  },

  async redeemCode() {
    const { redeemCode } = this.data;
    if (!redeemCode || redeemCode.length < 4) {
      wx.showToast({ title: '请输入有效的兑换码', icon: 'none' });
      return;
    }

    this.setData({ redeemLoading: true, redeemResult: '' });

    try {
      const res = await api.callCloudFunction('pointsManager', {
        action: 'redeemCode',
        code: redeemCode
      });

      if (res && res.success) {
        const pointsEarned = res.points_earned || 0;
        this.setData({
          redeemResult: 'success',
          redeemCode: ''
        });
        wx.showToast({ title: `兑换成功！+${pointsEarned}积分`, icon: 'success' });
        this.loadVipData();
        api.track('redeem_code', { points_earned: pointsEarned });
      } else {
        this.setData({ redeemResult: 'fail' });
        wx.showToast({ title: res.error || '兑换码无效', icon: 'none' });
      }
    } catch (e) {
      console.error('[vip] redeemCode error:', e);
      this.setData({ redeemResult: 'fail' });
      wx.showToast({ title: '兑换失败，请重试', icon: 'none' });
    } finally {
      this.setData({ redeemLoading: false });
    }
  },

  goBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    return {
      title: '提分神器VIP — AI个性化出题，精准提分',
      path: '/pages/home/home'
    };
  }
});
