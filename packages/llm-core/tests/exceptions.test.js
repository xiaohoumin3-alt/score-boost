/**
 * 异常体系测试
 */

const {
  LLMError,
  LLMConfigError,
  LLMAPIError,
  LLMParseError
} = require('../exceptions');

describe('LLM Exception Classes', () => {
  describe('LLMError', () => {
    test('应该创建基本错误', () => {
      const error = new LLMError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(LLMError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('LLM_ERROR');
      expect(error.name).toBe('LLMError');
    });

    test('应该支持自定义错误码', () => {
      const error = new LLMError('Test error', 'CUSTOM_ERROR');
      expect(error.code).toBe('CUSTOM_ERROR');
    });
  });

  describe('LLMConfigError', () => {
    test('应该创建配置错误', () => {
      const error = new LLMConfigError('API key missing');
      expect(error).toBeInstanceOf(LLMError);
      expect(error).toBeInstanceOf(LLMConfigError);
      expect(error.message).toBe('API key missing');
      expect(error.code).toBe('LLM_CONFIG_ERROR');
      expect(error.name).toBe('LLMConfigError');
    });
  });

  describe('LLMAPIError', () => {
    test('应该创建API错误（所有参数）', () => {
      const error = new LLMAPIError('API failed', 500, true, 60);
      expect(error).toBeInstanceOf(LLMError);
      expect(error).toBeInstanceOf(LLMAPIError);
      expect(error.message).toBe('API failed');
      expect(error.status).toBe(500);
      expect(error.retryable).toBe(true);
      expect(error.retryAfter).toBe(60);
      expect(error.code).toBe('LLM_API_ERROR');
      expect(error.name).toBe('LLMAPIError');
    });

    test('应该支持默认参数', () => {
      const error = new LLMAPIError('API failed');
      expect(error.status).toBeNull();
      expect(error.retryable).toBe(false);
      expect(error.retryAfter).toBeNull();
    });
  });

  describe('LLMParseError', () => {
    test('应该创建解析错误', () => {
      const rawContent = '{invalid json}';
      const error = new LLMParseError('Parse failed', rawContent);
      expect(error).toBeInstanceOf(LLMError);
      expect(error).toBeInstanceOf(LLMParseError);
      expect(error.message).toBe('Parse failed');
      expect(error.rawContent).toBe(rawContent);
      expect(error.code).toBe('LLM_PARSE_ERROR');
      expect(error.name).toBe('LLMParseError');
    });

    test('应该支持不提供rawContent', () => {
      const error = new LLMParseError('Parse failed');
      expect(error.rawContent).toBeNull();
    });
  });
});
