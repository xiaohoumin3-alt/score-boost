/**
 * COS 上传模块
 * 负责将文件上传到腾讯云对象存储（COS）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 上传文件到 COS
 * @param {Object} fileData - 文件数据
 * @param {Buffer} fileData.buffer - 文件内容
 * @param {string} fileData.filename - 文件名
 * @param {string} fileData.mimeType - MIME 类型
 * @param {string} prefix - 文件路径前缀 (e.g., 'materials/personal')
 * @returns {Promise<string>} 返回文件ID
 */
async function uploadToCOS(fileData, prefix = 'materials') {
  const { buffer, filename, mimeType } = fileData;

  if (!buffer || !filename) {
    throw new Error('文件数据不完整');
  }

  try {
    // 生成唯一文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = filename.split('.').pop().toLowerCase();
    const cloudPath = `${prefix}/${timestamp}_${random}.${extension}`;

    // 上传到云存储
    const result = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    });

    if (!result.fileID) {
      throw new Error('上传失败：未返回文件ID');
    }

    return result.fileID;

  } catch (error) {
    console.error('COS上传失败:', error);
    throw new Error(`文件上传失败: ${error.message}`);
  }
}

/**
 * 批量上传文件到 COS
 * @param {Array<Object>} files - 文件数组
 * @param {string} prefix - 文件路径前缀
 * @returns {Promise<Array<{filename: string, fileID: string}>>}
 */
async function batchUploadToCOS(files, prefix = 'materials') {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('文件数组不能为空');
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const fileID = await uploadToCOS(files[i], prefix);
      results.push({
        filename: files[i].filename,
        fileID,
        index: i
      });
    } catch (error) {
      errors.push({
        filename: files[i].filename,
        error: error.message,
        index: i
      });
    }
  }

  return {
    successful: results,
    failed: errors,
    total: files.length
  };
}

/**
 * 删除 COS 中的文件
 * @param {Array<string>} fileIDs - 文件ID数组
 * @returns {Promise<Object>} 删除结果
 */
async function deleteFromCOS(fileIDs) {
  if (!Array.isArray(fileIDs) || fileIDs.length === 0) {
    throw new Error('文件ID数组不能为空');
  }

  try {
    const result = await cloud.deleteFile({
      fileList: fileIDs
    });

    return {
      success: true,
      deleted: result.fileList || [],
      failed: result.fileList?.filter(f => f.status !== 0) || []
    };

  } catch (error) {
    console.error('COS删除失败:', error);
    throw new Error(`文件删除失败: ${error.message}`);
  }
}

/**
 * 获取临时下载链接
 * @param {string} fileID - 文件ID
 * @param {number} maxAge - 最大有效期（秒），默认 2 小时
 * @returns {Promise<string>} 临时下载链接
 */
async function getTempFileURL(fileID, maxAge = 7200) {
  if (!fileID) {
    throw new Error('文件ID不能为空');
  }

  try {
    const result = await cloud.getTempFileURL({
      fileList: [fileID],
      maxAge
    });

    if (!result.fileList || result.fileList.length === 0) {
      throw new Error('未返回临时链接');
    }

    const tempFileURL = result.fileList[0].tempFileURL;
    if (!tempFileURL) {
      throw new Error('临时链接生成失败');
    }

    return tempFileURL;

  } catch (error) {
    console.error('获取临时链接失败:', error);
    throw new Error(`获取临时链接失败: ${error.message}`);
  }
}

module.exports = {
  uploadToCOS,
  batchUploadToCOS,
  deleteFromCOS,
  getTempFileURL
};
