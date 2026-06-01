/**
 * 文档解析模块
 * 支持 PDF、DOCX、TXT 文件的文本提取
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * 支持的文件类型
 */
const SUPPORTED_TYPES = ['pdf', 'docx', 'txt'];

/**
 * 根据文件名获取内容类型
 * @param {string} filename - 文件名
 * @returns {string|null} 文件类型 (pdf/docx/txt) 或 null
 */
function getContentType(filename) {
  if (!filename || typeof filename !== 'string') {
    return null;
  }

  const extension = filename.split('.').pop().toLowerCase();

  if (SUPPORTED_TYPES.includes(extension)) {
    return extension;
  }

  return null;
}

/**
 * 解析 PDF 文件
 * @param {Buffer} buffer - PDF 文件内容
 * @returns {Promise<string>} 提取的文本
 */
async function parsePDF(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('无效的 PDF 文件');
  }

  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('PDF解析失败:', error);
    throw new Error('PDF解析失败');
  }
}

/**
 * 解析 DOCX 文件
 * @param {Buffer} buffer - DOCX 文件内容
 * @returns {Promise<string>} 提取的文本
 */
async function parseDOCX(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('无效的 DOCX 文件');
  }

  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (error) {
    console.error('DOCX解析失败:', error);
    throw new Error('DOCX解析失败');
  }
}

/**
 * 解析 TXT 文件
 * @param {Buffer} buffer - TXT 文件内容
 * @param {string} encoding - 文件编码，默认 UTF-8
 * @returns {Promise<string>} 提取的文本
 */
async function parseTXT(buffer, encoding = 'utf-8') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('无效的 TXT 文件');
  }

  try {
    return buffer.toString(encoding);
  } catch (error) {
    console.error('TXT解析失败:', error);
    throw new Error('TXT解析失败');
  }
}

/**
 * 根据文件类型解析文档
 * @param {string} type - 文件类型 (pdf/docx/txt)
 * @param {Buffer} buffer - 文件内容
 * @returns {Promise<string>} 提取的文本
 */
async function parseDocument(type, buffer) {
  if (!type || !buffer) {
    throw new Error('参数不完整');
  }

  switch (type) {
    case 'pdf':
      return await parsePDF(buffer);
    case 'docx':
      return await parseDOCX(buffer);
    case 'txt':
      return await parseTXT(buffer);
    default:
      throw new Error('不支持的文件类型');
  }
}

/**
 * 从文件对象解析文档
 * @param {Object} file - 文件对象
 * @param {Buffer} file.buffer - 文件内容
 * @param {string} file.filename - 文件名
 * @returns {Promise<{type: string, text: string}>}
 */
async function parseFile(file) {
  const { buffer, filename } = file;

  if (!buffer || !filename) {
    throw new Error('文件数据不完整');
  }

  const type = getContentType(filename);

  if (!type) {
    throw new Error('不支持的文件类型');
  }

  const text = await parseDocument(type, buffer);

  return {
    type,
    text: text.trim()
  };
}

module.exports = {
  SUPPORTED_TYPES,
  getContentType,
  parsePDF,
  parseDOCX,
  parseTXT,
  parseDocument,
  parseFile
};
