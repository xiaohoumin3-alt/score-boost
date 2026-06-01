/**
 * Assessment Page - 测评页面
 * 处理测评开始和结果显示
 */

const app = getApp();

Page({
  data: {
    assessmentId: '',
    questions: [],
    currentIndex: 0,
    answers: {},
    status: 'loading',
    fromQueue: false
  },

  onLoad(options) {
    const { assessment_id, from_queue } = options;

    if (assessment_id) {
      this.setData({
        assessmentId: assessment_id,
        fromQueue: from_queue === 'true'
      });
      this.loadAssessment();
    } else {
      this.startNewAssessment();
    }
  },

  /**
   * 加载已有测评
   */
  async loadAssessment() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'getAssessment',
        data: { assessment_id: this.data.assessmentId }
      });

      if (result.result.success) {
        this.setData({
          questions: result.result.data.questions || [],
          status: 'ready'
        });
      } else {
        this.showError(result.result.error || '加载失败');
      }
    } catch (e) {
      this.showError('加载失败: ' + e.message);
    }
  },

  /**
   * 开始新测评
   */
  async startNewAssessment() {
    const { subject, grade, num_questions } = this.data;

    try {
      wx.showLoading({ title: '加载中...' });

      const result = await wx.cloud.callFunction({
        name: 'startAssessment',
        data: {
          subject: subject || 'biology',
          grade: grade || '7',
          num_questions: num_questions || 20
        }
      });

      wx.hideLoading();

      if (result.result.success) {
        const data = result.result.data;

        // 处理队列状态
        if (data.status === 'queued') {
          wx.redirectTo({
            url: `/pages/assessment/assessment-queue?queue_id=${data.queue_id}`
          });
          return;
        }

        // 处理就绪状态
        this.setData({
          assessmentId: data.assessment_id,
          questions: data.questions || [],
          status: 'ready'
        });
      } else {
        this.showError(result.result.error || '发起测评失败');
      }
    } catch (e) {
      wx.hideLoading();
      this.showError('发起测评失败: ' + e.message);
    }
  },

  /**
   * 显示错误
   */
  showError(message) {
    wx.showModal({
      title: '提示',
      content: message,
      showCancel: false,
      success: () => {
        if (this.data.fromQueue) {
          wx.navigateBack();
        }
      }
    });
  }
});