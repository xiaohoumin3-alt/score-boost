/**
 * adminReviewMaterial 云函数
 * 功能：管理员审核用户上传的学习资料
 *
 * 支持的操作：
 * 1. listPending - 审核列表查询（status=pending，支持分页）
 * 2. getDetail - 审核详情查询（包含AI提取的知识点）
 * 3. approve - 批准操作（同步到公共库）
 * 4. reject - 拒绝操作（记录审核意见）
 * 5. updateKnowledgePoints - 知识点编辑（添加/删除/修改）
 * 6. 事务性保证（失败回滚，幂等性设计）
 *
 * TDD: Red-Green-Refactor
 */

const cloud = require('wx-server-sdk');

// 延迟初始化以支持测试环境
let db, _;

function initCloud() {
  if (!db) {
    try {
      cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
      db = cloud.database();
      _ = db.command;
    } catch (e) {
      db = { command: {} };
      _ = db.command;
    }
  }
  return { db, _ };
}

// 管理员OpenID列表（实际应从数据库配置表读取）
const ADMIN_OPENIDS = process.env.ADMIN_OPENIDS
  ? process.env.ADMIN_OPENIDS.split(',')
  : ['oxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']; // 默认测试管理员ID

/**
 * 操作类型定义
 */
const VALID_ACTIONS = [
  'listPending',
  'getDetail',
  'approve',
  'reject',
  'updateKnowledgePoints'
];

/**
 * 状态常量
 */
const MATERIAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

/**
 * 错误代码常量
 */
const ERROR_CODES = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  MISSING_PARAMS: 'MISSING_PARAMS',
  MISSING_ACTION: 'MISSING_ACTION',
  INVALID_ACTION: 'INVALID_ACTION',
  MATERIAL_NOT_FOUND: 'MATERIAL_NOT_FOUND',
  ALREADY_PROCESSED: 'ALREADY_PROCESSED',
  MISSING_NOTE: 'MISSING_NOTE',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED'
};

/**
 * 验证管理员权限
 * @param {string} openId - 用户OpenID
 * @returns {boolean} 是否为管理员
 */
function isAdmin(openId) {
  return ADMIN_OPENIDS.includes(openId);
}

/**
 * 创建标准错误响应
 * @param {string} code - 错误代码
 * @param {string} message - 错误消息
 * @returns {Object} 错误响应
 */
function createErrorResponse(code, message) {
  return {
    success: false,
    code,
    errMsg: message
  };
}

/**
 * 查询待审核资料列表
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码（从1开始）
 * @param {number} params.limit - 每页数量
 * @param {string} params.subject - 学科筛选（可选）
 * @param {string} params.grade - 年级筛选（可选）
 * @returns {Promise<Object>} 审核列表
 */
async function listPendingMaterials(params) {
  const { db } = initCloud();
  const { page = 1, limit = 10, subject, grade } = params;

  try {
    // 构建查询条件
    const whereCondition = { status: MATERIAL_STATUS.PENDING };
    if (subject) whereCondition.subject = subject;
    if (grade) whereCondition.grade = grade;

    // 查询总数
    const countResult = await db.collection('materials')
      .where(whereCondition)
      .count();

    const total = countResult.total || 0;

    // 查询数据
    const result = await db.collection('materials')
      .where(whereCondition)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .field({
        _id: true,
        title: true,
        subject: true,
        grade: true,
        semester: true,
        status: true,
        created_at: true,
        uploader_name: true,
        knowledge_points: true,
        file_id: true
      })
      .get();

    return {
      success: true,
      data: result.data,
      total,
      page,
      limit,
      hasMore: page * limit < total
    };
  } catch (error) {
    console.error('[listPendingMaterials] Error:', error);
    throw error;
  }
}

/**
 * 查询资料详情
 * @param {string} materialId - 资料ID
 * @returns {Promise<Object>} 资料详情
 */
async function getMaterialDetail(materialId) {
  const { db } = initCloud();

  try {
    const result = await db.collection('materials')
      .doc(materialId)
      .get();

    if (!result.data) {
      return createErrorResponse(
        ERROR_CODES.MATERIAL_NOT_FOUND,
        '资料不存在'
      );
    }

    const material = result.data;

    return {
      success: true,
      data: material
    };
  } catch (error) {
    console.error('[getMaterialDetail] Error:', error);
    if (error.errCode === -1) {
      return createErrorResponse(
        ERROR_CODES.MATERIAL_NOT_FOUND,
        '资料不存在'
      );
    }
    throw error;
  }
}

