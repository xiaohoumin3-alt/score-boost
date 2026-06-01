/**
 * 日志格式规范模块
 *
 * 提供统一的日志格式，支持云开发日志查询和监控
 */

/**
 * 日志级别常量
 */
const LogLevels = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

/**
 * 生成ISO 8601格式的时间戳
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * 格式化日志对象
 * @param {Object} params - 日志参数
 * @param {string} params.level - 日志级别
 * @param {string} params.message - 日志消息
 * @param {string} [params.taskId] - 任务ID
 * @param {string} [params.step] - 步骤名称
 * @param {string} [params.event] - 事件类型
 * @param {Object} [params.metrics] - 监控指标
 * @param {Object} [params.error] - 错误信息
 * @param {Object} [params.context] - 业务上下文
 * @param {Object} [params.result] - 执行结果
 * @returns {Object} 结构化日志对象
 */
function formatLog(params) {
  const {
    level,
    message,
    taskId,
    step,
    event,
    metrics,
    error,
    context,
    result
  } = params;

  const log = {
    timestamp: getTimestamp(),
    level,
    message
  };

  // 可选字段：只在有值时添加
  if (taskId) log.taskId = taskId;
  if (step) log.step = step;
  if (event) log.event = event;
  if (metrics) log.metrics = metrics;
  if (error) log.error = error;
  if (context) log.context = context;
  if (result) log.result = result;

  return log;
}

// 预定义日志模板
formatLog.taskStart = ({ taskId, studentId, subject, grade, semester, mode, numQuestions }) => {
  return formatLog({
    level: LogLevels.INFO,
    message: 'Task started',
    taskId,
    event: 'task_start',
    context: {
      studentId,
      subject,
      grade,
      semester,
      mode,
      numQuestions
    }
  });
};

formatLog.taskComplete = ({ taskId, assessmentId, duration, numQuestions }) => {
  return formatLog({
    level: LogLevels.INFO,
    message: 'Task completed',
    taskId,
    event: 'task_complete',
    result: { assessmentId },
    metrics: {
      duration,
      numQuestions
    }
  });
};

formatLog.taskFailed = ({ taskId, error, duration, failedAtStep, cancelled }) => {
  return formatLog({
    level: LogLevels.ERROR,
    message: cancelled ? 'Task cancelled' : 'Task failed',
    taskId,
    event: cancelled ? 'task_cancelled' : 'task_failed',
    error: {
      code: error.code || 'UNKNOWN',
      message: error.message
    },
    metrics: { duration },
    context: {
      failedAtStep,
      cancelled
    }
  });
};

formatLog.stepStart = ({ taskId, stepName }) => {
  return formatLog({
    level: LogLevels.DEBUG,
    message: 'Step started',
    taskId,
    step: stepName,
    event: 'step_start'
  });
};

formatLog.stepComplete = ({ taskId, stepName, duration, output }) => {
  return formatLog({
    level: LogLevels.DEBUG,
    message: 'Step completed',
    taskId,
    step: stepName,
    event: 'step_complete',
    metrics: { duration },
    result: output
  });
};

formatLog.stepFailed = ({ taskId, stepName, error, duration }) => {
  return formatLog({
    level: LogLevels.ERROR,
    message: 'Step failed',
    taskId,
    step: stepName,
    event: 'step_failed',
    error: {
      code: error.code || 'UNKNOWN',
      message: error.message
    },
    metrics: { duration }
  });
};

formatLog.queueStatus = ({ queueDepth, processingCount, avgWaitTime }) => {
  return formatLog({
    level: LogLevels.INFO,
    message: 'Queue status',
    event: 'queue_status',
    metrics: {
      queueDepth,
      processingCount,
      avgWaitTime
    }
  });
};

module.exports = {
  LogLevels,
  formatLog
};
