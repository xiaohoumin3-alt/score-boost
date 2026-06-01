/**
 * 存储模块 - Phase 3: 分流存储
 * 实现 user_materials 和 material_review 分流存储
 */

/**
 * 个人材料必填字段
 */
const PERSONAL_REQUIRED_FIELDS = [
  'openid',
  'material_type',
  'file_name',
  'file_type',
  'file_url'
];

/**
 * 教材审核必填字段
 */
const TEXTBOOK_REQUIRED_FIELDS = [
  'material_id',
  'openid',
  'file_name',
  'subject',
  'grade'
];

/**
 * 验证必填字段
 * @param {Object} data - 待验证数据
 * @param {string[]} requiredFields - 必填字段列表
 * @returns {Object} { valid: boolean, missing?: string[] }
 */
function validateRequiredFields(data, requiredFields) {
  const missing = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });

  return {
    valid: missing.length === 0,
    missing: missing.length > 0 ? missing : undefined
  };
}

/**
 * 保存个人材料到 user_materials 集合
 * @param {Object} materialData - 材料数据
 * @param {string} materialData.openid - 用户openid
 * @param {string} materialData.material_type - 材料类型 (personal)
 * @param {string} materialData.file_name - 文件名
 * @param {string} materialData.file_type - 文件类型 (pdf/docx/txt)
 * @param {string} materialData.file_url - 云存储URL
 * @param {string} [materialData.subject] - 学科
 * @param {string} [materialData.grade] - 年级
 * @param {number} [materialData.chunks_count] - 分块数量
 * @param {string[]} [materialData.knowledge_points] - 知识点列表
 * @param {Object} db - 数据库实例
 * @returns {Promise<Object>} { success: boolean, material_id?: string, error?: string }
 */
async function savePersonalMaterial(materialData, db) {
  try {
    // 验证必填字段
    const validation = validateRequiredFields(materialData, PERSONAL_REQUIRED_FIELDS);
    if (!validation.valid) {
      return {
        success: false,
        error: `必填字段缺失: ${validation.missing.join(', ')}`
      };
    }

    // 构建数据库记录
    const record = {
      openid: materialData.openid,
      material_type: materialData.material_type,
      file_name: materialData.file_name,
      file_type: materialData.file_type,
      file_url: materialData.file_url,
      subject: materialData.subject || null,
      grade: materialData.grade || null,
      chunks_count: materialData.chunks_count || 0,
      knowledge_points: materialData.knowledge_points || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const result = await db
      .collection('user_materials')
      .add({ data: record });

    return {
      success: true,
      material_id: result.id
    };

  } catch (error) {
    console.error('savePersonalMaterial error:', error);
    return {
      success: false,
      error: error.message || '保存个人材料失败'
    };
  }
}

/**
 * 保存教材审核记录到 material_review 集合
 * @param {Object} textbookData - 教材数据
 * @param {string} textbookData.material_id - 原材料ID
 * @param {string} textbookData.openid - 用户openid
 * @param {string} textbookData.file_name - 文件名
 * @param {string} textbookData.subject - 学科
 * @param {string} textbookData.grade - 年级
 * @param {number} [textbookData.extracted_kp_count] - 提取的知识点数量
 * @param {string[]} [textbookData.knowledge_points] - 知识点列表
 * @param {Object} db - 数据库实例
 * @returns {Promise<Object>} { success: boolean, review_id?: string, error?: string }
 */
async function saveTextbookForReview(textbookData, db) {
  try {
    // 验证必填字段
    const validation = validateRequiredFields(textbookData, TEXTBOOK_REQUIRED_FIELDS);
    if (!validation.valid) {
      return {
        success: false,
        error: `必填字段缺失: ${validation.missing.join(', ')}`
      };
    }

    // 构建数据库记录
    const record = {
      material_id: textbookData.material_id,
      openid: textbookData.openid,
      file_name: textbookData.file_name,
      subject: textbookData.subject,
      grade: textbookData.grade,
      extracted_kp_count: textbookData.extracted_kp_count || 0,
      knowledge_points: textbookData.knowledge_points || [],
      status: 'pending', // 默认待审核状态
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const result = await db
      .collection('material_review')
      .add({ data: record });

    return {
      success: true,
      review_id: result.id
    };

  } catch (error) {
    console.error('saveTextbookForReview error:', error);
    return {
      success: false,
      error: error.message || '保存教材审核记录失败'
    };
  }
}

module.exports = {
  PERSONAL_REQUIRED_FIELDS,
  TEXTBOOK_REQUIRED_FIELDS,
  validateRequiredFields,
  savePersonalMaterial,
  saveTextbookForReview
};
