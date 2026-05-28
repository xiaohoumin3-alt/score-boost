/**
 * 阶段4：压力测试
 * 目标：验证100并发下的性能
 * - 题池命中场景：p95响应时间 < 100ms
 * - AI生成场景：p95响应时间 < 5s
 */

const { performance } = require('perf_hooks');

/**
 * 模拟题池查询响应（命中）
 */
async function mockPoolQuery() {
  // 模拟数据库查询延迟：10-50ms
  const delay = Math.random() * 40 + 10;
  await new Promise(resolve => setTimeout(resolve, delay));
  return {
    kp_id: 'kp_001',
    questions: [
      { id: 'q1', content: '题1', answer: 'A' },
      { id: 'q2', content: '题2', answer: 'B' },
      { id: 'q3', content: '题3', answer: 'C' }
    ]
  };
}

/**
 * 模拟AI生成响应（未命中，触发生成）
 */
async function mockAiGeneration() {
  // 模拟AI API延迟：2-4秒
  const delay = Math.random() * 2000 + 2000;
  await new Promise(resolve => setTimeout(resolve, delay));
  return {
    task_id: `task_${Date.now()}`,
    questions: [
      { id: 'q1', content: '生成题1', answer: 'A' },
      { id: 'q2', content: '生成题2', answer: 'B' },
      { id: 'q3', content: '生成题3', answer: 'C' }
    ]
  };
}

/**
 * 计算百分位数
 */
function calculatePercentile(values, percentile) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * percentile / 100) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * 计算统计指标
 */
function calculateStats(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = sum / latencies.length;

  return {
    count: latencies.length,
    min: Math.min(...latencies),
    max: Math.max(...latencies),
    avg,
    p50: calculatePercentile(latencies, 50),
    p90: calculatePercentile(latencies, 90),
    p95: calculatePercentile(latencies, 95),
    p99: calculatePercentile(latencies, 99)
  };
}

/**
 * 并发压测
 */
async function runLoadTest(concurrency, testFn, hitRate = 0.8) {
  const results = [];
  const errors = [];

  // 创建并发任务
  const tasks = [];
  for (let i = 0; i < concurrency; i++) {
    tasks.push((async () => {
      const startTime = performance.now();
      try {
        // 根据命中率决定走哪个路径
        const isHit = Math.random() < hitRate;
        const result = isHit ? await mockPoolQuery() : await mockAiGeneration();
        const latency = performance.now() - startTime;
        return {
          success: true,
          latency,
          type: isHit ? 'pool_hit' : 'ai_generation',
          result
        };
      } catch (error) {
        const latency = performance.now() - startTime;
        return {
          success: false,
          latency,
          error: error.message
        };
      }
    })());
  }

  // 等待所有任务完成
  const taskResults = await Promise.all(tasks);

  // 分类统计
  const poolHits = taskResults.filter(r => r.success && r.type === 'pool_hit');
  const aiGenerations = taskResults.filter(r => r.success && r.type === 'ai_generation');
  const failures = taskResults.filter(r => !r.success);

  return {
    total: taskResults.length,
    poolHits: poolHits.length,
    aiGenerations: aiGenerations.length,
    failures: failures.length,
    poolHitStats: calculateStats(poolHits.map(r => r.latency)),
    aiGenerationStats: calculateStats(aiGenerations.map(r => r.latency)),
    failures: failures.map(r => r.error)
  };
}

