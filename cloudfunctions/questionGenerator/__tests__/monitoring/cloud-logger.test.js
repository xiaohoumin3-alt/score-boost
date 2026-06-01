/**
 * 云开发日志上报测试
 *
 * 验证日志正确上报到云开发日志系统
 */

const { CloudLogger } = require('../../monitoring/cloud-logger');
const { formatLog, LogLevels } = require('../../monitoring/logger');

describe('CloudLogger - 云开发日志上报', () => {
  let cloudLogger;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      collection: jest.fn()
    };
    cloudLogger = new CloudLogger({ db: mockDb });
  });

  describe('基础日志上报', () => {
    test('应将结构化日志写入云开发日志', async () => {
      const logEntry = formatLog({
        level: LogLevels.INFO,
        message: 'Task completed',
        taskId: 'task_123',
        event: 'task_complete'
      });

      await cloudLogger.write(logEntry);

      // 应调用云开发日志API
      expect(cloudLogger.getBuffer()).toHaveLength(1);
      expect(cloudLogger.getBuffer()[0]).toMatchObject({
        level: 'info',
        message: 'Task completed',
        taskId: 'task_123',
        event: 'task_complete'
      });
    });

    test('应支持批量写入日志', async () => {
      const logs = [
        formatLog({ level: LogLevels.INFO, message: 'Log 1', taskId: 'task_1' }),
        formatLog({ level: LogLevels.INFO, message: 'Log 2', taskId: 'task_2' }),
        formatLog({ level: LogLevels.INFO, message: 'Log 3', taskId: 'task_3' })
      ];

      for (const log of logs) {
        await cloudLogger.write(log);
      }

      await cloudLogger.flush();

      expect(cloudLogger.getBuffer()).toHaveLength(0); // flush后清空
    });
  });

  describe('日志缓冲机制', () => {
    test('应在达到缓冲区大小上限时自动刷新', async () => {
      const smallLogger = new CloudLogger({
        db: mockDb,
        bufferSize: 3
      });

      // 写入3条日志，触发自动刷新
      for (let i = 0; i < 3; i++) {
        await smallLogger.write(formatLog({
          level: LogLevels.INFO,
          message: `Log ${i}`,
          taskId: `task_${i}`
        }));
      }

      // 缓冲区应该被清空
      expect(smallLogger.getBuffer()).toHaveLength(0);
    });

    test('应支持手动刷新缓冲区', async () => {
      await cloudLogger.write(formatLog({
        level: LogLevels.INFO,
        message: 'Test',
        taskId: 'task_1'
      }));

      expect(cloudLogger.getBuffer()).toHaveLength(1);

      await cloudLogger.flush();

      expect(cloudLogger.getBuffer()).toHaveLength(0);
    });
  });

  describe('日志级别过滤', () => {
    test('应根据配置的日志级别过滤日志', async () => {
      const debugLogger = new CloudLogger({
        db: mockDb,
        minLevel: LogLevels.INFO
      });

      await debugLogger.write(formatLog({
        level: LogLevels.DEBUG,
        message: 'Debug log',
        taskId: 'task_1'
      }));

      await debugLogger.write(formatLog({
        level: LogLevels.INFO,
        message: 'Info log',
        taskId: 'task_2'
      }));

      // 只有INFO级别日志被记录
      expect(debugLogger.getBuffer()).toHaveLength(1);
      expect(debugLogger.getBuffer()[0].message).toBe('Info log');
    });
  });

  describe('集成日志格式', () => {
    test('应提供便捷方法记录任务事件', async () => {
      await cloudLogger.logTaskStart('task_123', {
        studentId: 'student_456',
        subject: 'math'
      });

      await cloudLogger.logTaskComplete('task_123', {
        assessmentId: 'assessment_789',
        duration: 5000
      });

      await cloudLogger.logTaskFailed('task_123', {
        error: { code: 'AI_TIMEOUT', message: 'Timeout' },
        duration: 30000
      });

      const buffer = cloudLogger.getBuffer();
      expect(buffer).toHaveLength(3);
      expect(buffer[0].event).toBe('task_start');
      expect(buffer[1].event).toBe('task_complete');
      expect(buffer[2].event).toBe('task_failed');
    });

    test('应提供便捷方法记录步骤事件', async () => {
      await cloudLogger.logStepStart('task_123', 'GenerateQuestionsStep');
      await cloudLogger.logStepComplete('task_123', 'GenerateQuestionsStep', 2000);
      await cloudLogger.logStepFailed('task_123', 'GenerateQuestionsStep', {
        error: { code: 'AI_ERROR', message: 'AI failed' }
      }, 1000);

      const buffer = cloudLogger.getBuffer();
      expect(buffer).toHaveLength(3);
      expect(buffer[0].event).toBe('step_start');
      expect(buffer[1].event).toBe('step_complete');
      expect(buffer[2].event).toBe('step_failed');
    });
  });

  describe('错误处理', () => {
    test('应处理写入失败的情况', async () => {
      const errorDb = {
        collection: jest.fn().mockReturnValue({
          add: jest.fn().mockRejectedValue(new Error('Write failed'))
        })
      };

      const errorLogger = new CloudLogger({
        db: errorDb,
        bufferSize: 1
      });

      // 写入应该不抛出错误
      await expect(errorLogger.write(formatLog({
        level: LogLevels.INFO,
        message: 'Test',
        taskId: 'task_1'
      }))).resolves.not.toThrow();
    });

    test('应记录写入失败计数', async () => {
      const errorDb = {
        collection: jest.fn().mockReturnValue({
          add: jest.fn().mockRejectedValue(new Error('Write failed'))
        })
      };

      const errorLogger = new CloudLogger({
        db: errorDb,
        bufferSize: 1
      });

      await errorLogger.write(formatLog({
        level: LogLevels.INFO,
        message: 'Test',
        taskId: 'task_1'
      }));

      const stats = errorLogger.getStats();
      expect(stats.writeErrors).toBe(1);
    });
  });

  describe('会话管理', () => {
    test('应支持会话级别的日志关联', async () => {
      cloudLogger.setSession('session_abc', {
        userId: 'user_123',
        requestId: 'req_456'
      });

      await cloudLogger.write(formatLog({
        level: LogLevels.INFO,
        message: 'Test',
        taskId: 'task_1'
      }));

      const buffer = cloudLogger.getBuffer();
      expect(buffer[0].sessionId).toBe('session_abc');
      expect(buffer[0].context).toMatchObject({
        userId: 'user_123',
        requestId: 'req_456'
      });
    });

    test('应清除会话信息', async () => {
      cloudLogger.setSession('session_abc', { userId: 'user_123' });
      cloudLogger.clearSession();

      await cloudLogger.write(formatLog({
        level: LogLevels.INFO,
        message: 'Test',
        taskId: 'task_1'
      }));

      const buffer = cloudLogger.getBuffer();
      expect(buffer[0].sessionId).toBeUndefined();
    });
  });
});
