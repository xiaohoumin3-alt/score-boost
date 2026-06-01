/**
 * ai-metrics 测试 (TDD Red-Green-Refactor)
 * 功能：AI题目系统监控指标
 */

const {
  calculateHitRate,
  calculatePregenTriggerRate,
  calculateVerificationRate,
  getSystemMetrics
} = require('../ai-metrics');

describe('calculateHitRate', () => {
  test('should calculate hit rate correctly', () => {
    const stats = {
      total_requests: 100,
      ai_hits: 75,
      fallback_to_bank: 25
    };

    const rate = calculateHitRate(stats);
    expect(rate).toBe(0.75); // 75/100
  });

  test('should handle zero requests', () => {
    const stats = {
      total_requests: 0,
      ai_hits: 0,
      fallback_to_bank: 0
    };

    const rate = calculateHitRate(stats);
    expect(rate).toBe(0);
  });
});

describe('calculatePregenTriggerRate', () => {
  test('should calculate trigger rate', () => {
    const stats = {
      total_requests: 100,
      pregen_triggers: 20
    };

    const rate = calculatePregenTriggerRate(stats);
    expect(rate).toBe(0.2); // 20/100
  });
});

describe('calculateVerificationRate', () => {
  test('should calculate verification rate', () => {
    const pool = [
      { verified: true },
      { verified: true },
      { verified: false },
      { verified: false },
      { verified: false }
    ];

    const rate = calculateVerificationRate(pool);
    expect(rate).toBe(0.4); // 2/5
  });

  test('should handle empty pool', () => {
    const rate = calculateVerificationRate([]);
    expect(rate).toBe(0);
  });
});

describe('getSystemMetrics', () => {
  test('should aggregate all metrics', () => {
    const requestStats = {
      total_requests: 100,
      ai_hits: 70,
      fallback_to_bank: 30,
      pregen_triggers: 15
    };

    const questionPool = [
      { verified: true },
      { verified: true },
      { verified: true },
      { verified: false }
    ];

    const metrics = getSystemMetrics(requestStats, questionPool);

    expect(metrics).toMatchObject({
      hit_rate: 0.7,
      pregen_trigger_rate: 0.15,
      verification_rate: 0.75,
      total_pool_size: 4
    });
  });

  test('should include health status', () => {
    const requestStats = {
      total_requests: 100,
      ai_hits: 80,
      fallback_to_bank: 20,
      pregen_triggers: 10
    };

    const questionPool = Array(20).fill({ verified: true });

    const metrics = getSystemMetrics(requestStats, questionPool);

    expect(metrics.health_status).toBe('healthy'); // 高命中率，高验证率
  });

  test('should flag unhealthy system', () => {
    const requestStats = {
      total_requests: 100,
      ai_hits: 10,
      fallback_to_bank: 90,
      pregen_triggers: 50
    };

    const questionPool = Array(10).fill({ verified: false });

    const metrics = getSystemMetrics(requestStats, questionPool);

    expect(metrics.health_status).toBe('unhealthy'); // 低命中率，低验证率
  });
});
