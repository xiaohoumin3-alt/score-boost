/**
 * 重试逻辑测试
 */

const { retryWithBackoff, retryWithBackoffCustom, calculateDelay, sleep } = require('../retry');
const { LLMAPIError } = require('../exceptions');

describe('Retry Logic', () => {
  describe('calculateDelay', () => {
    test('应该计算正确的指数退避延迟', () => {
      expect(calculateDelay(0, 1000, 60000)).toBe(1000);
      expect(calculateDelay(1, 1000, 60000)).toBe(2000);
      expect(calculateDelay(2, 1000, 60000)).toBe(4000);
      expect(calculateDelay(3, 1000, 60000)).toBe(8000);
    });

    test('应该遵守最大延迟限制', () => {
      expect(calculateDelay(10, 1000, 60000)).toBe(60000);
      expect(calculateDelay(100, 1000, 60000)).toBe(60000);
    });
  });

  describe('sleep', () => {
    test('应该等待指定时间', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(150);
    }, 200);
  });

  describe('retryWithBackoff', () => {
    test('成功时应立即返回结果', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('可重试错误应触发重试', async () => {
      const error = new LLMAPIError('Temporary error', 500, true);
      let attempts = 0;
      const fn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw error;
        }
        return Promise.resolve('success');
      });

      const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('达到最大重试次数后应抛出错误', async () => {
      const error = new LLMAPIError('Persistent error', 500, true);
      const fn = jest.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, { maxRetries: 2, baseDelay: 10 }))
        .rejects.toThrow('Persistent error');
      expect(fn).toHaveBeenCalledTimes(3); // 初始调用 + 2次重试
    });

    test('不可重试错误应立即抛出', async () => {
      const error = new LLMAPIError('Auth error', 401, false);
      const fn = jest.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, { maxRetries: 3, baseDelay: 10 }))
        .rejects.toThrow('Auth error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('应调用 onRetry 回调', async () => {
      const error = new LLMAPIError('Temporary error', 500, true);
      const onRetry = jest.fn();
      let attempts = 0;
      const fn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          throw error;
        }
        return Promise.resolve('success');
      });

      await retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelay: 10,
        onRetry
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1, // attempt number
        expect.any(LLMAPIError),
        expect.any(Number) // delay
      );
    });
  });

  describe('retryWithBackoffCustom', () => {
    test('应该使用自定义判断逻辑', async () => {
      const error = new Error('Custom error');
      let attempts = 0;
      const fn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          throw error;
        }
        return Promise.resolve('success');
      });

      const shouldRetry = (err) => err.message === 'Custom error';

      const result = await retryWithBackoffCustom(fn, shouldRetry, {
        maxRetries: 3,
        baseDelay: 10
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('自定义判断返回 false 时应停止重试', async () => {
      const error = new Error('Custom error');
      const fn = jest.fn().mockRejectedValue(error);
      const shouldRetry = () => false;

      await expect(retryWithBackoffCustom(fn, shouldRetry, { maxRetries: 3 }))
        .rejects.toThrow('Custom error');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