/**
 * 批准资料
 * @param {string} materialId - 资料ID
 * @param {string} reviewerNote - 审核备注
 * @param {string} reviewerId - 审核人ID
 * @param {boolean} useTransaction - 是否使用事务
 * @returns {Promise<Object>} 操作结果
 */
async function approveMaterial(materialId, reviewerNote, reviewerId, useTransaction = false) {
  const { db } = initCloud();

  try {
    // 查询资料
    const materialResult = await db.collection('materials')
      .doc(materialId)
      .get();

    if (!materialResult.data) {
      return createErrorResponse(
        ERROR_CODES.MATERIAL_NOT_FOUND,
        '资料不存在'
      );
    }

    const material = materialResult.data;

    // 检查当前状态
    if (material.status !== MATERIAL_STATUS.PENDING) {
      if (material.status === MATERIAL_STATUS.APPROVED) {
        // 幂等性：已经批准过
        return {
          success: true,
          status: MATERIAL_STATUS.APPROVED,
          message: '资料已经批准',
          alreadyApproved: true,
          data: material
        };
      }
      return createErrorResponse(
        ERROR_CODES.ALREADY_PROCESSED,
        `资料已处理，当前状态: ${material.status}`
      );
    }

    if (useTransaction) {
      // 使用事务处理
      const transaction = await db.startTransaction();

      try {
        // 更新资料状态
        await transaction.collection('materials')
          .doc(materialId)
          .update({
            data: {
              status: MATERIAL_STATUS.APPROVED,
              reviewTime: new Date().toISOString(),
              reviewerId,
              reviewerNote: reviewerNote || null
            }
          });

        // TODO: 同步知识点到公共库
        // await syncKnowledgePointsToPublic(material.knowledge_points, transaction);

        await transaction.commit();

        return {
          success: true,
          status: MATERIAL_STATUS.APPROVED,
          message: '资料审核通过'
        };
      } catch (transError) {
        await transaction.rollback();
        console.error('[approveMaterial] Transaction failed, rolled back:', transError);
        return createErrorResponse(
          ERROR_CODES.TRANSACTION_FAILED,
          '审核操作失败，已回滚'
        );
      }
    } else {
      // 非事务模式
      await db.collection('materials')
        .doc(materialId)
        .update({
          data: {
            status: MATERIAL_STATUS.APPROVED,
            reviewTime: new Date().toISOString(),
            reviewerId,
            reviewerNote: reviewerNote || null
          }
        });

      return {
        success: true,
        status: MATERIAL_STATUS.APPROVED,
        message: '资料审核通过'
      };
    }
  } catch (error) {
    console.error('[approveMaterial] Error:', error);
    throw error;
  }
}

/**
 * 拒绝资料
 * @param {string} materialId - 资料ID
 * @param {string} reviewerNote - 审核备注（必填）
 * @param {string} reviewerId - 审核人ID
 * @returns {Promise<Object>} 操作结果
 */
async function rejectMaterial(materialId, reviewerNote, reviewerId) {
  const { db } = initCloud();

  if (!reviewerNote || reviewerNote.trim().length === 0) {
    return createErrorResponse(
      ERROR_CODES.MISSING_NOTE,
      '拒绝资料必须提供审核意见'
    );
  }

  try {
    // 查询资料
    const materialResult = await db.collection('materials')
      .doc(materialId)
      .get();

    if (!materialResult.data) {
      return createErrorResponse(
        ERROR_CODES.MATERIAL_NOT_FOUND,
        '资料不存在'
      );
    }

    const material = materialResult.data;

    // 检查当前状态
    if (material.status !== MATERIAL_STATUS.PENDING) {
      if (material.status === MATERIAL_STATUS.REJECTED) {
        // 幂等性：已经拒绝过
        return {
          success: true,
          status: MATERIAL_STATUS.REJECTED,
          message: '资料已经拒绝',
          alreadyRejected: true
        };
      }
      return createErrorResponse(
        ERROR_CODES.ALREADY_PROCESSED,
        `资料已处理，当前状态: ${material.status}`
      );
    }

    // 更新状态
    await db.collection('materials')
      .doc(materialId)
      .update({
        data: {
          status: MATERIAL_STATUS.REJECTED,
          reviewTime: new Date().toISOString(),
          reviewerId,
          reviewerNote
        }
      });

    return {
      success: true,
      status: MATERIAL_STATUS.REJECTED,
      message: '资料已拒绝'
    };
  } catch (error) {
    console.error('[rejectMaterial] Error:', error);
    throw error;
  }
}

