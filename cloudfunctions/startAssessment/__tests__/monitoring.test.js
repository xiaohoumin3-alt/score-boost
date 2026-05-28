/**
 * 监控埋点模块测试 (TDD Red)
 */

describe('监控埋点模块', () => {
  let mockDb;
  let mockCollection;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock数据库
    mockCollection = {
      add: jest.fn().mockResolvedValue({ _id: 'log_id' }),
      where: jest.fn(() => ({
        count: jest.fn().mockResolvedValue({ total: 100 })
      }))
    };

    mockDb = {
      collection: jest.fn(() => mockCollection),
      command: jest.fn(() => ({
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({}))
        })),
        and: jest.fn(() => ({}))
      }))
    };
  });

  test('应该记录题库查询命中事件', async () => {
    const { logPoolHit } = require('../monitoring');

    await logPoolHit(mockDb, {
      kp_id: 'kp_001',
      difficulty: 'medium',
      cache_type: 'database',
      response_time_ms: 50
    });

    expect(mockDb.collection).toHaveBeenCalledWith('telemetry_logs');
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pool_hit',
        kp_id: 'kp_001',
        difficulty: 'medium',
        cache_type: 'database',
        response_time_ms: 50
      })
    );
  });

  test('应该记录题库查询未命中事件', async () => {
    const { logPoolMiss } = require('../monitoring');

    await logPoolMiss(mockDb, {
      kp_id: 'kp_002',
      difficulty: 'hard',
      reason: 'no_questions'
    });

    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pool_miss',
        kp_id: 'kp_002',
        reason: 'no_questions'
      })
    );
  });

  test('应该记录批量API成功事件', async () => {
    const { logBatchApiSuccess } = require('../monitoring');

    await logBatchApiSuccess(mockDb, {
      kp_id: 'kp_003',
      count_requested: 5,
      count_generated: 5,
      duration_ms: 12000
    });

    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'batch_api_success',
        count_requested: 5,
        count_generated: 5,
        duration_ms: 12000
      })
    );
  });

  test('应该记录批量API失败事件', async () => {
    const { logBatchApiFailure } = require('../monitoring');

    await logBatchApiFailure(mockDb, {
      kp_id: 'kp_004',
      error_code: 'AI_TIMEOUT',
      error_message: 'API request timeout'
    });

    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'batch_api_failure',
        error_code: 'AI_TIMEOUT',
        error_message: 'API request timeout'
      })
    );
  });

  test('应该记录轮询超时事件', async () => {
    const { logPollTimeout } = require('../monitoring');

    await logPollTimeout(mockDb, {
      task_id: 'task_123',
      poll_count: 60,
      elapsed_seconds: 30
    });

    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'poll_timeout',
        task_id: 'task_123',
        poll_count: 60
      })
    );
  });

  test('应该记录降级触发事件', async () => {
    const { logFallbackTriggered } = require('../monitoring');

    await logFallbackTriggered(mockDb, {
      component: 'cache',
      fallback_to: 'database',
      reason: 'cache_connection_failed'
    });

    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'fallback_triggered',
        component: 'cache',
        fallback_to: 'database'
      })
    );
  });

  test('监控记录失败不应抛出异常', async () => {
    const { logPoolHit } = require('../monitoring');

    // 模拟数据库错误
    mockCollection.add.mockRejectedValueOnce(new Error('DB error'));

    // 不应抛出异常
    await expect(logPoolHit(mockDb, { kp_id: 'kp_001' })).resolves.toBeUndefined();
  });

  test('应该支持批量记录监控事件', async () => {
    const { logBatchEvents } = require('../monitoring');

    const events = [
      { event: 'test1', value: 1 },
      { event: 'test2', value: 2 }
    ];

    await logBatchEvents(mockDb, events);

    expect(mockCollection.add).toHaveBeenCalledTimes(2);
  });

  test('应该获取监控统计数据', async () => {
    const { getTelemetryStats } = require('../monitoring');

    // 不指定日期范围的简单查询
    const stats = await getTelemetryStats(mockDb, {
      event: 'pool_hit'
    });

    expect(stats).toHaveProperty('total', 100);
    expect(stats).toHaveProperty('event', 'pool_hit');
  });

  test('应该计算命中率', async () => {
    const { calculateHitRate } = require('../monitoring');

    const hitRate = calculateHitRate({
      hits: 80,
      misses: 20
    });

    expect(hitRate).toBe(0.8);
  });

  test('应该处理除零情况', async () => {
    const { calculateHitRate } = require('../monitoring');

    const hitRate = calculateHitRate({
      hits: 0,
      misses: 0
    });

    expect(hitRate).toBe(0);
  });
});
