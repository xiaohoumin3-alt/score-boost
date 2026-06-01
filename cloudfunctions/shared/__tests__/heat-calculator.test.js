/**
 * 热度计算器测试 (TDD Red-Green-Refactor)
 */

const {
  calculateHeatScore,
  updateDailyLog,
  getHeatLevel,
  getTargetPoolSize
} = require('../heat-calculator');

describe('calculateHeatScore', () => {
  test('should return 0 for null input', () => {
    expect(calculateHeatScore(null)).toBe(0);
  });

  test('should return 0 for zero request count', () => {
    const result = calculateHeatScore({ request_count: 0 });
    expect(result).toBe(0);
  });

  test('should return score between 0-10 for normal requests', () => {
    const result = calculateHeatScore({
      request_count: 100,
      last_request_at: new Date().toISOString()
    });
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(10);
  });

  test('should decay score over time', () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const recentResult = calculateHeatScore({
      request_count: 100,
      last_request_at: now.toISOString()
    });

    const oldResult = calculateHeatScore({
      request_count: 100,
      last_request_at: oldDate.toISOString()
    });

    expect(oldResult).toBeLessThan(recentResult);
  });
});

describe('updateDailyLog', () => {
  test('should add new date entry when date not exists', () => {
    const result = updateDailyLog([], '2026-05-20', '2026-05-20');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-05-20');
    expect(result[0].count).toBe(1);
  });

  test('should increment count when date already exists', () => {
    const existing = [{ date: '2026-05-20', count: 5 }];
    const result = updateDailyLog(existing, '2026-05-20', '2026-05-20');
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(6);
  });

  test('should keep only last 7 days', () => {
    // 使用明确日期：假设今天是 2026-05-20
    // 7天前是 2026-05-13，更早的应该被过滤
    const existing = [
      { date: '2026-05-12', count: 10 },  // 8天前，应被过滤
      { date: '2026-05-19', count: 5 }
    ];

    const result = updateDailyLog(existing, '2026-05-20', '2026-05-20');
    expect(result).toHaveLength(2); // 2026-05-19和2026-05-20都保留
    expect(result.some(e => e.date === '2026-05-12')).toBe(false);
  });
});

describe('getHeatLevel', () => {
  test('should return high for score >= 7', () => {
    expect(getHeatLevel(7)).toBe('high');
    expect(getHeatLevel(10)).toBe('high');
  });

  test('should return medium for score >= 4 and < 7', () => {
    expect(getHeatLevel(4)).toBe('medium');
    expect(getHeatLevel(6)).toBe('medium');
  });

  test('should return low for score < 4', () => {
    expect(getHeatLevel(0)).toBe('low');
    expect(getHeatLevel(3)).toBe('low');
  });
});

describe('getTargetPoolSize', () => {
  test('should return 20 for high heat', () => {
    expect(getTargetPoolSize('high')).toBe(20);
  });

  test('should return 5 for medium heat', () => {
    expect(getTargetPoolSize('medium')).toBe(5);
  });

  test('should return 2 for low heat', () => {
    expect(getTargetPoolSize('low')).toBe(2);
  });
});
