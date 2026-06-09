const app = getApp();
const api = require('../../utils/cloudApi.js');

// 年级列表
const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级'];

// 科目列表（带图标）
const SUBJECT_LIST = [
  { name: '语文', icon: '📖' },
  { name: '数学', icon: '🔢' },
  { name: '英语', icon: '🔤' },
  { name: '物理', icon: '⚡' },
  { name: '化学', icon: '🧪' },
  { name: '生物', icon: '🌿' },
  { name: '历史', icon: '📜' },
  { name: '地理', icon: '🌍' },
  { name: '政治', icon: '⚖️' },
];

// 会考模式支持全部科目
const HUIKAO_SUBJECTS = SUBJECT_LIST;

Page({
  data: {
    grades: GRADES,
    subjectList: SUBJECT_LIST,
    huikaoSubjects: HUIKAO_SUBJECTS,
    selectedGrade: '',
    selectedSubject: '',
    examMode: 'grade'
  },

  onLoad() {
    // 恢复已保存的选择
    this.setData({
      selectedGrade: app.globalData.grade || '',
      selectedSubject: app.globalData.subject || '',
      examMode: app.globalData.examMode || 'grade'
    });
  },

  selectExamMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      examMode: mode,
      // 切换模式时清除科目选择
      selectedSubject: ''
    });
  },

  selectGrade(e) {
    const grade = e.currentTarget.dataset.grade;
    this.setData({ selectedGrade: grade });
  },

  selectSubject(e) {
    const subject = e.currentTarget.dataset.subject;
    this.setData({ selectedSubject: subject });
  },

  confirm() {
    const { selectedGrade, selectedSubject, examMode } = this.data;

    if (examMode === 'huikao') {
      if (!selectedSubject) {
        wx.showToast({ title: '请选择科目', icon: 'none' });
        return;
      }

      app.globalData.subject = selectedSubject;
      app.globalData.examMode = 'huikao';
      app.saveSession({ subject: selectedSubject, examMode: 'huikao' });
      api.track('onboarding_complete', { grade: '会考', subject: selectedSubject, mode: 'huikao' });

      wx.reLaunch({ url: '/pages/assessment/assessment?mode=huikao' });
    } else {
      if (!selectedGrade || !selectedSubject) {
        wx.showToast({ title: '请选择年级和科目', icon: 'none' });
        return;
      }

      app.globalData.grade = selectedGrade;
      app.globalData.subject = selectedSubject;
      app.globalData.examMode = 'grade';

      app.saveSession({ grade: selectedGrade, subject: selectedSubject, examMode: 'grade' });
      api.track('onboarding_complete', { grade: selectedGrade, subject: selectedSubject, mode: 'grade' });

      wx.reLaunch({ url: '/pages/assessment/assessment' });
    }
  }
});
