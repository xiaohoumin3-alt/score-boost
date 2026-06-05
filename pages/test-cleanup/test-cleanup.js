/**
 * 测试页面 - 题池状态查看
 */
Page({
  data: {
    status: 'ready',
    totalDeleted: 0,
    logs: []
  },

  addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.setData({
      logs: [`[${timestamp}] ${message}`].concat(this.data.logs).slice(0, 30)
    });
  },

  async startCleanup() {
    if (this.data.status === 'running') {
      this.addLog('正在处理中...');
      return;
    }

    this.setData({
      status: 'running',
      totalDeleted: 0,
      logs: []
    });

    // 统计题库信息
    this.addLog('正在统计题库信息...');
    try {
      const stats = await wx.cloud.callFunction({
        name: 'statsQuestions',
        data: {}
      });

      console.log('[stats] 返回:', JSON.stringify(stats.result));

      if (stats.result.success) {
        const { totalQuestions, summary, topDuplicates } = stats.result;
        this.addLog(`题库总数: ${totalQuestions} 条`);
        this.addLog(`重复题目: ${summary.totalDuplicates} 条 (${summary.uniqueDuplicates} 种)`);

        if (topDuplicates && topDuplicates.length > 0) {
          this.addLog('--- 最多重复的题目 ---');
          topDuplicates.forEach((item, i) => {
            const preview = item._id ? item._id.substring(0, 25) + '...' : '(空)';
            this.addLog(`${i+1}. ${preview} x${item.count}`);
          });
        }

        if (summary.uniqueDuplicates === 0) {
          this.addLog('✅ 题池已无重复题目！');
        }
      } else {
        this.addLog(`统计失败: ${stats.result.error}`);
      }
    } catch (e) {
      this.addLog(`统计失败: ${e.message}`);
    }

    this.setData({ status: 'ready' });
  },

  onLoad() {
    console.log('[cleanup] Page loaded');
    this.addLog('页面加载完成');
  }
});
