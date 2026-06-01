/**
 * 云开发日志上报模块
 *
 * 提供日志缓冲、批量写入和云开发日志集成功能
 */

const { formatLog, LogLevels } = require('./logger');

/**
 * 日志级别权重（用于过滤）
 */
const LEVEL_WEIGHT = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * 云开发日志收集器
 */
class CloudLogger {
  constructor(options = {}) {
    this.db = options.db;
    this.bufferSize = options.bufferSize || 10;
    this.minLevel = options.minLevel || LogLevels.DEBUG;
    this.buffer = [];
    this.session = null;
    this.sessionContext = {};
    this.stats = {
      totalWritten: 0,
      totalFlushed: 0,
      writeErrors: 0
    };
  }

  /**
   * 设置会话信息
   */
  setSession(sessionId, context = {}) {
    this.session = sessionId;
    this.sessionContext = context;
    return this;
  }

  /**
   * 清除会话信息
   */
  clearSession() {
    this.session = null;
    this.sessionContext = {};
    return this;
  }

  /**
   * 检查日志级别是否应该记录
   */
  _shouldLog(level) {
    return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[this.minLevel];
  }

  /**
   * 写入单条日志
   */
  async write(logEntry) {
    // 级别过滤
    if (!this._shouldLog(logEntry.level)) {
      return;
    }

    // 添加会话信息
    const enrichedEntry = {
      ...logEntry
    };
    if (this.session) {
      enrichedEntry.sessionId = this.session;
      if (!enrichedEntry.context) {
        enrichedEntry.context = {};
      }
      Object.assign(enrichedEntry.context, this.sessionContext);
    }

    this.buffer.push(enrichedEntry);
    this.stats.totalWritten++;

    // 达到缓冲区上限时自动刷新
    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  /**
   * 刷新缓冲区到云开发日志
   */
  async flush() {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToWrite = [...this.buffer];
    this.buffer = [];

    try {
      // 写入云开发日志
      // 注意：实际环境中使用云开发日志API，这里模拟写入
      if (this.db) {
        // 云开发日志写入通常通过console自动上报
        // 这里只是记录，实际由云函数运行时收集
        for (const log of logsToWrite) {
          console.log(JSON.stringify(log));
          // 尝试写入数据库（用于测试错误处理）
          if (this.db.collection) {
            const coll = this.db.collection('logs');
            if (coll && coll.add) {
              await coll.add({ data: log });
            }
          }
        }
      } else {
        // 没有db时只输出到console
        for (const log of logsToWrite) {
          console.log(JSON.stringify(log));
        }
      }

      this.stats.totalFlushed += logsToWrite.length;
    } catch (error) {
      // 写入失败时记录错误，但不阻塞程序
      this.stats.writeErrors++;
      // 可以在这里添加重试逻辑
    }
  }

  /**
   * 获取当前缓冲区内容（用于测试）
   */
  getBuffer() {
    return [...this.buffer];
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 便捷方法：记录任务开始
   */
  async logTaskStart(taskId, context) {
    await this.write(formatLog.taskStart({
      taskId,
      ...context
    }));
  }

  /**
   * 便捷方法：记录任务完成
   */
  async logTaskComplete(taskId, result) {
    await this.write(formatLog.taskComplete({
      taskId,
      ...result
    }));
  }

  /**
   * 便捷方法：记录任务失败
   */
  async logTaskFailed(taskId, errorInfo) {
    await this.write(formatLog.taskFailed({
      taskId,
      ...errorInfo
    }));
  }

  /**
   * 便捷方法：记录步骤开始
   */
  async logStepStart(taskId, stepName) {
    await this.write(formatLog.stepStart({
      taskId,
      stepName
    }));
  }

  /**
   * 便捷方法：记录步骤完成
   */
  async logStepComplete(taskId, stepName, duration, output) {
    await this.write(formatLog.stepComplete({
      taskId,
      stepName,
      duration,
      output
    }));
  }

  /**
   * 便捷方法：记录步骤失败
   */
  async logStepFailed(taskId, stepName, errorInfo, duration) {
    await this.write(formatLog.stepFailed({
      taskId,
      stepName,
      ...errorInfo,
      duration
    }));
  }

  /**
   * 便捷方法：记录队列状态
   */
  async logQueueStatus(queueInfo) {
    await this.write(formatLog.queueStatus(queueInfo));
  }
}

module.exports = {
  CloudLogger
};
