/**
 * 材料上传云函数主入口
 * 支持个人资料和教材资料上传，带配额限制
 */

const cloud = require('wx-server-sdk');
const { checkQuota, QUOTA_ERRORS, generateQuotaErrorResponse } = require('./quota');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 材料类型验证
 */
const VALID_MATERIAL_TYPES = ['personal', 'textbook'];

/**
 * 主入口函数
 * @param {Object} event - 请求参数
 * @param {string} event.material_type - 材料类型 (personal/textbook)
 * @param {string} event.title - 材料标题
 * @param {string} event.file_id - 云存储文件ID
 * @param {string} event.subject - 学科（可选）
 * @param {string} event.grade - 年级（可选）
 * @param {string} event.semester - 学期（可选）
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return {
      success: false,
      error: '无法获取用户身份'
    };
  }

  const {
    material_type,
    title,
    file_id,
    subject,
    grade,
    semester
  } = event;

  // 参数验证
  if (!material_type || !VALID_MATERIAL_TYPES.includes(material_type)) {
    return {
      success: false,
      error: '无效的材料类型，必须是 personal 或 textbook'
    };
  }

  if (!title || title.trim().length === 0) {
    return {
      success: false,
      error: '材料标题不能为空'
    };
  }

  if (!file_id || file_id.trim().length === 0) {
    return {
      success: false,
      error: '文件ID不能为空'
    };
  }

  const db = cloud.database();

  try {
    // 获取用户信息
    const userResult = await db
      .collection('users')
      .where({ openid })
      .field({ vip_status: true, vip_expire_at: true })
      .get();

    const user = userResult.data[0] || { vip_status: 'free' };

    // 配额检查
    const quotaCheck = await checkQuota(openid, material_type, db, user);

    if (!quotaCheck.allowed) {
      return generateQuotaErrorResponse(
        material_type,
        user,
        quotaCheck.usage,
        quotaCheck.limit
      );
    }

    // 保存材料记录
    const materialData = {
      openid,
      material_type,
      title: title.trim(),
      file_id,
      subject: subject || null,
      grade: grade || null,
      semester: semester || null,
      status: 'pending', // 待审核
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const result = await db.collection('materials').add({
      data: materialData
    });

    return {
      success: true,
      data: {
        material_id: result.id,
        ...materialData
      },
      message: '材料上传成功，等待管理员审核'
    };

  } catch (error) {
    console.error('uploadMaterial error:', error);
    return {
      success: false,
      error: error.message || '材料上传失败',
      error_code: error.errCode || 'UPLOAD_FAILED'
    };
  }
};
