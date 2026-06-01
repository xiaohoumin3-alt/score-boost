/**
 * 智能分块模块测试
 * TDD: 测试先行，实现后置
 */

const {
  splitText,
  splitByParagraphs,
  splitBySemanticChunks,
  createFixedChunks,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  MIN_CHUNK_SIZE
} = require('../text-splitter');

describe('text-splitter', () => {
  describe('Constants', () => {
    test('should have default chunk size defined', () => {
      expect(DEFAULT_CHUNK_SIZE).toBeDefined();
      expect(DEFAULT_CHUNK_SIZE).toBeGreaterThan(0);
    });

    test('should have default overlap defined', () => {
      expect(DEFAULT_CHUNK_OVERLAP).toBeDefined();
      expect(DEFAULT_CHUNK_OVERLAP).toBeGreaterThan(0);
    });

    test('should have minimum chunk size defined', () => {
      expect(MIN_CHUNK_SIZE).toBeDefined();
      expect(MIN_CHUNK_SIZE).toBeGreaterThan(0);
    });
  });

  describe('splitByParagraphs', () => {
    test('should split text by paragraph breaks', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const result = splitByParagraphs(text);

      expect(result).toEqual([
        'First paragraph.',
        'Second paragraph.',
        'Third paragraph.'
      ]);
    });

    test('should handle single paragraph', () => {
      const text = 'Single paragraph text.';
      const result = splitByParagraphs(text);

      expect(result).toEqual(['Single paragraph text.']);
    });

    test('should handle empty text', () => {
      const result = splitByParagraphs('');
      expect(result).toEqual([]);
    });

    test('should trim whitespace from paragraphs', () => {
      const text = '  First paragraph.  \n\n  Second paragraph.  ';
      const result = splitByParagraphs(text);

      expect(result).toEqual([
        'First paragraph.',
        'Second paragraph.'
      ]);
    });

    test('should filter out empty paragraphs', () => {
      const text = 'First.\n\n\n\nSecond.';
      const result = splitByParagraphs(text);

      expect(result).toEqual([
        'First.',
        'Second.'
      ]);
    });
  });

  describe('splitBySemanticChunks', () => {
    test('should split by semantic boundaries (headings)', () => {
      const text = `第一章 绪论
这是第一章的内容。

第二章 方法
这是第二章的内容。`;

      const result = splitBySemanticChunks(text);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0]).toContain('第一章');
    });

    test('should handle text without semantic markers', () => {
      const text = 'Plain text without headings.\nJust regular paragraphs.';
      const result = splitBySemanticChunks(text);

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createFixedChunks', () => {
    test('should split text into fixed-size chunks', () => {
      const text = 'A'.repeat(1000);
      const result = createFixedChunks(text, 100, 0);

      expect(result.length).toBe(10);
      expect(result[0].length).toBe(100);
    });

    test('should handle text smaller than chunk size', () => {
      const text = 'Short text';
      const result = createFixedChunks(text, 1000, 0);

      expect(result).toEqual(['Short text']);
    });

    test('should handle empty text', () => {
      const result = createFixedChunks('', 100, 0);
      expect(result).toEqual([]);
    });
  });

  describe('splitText - Main Entry Point', () => {
    test('should use semantic splitting by default', () => {
      const text = `第一章 绪论
内容。

第二章 方法
内容。`;

      const result = splitText(text);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    test('should fall back to fixed chunks when semantic fails', () => {
      const text = 'A'.repeat(1000);
      const result = splitText(text);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(1);
    });

    test('should handle empty text gracefully', () => {
      const result = splitText('');
      expect(result).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    test('should handle null input', () => {
      expect(() => splitText(null)).not.toThrow();
      expect(splitText(null)).toEqual([]);
    });

    test('should handle undefined input', () => {
      expect(() => splitText(undefined)).not.toThrow();
      expect(splitText(undefined)).toEqual([]);
    });

    test('should handle non-string input', () => {
      expect(() => splitText(123)).not.toThrow();
      expect(splitText(123)).toEqual([]);
    });
  });
});
