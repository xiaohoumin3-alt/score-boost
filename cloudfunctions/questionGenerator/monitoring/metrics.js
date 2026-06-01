/**
 * 监控指标采集模块
 *
 * 提供关键指标的采集、聚合和导出功能
 */

/**
 * 指标类型常量
 */
const MetricTypes = {
  COUNTER: 'counter',  // 计数器，只增不减
  GAUGE: 'gauge',      // 仪表盘，可增可减
  HISTOGRAM: 'histogram' // 直方图，记录分布
};

/**
 * 任务级别指标收集器
 */
class TaskMetrics {
  constructor(taskId) {
    this.taskId = taskId;
    this.startTime = null;
    this.endTime = null;
    this.waitTime = 0;
    this.steps = [];
    this.currentStep = null;
    this.status = 'pending';
    this.assessmentId = null;
    this.errorCode = null;
    this.errorMessage = null;
    this.failedAtStep = null;
    this.cancelledAtStep = null;
  }

  start() {
    this.startTime = Date.now();
    return this;
  }

  setWaitTime(ms) {
    this.waitTime = ms;
    return this;
  }

  setTotalDuration(ms) {
    this.endTime = this.startTime + ms;
    return this;
  }

  stepStart(stepName) {
    this.currentStep = {
      name: stepName,
      startTime: Date.now()
    };
    return this;
  }

  stepEnd(stepName) {
    if (this.currentStep && this.currentStep.name === stepName) {
      this.steps.push({
        name: stepName,
        duration: Date.now() - this.currentStep.startTime
      });
      this.currentStep = null;
    }
    return this;
  }

  markSuccess(result) {
    if (!this.endTime) {
      this.endTime = Date.now();
    }
    this.status = 'success';
    this.assessmentId = result.assessmentId || null;
    return this;
  }

  markFailure(error, stepName) {
    if (!this.endTime) {
      this.endTime = Date.now();
    }
    this.status = 'failed';
    this.errorCode = error.code || 'UNKNOWN';
    this.errorMessage = error.message;
    this.failedAtStep = stepName;
    return this;
  }

  markCancelled(stepName) {
    if (!this.endTime) {
      this.endTime = Date.now();
    }
    this.status = 'cancelled';
    this.cancelledAtStep = stepName;
    return this;
  }

  getSummary() {
    // 计算总耗时：优先使用endTime - startTime，否则返回null
    const totalDuration = this.endTime && this.startTime
      ? this.endTime - this.startTime
      : null;

    return {
      taskId: this.taskId,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      totalDuration,
      waitTime: this.waitTime,
      steps: this.steps,
      assessmentId: this.assessmentId,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
      failedAtStep: this.failedAtStep,
      cancelledAtStep: this.cancelledAtStep
    };
  }
}

/**
 * 全局指标收集器
 */
class MetricsCollector {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.tasks = new Map();
    this.failures = new Map();
  }

  /**
   * 递增计数器
   */
  increment(name, value = 1) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
    return this;
  }

  /**
   * 设置仪表盘值
   */
  set(name, value, labels = {}) {
    const labelKey = Object.keys(labels).length > 0
      ? `${name}_${Object.values(labels).join('_')}`
      : name;
    this.gauges.set(labelKey, value);
    return this;
  }

  /**
   * 记录耗时到直方图
   */
  recordDuration(name, value) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name).push(value);
    return this;
  }

  /**
   * 记录失败
   */
  recordFailure(errorCode) {
    const current = this.failures.get(errorCode) || 0;
    this.failures.set(errorCode, current + 1);
    return this;
  }

  /**
   * 创建任务级别指标收集器
   */
  createTaskMetrics(taskId) {
    const taskMetrics = new TaskMetrics(taskId);
    this.tasks.set(taskId, taskMetrics);
    return taskMetrics;
  }

  /**
   * 获取所有指标
   */
  getMetrics() {
    const metrics = {};

    // 计数器
    for (const [name, value] of this.counters) {
      metrics[name] = value;
    }

    // 仪表盘
    for (const [name, value] of this.gauges) {
      metrics[name] = value;
    }

    // 直方图统计
    for (const [name, values] of this.histograms) {
      if (values.length > 0) {
        metrics[`${name}_count`] = values.length;
        metrics[`${name}_sum`] = values.reduce((a, b) => a + b, 0);
        metrics[`${name}_avg`] = values.reduce((a, b) => a + b, 0) / values.length;
        metrics[`${name}_min`] = Math.min(...values);
        metrics[`${name}_max`] = Math.max(...values);

        // 百分位数
        const sorted = [...values].sort((a, b) => a - b);
        metrics[`${name}_p50`] = this._percentile(sorted, 50);
        metrics[`${name}_p95`] = this._percentile(sorted, 95);
        metrics[`${name}_p99`] = this._percentile(sorted, 99);
      }
    }

    return metrics;
  }

  /**
   * 计算百分位数
   * 使用线性插值法计算更精确的百分位数
   */
  _percentile(sortedArray, p) {
    const index = (p / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper >= sortedArray.length) {
      return sortedArray[sortedArray.length - 1];
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * 导出指标快照
   */
  export() {
    return {
      timestamp: new Date().toISOString(),
      metrics: this.getMetrics()
    };
  }

  /**
   * 重置所有指标
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.tasks.clear();
    this.failures.clear();
    return this;
  }

  /**
   * 获取统计摘要
   */
  getStats() {
    const started = this.counters.get('tasks_started') || 0;
    const completed = this.counters.get('tasks_completed') || 0;
    const failed = this.counters.get('tasks_failed') || 0;

    let avgWaitTime = 0;
    let waitTimeCount = 0;
    for (const task of this.tasks.values()) {
      const summary = task.getSummary();
      if (summary.waitTime > 0) {
        avgWaitTime += summary.waitTime;
        waitTimeCount++;
      }
    }
    if (waitTimeCount > 0) {
      avgWaitTime = Math.round(avgWaitTime / waitTimeCount);
    }

    return {
      totalTasks: started,
      completedTasks: completed,
      failedTasks: failed,
      successRate: started > 0 ? completed / started : 0,
      failureRate: started > 0 ? failed / started : 0,
      avgWaitTime
    };
  }

  /**
   * 获取慢任务列表
   */
  getSlowTasks(thresholdMs) {
    const slowTasks = [];
    for (const task of this.tasks.values()) {
      const summary = task.getSummary();
      if (summary.totalDuration && summary.totalDuration > thresholdMs) {
        slowTasks.push({
          taskId: summary.taskId,
          duration: summary.totalDuration,
          status: summary.status
        });
      }
    }
    return slowTasks.sort((a, b) => b.duration - a.duration);
  }

  /**
   * 按错误类型获取失败统计
   */
  getErrorsByType() {
    const errors = {};
    for (const [code, count] of this.failures) {
      errors[code] = count;
    }
    return errors;
  }
}

module.exports = {
  MetricTypes,
  MetricsCollector,
  TaskMetrics
};