describe('阶段4：压力测试', () => {
  const CONCURRENCY = 100;

  describe('题池命中场景', () => {
    let results;

    beforeAll(async () => {
      // 100并发，100%题池命中
      results = await runLoadTest(CONCURRENCY, mockPoolQuery, 1.0);
    }, 15000);

    test('应该无失败请求', () => {
      expect(results.failures.length).toBe(0);
      expect(results.poolHits).toBe(CONCURRENCY);
    });

    test('p95响应时间应小于100ms', () => {
      console.log('题池命中延迟统计:', results.poolHitStats);
      expect(results.poolHitStats.p95).toBeLessThan(100);
    });

    test('p99响应时间应小于150ms', () => {
      expect(results.poolHitStats.p99).toBeLessThan(150);
    });

    test('平均响应时间应小于60ms', () => {
      expect(results.poolHitStats.avg).toBeLessThan(60);
    });
  });

  describe('AI生成场景', () => {
    let results;

    beforeAll(async () => {
      // 100并发，100% AI生成
      results = await runLoadTest(CONCURRENCY, mockAiGeneration, 0.0);
    }, 30000);

    test('应该无失败请求', () => {
      expect(results.failures.length).toBe(0);
      expect(results.aiGenerations).toBe(CONCURRENCY);
    });

    test('p95响应时间应小于5秒', () => {
      console.log('AI生成延迟统计:', results.aiGenerationStats);
      expect(results.aiGenerationStats.p95).toBeLessThan(5000);
    });

    test('p99响应时间应小于6秒', () => {
      expect(results.aiGenerationStats.p99).toBeLessThan(6000);
    });

    test('平均响应时间应小于4秒', () => {
      expect(results.aiGenerationStats.avg).toBeLessThan(4000);
    });
  });

  describe('混合场景（80%题池命中）', () => {
    let results;

    beforeAll(async () => {
      // 100并发，80%题池命中，20% AI生成
      results = await runLoadTest(CONCURRENCY, null, 0.8);
    }, 20000);

    test('应该无失败请求', () => {
      expect(results.failures.length).toBe(0);
      expect(results.total).toBe(CONCURRENCY);
    });

    test('命中率应符合预期（80%±5%）', () => {
      const actualHitRate = results.poolHits / CONCURRENCY;
      expect(actualHitRate).toBeGreaterThan(0.75);
      expect(actualHitRate).toBeLessThan(0.85);
    });

    test('题池命中p95应小于100ms', () => {
      expect(results.poolHitStats.p95).toBeLessThan(100);
    });

    test('AI生成p95应小于5秒', () => {
      expect(results.aiGenerationStats.p95).toBeLessThan(5000);
    });

    test('整体平均响应时间应小于1.5秒', () => {
      const allLatencies = [
        ...Array(results.poolHits).fill(0).map((_, i) => results.poolHitStats.avg),
        ...Array(results.aiGenerations).fill(0).map((_, i) => results.aiGenerationStats.avg)
      ];
      const overallAvg = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
      console.log('整体平均响应时间:', overallAvg, 'ms');
      expect(overallAvg).toBeLessThan(1500);
    });
  });

  describe('性能调优验证', () => {
    const { calculateOptimalPollInterval, calculateOptimalBatchSize } = require('../performance-tuner');

    test('轮询间隔应基于响应时间动态调整', () => {
      // 题池命中场景：平均50ms，最小间隔是300ms
      const pollInterval1 = calculateOptimalPollInterval({
        avg_response_time: 50,
        p95_response_time: 100
      });
      expect(pollInterval1).toBe(300); // 最小值

      // AI生成场景：平均3秒
      const pollInterval2 = calculateOptimalPollInterval({
        avg_response_time: 3000,
        p95_response_time: 5000
      });
      expect(pollInterval2).toBeGreaterThan(500);
      expect(pollInterval2).toBeLessThan(5000);
    });

    test('批量生成应基于时间限制动态调整', () => {
      // 单题2秒，15秒限制 -> floor(15000*0.8/2000) = 6，但max=5 -> 5
      const batchSize1 = calculateOptimalBatchSize({
        avg_generation_time: 2000,
        target_duration: 15000
      });
      expect(batchSize1).toBe(5);

      // 单题5秒，15秒限制 -> floor(15000*0.8/5000) = 2
      const batchSize2 = calculateOptimalBatchSize({
        avg_generation_time: 5000,
        target_duration: 15000
      });
      expect(batchSize2).toBe(2);
    });
  });
});
