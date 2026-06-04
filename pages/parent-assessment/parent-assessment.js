/**
 * 家长测评页面
 * 功能：让家长先做题，再让孩子做题，最后对比结果
 */

const app = getApp();

Page({
  data: {
    // 页面状态：start -> parent_quiz -> parent_result -> child_quiz -> child_result -> comparison
    status: 'start',

    // 年级选择
    grade: '',
    grades: [
      { value: '1', label: '一年级' },
      { value: '2', label: '二年级' },
      { value: '3', label: '三年级' },
      { value: '4', label: '四年级' },
      { value: '5', label: '五年级' },
      { value: '6', label: '六年级' },
      { value: '7', label: '初一' },
      { value: '8', label: '初二' },
      { value: '9', label: '初三' }
    ],

    // 题目相关
    questions: [],
    currentQuestionIndex: 0,
    currentQuestion: null,
    selectedAnswer: '',
    answers: [],

    // 计时
    startTime: 0,
    duration: 0,

    // 结果
    assessmentId: '',
    parentResult: null,
    childResult: null,
    comparisonResult: null,

    // 加载状态
    loading: false,
    error: ''
  },

  onLoad(options) {
    console.log('[parentAssessment] onLoad, options:', options);

    // 如果有预设年级
    if (options.grade) {
      this.setData({ grade: options.grade });
    }
  },

  // 选择年级
  onGradeChange(e) {
    this.setData({ grade: e.detail.value });
  },

  // 开始测评
  async startAssessment() {
    const { grade } = this.data;

    if (!grade) {
      wx.showToast({ title: '请选择年级', icon: 'none' });
      return;
    }

    this.setData({ loading: true, error: '' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'parentAssessment',
        data: {
          action: 'start',
          grade: grade,
          subject: 'math'
        }
      });

      console.log('[startAssessment] result:', res.result);

      if (res.result.success) {
        const { assessment_id, questions } = res.result.data;

        this.setData({
          status: 'parent_quiz',
          assessmentId: assessment_id,
          questions: questions,
          currentQuestionIndex: 0,
          currentQuestion: questions[0],
          selectedAnswer: '',
          answers: [],
          startTime: Date.now(),
          loading: false
        });
      } else {
        this.setData({
          loading: false,
          error: res.result.error || '启动测评失败'
        });
      }
    } catch (e) {
      console.error('[startAssessment] Error:', e);
      this.setData({
        loading: false,
        error: '网络错误，请稍后重试'
      });
    }
  },

  // 选择答案
  onSelectAnswer(e) {
    const answer = e.currentTarget.dataset.answer;
    this.setData({ selectedAnswer: answer });
  },

  // 下一题
  async nextQuestion() {
    const {
      currentQuestionIndex,
      questions,
      selectedAnswer,
      answers,
      status
    } = this.data;

    if (!selectedAnswer) {
      wx.showToast({ title: '请选择答案', icon: 'none' });
      return;
    }

    // 保存答案
    const newAnswers = [...answers, selectedAnswer];
    const nextIndex = currentQuestionIndex + 1;

    if (nextIndex < questions.length) {
      // 还有题目
      this.setData({
        answers: newAnswers,
        currentQuestionIndex: nextIndex,
        currentQuestion: questions[nextIndex],
        selectedAnswer: ''
      });
    } else {
      // 完成测评
      const duration = Math.round((Date.now() - this.data.startTime) / 1000);

      this.setData({
        answers: newAnswers,
        duration: duration,
        loading: true
      });

      if (status === 'parent_quiz') {
        // 提交家长答案
        await this.submitParentAnswers(newAnswers, duration);
      } else if (status === 'child_quiz') {
        // 提交孩子答案
        await this.submitChildAnswers(newAnswers, duration);
      }
    }
  },

  // 提交家长答案
  async submitParentAnswers(answers, duration) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'parentAssessment',
        data: {
          action: 'submitParent',
          assessment_id: this.data.assessmentId,
          answers: answers,
          duration: duration
        }
      });

      console.log('[submitParentAnswers] result:', res.result);

      if (res.result.success) {
        const { parent_score, questions, role } = res.result.data;

        this.setData({
          status: 'parent_result',
          parentResult: res.result.data,
          loading: false
        });
      } else {
        this.setData({
          loading: false,
          error: res.result.error || '提交失败'
        });
      }
    } catch (e) {
      console.error('[submitParentAnswers] Error:', e);
      this.setData({
        loading: false,
        error: '网络错误，请稍后重试'
      });
    }
  },

  // 开始孩子测评
  startChildAssessment() {
    const { parentResult } = this.data;

    this.setData({
      status: 'child_quiz',
      questions: parentResult.questions,
      currentQuestionIndex: 0,
      currentQuestion: parentResult.questions[0],
      selectedAnswer: '',
      answers: [],
      startTime: Date.now(),
      loading: false
    });
  },

  // 提交孩子答案
  async submitChildAnswers(answers, duration) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'parentAssessment',
        data: {
          action: 'submitChild',
          assessment_id: this.data.assessmentId,
          answers: answers,
          duration: duration
        }
      });

      console.log('[submitChildAnswers] result:', res.result);

      if (res.result.success) {
        this.setData({
          status: 'comparison',
          comparisonResult: res.result.data,
          loading: false
        });
      } else {
        this.setData({
          loading: false,
          error: res.result.error || '提交失败'
        });
      }
    } catch (e) {
      console.error('[submitChildAnswers] Error:', e);
      this.setData({
        loading: false,
        error: '网络错误，请稍后重试'
      });
    }
  },

  // 分享结果
  onShareAppMessage() {
    const { comparisonResult, grade } = this.data;

    if (!comparisonResult) {
      return {
        title: '家长测评：你真的了解你孩子的学习水平吗？',
        path: '/pages/parent-assessment/parent-assessment'
      };
    }

    const { parent, child, message } = comparisonResult;

    return {
      title: `我做了${grade}年级数学题，得分${parent.score}分！${message}`,
      path: `/pages/parent-assessment/parent-assessment?grade=${grade}`,
      imageUrl: '' // 可以设置分享图片
    };
  },

  // 重新测评
  restart() {
    this.setData({
      status: 'start',
      grade: '',
      questions: [],
      currentQuestionIndex: 0,
      currentQuestion: null,
      selectedAnswer: '',
      answers: [],
      startTime: 0,
      duration: 0,
      assessmentId: '',
      parentResult: null,
      childResult: null,
      comparisonResult: null,
      loading: false,
      error: ''
    });
  },

  // 返回首页
  goHome() {
    wx.navigateBack();
  }
});
