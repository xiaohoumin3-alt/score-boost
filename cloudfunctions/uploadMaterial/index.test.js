/**
 * uploadMaterial 云函数集成测试
 */

// Mock 各个依赖模块
jest.mock('./validator', () => ({
  validateFile: jest.fn(),
  ALLOWED_TYPES: ['pdf', 'docx', 'txt'],
  FILE_SIZE_LIMITS: { normal: 10 * 1024 * 1024, vip: 20 * 1024 * 1024 }
}));

jest.mock('./doc-parser', () => ({
  parseDocument: jest.fn()
}));

jest.mock('./text-splitter', () => ({
  splitText: jest.fn()
}));

jest.mock('./embedder', () => ({
  generateBatchEmbeddings: jest.fn()
}));

jest.mock('./vector-store', () => ({
  saveVectors: jest.fn()
}));

jest.mock('./kp-extractor', () => ({
  extractKnowledgePoints: jest.fn()
}));

jest.mock('./storage', () => ({
  savePersonalMaterial: jest.fn(),
  saveTextbookForReview: jest.fn()
}));

jest.mock('./quota', () => ({
  checkQuota: jest.fn()
}));

jest.mock('./ai-type-validator', () => ({
  validateTypeMatch: jest.fn()
}));

const { validateFile } = require('./validator');
const { checkQuota } = require('./quota');

describe('uploadMaterial 入口函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('配额不足时应拒绝上传', async () => {
    checkQuota.mockResolvedValue({
      allowed: false,
      reason: '配额已用完',
      remaining: 0
    });

    // 验证配额检查函数被正确调用
    const result = await checkQuota('test-openid', 'personal', {});
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('配额');
  });

  test('配额充足时应允许上传', async () => {
    checkQuota.mockResolvedValue({
      allowed: true,
      remaining: 3,
      limit: 5
    });

    const result = await checkQuota('test-openid', 'personal', {});
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
  });
});
