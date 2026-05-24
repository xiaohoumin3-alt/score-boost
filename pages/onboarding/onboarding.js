const app = getApp();

// 可用年级（与后端数据文件对应）
const GRADES = ['七年级', '八年级'];
const SUBJECTS = ['生物', '地理', '数学'];
// 会考模式只支持生地
const HUIKAO_SUBJECTS = ['生物', '地理'];

Page({
  data: {
    grades: GRADES,
    subjects: SUBJECTS,
    huikaoSubjects: HUIKAO_SUBJECTS,
    selectedGrade: '',
    selectedSubject: '',
    gradeIndex: -1,
    subjectIndex: -1,
    examMode: 'grade' // 'grade' 或 'huikao'
  },

  onLoad() {
    // 根据当前 globalData 找到正确的索引
    const gradeIndex = GRADES.indexOf(app.globalData.grade);
    const subjectIndex = SUBJECTS.indexOf(app.globalData.subject);

    this.setData({
      selectedGrade: gradeIndex >= 0 ? GRADES[gradeIndex] : GRADES[0],
      selectedSubject: subjectIndex >= 0 ? SUBJECTS[subjectIndex] : SUBJECTS[0],
      gradeIndex: gradeIndex >= 0 ? gradeIndex : 0,
      subjectIndex: subjectIndex >= 0 ? subjectIndex : 0,
      examMode: 'grade'
    });
  },

  selectExamMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      examMode: mode,
      subjectIndex: -1,
      selectedSubject: ''
    });
  },

  selectGrade(e) {
    const idx = e.detail.value;
    this.setData({ gradeIndex: idx, selectedGrade: GRADES[idx] });
  },

  selectSubject(e) {
    const idx = e.detail.value;
    const subjects = this.data.examMode === 'huikao' ? HUIKAO_SUBJECTS : SUBJECTS;
    this.setData({ subjectIndex: idx, selectedSubject: subjects[idx] });
  },

  confirm() {
    const { selectedGrade, selectedSubject, examMode } = this.data;

    if (examMode === 'huikao') {
      // 会考模式
      if (!selectedSubject) {
        wx.showToast({ title: '请选择科目', icon: 'none' });
        return;
      }
      console.log('[onboarding] confirm - 会考模式:', { selectedSubject });

      // 更新 globalData（会考模式不设置年级）
      app.globalData.subject = selectedSubject;
      app.globalData.examMode = 'huikao';
      app.saveSession({ subject: selectedSubject, examMode: 'huikao' });

      wx.reLaunch({ url: '/pages/assessment/assessment?mode=huikao' });
    } else {
      // 年级测评模式
      if (!selectedGrade || !selectedSubject) {
        wx.showToast({ title: '请完整选择', icon: 'none' });
        return;
      }
      console.log('[onboarding] confirm - 当前选择:', { selectedGrade, selectedSubject });
      console.log('[onboarding] confirm - globalData保存前:', { grade: app.globalData.grade, subject: app.globalData.subject });

      // 先更新 globalData
      app.globalData.grade = selectedGrade;
      app.globalData.subject = selectedSubject;
      app.globalData.examMode = 'grade';

      // 再保存到 storage
      app.saveSession({ grade: selectedGrade, subject: selectedSubject, examMode: 'grade' });

      console.log('[onboarding] confirm - globalData保存后:', { grade: app.globalData.grade, subject: app.globalData.subject });
      console.log('[onboarding] confirm - storage:', JSON.stringify(wx.getStorageSync('userSession')));
      wx.reLaunch({ url: '/pages/assessment/assessment' });
    }
  }
});
