/**
 * 向量嵌入模块测试
 * TDD: 测试先行，实现后置
 * 测试文心一言主接口和通义千问降级接口
 */

// Mock dependencies - must be before require
jest.mock('axios');

const axios = require('axios');
const {
  generateEmbedding,
  generateBatchEmbeddings,
  WENXIN_PROVIDER,
  QIANWEN_PROVIDER
} = require('../embedder');

describe('embedder', () => {
  const mockAccessToken = 'test_wenxin_token';
  const mockQianwenResponse = {
    data: {
      output: {
        embeddings: [{
          embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
        }]
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // 设置环境变量
    process.env.WENXIN_API_KEY = 'test_wenxin_key';
    process.env.WENXIN_SECRET_KEY = 'test_wenxin_secret';
    process.env.QIANWEN_API_KEY = 'test_qianwen_key';
  });

  afterEach(() => {
    delete process.env.WENXIN_API_KEY;
    delete process.env.WENXIN_SECRET_KEY;
    delete process.env.QIANWEN_API_KEY;
  });

  describe('Constants', () => {
    test('should have WENXIN_PROVIDER defined', () => {
      expect(WENXIN_PROVIDER).toBe('wenxin');
    });

    test('should have QIANWEN_PROVIDER defined', () => {
      expect(QIANWEN_PROVIDER).toBe('qianwen');
    });
  });

  describe('generateEmbedding - Wenxin (Primary)', () => {
    test('should generate embedding using Wenxin API', async () => {
      // Mock Wenxin access token response
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockAccessToken }
      });

      // Mock Wenxin embedding response
      axios.post.mockResolvedValueOnce({
        data: {
          embedding: [[0.1, 0.2, 0.3, 0.4, 0.5]]
        }
      });

      const result = await generateEmbedding('test text');

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(axios.post).toHaveBeenCalledTimes(2); // token + embedding
    });

    test('should handle Wenxin API error and fallback to Qianwen', async () => {
      // Mock Wenxin token failure
      axios.post.mockRejectedValueOnce(new Error('Wenxin API error'));

      // Mock Qianwen fallback
      axios.post.mockResolvedValueOnce({
        data: {
          output: {
            embeddings: [{
              embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
            }]
          }
        }
      });

      const result = await generateEmbedding('test text');

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    test('should fallback to Qianwen when Wenxin token fails', async () => {
      // Mock Wenxin token failure - triggers fallback
      axios.post.mockRejectedValueOnce(new Error('Network error'));

      // Mock Qianwen fallback success
      axios.post.mockResolvedValueOnce(mockQianwenResponse);

      const result = await generateEmbedding('test text', { retries: 0 });

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });
  });

  describe('generateEmbedding - Qianwen (Fallback)', () => {
    test('should fallback to Qianwen when Wenxin fails', async () => {
      // Mock Wenxin failure
      axios.post.mockRejectedValueOnce(new Error('Wenxin unavailable'));

      // Mock Qianwen success
      axios.post.mockResolvedValueOnce(mockQianwenResponse);

      const result = await generateEmbedding('test text');

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    test('should throw when both providers fail', async () => {
      // Mock both failures
      axios.post.mockRejectedValue(new Error('All providers failed'));

      await expect(generateEmbedding('test text')).rejects.toThrow();
    });
  });

  describe('generateBatchEmbeddings', () => {
    test('should generate embeddings for multiple texts', async () => {
      // Mock: token calls return access_token, embedding calls return vector
      axios.post.mockImplementation(async (url) => {
        if (url.includes('oauth')) {
          return { data: { access_token: mockAccessToken } };
        }
        return { data: { embedding: [[0.1, 0.2, 0.3]] } };
      });

      const texts = ['text1', 'text2'];
      const result = await generateBatchEmbeddings(texts);

      expect(result).toHaveLength(2);
    });

    test('should handle empty array', async () => {
      const result = await generateBatchEmbeddings([]);

      expect(result).toEqual([]);
    });

    test('should handle batch size limit', async () => {
      // Mock: token calls return access_token, embedding calls return vector
      axios.post.mockImplementation(async (url) => {
        if (url.includes('oauth')) {
          return { data: { access_token: mockAccessToken } };
        }
        return { data: { embedding: [[0.1, 0.2, 0.3]] } };
      });

      const largeBatch = Array.from({ length: 100 }, (_, i) => `text ${i}`);
      const result = await generateBatchEmbeddings(largeBatch, { batchSize: 10 });

      expect(result.length).toBe(100);
    });
  });

  describe('Error Handling', () => {
    test('should handle empty text', async () => {
      await expect(generateEmbedding('')).rejects.toThrow();
    });

    test('should handle null input', async () => {
      await expect(generateEmbedding(null)).rejects.toThrow();
    });

    test('should handle missing API keys', async () => {
      delete process.env.WENXIN_API_KEY;
      delete process.env.QIANWEN_API_KEY;

      await expect(generateEmbedding('test')).rejects.toThrow();
    });

    test('should handle timeout', async () => {
      axios.post.mockImplementationOnce(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      await expect(
        generateEmbedding('test', { timeout: 50 })
      ).rejects.toThrow();
    });
  });

  describe('Provider Selection', () => {
    test('should respect forced provider option', async () => {
      // Mock Qianwen
      axios.post.mockResolvedValueOnce(mockQianwenResponse);

      const result = await generateEmbedding('test', { provider: QIANWEN_PROVIDER });

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    test('should use Wenxin by default', async () => {
      // Mock Wenxin
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockAccessToken }
      });
      axios.post.mockResolvedValueOnce({
        data: {
          embedding: [[0.1, 0.2, 0.3]]
        }
      });

      await generateEmbedding('test');

      // Should call Wenxin embedding endpoint
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('wenxinworkshop'),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('Embedding Format', () => {
    test('should return normalized vector array', async () => {
      // Mock Wenxin
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockAccessToken }
      });
      axios.post.mockResolvedValueOnce({
        data: {
          embedding: [[0.1, 0.2, 0.3]]
        }
      });

      const result = await generateEmbedding('test');

      expect(Array.isArray(result)).toBe(true);
      expect(result.every(v => typeof v === 'number')).toBe(true);
    });

    test('should handle different embedding dimensions', async () => {
      // Mock Qianwen with larger embedding
      axios.post.mockResolvedValueOnce({
        data: {
          output: {
            embeddings: [{
              embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
            }]
          }
        }
      });

      const result = await generateEmbedding('test', { provider: QIANWEN_PROVIDER });

      expect(result.length).toBe(8);
    });
  });
});
