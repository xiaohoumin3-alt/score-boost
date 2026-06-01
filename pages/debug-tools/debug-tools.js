/**
 * 调试工具页面
 * 用于快速清除缓存和设置科目
 */

const app = getApp();

Page({
  data: {
    currentSubject: '',
    currentGrade: '',
    currentExamMode: '',
    storageData: ''
  },

  onLoad() {
    this.loadCurrentData();
  },

  loadCurrentData() {
    this.setData({
      currentSubject: app.globalData.subject || '(未设置)',
      currentGrade: app.globalData.grade || '(未设置)',
      currentExamMode: app.globalData.examMode || '(未设置)',
      storageData: JSON.stringify(wx.getStorageSync('userSession'), null, 2)
    });
  },

  // 清除所有缓存
  clearAll() {
    wx.clearStorageSync();
    app.globalData.subject = null;
    app.globalData.grade = null;
    app.globalData.examMode = null;
    app.globalData.studentId = null;

    wx.showToast({ title: '缓存已清除', icon: 'success' });
    this.loadCurrentData();
  },

  // 设置为7年地理
  set7Geo() {
    app.globalData.subject = '地理';
    app.globalData.grade = '七年级';
    app.globalData.examMode = 'grade';

    app.saveSession({
      subject: '地理',
      grade: '七年级',
      examMode: 'grade'
    });

    wx.showToast({ title: '已设置为7年地理', icon: 'success' });
    this.loadCurrentData();
  },

  // 设置为8年生物
  set8Bio() {
    app.globalData.subject = '生物';
    app.globalData.grade = '八年级';
    app.globalData.examMode = 'grade';

    app.saveSession({
      subject: '生物',
      grade: '八年级',
      examMode: 'grade'
    });

    wx.showToast({ title: '已设置为8年生物', icon: 'success' });
    this.loadCurrentData();
  },

  // 跳转到测评页面
  goToAssessment() {
    wx.redirectTo({ url: '/pages/assessment/assessment' });
  },

  // 跳转到引导页
  goTOnboarding() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' });
  }
});
