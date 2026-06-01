/**
 * 文件验证模块
 * 验证文件类型、大小和内容
 */

const { getContentType, SUPPORTED_TYPES } = require('./doc-parser');

/**
 * 文件大小限制（字节）
 */
const FILE_SIZE_LIMITS = {
  free: 10 * 1024 * 1024,  // 10MB
  vip: 20 * 1024 * 1024     // 20MB
};

/**
 * 允许的文件类型
 */
const ALLOWED_TYPES = SUPPORTED_TYPES;

/**
 * MIME 类型映射
 */
const MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain'
};

/**
 * 验证单个文件
 * @param {Object} file - 文件对象
 * @param {string} file.filename - 文件名
 * @param {number} file.size - 文件大小（字节）
 * @param {string} file.mimeType - MIME 类型（可选）
 * @param {string} userType - 用户类型 (free/vip)
 * @returns {{valid: boolean, errors: Array<string>}}
 */
function validateFile(file, userType = 'free') {
  const errors = [];

  if (!file) {
    return {
      valid: false,
      errors: ['文件不能为空']
    };
  }

  const { filename, size, mimeType } = file;

  // 验证文件名
  if (!filename || typeof filename !== 'string') {
    errors.push('文件名不能为空');
    return { valid: false, errors };
  }

  // 验证文件大小
  if (typeof size !== 'number' || size <= 0) {
    errors.push('文件内容为空');
  } else {
    const maxSize = FILE_SIZE_LIMITS[userType] || FILE_SIZE_LIMITS.free;
    if (size > maxSize) {
      errors.push(`文件大小超过限制（普通用户10MB，VIP用户20MB）`);
    }
  }

  // 验证文件类型
  const fileType = getContentType(filename);
  if (!fileType) {
    errors.push('不支持的文件类型，仅支持 PDF、DOCX、TXT');
  }

  // 验证 MIME 类型（可选，如果提供了的话）
  if (mimeType && fileType) {
    const expectedMime = MIME_TYPES[fileType];
    if (expectedMime && !mimeType.includes(expectedMime.split('/')[1])) {
      errors.push(`文件类型不匹配：期望 ${fileType.toUpperCase()}，但 MIME 类型为 ${mimeType}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 验证多个文件
 * @param {Array<Object>} files - 文件数组
 * @param {string} userType - 用户类型
 * @returns {{valid: boolean, results: Array, totalFiles: number}}
 */
function validateFiles(files, userType = 'free') {
  if (!Array.isArray(files)) {
    return {
      valid: false,
      results: [],
      totalFiles: 0
    };
  }

  const results = files.map((file, index) => ({
    index,
    filename: file?.filename,
    ...validateFile(file, userType)
  }));

  const valid = results.every(r => r.valid);

  return {
    valid,
    results,
    totalFiles: files.length
  };
}

/**
 * 获取用户类型对应的文件大小限制
 * @param {string} userType - 用户类型
 * @returns {number} 文件大小限制（字节）
 */
function getSizeLimit(userType) {
  return FILE_SIZE_LIMITS[userType] || FILE_SIZE_LIMITS.free;
}

/**
 * 检查文件是否为空
 * @param {Buffer} buffer - 文件内容
 * @returns {boolean}
 */
function isEmptyFile(buffer) {
  return !buffer || !Buffer.isBuffer(buffer) || buffer.length === 0;
}

/**
 * 安全检查：检测可疑文件特征
 * @param {Object} file - 文件对象
 * @returns {{safe: boolean, reasons: Array<string>}}
 */
function securityCheck(file) {
  const reasons = [];

  if (!file || !file.filename) {
    return { safe: false, reasons: ['文件对象无效'] };
  }

  const filename = file.filename.toLowerCase();

  // 检查可疑扩展名
  const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.scr', '.dll'];
  const hasSuspiciousExt = suspiciousExtensions.some(ext =>
    filename.endsWith(ext)
  );

  if (hasSuspiciousExt) {
    reasons.push('可疑的文件扩展名');
  }

  // 检查双扩展名攻击 (e.g., document.pdf.exe)
  const parts = filename.split('.');
  if (parts.length > 2) {
    const lastTwo = parts.slice(-2).join('.');
    if (suspiciousExtensions.some(ext => lastTwo.endsWith(ext))) {
      reasons.push('可能的双扩展名攻击');
    }
  }

  return {
    safe: reasons.length === 0,
    reasons
  };
}

module.exports = {
  FILE_SIZE_LIMITS,
  ALLOWED_TYPES,
  MIME_TYPES,
  validateFile,
  validateFiles,
  getSizeLimit,
  isEmptyFile,
  securityCheck
};
