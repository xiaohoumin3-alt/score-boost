/**
 * assessment.js 队列模式支持测试 (TDD Red-Green-Refactor)
 * 功能：处理startAssessment返回的queued状态
 */

// Mock wx对象
global.wx = {
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showToast: jest.fn(),
  redirectTo: jest.fn(),
  navigateBack: jest.fn(),
  setStorageSync: jest.fn(),
  getStorageSync: jest.fn(),
  cloud: {
    init: jest.fn(),
    callFunction: jest.fn()
  }
};

// Mock getApp
const mockApp = {
  checkLogin: jest.fn(() => true),
  requireLogin: jest.fn(),
  globalData: {
    subject: '生物',
    grade: '八年级',
    examMode: 'grade'
  }
};
global.getApp = jest.fn(() => mockApp);

// Mock cloudApi
jest.mock('../../utils/cloudApi.js', () => ({
  startAssessment: jest.fn(),
  checkQueueStatus: jest.fn(),
  pollQueueStatus: jest.fn()
}));

const cloudApi = require('../../utils/cloudApi.js');

// 动态require assessment.js，避免初始化问题
let assessmentPage;

describe('assessment.js - Queue Mode Support', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // 重置mock数据
    wx.getStorageSync.mockReturnValue(null);
  });

  describe('startAssessment返回queued状态', () => {
    test('should save queue_id and enter waiting state', async () => {
      // Mock startAssessment返回queued状态
      cloudApi.startAssessment.mockResolvedValue({
        status: 'queued',
        queue_id: 'queue_123',
        message: '题目正在生成中，请稍候...'
      });

      // Mock pollQueueStatus返回completed状态
      cloudApi.pollQueueStatus.mockResolvedValue({
        status: 'completed',
        assessment_id: 'assessment_456'
      });

      // 创建Page实例
      const Page = require('../../pages/assessment/assessment.js');
      const page = new Page();

      // 模拟onLoad
      await page.onLoad({});

      // 验证pollQueueStatus被调用
      expect(cloudApi.pollQueueStatus).toHaveBeenCalledWith(
        'queue_123',
        expect.objectContaining({
          maxAttempts: expect.any(Number),
          onProgress: expect.any(Function)
        })
      );
    });

    test('should show loading message with queue info', async () => {
      cloudApi.startAssessment.mockResolvedValue({
        status: 'queued',
        queue_id: 'queue_123',
        message: '题目正在生成中...'
      });

      cloudApi.pollQueueStatus.mockResolvedValue({
        status: 'completed',
        assessment_id: 'assessment_456'
      });

      const Page = require('../../pages/assessment/assessment.js');
      const page = new Page();

      await page.onLoad({});

      // 验证loading提示
      expect(wx.showLoading).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('生成中')
        })
      );
    });

    test('should handle ready response with assessment_id', async () => {
      cloudApi.startAssessment.mockResolvedValue({
        status: 'ready',
        assessment_id: 'assessment_456'
      });

      const Page = require('../../pages/assessment/assessment.js');
      const page = new Page();

      await page.onLoad({});

      // 应该直接使用assessment_id，不需要轮询
      expect(cloudApi.pollQueueStatus).not.toHaveBeenCalled();
    });
  });

  describe('轮询状态更新', () => {
    test('should update progress callback during polling', async () => {
      cloudApi.startAssessment.mockResolvedValue({
        status: 'queued',
        queue_id: 'queue_123'
      });

      let progressUpdates = [];
      cloudApi.pollQueueStatus.mockImplementation((queueId, options) => {
        // 模拟进度更新
        if (options.onProgress) {
          options.onProgress({ attempt: 1, maxAttempts: 60, status: 'processing' });
          options.onProgress({ attempt: 2, maxAttempts: 60, status: 'processing' });
        }
        return Promise.resolve({
          status: 'completed',
          assessment_id: 'assessment_456'
        });
      });

      const Page = require('../../pages/assessment/assessment.js');
      const page = new Page();

      await page.onLoad({});

      // 验证进度回调被调用
      expect(cloudApi.pollQueueStatus).toHaveBeenCalledWith(
        'queue_123',
        expect.objectContaining({
          onProgress: expect.any(Function)
        })
      );
    });

    test('should handle failed status', async () => {
      cloudApi.startAssessment.mockResolvedValue({
        status: 'queued',
        queue_id: 'queue_123'
      });

      cloudApi.pollQueueStatus.mockResolvedValue({
        status: 'failed',
        error: 'AI generation failed'
      });

      const Page = require('../../pages/assessment/assessment.js');
      const page = new Page();

      await page.onLoad({});

      // 应该显示错误信息
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('失败')
        })
      );
    });
  });

  describe('超时处理', () => {
    test('should handle timeout after max attempts', async () => {
      cloudApi.startAssessment.mockResolvedValue({
        status: 'queued',
        queue_id: 'queue_123'
      });

      cloudApi.pollQueueStatus.mockResolvedValue({
        status: 'timeout',
        exceededMaxAttempts: true
      });

      const Page = require('../../pages/assessment/assessment.js');
      const page = new Page();

      await page.onLoad({});

      // 应该显示超时信息
      expect(wx.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('超时')
        })
      );
    });
  });
});
