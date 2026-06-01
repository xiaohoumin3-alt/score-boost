/**
 * 日志格式规范测试
 *
 * 定义统一的日志格式规范，确保所有日志可解析、可查询
 */

const { formatLog, LogLevels } = require('../../monitoring/logger');

describe('Logger - 日志格式规范', () => {
  describe('日志级别常量', () => {
    test('应定义标准日志级别', () => {
      expect(LogLevels).toHaveProperty('DEBUG', 'debug');
      expect(LogLevels).toHaveProperty('INFO', 'info');
      expect(LogLevels).toHaveProperty('WARN', 'warn');
      expect(LogLevels).toHaveProperty('ERROR', 'error');
    });
  });

  describe('formatLog - 基础格式', () => {
    test('应生成包含所有必需字段的结构化日志', () => {
      const log = formatLog({
        level: LogLevels.INFO,
        message: 'Task completed',
        taskId: 'task_123',
        step: 'GenerateQuestionsStep'
      });

      // 必需字段
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('level', 'info');
      expect(log).toHaveProperty('message', 'Task completed');
      expect(log).toHaveProperty('taskId', 'task_123');
      expect(log).toHaveProperty('step', 'GenerateQuestionsStep');
    });

    test('timestamp应为ISO 8601格式', () => {
      const log = formatLog({
        level: LogLevels.INFO,
        message: 'Test'
      });

      expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('formatLog - 监控指标字段', () => {
    test('应支持任务耗时记录', () => {
      const log = formatLog({
        level: LogLevels.INFO,
        message: 'Task completed',
        taskId: 'task_123',
        metrics: {
          duration: 5000,
          stepDuration: 1200
        }
      });

      expect(log.metrics).toEqual({
        duration: 5000,
        stepDuration: 1200
      });
    });

    test('应支持失败原因记录', () => {
      const log = formatLog({
        level: LogLevels.ERROR,
        message: 'AI service failed',
        taskId: 'task_123',
        error: {
          code: 'AI_TIMEOUT',
          message: 'AI service timeout after 30s',
          stack: 'Error: AI service timeout...'
        }
      });

      expect(log.error).toEqual({
        code: 'AI_TIMEOUT',
        message: 'AI service timeout after 30s',
        stack: 'Error: AI service timeout...'
      });
    });

    test('应支持队列指标记录', () => {
      const log = formatLog({
        level: LogLevels.INFO,
        message: 'Queue status',
        metrics: {
          queueDepth: 15,
          processingCount: 3,
          avgWaitTime: 45000
        }
      });

      expect(log.metrics).toEqual({
        queueDepth: 15,
        processingCount: 3,
        avgWaitTime: 45000
      });
    });
  });

  describe('formatLog - 业务上下文', () => {
    test('应支持任意业务上下文字段', () => {
      const log = formatLog({
        level: LogLevels.INFO,
        message: 'Generating questions',
        taskId: 'task_123',
        context: {
          studentId: 'student_456',
          subject: 'math',
          grade: '7',
          numQuestions: 10
        }
      });

      expect(log.context).toEqual({
        studentId: 'student_456',
        subject: 'math',
        grade: '7',
        numQuestions: 10
      });
    });
  });

  describe('formatLog - 预定义日志模板', () => {
    test('应提供任务开始日志模板', () => {
      const log = formatLog.taskStart({
        taskId: 'task_123',
        studentId: 'student_456',
        subject: 'math',
        grade: '7'
      });

      expect(log.level).toBe('info');
      expect(log.message).toBe('Task started');
      expect(log.taskId).toBe('task_123');
      expect(log.event).toBe('task_start');
      expect(log.context).toEqual({
        studentId: 'student_456',
        subject: 'math',
        grade: '7'
      });
    });

    test('应提供任务完成日志模板', () => {
      const log = formatLog.taskComplete({
        taskId: 'task_123',
        assessmentId: 'assessment_789',
        duration: 8000,
        numQuestions: 10
      });

      expect(log.level).toBe('info');
      expect(log.message).toBe('Task completed');
      expect(log.taskId).toBe('task_123');
      expect(log.event).toBe('task_complete');
      expect(log.metrics).toEqual({
        duration: 8000,
        numQuestions: 10
      });
      expect(log.result).toEqual({
        assessmentId: 'assessment_789'
      });
    });

    test('应提供任务失败日志模板', () => {
      const log = formatLog.taskFailed({
        taskId: 'task_123',
        error: {
          code: 'AI_TIMEOUT',
          message: 'AI service timeout'
        },
        duration: 30000,
        failedAtStep: 'GenerateQuestionsStep'
      });

      expect(log.level).toBe('error');
      expect(log.message).toBe('Task failed');
      expect(log.taskId).toBe('task_123');
      expect(log.event).toBe('task_failed');
      expect(log.error).toEqual({
        code: 'AI_TIMEOUT',
        message: 'AI service timeout'
      });
      expect(log.metrics).toEqual({
        duration: 30000
      });
      expect(log.context).toEqual({
        failedAtStep: 'GenerateQuestionsStep'
      });
    });

    test('应提供步骤开始日志模板', () => {
      const log = formatLog.stepStart({
        taskId: 'task_123',
        stepName: 'GenerateQuestionsStep'
      });

      expect(log.level).toBe('debug');
      expect(log.message).toBe('Step started');
      expect(log.step).toBe('GenerateQuestionsStep');
      expect(log.event).toBe('step_start');
    });

    test('应提供步骤完成日志模板', () => {
      const log = formatLog.stepComplete({
        taskId: 'task_123',
        stepName: 'GenerateQuestionsStep',
        duration: 2500,
        output: {
          numQuestions: 10
        }
      });

      expect(log.level).toBe('debug');
      expect(log.message).toBe('Step completed');
      expect(log.step).toBe('GenerateQuestionsStep');
      expect(log.event).toBe('step_complete');
      expect(log.metrics).toEqual({
        duration: 2500
      });
      expect(log.result).toEqual({
        numQuestions: 10
      });
    });
  });

  describe('formatLog - 云开发兼容性', () => {
    test('日志应为可序列化的纯对象', () => {
      const log = formatLog({
        level: LogLevels.INFO,
        message: 'Test',
        taskId: 'task_123',
        metrics: { duration: 5000 },
        error: new Error('Test error')
      });

      // 应该可以安全序列化为JSON
      expect(() => JSON.stringify(log)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(log));
      expect(parsed.level).toBe('info');
    });

    test('应支持云开发日志查询字段', () => {
      // 云开发日志支持按特定字段查询
      const log = formatLog({
        level: LogLevels.INFO,
        message: 'Task completed',
        taskId: 'task_123',
        event: 'task_complete',
        timestamp: new Date().toISOString()
      });

      // 关键索引字段
      expect(log).toHaveProperty('taskId');
      expect(log).toHaveProperty('event');
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('level');
    });
  });
});
