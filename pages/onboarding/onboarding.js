const app = getApp();
const api = require('../../utils/cloudApi.js');

// 年级列表
const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级'];

// 中文年级 → 数字映射（后端期望数字格式）
const GRADE_TO_NUMBER = {
  '一年级': '1', '二年级': '2', '三年级': '3', '四年级': '4',
  '五年级': '5', '六年级': '6', '七年级': '7', '八年级': '8', '九年级': '9'
};

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

// 综合测评模式支持全部科目
const HUIKAO_SUBJECTS = SUBJECT_LIST;

// 综合测评：科目 → 年级范围（小学+初中）
const HUIKAO_GRADE_RANGES = {
  '语文': ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  '数学': ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  '英语': ['3', '4', '5', '6', '7', '8', '9'],  // 英语一般3年级开始
  '物理': ['8', '9'],
  '化学': ['9'],
  '生物': ['7', '8'],
  '历史': ['7', '8', '9'],
  '地理': ['7', '8'],
  '政治': ['7', '8', '9'],
};

// 支持小学学段的科目
const PRIMARY_SUBJECTS = ['语文', '数学', '英语'];

// 科目-年级兼容性矩阵
const SUBJECT_GRADE_MATRIX = {
  '语文': { min: 1, max: 9 },
  '数学': { min: 1, max: 9 },
  '英语': { min: 1, max: 9 },
  '生物': { min: 7, max: 8 },
  '地理': { min: 7, max: 8 },
  '历史': { min: 7, max: 9 },
  '政治': { min: 7, max: 9 },
  '物理': { min: 8, max: 9 },
  '化学': { min: 9, max: 9 },
};

