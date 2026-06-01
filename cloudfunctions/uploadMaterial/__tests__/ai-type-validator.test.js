/**
 * ai-type-validator 测试
 */

jest.mock('../llm-client', () => ({
  generateCompletion: jest.fn()
}));

const { validateTypeMatch, VERIFY_ENABLED } = require('../ai-type-validator');
const { generateCompletion } = require('../llm-client');

describe('ai-type-validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTypeMatch', () => {
    test('应返回匹配结果', async () => {
      generateCompletion.mockResolvedValue('{"match": true, "confidence": 0.9, "reason": "内容与生物学匹配"}');

      const result = await validateTypeMatch('光合作用是植物...', 'biology', '八年级上');

      expect(result.match).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(result.message).toContain('匹配');
    });

    test('应检测不匹配的内容', async () => {
      generateCompletion.mockResolvedValue('{"match": false, "confidence": 0.85, "reason": "内容是数学而非生物"}');

      const result = await validateTypeMatch('二次方程求解...', 'biology', '八年级上');

      expect(result.match).toBe(false);
    });

    test('空文本应跳过验证', async () => {
      const result = await validateTypeMatch('', 'biology', '八年级上');

      expect(result.match).toBe(true);
      expect(generateCompletion).not.toHaveBeenCalled();
    });

    test('LLM 调用失败时应默认通过', async () => {
      generateCompletion.mockRejectedValue(new Error('API 超时'));

      const result = await validateTypeMatch('测试内容', 'biology', '八年级上');

      expect(result.match).toBe(true);
      expect(result.confidence).toBe(0);
      expect(result.message).toContain('验证失败');
    });

    test('LLM 返回非 JSON 时应默认通过', async () => {
      generateCompletion.mockResolvedValue('这不是JSON');

      const result = await validateTypeMatch('测试内容', 'biology', '八年级上');

      expect(result.match).toBe(true);
    });
  });
});
