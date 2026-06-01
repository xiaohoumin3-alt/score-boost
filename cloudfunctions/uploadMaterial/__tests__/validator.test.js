/**
 * 文件验证模块测试
 * TDD: 测试先行，实现后置
 */

const { validateFile, FILE_SIZE_LIMITS, ALLOWED_TYPES } = require('../validator');

describe('validator', () => {
  describe('FILE_SIZE_LIMITS', () => {
    test('should define size limits for user types', () => {
      expect(FILE_SIZE_LIMITS).toBeDefined();
      expect(FILE_SIZE_LIMITS.free).toBe(10 * 1024 * 1024); // 10MB
      expect(FILE_SIZE_LIMITS.vip).toBe(20 * 1024 * 1024); // 20MB
    });
  });

  describe('ALLOWED_TYPES', () => {
    test('should contain allowed file types', () => {
      expect(ALLOWED_TYPES).toEqual(expect.arrayContaining(['pdf', 'docx', 'txt']));
    });
  });

  describe('validateFile', () => {
    const createMockFile = (filename, size, mimeType) => ({
      filename,
      size,
      mimeType
    });

    test('should validate PDF file within size limit', () => {
      const mockFile = createMockFile('test.pdf', 5 * 1024 * 1024, 'application/pdf');
      const result = validateFile(mockFile, 'free');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should validate DOCX file within size limit', () => {
      const mockFile = createMockFile('test.docx', 5 * 1024 * 1024, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const result = validateFile(mockFile, 'free');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should validate TXT file within size limit', () => {
      const mockFile = createMockFile('test.txt', 1024, 'text/plain');
      const result = validateFile(mockFile, 'free');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should reject PDF file exceeding free user limit', () => {
      const mockFile = createMockFile('large.pdf', 15 * 1024 * 1024, 'application/pdf');
      const result = validateFile(mockFile, 'free');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('文件大小超过限制（普通用户10MB，VIP用户20MB）');
    });

    test('should accept large file for VIP user', () => {
      const mockFile = createMockFile('large.pdf', 15 * 1024 * 1024, 'application/pdf');
      const result = validateFile(mockFile, 'vip');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should reject file exceeding VIP limit', () => {
      const mockFile = createMockFile('huge.pdf', 25 * 1024 * 1024, 'application/pdf');
      const result = validateFile(mockFile, 'vip');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('文件大小超过限制（普通用户10MB，VIP用户20MB）');
    });

    test('should reject unsupported file type', () => {
      const mockFile = createMockFile('image.jpg', 1024, 'image/jpeg');
      const result = validateFile(mockFile, 'free');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('不支持的文件类型，仅支持 PDF、DOCX、TXT');
    });

    test('should reject EXE file type', () => {
      const mockFile = createMockFile('malware.exe', 1024, 'application/octet-stream');
      const result = validateFile(mockFile, 'vip');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('不支持的文件类型，仅支持 PDF、DOCX、TXT');
    });

    test('should handle case-insensitive file extensions', () => {
      const mockFile = createMockFile('test.PDF', 5 * 1024 * 1024, 'application/pdf');
      const result = validateFile(mockFile, 'free');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should reject empty file', () => {
      const mockFile = createMockFile('empty.pdf', 0, 'application/pdf');
      const result = validateFile(mockFile, 'free');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('文件内容为空');
    });

    test('should validate multiple errors simultaneously', () => {
      const mockFile = createMockFile('huge.exe', 25 * 1024 * 1024, 'application/octet-stream');
      const result = validateFile(mockFile, 'free');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('不支持的文件类型，仅支持 PDF、DOCX、TXT');
    });
  });
});
