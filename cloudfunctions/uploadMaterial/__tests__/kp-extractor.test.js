/**
 * kp-extractor 测试
 */

const { extractKnowledgePoints, fallbackChunkExtraction, FIXED_CHUNK_SIZE } = require('../kp-extractor');

// Mock llm-client
jest.mock('../llm-client', () => ({
  generateJSON: jest.fn()
}));

const { generateJSON } = require('../llm-client');

describe('kp-extractor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractKnowledgePoints', () => {
    test('应从文本块提取知识点', async () => {
      generateJSON.mockResolvedValue([
        { title: '光合作用', description: '植物利用光能合成有机物', chunk_indices: [0] },
        { title: '呼吸作用', description: '生物氧化有机物释放能量', chunk_indices: [1] }
      ]);

      const result = await extractKnowledgePoints(['光合作用是...', '呼吸作用是...'], {
        subject: 'biology',
        grade: '八年级上'
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].title).toBe('光合作用');
    });

    test('空chunks应返回空数组', async () => {
      const result = await extractKnowledgePoints([]);
      expect(result).toEqual([]);
    });

    test('LLM 返回空结果时应重试后降级', async () => {
      generateJSON.mockRejectedValue(new Error('LLM 失败'));

      const result = await extractKnowledgePoints(['测试文本'], { maxRetries: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].title).toContain('知识点片段');
    });

    test('应重试3次后降级', async () => {
      generateJSON.mockRejectedValue(new Error('超时'));

      const result = await extractKnowledgePoints(['测试'], { maxRetries: 3 });

      expect(generateJSON).toHaveBeenCalledTimes(3);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('fallbackChunkExtraction', () => {
    test('应按固定字符分块', () => {
      const longText = 'a'.repeat(1200);
      const result = fallbackChunkExtraction(longText);

      expect(result.length).toBe(Math.ceil(1200 / FIXED_CHUNK_SIZE));
    });

    test('短文本应返回一个知识点', () => {
      const result = fallbackChunkExtraction('短文本');
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('知识点片段 1');
    });
  });
});
