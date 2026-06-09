/**
 * embedder 真实测试
 *
 * 分为两组：
 * - 单元测试：参数校验、常量、错误处理（不依赖网络）
 * - 集成测试（@integration）：调用真实嵌入 API（npm run test:integration）
 *
 * 不使用 jest.mock
 */

const {
  WENXIN_PROVIDER,
  QIANWEN_PROVIDER,
  generateEmbedding,
  generateBatchEmbeddings,
  getWenxinAccessToken,
  callQianwenEmbedding
} = require('../embedder');

// ============================================================
// 单元测试 — 不依赖网络，npm test 正常运行
// ============================================================

describe('embedder — 单元测试', () => {

  describe('Constants', () => {
    test('WENXIN_PROVIDER should be "wenxin"', () => {
      expect(WENXIN_PROVIDER).toBe('wenxin');
    });

    test('QIANWEN_PROVIDER should be "qianwen"', () => {
      expect(QIANWEN_PROVIDER).toBe('qianwen');
    });
  });

  describe('generateEmbedding — input validation', () => {
    test('should throw on empty string', async () => {
      await expect(generateEmbedding('')).rejects.toThrow('输入文本不能为空');
    });

    test('should throw on null', async () => {
      await expect(generateEmbedding(null)).rejects.toThrow();
    });

    test('should throw on undefined', async () => {
      await expect(generateEmbedding(undefined)).rejects.toThrow();
    });

    test('should throw on whitespace-only string', async () => {
      await expect(generateEmbedding('   ')).rejects.toThrow('输入文本不能为空');
    });

    test('should throw on non-string input', async () => {
      await expect(generateEmbedding(123)).rejects.toThrow();
    });
  });

  describe('getWenxinAccessToken — missing config', () => {
    test('should throw when WENXIN_API_KEY not set', async () => {
      delete process.env.WENXIN_API_KEY;
      delete process.env.WENXIN_SECRET_KEY;
      await expect(getWenxinAccessToken()).rejects.toThrow('未配置');
    });
  });

  describe('callQianwenEmbedding — missing config', () => {
    test('should throw when QIANWEN_API_KEY not set', async () => {
      delete process.env.QIANWEN_API_KEY;
      await expect(callQianwenEmbedding('test')).rejects.toThrow('未配置');
    });
  });

  describe('generateBatchEmbeddings — input validation', () => {
    test('should return empty array for empty input', async () => {
      const result = await generateBatchEmbeddings([]);
      expect(result).toEqual([]);
    });

    test('should throw on non-array input', async () => {
      await expect(generateBatchEmbeddings('not array')).rejects.toThrow('输入必须是数组');
    });

    test('should throw on null input', async () => {
      await expect(generateBatchEmbeddings(null)).rejects.toThrow();
    });
  });

  describe('generateEmbedding — no API keys at all', () => {
    test('should throw when no embedding provider is configured', async () => {
      const savedWenxin = process.env.WENXIN_API_KEY;
      const savedQianwen = process.env.QIANWEN_API_KEY;
      delete process.env.WENXIN_API_KEY;
      delete process.env.WENXIN_SECRET_KEY;
      delete process.env.QIANWEN_API_KEY;

      try {
        await expect(generateEmbedding('test text')).rejects.toThrow();
      } finally {
        // Restore
        if (savedWenxin) process.env.WENXIN_API_KEY = savedWenxin;
        if (savedQianwen) process.env.QIANWEN_API_KEY = savedQianwen;
      }
    });
  });
});

// ============================================================
// 集成测试 — 需要真实 API key，npm run test:integration 运行
// ============================================================

describe.skip('@integration embedder — 集成测试 (需真实 API key)', () => {

  beforeAll(() => {
    // Check if API keys are available
    if (!process.env.WENXIN_API_KEY && !process.env.QIANWEN_API_KEY) {
      console.warn('跳过: 无 WENXIN_API_KEY 或 QIANWEN_API_KEY');
    }
  });

  test('should generate embedding via Wenxin', async () => {
    if (!process.env.WENXIN_API_KEY || !process.env.WENXIN_SECRET_KEY) return;
    const result = await generateEmbedding('光合作用是植物利用阳光合成有机物的过程');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(v => typeof v === 'number')).toBe(true);
  });

  test('should generate embedding via Qianwen (forced)', async () => {
    if (!process.env.QIANWEN_API_KEY) return;
    const result = await generateEmbedding('测试文本', { provider: QIANWEN_PROVIDER });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test('should generate batch embeddings', async () => {
    if (!process.env.WENXIN_API_KEY && !process.env.QIANWEN_API_KEY) return;
    const texts = ['文本一', '文本二'];
    const result = await generateBatchEmbeddings(texts, { batchSize: 2 });
    expect(result).toHaveLength(2);
    result.forEach(vec => {
      expect(Array.isArray(vec)).toBe(true);
      expect(vec.length).toBeGreaterThan(0);
    });
  });

  test('should fallback from Wenxin to Qianwen', async () => {
    if (!process.env.QIANWEN_API_KEY) return;
    // Temporarily break Wenxin config to force fallback
    const savedKey = process.env.WENXIN_API_KEY;
    process.env.WENXIN_API_KEY = 'invalid_key_to_force_fallback';
    try {
      const result = await generateEmbedding('降级测试');
      expect(Array.isArray(result)).toBe(true);
    } finally {
      process.env.WENXIN_API_KEY = savedKey;
    }
  });
});
