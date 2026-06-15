/**
 * assessment-depth queued 状态与轮询测试
 */

const fs = require('fs');
const path = require('path');

function flushPromises() {
  return Promise.resolve();
}

function loadPage() {
  let pageConfig;
  global.getApp = jest.fn(() => ({
    globalData: { grade: '2', subject: 'math' }
  }));
  global.Page = jest.fn(config => {
    pageConfig = config;
  });
  global.wx = {
    showToast: jest.fn(),
    cloud: { callFunction: jest.fn() }
  };

  jest.resetModules();
  require('../assessment-depth.js');

  const page = {
    data: { ...pageConfig.data },
    setData: jest.fn(updates => {
      Object.assign(page.data, updates);
    })
  };

  Object.keys(pageConfig).forEach(key => {
    if (typeof pageConfig[key] === 'function') {
      page[key] = pageConfig[key].bind(page);
    }
  });

  return page;
}

describe('assessment-depth queued 状态与轮询', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('data 包含 queued 轮询字段', () => {
    const page = loadPage();

    expect(page.data.queueId).toBe('');
    expect(page.data.queuePollTimer).toBeNull();
    expect(page.data.queuePollAttempts).toBe(0);
    expect(page.data.queueMessage).toBe('');
    expect(page.data.queueRetryTimer).toBeNull();
    expect(page.data.hasRetriedAfterQueue).toBe(false);
    expect(page.data.errorMessage).toBe('');
  });

  test('startExtendedAssessment 收到 queued 后进入 queued 状态并开始轮询', async () => {
    const page = loadPage();
    page.data.grade = 2;
    page.data.subject = 'math';
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        status: 'queued',
        queue_id: 'queue-1',
        message: '生成中'
      }
    });

    await page.startExtendedAssessment();

    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'extendedAssessment',
      data: { action: 'startExtendedAssessment', grade: 2, subject: 'math' }
    });
    expect(page.data.status).toBe('queued');
    expect(page.data.queueId).toBe('queue-1');
    expect(page.data.queueMessage).toBe('生成中');
    expect(page.data.queuePollTimer).toBeNull();
    expect(page.queuePollTimer).not.toBeNull();
  });

  test('队列 completed 且有 question_ids 时停止轮询并带 after_queue_id 重启', async () => {
    const page = loadPage();
    page.startExtendedAssessment = jest.fn();
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: { status: 'completed', queue_id: 'queue-1', question_ids: ['q1'] }
      }
    });

    page.startQueuePolling('queue-1');
    jest.advanceTimersByTime(2000);
    await flushPromises();
    jest.advanceTimersByTime(500);

    expect(page.data.queuePollTimer).toBeNull();
    expect(page.data.hasRetriedAfterQueue).toBe(true);
    expect(page.startExtendedAssessment).toHaveBeenCalledWith({ after_queue_id: 'queue-1' });
  });

  test('已通过 after_queue_id 重试后再次 completed 应进入 error 避免无限循环', async () => {
    const page = loadPage();
    page.data.hasRetriedAfterQueue = true;
    page.startExtendedAssessment = jest.fn();
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: { status: 'completed', queue_id: 'queue-1', question_ids: ['q1'] }
      }
    });

    page.startQueuePolling('queue-1');
    jest.advanceTimersByTime(2000);
    await flushPromises();

    expect(page.data.status).toBe('error');
    expect(page.data.errorMessage).toContain('题目生成后仍不足');
    expect(page.startExtendedAssessment).not.toHaveBeenCalled();
  });

  test('队列 completed 但 question_ids 为空时进入 error', async () => {
    const page = loadPage();
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: { status: 'completed', queue_id: 'queue-1', question_ids: [] }
      }
    });

    page.startQueuePolling('queue-1');
    jest.advanceTimersByTime(2000);
    await flushPromises();

    expect(page.data.status).toBe('error');
    expect(page.data.errorMessage).toContain('题目生成完成但没有可用题目');
    expect(page.data.queuePollTimer).toBeNull();
  });

  test('ready 后应预计算 currentQuestion/currentOptions 供 WXML 简单渲染', async () => {
    const page = loadPage();
    page.data.grade = 2;
    page.data.subject = 'math';
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        session_id: 'session-1',
        questions: [{ question_id: 'q1', content: '题目', options: ['A. 甲', 'B. 乙'] }]
      }
    });

    await page.startExtendedAssessment();

    expect(page.data.currentQuestion.content).toBe('题目');
    expect(page.data.currentOptions).toEqual([
      { label: 'A', text: '甲', selected: false },
      { label: 'B', text: '乙', selected: false }
    ]);
  });

  test('WXML 不应依赖 questions[currentIndex] 动态下标渲染当前题', () => {
    const wxml = fs.readFileSync(path.join(__dirname, '../assessment-depth.wxml'), 'utf8');

    expect(wxml).not.toContain('questions[currentIndex]');
    expect(wxml).toContain('currentQuestion');
    expect(wxml).toContain('currentOptions');
  });

  test('queued 响应无 message 时使用默认文案', async () => {
    const page = loadPage();
    page.data.grade = 2;
    page.data.subject = 'math';
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        status: 'queued',
        queue_id: 'queue-1'
      }
    });

    await page.startExtendedAssessment();

    expect(page.data.queueMessage).toBe('题目生成中，请稍候...');
  });

  test('getNextQuestion 返回的新题应解析 parsedOptions', async () => {
    const page = loadPage();
    page.data.sessionId = 'session-1';
    page.data.questions = [{ question_id: 'q0', parsedOptions: ['旧A'] }];
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        question: {
          question_id: 'q1',
          content: '新题',
          options: [{ key: 'A', value: '选项A' }, { key: 'B', value: '选项B' }]
        },
        current_se: 0.7,
        progress: { current_question: 2 }
      }
    });

    await page.onContinueAssessment();

    expect(page.data.questions[1].parsedOptions).toEqual(['选项A', '选项B']);
    expect(page.data.phase).toBe('second');
    expect(page.data.status).toBe('ready');
  });

  test('checkQueueStatus 返回失败时立即进入 error', async () => {
    const page = loadPage();
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: { success: false, error: 'Queue task not found or has expired' }
    });

    page.startQueuePolling('queue-missing');
    jest.advanceTimersByTime(2000);
    await flushPromises();

    expect(page.data.status).toBe('error');
    expect(page.data.errorMessage).toBe('Queue task not found or has expired');
    expect(page.data.queuePollTimer).toBeNull();
  });

  test('队列 failed 时停止轮询并展示错误', async () => {
    const page = loadPage();
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: { status: 'failed', error: '生成失败' }
      }
    });

    page.startQueuePolling('queue-1');
    jest.advanceTimersByTime(2000);
    await flushPromises();

    expect(page.data.status).toBe('error');
    expect(page.data.errorMessage).toBe('生成失败');
    expect(page.data.queuePollTimer).toBeNull();
  });

  test('队列 timeout 时停止轮询并展示超时错误', async () => {
    const page = loadPage();
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: {
        success: true,
        data: { status: 'timeout', message: '服务端生成超时' }
      }
    });

    page.startQueuePolling('queue-1');
    jest.advanceTimersByTime(2000);
    await flushPromises();

    expect(page.data.status).toBe('error');
    expect(page.data.errorMessage).toBe('服务端生成超时');
    expect(page.data.queuePollTimer).toBeNull();
  });

  test('轮询超时后停止并允许重试', async () => {
    const page = loadPage();
    wx.cloud.callFunction.mockResolvedValue({
      result: {
        success: true,
        data: { status: 'processing' }
      }
    });

    page.startQueuePolling('queue-1');
    for (let i = 0; i < 45; i++) {
      jest.advanceTimersByTime(2000);
      await flushPromises();
    }

    expect(page.data.status).toBe('error');
    expect(page.data.errorMessage).toContain('生成超时');
    expect(page.data.queuePollTimer).toBeNull();
  });

  test('onRetry 应清空旧测评状态并启动新测评', () => {
    const page = loadPage();
    page.startExtendedAssessment = jest.fn();
    page.data.sessionId = 'old-session';
    page.data.questions = [{ question_id: 'old' }];
    page.data.currentIndex = 2;
    page.data.answers = { 0: 'A' };
    page.data.phase = 'second';
    page.data.phase1Completed = true;
    page.data.accuracyMeter = { current: 80 };
    page.data.extensionRecommendation = { should_extend: true };
    page.data.progress = { current_question: 3 };
    page.data.finalResult = { final_score: 90 };
    page.data.queueId = 'queue-old';
    page.data.queuePollAttempts = 10;
    page.data.queueMessage = 'old';
    page.data.hasRetriedAfterQueue = true;
    page.data.errorMessage = 'old error';

    page.onRetry();

    expect(page.data.sessionId).toBe('');
    expect(page.data.questions).toEqual([]);
    expect(page.data.currentIndex).toBe(0);
    expect(page.data.answers).toEqual({});
    expect(page.data.phase).toBe('first');
    expect(page.data.phase1Completed).toBe(false);
    expect(page.data.accuracyMeter).toBeNull();
    expect(page.data.extensionRecommendation).toBeNull();
    expect(page.data.progress).toBeNull();
    expect(page.data.finalResult).toBeNull();
    expect(page.data.queueId).toBe('');
    expect(page.data.queuePollAttempts).toBe(0);
    expect(page.data.queueMessage).toBe('');
    expect(page.data.hasRetriedAfterQueue).toBe(false);
    expect(page.data.errorMessage).toBe('');
    expect(page.startExtendedAssessment).toHaveBeenCalledWith();
  });

  test('WXML 提供 Phase 2 提交入口', () => {
    const wxml = fs.readFileSync(path.join(__dirname, '../assessment-depth.wxml'), 'utf8');

    expect(wxml).toContain('phase === \'second\'');
    expect(wxml).toContain('onSubmitPhase2');
  });

  test('WXML 展示 queued 消息和具体错误消息', () => {
    const wxml = fs.readFileSync(path.join(__dirname, '../assessment-depth.wxml'), 'utf8');

    expect(wxml).toContain("status === 'queued'");
    expect(wxml).toContain('queueMessage');
    expect(wxml).toContain('预计需要 10-30 秒');
    expect(wxml).toContain('errorMessage');

    const wxss = fs.readFileSync(path.join(__dirname, '../assessment-depth.wxss'), 'utf8');
    expect(wxss).toContain('.queued-state');
    expect(wxss).toContain('.queued-title');
    expect(wxss).toContain('.queued-message');
  });

  test('timer 句柄不应通过 setData 写入渲染层 data', () => {
    const page = loadPage();

    page.startQueuePolling('queue-1');

    expect(page.setData).not.toHaveBeenCalledWith(expect.objectContaining({ queuePollTimer: expect.anything() }));
    expect(page.setData).not.toHaveBeenCalledWith(expect.objectContaining({ queueRetryTimer: expect.anything() }));
    expect(page.queuePollTimer).not.toBeNull();
  });

  test('stopQueuePolling 清理轮询和重试 timer', () => {
    const page = loadPage();
    page.queuePollTimer = setInterval(() => {}, 2000);
    page.queueRetryTimer = setTimeout(() => {}, 500);

    page.stopQueuePolling();

    expect(page.queuePollTimer).toBeNull();
    expect(page.queueRetryTimer).toBeNull();
    expect(page.data.queuePollTimer).toBeNull();
    expect(page.data.queueRetryTimer).toBeNull();
  });
});
