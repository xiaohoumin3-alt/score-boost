/**
 * llm-client 测试
 */

const axios = require('axios');
jest.mock('axios');

const { generateCompletion, generateJSON, DEFAULT_CONFIG } = require('../llm-client');

describe('llm-client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'https://api.deepseek.com';
    process.env.LLM_MODEL = 'deepseek-chat';
    DEFAULT_CONFIG.apiKey = 'test-key';
    DEFAULT_CONFIG.maxRetries = 0; // 测试中不重试
  });

  describe('generateCompletion', () => {
    test('应调用 DeepSeek API 并返回结果', async () => {
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: '测试回复' } }]
        }
      });

      const result = await generateCompletion('测试提示');
      expect(result).toBe('测试回复');
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('LLM_API_KEY 未配置时应抛出错误', async () => {
      DEFAULT_CONFIG.apiKey = undefined;
      delete process.env.LLM_API_KEY;

      await expect(generateCompletion('test')).rejects.toThrow('LLM_API_KEY 未配置');
    });

    test('API 响应格式错误时应抛出错误', async () => {
      axios.post.mockResolvedValue({ data: { invalid: true } });

      await expect(generateCompletion('test')).rejects.toThrow();
    });
  });

  describe('generateJSON', () => {
    test('应解析 LLM 返回的 JSON 数组', async () => {
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: '[{"title":"光合作用","description":"植物合成有机物"}]' } }]
        }
      });

      const result = await generateJSON('提取知识点');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].title).toBe('光合作用');
    });

    test('应解析带 markdown 标记的 JSON', async () => {
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: '```json\n{"match": true}\n```' } }]
        }
      });

      const result = await generateJSON('验证类型');
      expect(result.match).toBe(true);
    });

    test('无效 JSON 时应抛出错误', async () => {
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: '这不是JSON格式的回复' } }]
        }
      });

      await expect(generateJSON('test')).rejects.toThrow('不是有效 JSON');
    });
  });
});
