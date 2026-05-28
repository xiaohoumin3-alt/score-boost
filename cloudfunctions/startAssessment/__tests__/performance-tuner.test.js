/**
 * 性能调优模块测试
 */

describe('性能调优模块', () => {
  const {
    calculateOptimalPollInterval,
    calculateOptimalBatchSize,
    shouldPreWarmCache,
    calculatePreWarmQuestions,
    adjustExpansionThreshold,
    calculatePerformanceMetrics,
    generateOptimizationSuggestions
  } = require('../performance-tuner');

  describe('计算最优轮询间隔', () => {
    test('应该基于平均响应时间计算间隔', () => {
      const interval = calculateOptimalPollInterval({
        avg_response_time: 500,
        p95_response_time: 2000
      });

      // 500 * 1.5 = 750
      expect(interval).toBe(750);
    });

    test('应该最小间隔为300ms', () => {
      const interval = calculateOptimalPollInterval({
        avg_response_time: 100,
        p95_response_time: 200
      });

      expect(interval).toBe(300);
    });

    test('应该不超过P95的80%', () => {
      const interval = calculateOptimalPollInterval({
        avg_response_time: 3000,
        p95_response_time: 5000
      });

      // 3000 * 1.5 = 4500, 但 P95 * 0.8 = 4000
      expect(interval).toBe(4000);
    });

    test('应该使用默认值处理空参数', () => {
      const interval = calculateOptimalPollInterval({});

      expect(interval).toBeGreaterThan(0);
    });
  });

  describe('计算批量生成最优批次大小', () => {
    test('应该基于平均生成时间计算批次', () => {
      const batchSize = calculateOptimalBatchSize({
        avg_generation_time: 5000,
        target_duration: 15000
      });

      // 15000 * 0.8 / 5000 = 2.4, floor = 2
      expect(batchSize).toBe(2);
    });

    test('应该最小批次为1', () => {
      const batchSize = calculateOptimalBatchSize({
        avg_generation_time: 20000,
        target_duration: 15000
      });

      expect(batchSize).toBe(1);
    });

    test('应该最大批次为5', () => {
      const batchSize = calculateOptimalBatchSize({
        avg_generation_time: 1000,
        target_duration: 15000
      });

      expect(batchSize).toBeLessThanOrEqual(5);
    });
  });

  describe('判断是否需要预热缓存', () => {
    test('低命中率+高请求应该预热', () => {
      const shouldWarm = shouldPreWarmCache({
        hit_rate: 0.5,
        request_count: 100
      });

      expect(shouldWarm).toBe(true);
    });

    test('高命中率不应该预热', () => {
      const shouldWarm = shouldPreWarmCache({
        hit_rate: 0.8,
        request_count: 100
      });

      expect(shouldWarm).toBe(false);
    });

    test('低请求量不应该预热', () => {
      const shouldWarm = shouldPreWarmCache({
        hit_rate: 0.4,
        request_count: 30
      });

      expect(shouldWarm).toBe(false);
    });
  });

  describe('计算预热题目数量', () => {
    test('应该基于日均请求计算', () => {
      const count = calculatePreWarmQuestions({
        daily_requests: 1000,
        current_questions: 100
      });

      // 1000 * 0.2 - 100 = 100
      expect(count).toBe(100);
    });

    test('题目充足时返回0', () => {
      const count = calculatePreWarmQuestions({
        daily_requests: 1000,
        current_questions: 250
      });

      expect(count).toBe(0);
    });

    test('应该使用默认值处理空参数', () => {
      const count = calculatePreWarmQuestions({});

      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('调整扩容阈值', () => {
    test('高命中率应该降低阈值', () => {
      const threshold = adjustExpansionThreshold({
        current_hit_rate: 0.9,
        current_threshold: 3
      });

      expect(threshold).toBe(2);
    });

    test('低命中率应该提高阈值', () => {
      const threshold = adjustExpansionThreshold({
        current_hit_rate: 0.4,
        current_threshold: 3
      });

      expect(threshold).toBe(4);
    });

    test('中等命中率保持阈值', () => {
      const threshold = adjustExpansionThreshold({
        current_hit_rate: 0.7,
        current_threshold: 3
      });

      expect(threshold).toBe(3);
    });

    test('阈值应该有最小值1', () => {
      const threshold = adjustExpansionThreshold({
        current_hit_rate: 0.95,
        current_threshold: 1
      });

      expect(threshold).toBe(1);
    });

    test('阈值应该有最大值10', () => {
      const threshold = adjustExpansionThreshold({
        current_hit_rate: 0.3,
        current_threshold: 10
      });

      expect(threshold).toBe(10);
    });
  });

  describe('计算性能指标', () => {
    test('应该正确计算各项命中率', () => {
      const metrics = calculatePerformanceMetrics({
        total_requests: 100,
        cache_hits: 30,
        pool_hits: 40,
        api_calls: 30
      });

      expect(metrics.cache_hit_rate).toBe(0.3);
      expect(metrics.pool_hit_rate).toBe(0.4);
      expect(metrics.api_call_rate).toBe(0.3);
      expect(metrics.overall_hit_rate).toBe(0.7);
    });

    test('零请求应该返回零指标', () => {
      const metrics = calculatePerformanceMetrics({
        total_requests: 0
      });

      expect(metrics.total_requests).toBe(0);
      expect(metrics.cache_hit_rate).toBe(0);
      expect(metrics.overall_hit_rate).toBe(0);
    });
  });

  describe('生成优化建议', () => {
    test('低命中率应该建议预热', () => {
      const suggestions = generateOptimizationSuggestions({
        overall_hit_rate: 0.5
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].priority).toBe('high');
      expect(suggestions[0].type).toBe('cache');
    });

    test('高API调用应该建议预生成', () => {
      const suggestions = generateOptimizationSuggestions({
        overall_hit_rate: 0.8,
        api_call_rate: 0.5
      });

      const hasGenerationSuggestion = suggestions.some(
        s => s.type === 'generation'
      );
      expect(hasGenerationSuggestion).toBe(true);
    });

    test('缓存命中率低于题池应该建议Redis', () => {
      const suggestions = generateOptimizationSuggestions({
        cache_hit_rate: 0.1,
        pool_hit_rate: 0.7,
        overall_hit_rate: 0.8
      });

      const hasRedisSuggestion = suggestions.some(
        s => s.message.includes('Redis')
      );
      expect(hasRedisSuggestion).toBe(true);
    });

    test('高命中率应该无高优建议', () => {
      const suggestions = generateOptimizationSuggestions({
        overall_hit_rate: 0.95,
        api_call_rate: 0.05
      });

      const highPrioritySuggestions = suggestions.filter(
        s => s.priority === 'high'
      );
      expect(highPrioritySuggestions).toHaveLength(0);
    });
  });
});
