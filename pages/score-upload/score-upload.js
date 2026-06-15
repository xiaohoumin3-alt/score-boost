/**
 * 上传真实成绩页面
 * 用于收集用户真实考试成绩，校准预估模型
 */

const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    subjects: [],
    selectedSubject: '',
    selectedGrade: '',
    examScore: '',
    examType: 'midterm',  // midterm / final / mock
    submitting: false,
  },

  onLoad() {
    this.initSubjects();
  },

  initSubjects() {
    const subjectList = [
      { id: 'math', name: '数学', icon: '🔢' },
      { id: 'chinese', name: '语文', icon: '📖' },
      { id: 'english', name: '英语', icon: '🔤' },
      { id: 'physics', name: '物理', icon: '⚡' },
      { id: 'chemistry', name: '化学', icon: '🧪' },
      { id: 'biology', name: '生物', icon: '🌿' },
      { id: 'geography', name: '地理', icon: '🌍' },
      { id: 'history', name: '历史', icon: '📜' },
      { id: 'politics', name: '政治', icon: '⚖️' },
    ];
    
    this.setData({ subjects: subjectList });
  },

  selectSubject(e) {
    this.setData({ selectedSubject: e.currentTarget.dataset.subject });
  },

  selectGrade(e) {
    this.setData({ selectedGrade: e.currentTarget.dataset.grade });
  },

  selectExamType(e) {
    this.setData({ examType: e.currentTarget.dataset.type });
  },

  onScoreInput(e) {
    this.setData({ examScore: e.detail.value });
  },

  async submit() {
    const { selectedSubject, selectedGrade, examScore, examType } = this.data;
    
    if (!selectedSubject) {
      wx.showToast({ title: '请选择科目', icon: 'none' });
      return;
    }
    if (!selectedGrade) {
      wx.showToast({ title: '请选择年级', icon: 'none' });
      return;
    }
    if (!examScore || isNaN(examScore)) {
      wx.showToast({ title: '请输入有效分数', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const res = await api.callCloudFunction('scoreCalibration', {
        action: 'uploadScore',
        subject: selectedSubject,
        grade: selectedGrade,
        exam_score: parseInt(examScore),
        exam_type: examType,
        student_id: app.globalData.studentId || app.globalData.openid,
      });

      if (res.success) {
        wx.showToast({ title: '上传成功！模型已校准', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.error || '上传失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[scoreUpload] submit error:', e);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
