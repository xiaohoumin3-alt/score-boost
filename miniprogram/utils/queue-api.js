/**
 * Queue API - 队列状态轮询工具
 * 用于检查和轮询队列任务状态
 */

class QueueApi {
  constructor(cloud) {
    this.cloud = cloud;
  }

  /**
   * 检查队列状态
   * @param {string} queueId - 队列ID
   * @returns {Promise<Object>} 状态结果
   */
  async checkQueueStatus(queueId) {
    try {
      const result = await this.cloud.callFunction({
        name: 'checkQueueStatus',
        data: { queue_id: queueId }
      });
      return result.result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 轮询队列状态直到完成或超时
   * @param {string} queueId - 队列ID
   * @param {Object} options - 配置选项
   * @param {number} options.maxPolls - 最大轮询次数（默认60次）
   * @param {number} options.interval - 轮询间隔毫秒（默认3000ms）
   * @param {Function} options.onPoll - 轮询回调函数 (status, count) => void
   * @returns {Promise<Object>} 最终状态结果
   */
  async pollQueueStatus(queueId, options = {}) {
    const {
      maxPolls = 60,
      interval = 3000,
      onPoll = null
    } = options;

    for (let i = 0; i < maxPolls; i++) {
      const status = await this.checkQueueStatus(queueId);

      if (onPoll) {
        onPoll(status, i + 1);
      }

      if (status.success && status.data?.status === 'completed') {
        return {
          status: 'completed',
          assessment_id: status.data.assessment_id,
          ...status.data
        };
      }

      if (status.success && status.data?.status === 'failed') {
        return {
          status: 'failed',
          error: status.data?.error || '生成失败'
        };
      }

      // 非成功状态继续轮询
      await this._delay(interval);
    }

    return { status: 'timeout' };
  }

  /**
   * 延迟工具函数
   * @param {number} ms - 毫秒
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = QueueApi;