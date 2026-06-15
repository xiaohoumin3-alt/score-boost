// pages/admin/irt-data-manager/irt-data-manager.js
Page({
  data: {
    status: {
      mockAssessments: 0,
      questionsWithData: 0,
      totalQuestions: 0,
    },
    result: '',
    refreshing: false,
    updatingStats: false,
    importing: false,
    fullImporting: false,
  },

  onLoad() {
    this.refreshStatus();
  },

  // 刷新状态
  async refreshStatus() {
    this.setData({ refreshing: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'bulkImportMockData',
        data: { action: 'status' },
      });
      if (res.result.success) {
        this.setData({
          status: res.result.data,
          result: '状态刷新成功',
        });
      }
    } catch (e) {
      this.setData({ result: '状态刷新失败: ' + e.message });
    } finally {
      this.setData({ refreshing: false });
    }
  },

  // 更新题目统计
  async updateQuestionStats() {
    this.setData({ updatingStats: true, result: '正在更新题目统计...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'bulkImportMockData',
        data: { action: 'updateQuestionStats' },
      });
      if (res.result.success) {
        const data = res.result.data;
        this.setData({
          result: `题目统计更新完成！\n成功: ${data.updated}\n失败: ${data.errors}\n总计: ${data.total}`,
        });
        this.refreshStatus();
      }
    } catch (e) {
      this.setData({ result: '题目统计更新失败: ' + e.message });
    } finally {
      this.setData({ updatingStats: false });
    }
  },

  // 导入测评记录
  async importAssessments() {
    this.setData({ importing: true, result: '正在导入测评记录...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'bulkImportMockData',
        data: { action: 'importAssessments' },
      });
      if (res.result.success) {
        const data = res.result.data;
        this.setData({
          result: `测评记录导入完成！\n成功: ${data.imported}\n失败: ${data.errors}`,
        });
        this.refreshStatus();
      }
    } catch (e) {
      this.setData({ result: '测评记录导入失败: ' + e.message });
    } finally {
      this.setData({ importing: false });
    }
  },

  // 完整导入
  async fullImport() {
    wx.showModal({
      title: '确认执行',
      content: '完整导入将执行所有数据积累步骤，预计需要1-2分钟。是否继续？',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ fullImporting: true, result: '正在执行完整导入...\n这可能需要1-2分钟...' });
          try {
            const res = await wx.cloud.callFunction({
              name: 'bulkImportMockData',
              data: { action: 'fullImport' },
            });
            if (res.result.success) {
              const data = res.result.data;
              const finalStatus = data.finalStatus;
              this.setData({
                result: `完整导入完成！\n\n` +
                         `测评记录:\n  成功: ${data.assessments.imported}\n  失败: ${data.assessments.errors}\n\n` +
                         `题目统计:\n  成功: ${data.questionStats.updated}\n  失败: ${data.questionStats.errors}\n\n` +
                         `最终状态:\n  模拟测评: ${finalStatus.mockAssessments}\n  有数据题目: ${finalStatus.questionsWithData}\n  总题目数: ${finalStatus.totalQuestions}`,
              });
              this.refreshStatus();
            }
          } catch (e) {
            this.setData({ result: '完整导入失败: ' + e.message });
          } finally {
            this.setData({ fullImporting: false });
          }
        }
      },
    });
  },

  onRefreshStatus() {
    this.refreshStatus();
  },

  onUpdateQuestionStats() {
    this.updateQuestionStats();
  },

  onImportAssessments() {
    this.importAssessments();
  },

  onFullImport() {
    this.fullImport();
  },
});
