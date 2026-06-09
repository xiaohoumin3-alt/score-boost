/**
 * doc-parser 真实测试
 * 使用真实的 mammoth 解析 DOCX，真实的 Buffer 解析 TXT
 * PDF 测试覆盖错误路径（无有效 fixture 文件）
 * 不使用 jest.mock
 */

const fs = require('fs');
const path = require('path');
const {
  parsePDF,
  parseDOCX,
  parseTXT,
  getContentType,
  SUPPORTED_TYPES,
  parseDocument
} = require('../doc-parser');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

describe('doc-parser', () => {
  describe('getContentType', () => {
    test('should identify PDF files', () => {
      expect(getContentType('document.pdf')).toBe('pdf');
    });

    test('should identify DOCX files', () => {
      expect(getContentType('document.docx')).toBe('docx');
    });

    test('should identify TXT files', () => {
      expect(getContentType('document.txt')).toBe('txt');
    });

    test('should handle uppercase extensions', () => {
      expect(getContentType('document.PDF')).toBe('pdf');
      expect(getContentType('document.DOCX')).toBe('docx');
      expect(getContentType('document.TXT')).toBe('txt');
    });

    test('should return null for unsupported types', () => {
      expect(getContentType('document.jpg')).toBeNull();
      expect(getContentType('document.png')).toBeNull();
      expect(getContentType('document.exe')).toBeNull();
    });
  });

  describe('SUPPORTED_TYPES', () => {
    test('should contain all supported file types', () => {
      expect(SUPPORTED_TYPES).toEqual(expect.arrayContaining(['pdf', 'docx', 'txt']));
    });
  });

  describe('parsePDF', () => {
    test('should throw error for invalid binary (not a valid PDF)', async () => {
      const invalidBuffer = Buffer.from('not a pdf at all just plain text');
      await expect(parsePDF(invalidBuffer)).rejects.toThrow();
    });

    test('should throw error for empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      await expect(parsePDF(emptyBuffer)).rejects.toThrow();
    });
  });

  describe('parseDOCX', () => {
    test('should extract text from real DOCX file', async () => {
      const docxBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'test.docx'));
      const result = await parseDOCX(docxBuffer);
      expect(typeof result).toBe('string');
      expect(result).toContain('DocParser Test Content');
    });

    test('should extract all paragraphs from real DOCX', async () => {
      const docxBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'test.docx'));
      const result = await parseDOCX(docxBuffer);
      expect(result).toContain('Second paragraph');
    });

    test('should throw error for invalid DOCX (not a ZIP)', async () => {
      const invalidBuffer = Buffer.from('not a docx file');
      await expect(parseDOCX(invalidBuffer)).rejects.toThrow();
    });
  });

  describe('parseTXT', () => {
    test('should read text from buffer', async () => {
      const buffer = Buffer.from('Sample TXT content', 'utf-8');
      const result = await parseTXT(buffer);
      expect(result).toBe('Sample TXT content');
    });

    test('should handle UTF-8 (Chinese) encoding', async () => {
      const buffer = Buffer.from('中文内容测试', 'utf-8');
      const result = await parseTXT(buffer);
      expect(result).toBe('中文内容测试');
    });

    test('should handle empty text', async () => {
      const buffer = Buffer.from('', 'utf-8');
      const result = await parseTXT(buffer);
      expect(result).toBe('');
    });

    test('should parse real TXT fixture file', async () => {
      const buffer = fs.readFileSync(path.join(FIXTURES_DIR, 'test.txt'));
      const result = await parseTXT(buffer);
      expect(result).toContain('test text file');
      expect(result).toContain('中文内容测试');
    });
  });

  describe('Integration: parseDocument', () => {
    test('should route to DOCX parser and return text', async () => {
      const docxBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'test.docx'));
      const result = await parseDocument('docx', docxBuffer);
      expect(result).toContain('DocParser Test Content');
    });

    test('should route to TXT parser and return text', async () => {
      const txtBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'test.txt'));
      const result = await parseDocument('txt', txtBuffer);
      expect(result).toContain('test text file');
    });

    test('should throw error for unsupported type', async () => {
      const buffer = Buffer.from('content');
      await expect(parseDocument('jpg', buffer)).rejects.toThrow('不支持的文件类型');
    });

    test('should attempt PDF parsing (rejects invalid input)', async () => {
      const invalidPdf = Buffer.from('not a pdf');
      await expect(parseDocument('pdf', invalidPdf)).rejects.toThrow();
    });
  });
});
