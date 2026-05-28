/**
 * 队列等待页面
 * 展示题目生成进度，轮询队列状态
 */

const QueueApi = require('../../utils/queue-api');

Page({
  data: {
    queueId: '',
    status: 'pending',
    message: '题目正在生成中...',
    progress: 0,
    pollCount: 0,
    maxPolls: 60,
    interval: 3000
  },

  onLoad(options) {
    const { queue_id } = options;
    if (!queue_id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ queueId: queue_id });
    this.startPolling();
  },

  onUnload() {
    // 清理定时器
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
    }
  },

  /**
   * 开始轮询队列状态
   */
  startPolling() {
    const api = new QueueApi(wx.cloud);
    let pollCount = 0;
    const maxPolls = this.data.maxPolls;
    const interval = this.data.interval;

    const poll = async () => {
      if (pollCount >= maxPolls) {
        this.showTimeout();
        return;
      }

      pollCount++;
      this.setData({ pollCount, progress: Math.min(90, (pollCount / maxPolls) * 100) });

      try {
        const status = await api.checkQueueStatus(this.data.queueId);

        if (status.success && status.data) {
          this.setData({
            status: status.data.status || 'pending',
            message: status.data.message || this.getDefaultMessage(status.data.status)
          });

          if (status.data.status === 'completed' && status.data.assessment_id) {
            this.navigateToAssessment(status.data.assessment_id);
            return;
          }

          if (status.data.status === 'failed') {
            this.showError(status.data.error || '题目生成失败');
            return;
          }

          // cancelled状态：新请求取消旧任务
          if (status.data.status === 'cancelled') {
            this.showError('任务已取消，请重新发起测评');
            return;
          }
        }
      } catch (e) {
        console.error('[assessment-queue] Poll error:', e.message);
      }

      // 继续轮询
      this.pollingTimer = setTimeout(poll, interval);
    };

    // 开始轮询
    poll();
  },

  /**
   * 获取状态对应的默认消息
   */
  getDefaultMessage(status) {
    const messages = {
      pending: '题目正在排队生成中...',
      processing: '题目正在生成中...',
      completed: '题目生成完成，即将跳转...',
      failed: '题目生成失败'
    };
    return messages[status] || '生成中...';
  },

  /**
   * 跳转到测评页面
   */
  navigateToAssessment(assessmentId) {
    this.setData({ progress: 100 });
    wx.redirectTo({
      url: `/pages/assessment/assessment?assessment_id=${assessmentId}&from_queue=true`
    });
  },

  /**
   * 显示超时提示
   */
  showTimeout() {
    wx.showModal({
      title: '提示',
      content: '生成超时，请稍后重试',
      showCancel: false,
      success: () => wx.navigateBack()
    });
  },

  /**
   * 显示错误
   */
  showError(message) {
    wx.showModal({
      title: '提示',
      content: message,
      showCancel: false,
      success: () => wx.navigateBack()
    });
  }
});