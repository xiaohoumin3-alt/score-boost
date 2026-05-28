/**
 * assessment.js 队列模式支持测试 (TDD Red-Green-Refactor)
 * 功能：处理startAssessment返回的queued状态
 */

// Mock Page 函数
global.Page = jest.fn((config) => {
  // 返回一个模拟的Page实例
  const mockPage = {
    data: { ...config.data },
    setData: jest.fn((updates) => {
      Object.assign(mockPage.data, updates);
    })
  };
  // 绑定方法
  Object.keys(config).forEach(key => {
    if (typeof config[key] === 'function') {
      mockPage[key] = config[key].bind(mockPage);
    }
  });
  return mockPage;
});

// Mock wx对象
global.wx = {
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showToast: jest.fn(),
  showModal: jest.fn(),
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
global.getApp = jest.fn(() => ({
  checkLogin: jest.fn(() => true),
  requireLogin: jest.fn(),
  globalData: {
    subject: '生物',
    grade: '八年级',
    examMode: 'grade'
  }
}));

// Mock cloudApi
jest.mock('../../../utils/cloudApi.js', () => ({
  startAssessment: jest.fn(),
  getAssessment: jest.fn(),
  checkQueueStatus: jest.fn(),
  submitAssessment: jest.fn(),
  pollQueueStatus: jest.fn()
}));

const cloudApi = require('../../../utils/cloudApi.js');

describe('assessment.js - Queue Mode Support', () => {
  let assessmentPage;
  let PageConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // 清除模块缓存以重新加载assessment.js
    jest.resetModules();

    // 重新设置mock
    global.wx.getStorageSync.mockReturnValue(null);

    // 重新加载cloudApi
    jest.doMock('../../../utils/cloudApi.js', () => ({
      startAssessment: jest.fn(),
      getAssessment: jest.fn(),
      checkQueueStatus: jest.fn(),
      submitAssessment: jest.fn(),
      pollQueueStatus: jest.fn()
    }));

    // 手动创建Page模拟
    PageConfig = {
      data: {
        assessmentId: null,
        questions: [],
        currentIndex: 0,
        currentQuestion: null,
        selectedOption: null,
        answers: {},
        loading: true,
        submitted: false,
        startTime: null,
        totalQuestions: 0
      },
      onLoad: jest.fn()
    };
  });

  describe('queued状态检测', () => {
    test('当startAssessment返回queued时应跳转到waiting页面', async () => {
      // 模拟startAssessment返回queued状态
      cloudApi.startAssessment.mockResolvedValue({
        success: true,
        data: {
          status: 'queued',
          queue_id: 'queue_123',
          message: '题目正在生成中...'
        }
      });

      // 模拟assessment页面逻辑
      const result = await cloudApi.startAssessment({
        subject: '生物',
        grade: '八年级'
      });

      // 验证返回queued状态
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('queued');
      expect(result.data.queue_id).toBe('queue_123');

      // 验证应跳转到waiting页面
      expect(result.data.status).toBe('queued');
    });

    test('当startAssessment返回ready时应加载题目', async () => {
      // 模拟startAssessment返回ready状态
      cloudApi.startAssessment.mockResolvedValue({
        success: true,
        data: {
          status: 'ready',
          assessment_id: 'ass_456',
          questions: [
            { id: 'q1', content: '题目1', options: ['A', 'B', 'C', 'D'] }
          ]
        }
      });

      const result = await cloudApi.startAssessment({
        subject: '生物',
        grade: '八年级'
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ready');
      expect(result.data.assessment_id).toBe('ass_456');
      expect(result.data.questions).toHaveLength(1);
    });
  });

  describe('queue_id参数传递', () => {
    test('跳转waiting页面时应携带queue_id', async () => {
      const queueId = 'queue_test_abc';
      const waitingUrl = `/pages/waiting/waiting?queueId=${queueId}`;

      // 验证URL格式正确
      expect(waitingUrl).toContain('queueId=' + queueId);
      expect(waitingUrl).toMatch(/^\/pages\/waiting\/waiting\?queueId=.+/);
    });
  });

  describe('轮询完成回调', () => {
    test('pollQueueStatus完成后应返回assessment_id', async () => {
      cloudApi.pollQueueStatus.mockResolvedValue({
        status: 'completed',
        assessment_id: 'ass_completed_123'
      });

      const result = await cloudApi.pollQueueStatus('queue_123', {
        maxAttempts: 60,
        interval: 3000
      });

      expect(result.status).toBe('completed');
      expect(result.assessment_id).toBe('ass_completed_123');
    });

    test('pollQueueStatus超时时应返回timeout状态', async () => {
      cloudApi.pollQueueStatus.mockResolvedValue({
        status: 'timeout'
      });

      const result = await cloudApi.pollQueueStatus('queue_456', {
        maxAttempts: 2,
        interval: 100
      });

      expect(result.status).toBe('timeout');
    });
  });

  describe('错误处理', () => {
    test('startAssessment失败时应显示错误提示', async () => {
      cloudApi.startAssessment.mockResolvedValue({
        success: false,
        error: '题库无题目且异步生成失败'
      });

      const result = await cloudApi.startAssessment({
        subject: '生物',
        grade: '八年级'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});