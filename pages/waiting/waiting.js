// pages/waiting/waiting.js
const api = require('../../utils/cloudApi.js');

Page({
  // 超过2分钟仍然 pending 时显示重试按钮
  FORCE_SYNC_THRESHOLD_ATTEMPTS: 24,  // 24次 × 5秒 = 2分钟

  data: {
    queueId: null,
    statusText: '题目正在生成中...',
    showProgress: true,
    progressPercent: 0,
    progressText: '预计需要 1-2 分钟',
    tipText: 'AI正在根据您的学习情况智能生成题目，请耐心等待',
    allowCancel: true,
    showRetryButton: false,
    polling: false,
    maxAttempts: 300,
    currentAttempt: 0
  },

  onLoad(options) {
    const queueId = options.queueId;
    if (!queueId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ queueId });
    this.startPolling();
  },

  onUnload() {
    // 页面卸载时停止轮询
    this.stopPolling();
  },

  /**
   * 开始轮询
   */
  async startPolling() {
    if (this.data.polling) return;

    this.setData({ polling: true });

    try {
      const result = await api.pollQueueStatus(this.data.queueId, {
        maxAttempts: this.data.maxAttempts,
        intervalMs: 5000,
        onProgress: this.onProgress.bind(this)
      });

      this.handlePollResult(result);
    } catch (e) {
      console.error('[waiting] 轮询错误:', e);
      wx.showToast({ title: '网络错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 2000);
    } finally {
      this.setData({ polling: false });
    }
  },

  /**
   * 停止轮询
   */
  stopPolling() {
    this.setData({ polling: false });
  },

  /**
   * 进度回调
   */
  onProgress(progress) {
    console.log('[waiting] 进度:', progress);

    const { attempt, maxAttempts, status } = progress;
    const percent = Math.min(Math.floor((attempt / maxAttempts) * 100), 95);

    this.setData({
      currentAttempt: attempt,
      progressPercent: percent,
      progressText: this.getStatusText(status)
    });

    // 根据状态更新提示文字
    this.updateStatusText(status);

    // 超过阈值仍然 pending 时，显示直接重试按钮
    if (status === 'pending' && attempt >= this.FORCE_SYNC_THRESHOLD_ATTEMPTS && !this.data.showRetryButton) {
      console.log('[waiting] Pending too long, showing retry button');
      this.setData({
        showRetryButton: true,
        tipText: '生成时间较长，可以尝试直接重新生成'
      });
    }
  },

  /**
   * 更新状态文字
   */
  updateStatusText(status) {
    const statusMap = {
      'pending': '题目正在排队中...',
      'processing': 'AI正在生成题目中...',
      'completed': '题目生成完成！',
      'failed': '题目生成失败'
    };

    this.setData({
      statusText: statusMap[status] || '题目正在生成中...'
    });
  },

  /**
   * 获取进度文字
   */
  getStatusText(status) {
    if (status === 'pending') {
      return '等待处理...';
    } else if (status === 'processing') {
      return '生成中...';
    } else if (status === 'completed') {
      return '已完成';
    }
    return '处理中...';
  },

  /**
   * 处理轮询结果
   */
  handlePollResult(result) {
    console.log('[waiting] 轮询结果:', result);

    if (result.status === 'completed' && result.assessment_id) {
      // 清除队列ID（防止重复进入）
      wx.removeStorageSync('currentQueueId');
      wx.removeStorageSync('currentAssessmentId');

      wx.showToast({ title: '题目生成完成', icon: 'success' });

      // 跳转到测评页面（清除页面栈，防止返回到旧页面）
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/assessment/assessment?assessmentId=' + result.assessment_id
        });
      }, 500);
    } else if (result.status === 'failed') {
      const errorMsg = result.error || '题目生成失败';
      wx.showModal({
        title: '生成失败',
        content: errorMsg + '\n\n是否重试？',
        confirmText: '重试',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
            this.retry();
          } else {
            wx.navigateBack();
          }
        }
      });
    } else if (result.exceededMaxAttempts) {
      wx.showModal({
        title: '生成超时',
        content: '题目生成时间过长，请稍后重试',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    } else {
      wx.showToast({ title: '生成异常', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 2000);
    }
  },

  /**
   * 重试
   */
  retry() {
    this.setData({
      progressPercent: 0,
      currentAttempt: 0,
      statusText: '重新生成中...'
    });
    this.startPolling();
  },

  /**
   * 取消生成
   */
  onCancel() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消题目生成吗？',
      success: (res) => {
        if (res.confirm) {
          this.cancelQueue();
        }
      }
    });
  },

  /**
   * 强制同步重试（跳过队列）
   */
  async forceSyncRetry() {
    wx.showLoading({ title: '重新生成中...' });

    try {
      // 取消当前队列任务
      await api.cancelQueueTask(this.data.queueId).catch(() => {});
      wx.removeStorageSync('currentQueueId');

      // 以 force_sync=true 重新发起
      const storageQueueId = this.data.queueId;
      // 读取当前测评参数（从 storage 获取）
      const lastParams = wx.getStorageSync('lastAssessmentParams') || {};
      const result = await api.startAssessment(
        lastParams.grade || '',
        lastParams.subject || '',
        lastParams.mode || 'quick',
        null,
        { forceSync: true }
      );

      wx.hideLoading();

      if (result && result.status === 'ready') {
        // 直接拿到题目，跳转到测评
        wx.reLaunch({
          url: '/pages/assessment/assessment?assessmentId=' + result.assessment_id
        });
      } else if (result && result.status === 'queued') {
        // 新队列任务
        this.setData({
          queueId: result.queue_id,
          showRetryButton: false,
          progressPercent: 0,
          currentAttempt: 0,
          statusText: '题目正在生成中...',
          tipText: 'AI正在根据您的学习情况智能生成题目，请耐心等待'
        });
        this.startPolling();
      } else {
        wx.showToast({ title: '重试失败，请稍后再试', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      console.error('[waiting] forceSyncRetry error:', e);
      wx.showToast({ title: '重试失败', icon: 'none' });
    }
  },

  /**
   * 取消队列任务
   */
  async cancelQueue() {
    wx.showLoading({ title: '取消中...' });

    try {
      await api.cancelQueueTask(this.data.queueId);

      // 清除队列ID
      wx.removeStorageSync('currentQueueId');

      wx.hideLoading();
      wx.showToast({ title: '已取消', icon: 'none' });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '取消失败', icon: 'none' });
    }
  }
});