Page({
  data: {
    grades: GRADES,
    subjectList: SUBJECT_LIST,
    huikaoSubjects: HUIKAO_SUBJECTS,
    selectedGrade: '',
    selectedSubject: '',
    selectedGradeBand: '',
    showGradeBand: false,
    examMode: 'grade',
    // 动态可用选项
    availableGrades: GRADES,
    availableSubjects: SUBJECT_LIST,
    gradeDisabled: false,
    subjectDisabled: false,
  },

  onLoad() {
    // 恢复已保存的选择
    const savedGrade = app.globalData.grade || '';
    const savedSubject = app.globalData.subject || '';
    const savedMode = app.globalData.examMode || 'grade';

    this.setData({
      selectedGrade: savedGrade,
      selectedSubject: savedSubject,
      examMode: savedMode
    });

    // 根据已保存的选择更新可用选项
    if (savedMode === 'grade') {
      if (savedGrade) {
        this.updateAvailableSubjectsByGrade(savedGrade);
      } else if (savedSubject) {
        this.updateAvailableGradesBySubject(savedSubject);
      }
    }
  },

  selectExamMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      examMode: mode,
      // 切换模式时清除选择
      selectedSubject: '',
      selectedGrade: '',
      selectedGradeBand: '',
      gradeDisabled: false,
      subjectDisabled: false,
      availableGrades: GRADES,
      availableSubjects: SUBJECT_LIST,
    });
  },

  selectGrade(e) {
    const grade = e.currentTarget.dataset.grade;
    this.setData({ selectedGrade: grade });
    // 根据年级更新可用科目
    this.updateAvailableSubjectsByGrade(grade);
  },

  selectSubject(e) {
    const subject = e.currentTarget.dataset.subject;
    const isPrimarySupported = PRIMARY_SUBJECTS.includes(subject);
    // 非语数英科目直接默认初中
    const defaultBand = isPrimarySupported ? '' : 'junior';
    this.setData({ 
      selectedSubject: subject, 
      selectedGradeBand: defaultBand,
      showGradeBand: isPrimarySupported
    });
    // 根据科目更新可用年级
    this.updateAvailableGradesBySubject(subject);
  },

  selectGradeBand(e) {
    const band = e.currentTarget.dataset.band;
    this.setData({ selectedGradeBand: band });
  },

  /**
   * 根据年级更新可用科目
   */
  updateAvailableSubjectsByGrade(grade) {
    const gradeNum = this.gradeToNumber(grade);
    if (!gradeNum) return;

    const available = SUBJECT_LIST.filter(item => {
      const range = SUBJECT_GRADE_MATRIX[item.name];
      return range && gradeNum >= range.min && gradeNum <= range.max;
    });

    // 检查当前选中的科目是否仍然可用
    const currentSubject = this.data.selectedSubject;
    if (currentSubject) {
      const range = SUBJECT_GRADE_MATRIX[currentSubject];
      if (!range || gradeNum < range.min || gradeNum > range.max) {
        // 当前科目不可用，清除选择
        this.setData({ selectedSubject: '' });
      }
    }

    this.setData({ availableSubjects: available, subjectDisabled: false });
  },

  /**
   * 根据科目更新可用年级
   */
  updateAvailableGradesBySubject(subject) {
    const range = SUBJECT_GRADE_MATRIX[subject];
    if (!range) {
      this.setData({ availableGrades: GRADES, gradeDisabled: false });
      return;
    }

    const available = GRADES.filter(grade => {
      const gradeNum = this.gradeToNumber(grade);
      return gradeNum >= range.min && gradeNum <= range.max;
    });

    // 检查当前选中的年级是否仍然可用
    const currentGrade = this.data.selectedGrade;
    if (currentGrade) {
      const gradeNum = this.gradeToNumber(currentGrade);
      if (gradeNum < range.min || gradeNum > range.max) {
        // 当前年级不可用，清除选择
        this.setData({ selectedGrade: '' });
      }
    }

    this.setData({ availableGrades: available, gradeDisabled: false });
  },

  /**
   * 年级名称转数字
   */
  gradeToNumber(grade) {
    const map = {
      '一年级': 1, '二年级': 2, '三年级': 3, '四年级': 4,
      '五年级': 5, '六年级': 6, '七年级': 7, '八年级': 8, '九年级': 9
    };
    return map[grade] || null;
  },

  confirm() {
    const { selectedGrade, selectedSubject, selectedGradeBand, examMode } = this.data;

    if (examMode === 'huikao') {
      if (!selectedSubject) {
        wx.showToast({ title: '请选择科目', icon: 'none' });
        return;
      }
      // 非语数英科目自动默认初中，无需选择学段
      const isPrimarySupported = PRIMARY_SUBJECTS.includes(selectedSubject);
      if (isPrimarySupported && !selectedGradeBand) {
        wx.showToast({ title: '请选择学段', icon: 'none' });
        return;
      }
      const gradeBand = isPrimarySupported ? selectedGradeBand : 'junior';

      app.globalData.subject = selectedSubject;
      app.globalData.examMode = 'huikao';
      // 综合测评：根据科目和学段确定年级范围
      const allRanges = HUIKAO_GRADE_RANGES[selectedSubject] || ['7', '8', '9'];
      let gradeRange;
      if (gradeBand === 'primary') {
        gradeRange = allRanges.filter(g => parseInt(g) <= 6);
      } else {
        gradeRange = allRanges.filter(g => parseInt(g) >= 7);
      }
      if (gradeRange.length === 0) {
        wx.showToast({ title: '该科目不支持此学段', icon: 'none' });
        return;
      }
      const defaultGrade = gradeRange[Math.floor(gradeRange.length / 2)];
      const gradeMap = { '1': '一年级', '2': '二年级', '3': '三年级', '4': '四年级', '5': '五年级', '6': '六年级', '7': '七年级', '8': '八年级', '9': '九年级' };
      const gradeLabel = gradeMap[defaultGrade] || '八年级';
      app.globalData.grade = defaultGrade.toString();  // 保存数字格式
      app.globalData.gradeRange = gradeRange;
      app.saveSession({ subject: selectedSubject, examMode: 'huikao', grade: defaultGrade.toString(), gradeRange });
      api.track('onboarding_complete', { grade: '综合测评', subject: selectedSubject, mode: 'huikao', gradeRange, gradeBand });

      wx.reLaunch({ url: '/pages/assessment/assessment?mode=huikao' });
    } else {
      if (!selectedGrade || !selectedSubject) {
        wx.showToast({ title: '请选择年级和科目', icon: 'none' });
        return;
      }

      const gradeNumber = GRADE_TO_NUMBER[selectedGrade] || selectedGrade;
      app.globalData.grade = gradeNumber;
      app.globalData.subject = selectedSubject;
      app.globalData.examMode = 'grade';

      app.saveSession({ grade: gradeNumber, subject: selectedSubject, examMode: 'grade' });
      api.track('onboarding_complete', { grade: selectedGrade, subject: selectedSubject, mode: 'grade' });

      wx.reLaunch({ url: '/pages/assessment/assessment' });
    }
  }
});