/**
 * 更新知识点
 * @param {string} materialId - 资料ID
 * @param {Array} knowledgePoints - 新的知识点列表
 * @param {string} reviewerId - 操作人ID
 * @returns {Promise<Object>} 操作结果
 */
async function updateKnowledgePoints(materialId, knowledgePoints, reviewerId) {
  const { db } = initCloud();

  if (!Array.isArray(knowledgePoints)) {
    return createErrorResponse(
      ERROR_CODES.MISSING_PARAMS,
      '知识点必须是数组格式'
    );
  }

  try {
    // 验证知识点格式
    for (const kp of knowledgePoints) {
      if (!kp.kp_id || !kp.name) {
        return createErrorResponse(
          ERROR_CODES.MISSING_PARAMS,
          '知识点必须包含 kp_id 和 name 字段'
        );
      }
    }

    // 查询资料
    const materialResult = await db.collection('materials')
      .doc(materialId)
      .get();

    if (!materialResult.data) {
      return createErrorResponse(
        ERROR_CODES.MATERIAL_NOT_FOUND,
        '资料不存在'
      );
    }

    const material = materialResult.data;

    // 只有待审核或已批准的资料可以编辑知识点
    if (material.status !== MATERIAL_STATUS.PENDING &&
        material.status !== MATERIAL_STATUS.APPROVED) {
      return createErrorResponse(
        ERROR_CODES.ALREADY_PROCESSED,
        '已拒绝的资料无法编辑知识点'
      );
    }

    // 更新知识点
    await db.collection('materials')
      .doc(materialId)
      .update({
        data: {
          knowledge_points: knowledgePoints,
          updated_by: reviewerId,
          updated_at: new Date().toISOString()
        }
      });

    // 返回更新后的资料
    const updatedResult = await db.collection('materials')
      .doc(materialId)
      .get();

    return {
      success: true,
      message: '知识点更新成功',
      data: updatedResult.data
    };
  } catch (error) {
    console.error('[updateKnowledgePoints] Error:', error);
    throw error;
  }
}

/**
 * 主入口函数
 * @param {Object} event - 请求参数
 * @param {string} event.action - 操作类型
 * @param {string} event.materialId - 资料ID（某些操作必需）
 * @param {string} event.reviewerNote - 审核备注（某些操作必需）
 * @param {Object} context - 云函数上下文
 */
exports.main = async (event, context) => {
  const { action, materialId, reviewerNote, useTransaction, ...otherParams } = event;
  const userId = context.userInfo?.openId;

  // 验证管理员权限
  if (!isAdmin(userId)) {
    return createErrorResponse(
      ERROR_CODES.PERMISSION_DENIED,
      '权限不足，仅管理员可执行此操作'
    );
  }

  // 验证操作类型
  if (!action) {
    return createErrorResponse(
      ERROR_CODES.MISSING_ACTION,
      '缺少操作类型参数'
    );
  }

  if (!VALID_ACTIONS.includes(action)) {
    return createErrorResponse(
      ERROR_CODES.INVALID_ACTION,
      `无效的操作类型: ${action}，支持的操作: ${VALID_ACTIONS.join(', ')}`
    );
  }

  try {
    switch (action) {
      case 'listPending':
        return await listPendingMaterials(otherParams);

      case 'getDetail':
        if (!materialId) {
          return createErrorResponse(
            ERROR_CODES.MISSING_PARAMS,
            '缺少资料ID参数'
          );
        }
        return await getMaterialDetail(materialId);

      case 'approve':
        if (!materialId) {
          return createErrorResponse(
            ERROR_CODES.MISSING_PARAMS,
            '缺少资料ID参数'
          );
        }
        return await approveMaterial(materialId, reviewerNote, userId, useTransaction);

      case 'reject':
        if (!materialId) {
          return createErrorResponse(
            ERROR_CODES.MISSING_PARAMS,
            '缺少资料ID参数'
          );
        }
        return await rejectMaterial(materialId, reviewerNote, userId);

      case 'updateKnowledgePoints':
        if (!materialId) {
          return createErrorResponse(
            ERROR_CODES.MISSING_PARAMS,
            '缺少资料ID参数'
          );
        }
        return await updateKnowledgePoints(materialId, otherParams.knowledgePoints, userId);

      default:
        return createErrorResponse(
          ERROR_CODES.INVALID_ACTION,
          `未实现的操作: ${action}`
        );
    }
  } catch (error) {
    console.error('[adminReviewMaterial] Error:', error);
    return {
      success: false,
      errMsg: error.message || '操作失败',
      code: 'OPERATION_FAILED'
    };
  }
};
