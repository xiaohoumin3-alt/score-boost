/**
 * 错误映射测试
 */

const { mapError, RETRYABLE_STATUS, RETRYABLE_CODES } = require('../error-mapping');
const { LLMConfigError, LLMAPIError, LLMParseError } = require('../exceptions');

describe('Error Mapping', () => {
  describe('常量定义', () => {
    test('RETRYABLE_STATUS 应包含正确的状态码', () => {
      expect(RETRYABLE_STATUS).toContain(429);
      expect(RETRYABLE_STATUS).toContain(500);
      expect(RETRYABLE_STATUS).toContain(502);
      expect(RETRYABLE_STATUS).toContain(503);
      expect(RETRYABLE_STATUS).toContain(504);
    });

    test('RETRYABLE_CODES 应包含正确的错误码', () => {
      expect(RETRYABLE_CODES).toContain('ETIMEDOUT');
      expect(RETRYABLE_CODES).toContain('ECONNREFUSED');
      expect(RETRYABLE_CODES).toContain('ENOTFOUND');
      expect(RETRYABLE_CODES).toContain('ECONNRESET');
      expect(RETRYABLE_CODES).toContain('EAI_AGAIN');
    });
  });

  describe('HTTP 状态码映射', () => {
    test('401 应映射为不可重试的认证错误', () => {
      const error = new Error('Unauthorized');
      const mapped = mapError(error, { status: 401 });
      expect(mapped).toBeInstanceOf(LLMAPIError);
      expect(mapped.status).toBe(401);
      expect(mapped.retryable).toBe(false);
    });

    test('429 应映射为可重试的限流错误', () => {
      const error = new Error('Rate limit');
      const mapped = mapError(error, { status: 429, retryAfter: 5 });
      expect(mapped).toBeInstanceOf(LLMAPIError);
      expect(mapped.status).toBe(429);
      expect(mapped.retryable).toBe(true);
      expect(mapped.retryAfter).toBe(5);
    });

    test('500 应映射为可重试的服务器错误', () => {
      const error = new Error('Internal server error');
      const mapped = mapError(error, { status: 500 });
      expect(mapped).toBeInstanceOf(LLMAPIError);
      expect(mapped.status).toBe(500);
      expect(mapped.retryable).toBe(true);
    });

    test('502 应映射为可重试', () => {
      const error = new Error('Bad gateway');
      const mapped = mapError(error, { status: 502 });
      expect(mapped.retryable).toBe(true);
    });

    test('503 应映射为可重试', () => {
      const error = new Error('Service unavailable');
      const mapped = mapError(error, { status: 503 });
      expect(mapped.retryable).toBe(true);
    });

    test('504 应映射为可重试', () => {
      const error = new Error('Gateway timeout');
      const mapped = mapError(error, { status: 504 });
      expect(mapped.retryable).toBe(true);
    });
  });

  describe('网络错误映射', () => {
    test('ETIMEDOUT 应映射为可重试', () => {
      const error = new Error('Request timeout');
      error.code = 'ETIMEDOUT';
      const mapped = mapError(error);
      expect(mapped).toBeInstanceOf(LLMAPIError);
      expect(mapped.retryable).toBe(true);
    });

    test('ECONNREFUSED 应映射为可重试', () => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      const mapped = mapError(error);
      expect(mapped).toBeInstanceOf(LLMAPIError);
      expect(mapped.retryable).toBe(true);
    });

    test('ENOTFOUND 应映射为可重试', () => {
      const error = new Error('DNS lookup failed');
      error.code = 'ENOTFOUND';
      const mapped = mapError(error);
      expect(mapped).toBeInstanceOf(LLMAPIError);
      expect(mapped.retryable).toBe(true);
    });
  });

  describe('消息内容映射', () => {
    test('rate limit 关键词应映射为可重试', () => {
      const error = new Error('Rate limit exceeded');
      const mapped = mapError(error);
      expect(mapped).toBeInstanceOf(LLMAPIError);
      expect(mapped.retryable).toBe(true);
    });

    test('too many requests 应映射为可重试', () => {
      const error = new Error('Too many requests');
      const mapped = mapError(error);
      expect(mapped.retryable).toBe(true);
    });

    test('quota exceeded 应映射为可重试', () => {
      const error = new Error('Quota exceeded');
      const mapped = mapError(error);
      expect(mapped.retryable).toBe(true);
    });
  });

  describe('配置错误映射', () => {
    test('API key 关键词应映射为配置错误', () => {
      const error = new Error('API key is required');
      const mapped = mapError(error);
      expect(mapped).toBeInstanceOf(LLMConfigError);
    });

    test('密钥关键词应映射为配置错误', () => {
      const error = new Error('密钥未配置');
      const mapped = mapError(error);
      expect(mapped).toBeInstanceOf(LLMConfigError);
    });
  });

  describe('解析错误映射', () => {
    test('SyntaxError 应映射为解析错误', () => {
      const error = new SyntaxError('Unexpected token');
      const mapped = mapError(error, { body: '{invalid}' });
      expect(mapped).toBeInstanceOf(LLMParseError);
      expect(mapped.rawContent).toBe('{invalid}');
    });

    test('JSON.parse 关键词应映射为解析错误', () => {
      const error = new Error('JSON.parse failed');
      const mapped = mapError(error, { body: 'not json' });
      expect(mapped).toBeInstanceOf(LLMParseError);
    });
  });

  describe('超时错误映射', () => {
    test('timeout 关键词应映射为可重试', () => {
      const error = new Error('Request timeout');
      const mapped = mapError(error);
      expect(mapped).toBeInstanceOf(LLMAPIError);
      expect(mapped.retryable).toBe(true);
    });
  });
});
