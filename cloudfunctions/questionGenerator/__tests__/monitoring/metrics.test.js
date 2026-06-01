/**
 * 监控指标采集测试
 *
 * 验证关键指标的正确采集和聚合
 */

const { MetricsCollector, MetricTypes } = require('../../monitoring/metrics');

describe('MetricsCollector - 指标采集', () => {
  let collector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('指标类型常量', () => {
    test('应定义标准指标类型', () => {
      expect(MetricTypes).toHaveProperty('COUNTER', 'counter');
      expect(MetricTypes).toHaveProperty('GAUGE', 'gauge');
      expect(MetricTypes).toHaveProperty('HISTOGRAM', 'histogram');
    });
  });

  describe('计数器指标', () => {
    test('应支持递增计数器', () => {
      collector.increment('tasks_started');
      collector.increment('tasks_started');
      collector.increment('tasks_started', 5);

      const metrics = collector.getMetrics();
      expect(metrics.tasks_started).toBe(7);
    });

    test('应支持多个独立计数器', () => {
      collector.increment('tasks_started');
      collector.increment('tasks_completed');
      collector.increment('tasks_failed');

      const metrics = collector.getMetrics();
      expect(metrics.tasks_started).toBe(1);
      expect(metrics.tasks_completed).toBe(1);
      expect(metrics.tasks_failed).toBe(1);
    });
  });

  describe('仪表盘指标', () => {
    test('应支持设置仪表盘值', () => {
      collector.set('queue_depth', 10);
      collector.set('queue_depth', 15);
      collector.set('queue_depth', 5);

      const metrics = collector.getMetrics();
      expect(metrics.queue_depth).toBe(5);
    });

    test('应支持带标签的仪表盘', () => {
      collector.set('processing_by_subject', 3, { subject: 'math' });
      collector.set('processing_by_subject', 2, { subject: 'biology' });

      const metrics = collector.getMetrics();
      expect(metrics.processing_by_subject_math).toBe(3);
      expect(metrics.processing_by_subject_biology).toBe(2);
    });
  });

  describe('直方图指标', () => {
    test('应记录任务执行时间分布', () => {
      collector.recordDuration('task_duration', 5000);
      collector.recordDuration('task_duration', 8000);
      collector.recordDuration('task_duration', 3000);

      const metrics = collector.getMetrics();
      expect(metrics.task_duration_count).toBe(3);
      expect(metrics.task_duration_sum).toBe(16000);
      expect(metrics.task_duration_avg).toBeCloseTo(5333.33, 1);
    });

    test('应计算百分位数', () => {
      const durations = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
      durations.forEach(d => collector.recordDuration('task_duration', d));

      const metrics = collector.getMetrics();
      // 使用线性插值法：p50 = index 4.5 => 5000*0.5 + 6000*0.5 = 5500
      expect(metrics.task_duration_p50).toBeCloseTo(5500, 0);
      // p95 = index 8.55 => 9000*0.45 + 10000*0.55 = 9550
      expect(metrics.task_duration_p95).toBeCloseTo(9550, 0);
      // p99 = index 8.91 => 9000*0.09 + 10000*0.91 = 9910
      expect(metrics.task_duration_p99).toBeCloseTo(9910, 0);
    });

    test('应记录步骤耗时分布', () => {
      collector.recordDuration('step_InitStateStep', 100);
      collector.recordDuration('step_GenerateQuestionsStep', 5000);
      collector.recordDuration('step_SaveQuestionsStep', 200);

      const metrics = collector.getMetrics();
      expect(metrics.step_InitStateStep_count).toBe(1);
      expect(metrics.step_GenerateQuestionsStep_count).toBe(1);
      expect(metrics.step_SaveQuestionsStep_count).toBe(1);
    });
  });

  describe('任务级别指标', () => {
    test('应记录单个任务的完整执行', () => {
      const taskMetrics = collector.createTaskMetrics('task_123');

      taskMetrics.start();
      // 设置一个模拟的执行时间
      taskMetrics.setTotalDuration(5000);

      taskMetrics.stepStart('InitStateStep');
      taskMetrics.stepEnd('InitStateStep');

      taskMetrics.stepStart('GenerateQuestionsStep');
      taskMetrics.stepEnd('GenerateQuestionsStep');

      taskMetrics.markSuccess({ assessmentId: 'assessment_456' });

      const summary = taskMetrics.getSummary();
      expect(summary.taskId).toBe('task_123');
      expect(summary.status).toBe('success');
      expect(summary.assessmentId).toBe('assessment_456');
      expect(summary.totalDuration).toBe(5000);
      expect(summary.steps).toHaveLength(2);
    });

    test('应记录任务失败', () => {
      const taskMetrics = collector.createTaskMetrics('task_123');

      taskMetrics.start();
      taskMetrics.stepStart('GenerateQuestionsStep');
      taskMetrics.markFailure({
        code: 'AI_TIMEOUT',
        message: 'AI service timeout'
      }, 'GenerateQuestionsStep');

      const summary = taskMetrics.getSummary();
      expect(summary.status).toBe('failed');
      expect(summary.errorCode).toBe('AI_TIMEOUT');
      expect(summary.failedAtStep).toBe('GenerateQuestionsStep');
    });

    test('应记录任务取消', () => {
      const taskMetrics = collector.createTaskMetrics('task_123');

      taskMetrics.start();
      taskMetrics.markCancelled('InitStateStep');

      const summary = taskMetrics.getSummary();
      expect(summary.status).toBe('cancelled');
      expect(summary.cancelledAtStep).toBe('InitStateStep');
    });
  });

  describe('指标聚合和导出', () => {
    test('应导出所有指标的快照', () => {
      collector.increment('tasks_started');
      collector.set('queue_depth', 10);
      collector.recordDuration('task_duration', 5000);

      const snapshot = collector.export();
      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('metrics');
      expect(snapshot.metrics.tasks_started).toBe(1);
      expect(snapshot.metrics.queue_depth).toBe(10);
    });

    test('应支持重置指标', () => {
      collector.increment('tasks_started');
      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.tasks_started).toBeUndefined();
    });

    test('应计算成功率', () => {
      collector.increment('tasks_started', 10);
      collector.increment('tasks_completed', 8);
      collector.increment('tasks_failed', 2);

      const stats = collector.getStats();
      expect(stats.successRate).toBeCloseTo(0.8, 1);
      expect(stats.failureRate).toBeCloseTo(0.2, 1);
    });
  });

  describe('关键业务指标', () => {
    test('应计算平均等待时间', () => {
      const taskMetrics1 = collector.createTaskMetrics('task_1');
      const taskMetrics2 = collector.createTaskMetrics('task_2');

      // 模拟不同等待时间
      taskMetrics1.setWaitTime(30000);
      taskMetrics2.setWaitTime(60000);

      taskMetrics1.markSuccess({});
      taskMetrics2.markSuccess({});

      const stats = collector.getStats();
      expect(stats.avgWaitTime).toBe(45000);
    });

    test('应检测慢任务', () => {
      const taskMetrics = collector.createTaskMetrics('task_slow');

      taskMetrics.start();
      // 模拟慢任务（超过10秒）
      taskMetrics.setTotalDuration(15000);
      taskMetrics.markSuccess({});

      const slowTasks = collector.getSlowTasks(10000);
      expect(slowTasks).toHaveLength(1);
      expect(slowTasks[0].taskId).toBe('task_slow');
      expect(slowTasks[0].duration).toBe(15000);
    });

    test('应统计按错误类型的失败', () => {
      collector.recordFailure('AI_TIMEOUT');
      collector.recordFailure('AI_TIMEOUT');
      collector.recordFailure('DB_ERROR');

      const errors = collector.getErrorsByType();
      expect(errors.AI_TIMEOUT).toBe(2);
      expect(errors.DB_ERROR).toBe(1);
    });
  });
});
