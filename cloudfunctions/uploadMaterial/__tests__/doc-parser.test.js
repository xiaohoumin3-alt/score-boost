/**
 * 文档解析模块测试
 * TDD: 测试先行，实现后置
 */

const { parsePDF, parseDOCX, parseTXT, getContentType, SUPPORTED_TYPES, parseDocument } = require('../doc-parser');

// Mock dependencies
jest.mock('pdf-parse');
jest.mock('mammoth');

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

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
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should extract text from PDF buffer', async () => {
      const mockBuffer = Buffer.from('%PDF-1.4\nmock pdf content');
      pdfParse.mockResolvedValue({ text: 'Sample PDF content' });

      const result = await parsePDF(mockBuffer);
      expect(result).toBe('Sample PDF content');
      expect(pdfParse).toHaveBeenCalledWith(mockBuffer);
    });

    test('should throw error for invalid PDF', async () => {
      const mockBuffer = Buffer.from('not a pdf');
      pdfParse.mockRejectedValue(new Error('Invalid PDF'));

      await expect(parsePDF(mockBuffer)).rejects.toThrow('PDF解析失败');
    });

    test('should handle empty PDF', async () => {
      const mockBuffer = Buffer.from('%PDF-1.4\n%%EOF');
      pdfParse.mockResolvedValue({ text: '' });

      const result = await parsePDF(mockBuffer);
      expect(result).toBe('');
    });
  });

  describe('parseDOCX', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should extract text from DOCX buffer', async () => {
      const mockBuffer = Buffer.from('PK\x03\x04'); // ZIP header (DOCX is ZIP)
      mammoth.extractRawText.mockResolvedValue({ value: 'Sample DOCX content' });

      const result = await parseDOCX(mockBuffer);
      expect(result).toBe('Sample DOCX content');
      expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer: mockBuffer });
    });

    test('should throw error for invalid DOCX', async () => {
      const mockBuffer = Buffer.from('not a docx');
      mammoth.extractRawText.mockRejectedValue(new Error('Invalid DOCX'));

      await expect(parseDOCX(mockBuffer)).rejects.toThrow('DOCX解析失败');
    });

    test('should handle empty DOCX', async () => {
      const mockBuffer = Buffer.from('PK\x03\x04');
      mammoth.extractRawText.mockResolvedValue({ value: '' });

      const result = await parseDOCX(mockBuffer);
      expect(result).toBe('');
    });
  });

  describe('parseTXT', () => {
    test('should read text from buffer', async () => {
      const mockBuffer = Buffer.from('Sample TXT content', 'utf-8');

      const result = await parseTXT(mockBuffer);
      expect(result).toBe('Sample TXT content');
    });

    test('should handle UTF-8 encoding', async () => {
      const mockBuffer = Buffer.from('中文内容测试', 'utf-8');

      const result = await parseTXT(mockBuffer);
      expect(result).toBe('中文内容测试');
    });

    test('should handle empty text', async () => {
      const mockBuffer = Buffer.from('', 'utf-8');

      const result = await parseTXT(mockBuffer);
      expect(result).toBe('');
    });
  });

  describe('Integration: parseDocument', () => {
    test('should route to PDF parser', async () => {
      const mockBuffer = Buffer.from('%PDF-1.4');

      const result = await parseDocument('pdf', mockBuffer);
      expect(result).toBeDefined();
    });

    test('should route to DOCX parser', async () => {
      const mockBuffer = Buffer.from('PK\x03\x04');

      const result = await parseDocument('docx', mockBuffer);
      expect(result).toBeDefined();
    });

    test('should route to TXT parser', async () => {
      const mockBuffer = Buffer.from('text content');

      const result = await parseDocument('txt', mockBuffer);
      expect(result).toBeDefined();
    });

    test('should throw error for unsupported type', async () => {
      const mockBuffer = Buffer.from('content');

      await expect(parseDocument('jpg', mockBuffer)).rejects.toThrow('不支持的文件类型');
    });
  });
});
