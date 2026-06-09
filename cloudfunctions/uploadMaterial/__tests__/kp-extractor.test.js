/**
 * kp-extractor 真实测试
 *
 * - fallbackChunkExtraction: 纯函数测试（不依赖 LLM）
 * - extractKnowledgePoints 空输入: 不依赖 LLM
 * - extractKnowledgePoints LLM 路径: 集成测试 (@integration)
 *
 * 不使用 jest.mock
 */

const {
  extractKnowledgePoints,
  fallbackChunkExtraction,
  FIXED_CHUNK_SIZE
} = require('../kp-extractor');

// ============================================================
// 纯函数测试 — 不依赖任何外部服务
// ============================================================

describe('kp-extractor — fallbackChunkExtraction', () => {
  test('should split long text into chunks by FIXED_CHUNK_SIZE', () => {
    const longText = 'a'.repeat(1200);
    const result = fallbackChunkExtraction(longText);
    expect(result.length).toBe(Math.ceil(1200 / FIXED_CHUNK_SIZE));
  });

  test('should return single chunk for short text', () => {
    const result = fallbackChunkExtraction('短文本');
    expect(result.length).toBe(1);
    expect(result[0].title).toBe('知识点片段 1');
  });

  test('each chunk should have title, description, chunk_indices', () => {
    const text = 'x'.repeat(800);
    const result = fallbackChunkExtraction(text);
    result.forEach(chunk => {
      expect(chunk).toHaveProperty('title');
      expect(chunk).toHaveProperty('description');
      expect(chunk).toHaveProperty('chunk_indices');
      expect(Array.isArray(chunk.chunk_indices)).toBe(true);
    });
  });

  test('description should be at most 100 chars', () => {
    const text = 'a'.repeat(600);
    const result = fallbackChunkExtraction(text);
    result.forEach(chunk => {
      expect(chunk.description.length).toBeLessThanOrEqual(100);
    });
  });

  test('should handle exactly FIXED_CHUNK_SIZE text', () => {
    const text = 'b'.repeat(FIXED_CHUNK_SIZE);
    const result = fallbackChunkExtraction(text);
    expect(result.length).toBe(1);
  });

  test('should handle FIXED_CHUNK_SIZE + 1 text', () => {
    const text = 'b'.repeat(FIXED_CHUNK_SIZE + 1);
    const result = fallbackChunkExtraction(text);
    expect(result.length).toBe(2);
  });
});

describe('kp-extractor — extractKnowledgePoints (empty input)', () => {
  test('empty array should return empty array', async () => {
    const result = await extractKnowledgePoints([]);
    expect(result).toEqual([]);
  });

  test('null should return empty array', async () => {
    const result = await extractKnowledgePoints(null);
    expect(result).toEqual([]);
  });

  test('undefined should return empty array', async () => {
    const result = await extractKnowledgePoints(undefined);
    expect(result).toEqual([]);
  });
});

describe('kp-extractor — extractKnowledgePoints (LLM failure → fallback)', () => {
  test('should fallback to chunk extraction when LLM is unreachable', async () => {
    // Without a valid LLM_API_KEY, generateJSON will fail, triggering fallback
    const savedKey = process.env.LLM_API_KEY;
    process.env.LLM_API_KEY = 'invalid_key_for_testing_fallback';
    try {
      const result = await extractKnowledgePoints(['光合作用是植物利用阳光合成有机物的过程'], {
        maxRetries: 1  // minimize wait time
      });
      // Fallback should kick in
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('title');
    } finally {
      process.env.LLM_API_KEY = savedKey;
    }
  });
});

// ============================================================
// 集成测试 — 需要真实 LLM API key
// ============================================================

describe.skip('@integration kp-extractor — LLM 集成测试', () => {
  test('should extract knowledge points from real text via LLM', async () => {
    if (!process.env.LLM_API_KEY) return;

    const chunks = [
      '光合作用是植物利用阳光、二氧化碳和水合成有机物的过程。',
      '呼吸作用是生物氧化有机物释放能量的过程。'
    ];

    const result = await extractKnowledgePoints(chunks, {
      subject: 'biology',
      grade: '八年级上',
      maxRetries: 2
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    result.forEach(kp => {
      expect(kp).toHaveProperty('title');
      expect(kp).toHaveProperty('description');
    });
  });
});
