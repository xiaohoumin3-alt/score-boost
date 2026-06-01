/**
 * startExclusiveExam 云函数
 * 功能：为VIP用户创建专属测评（基于用户上传资料）
 * Phase 6: 专属测评 + RAG检索
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 专属测评配额限制
 */
const EXCLUSIVE_EXAM_QUOTA = {
  normal: 1,    // 普通用户每月1次
  vip: 10      // VIP用户每月10次
};

/**
 * 获取当月起始时间
 */
function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * 检查用户是否为有效VIP
 */
function isValidVip(user) {
  if (!user || user.vip_status !== 'vip') {
    return false;
  }
  if (user.vip_expire_at) {
    const expireTime = new Date(user.vip_expire_at).getTime();
    return expireTime > Date.now();
  }
  return true;
}

/**
 * 验证专属测评配额
 */
async function checkExclusiveExamQuota(db, _, openid, user) {
  const monthStart = getMonthStart();
  const monthStartDate = new Date(monthStart).toISOString();

  try {
    const result = await db.collection('user_exams')
      .where({
        openid: openid,
        exam_type: 'exclusive',
        created_at: _.gte(monthStartDate)
      })
      .count();

    const usage = result.total || 0;
    const limit = isValidVip(user) ? EXCLUSIVE_EXAM_QUOTA.vip : EXCLUSIVE_EXAM_QUOTA.normal;
    const remaining = Math.max(0, limit - usage);

    return {
      allowed: remaining > 0,
      usage,
      limit,
      remaining,
      reason: remaining === 0 ? '专属测评配额已用完' : null
    };
  } catch (error) {
    console.error('[checkExclusiveExamQuota] Error:', error);
    return { allowed: false, usage: 0, limit: 0, remaining: 0, reason: '配额查询失败' };
  }
}

/**
 * RAG检索：从user_materials_vectors获取相关chunks
 */
async function searchRelatedChunks(db, _, openid, materialIds, limit = 50) {
  try {
    const result = await db.collection('user_materials_vectors')
      .where({
        openid: openid,
        material_id: _.in(materialIds)
      })
      .limit(limit)
      .get();

    return result.data || [];
  } catch (error) {
    console.error('[searchRelatedChunks] Error:', error);
    return [];
  }
}

/**
 * 主入口函数
 * @param {Object} event - 请求参数
 * @param {string} event.subject - 学科
 * @param {string} event.grade - 年级
 * @param {string[]} event.materialIds - 用户资料ID列表
 * @param {number} event.questionCount - 题目数量
 * @param {string} event.difficulty - 难度 (easy/medium/hard)
 * @param {Object} context - 云函数上下文
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const wxContext = cloud.getWXContext();

  const openid = wxContext.OPENID;

  if (!openid) {
    return {
      success: false,
      error_code: 'UNAUTHORIZED',
      error: '无法获取用户身份'
    };
  }

  const { subject, grade, materialIds, questionCount = 10, difficulty = 'medium' } = event;

  // ========== Step 6.3: 参数验证 ==========
  if (!subject || !grade || !materialIds || !Array.isArray(materialIds) || materialIds.length === 0) {
    return {
      success: false,
      error_code: 'MISSING_PARAMS',
      error: '缺少必填参数：subject, grade, materialIds'
    };
  }

  if (questionCount < 1 || questionCount > 100) {
    return {
      success: false,
      error_code: 'INVALID_QUESTION_COUNT',
      error: '题目数量必须在1-100之间'
    };
  }

  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    return {
      success: false,
      error_code: 'INVALID_DIFFICULTY',
      error: '难度必须是 easy, medium, hard 之一'
    };
  }

  try {
    // 获取用户信息
    const userResult = await db.collection('users')
      .where({ _openid: openid })
      .field({ vip_status: true, vip_expire_at: true })
      .get();

    const user = userResult.data[0];

    // ========== Step 6.3: VIP状态验证 ==========
    if (!user || !isValidVip(user)) {
      return {
        success: false,
        error_code: 'NOT_VIP',
        error: '专属测评需要VIP权限，请先升级VIP'
      };
    }

    // ========== Step 6.3: 专属测评配额验证 ==========
    const quotaCheck = await checkExclusiveExamQuota(db, _, openid, user);
    if (!quotaCheck.allowed) {
      return {
        success: false,
        error_code: 'QUOTA_EXCEEDED',
        error: quotaCheck.reason || '专属测评配额已用完',
        quota_info: {
          usage: quotaCheck.usage,
          limit: quotaCheck.limit,
          remaining: quotaCheck.remaining
        }
      };
    }

    // ========== Step 6.3: 验证资料所有权和审核状态 ==========
    const materialsResult = await db.collection('user_materials')
      .where({
        _id: _.in(materialIds),
        openid: openid,
        status: 'approved'
      })
      .get();

    if (materialsResult.data.length !== materialIds.length) {
      return {
        success: false,
        error_code: 'INVALID_MATERIALS',
        error: '部分资料不存在或未通过审核，请检查资料状态'
      };
    }

    // ========== Step 6.2: RAG检索相关chunks ==========
    const relatedChunks = await searchRelatedChunks(db, _, openid, materialIds, 50);

    console.log('[startExclusiveExam] RAG检索完成，chunks数量:', relatedChunks.length);

    // ========== Step 6.1: 创建user_exams记录 ==========
    const now = new Date();
    const examData = {
      openid,
      exam_type: 'exclusive',
      material_ids: materialIds,
      num_questions: questionCount,
      subject,
      grade,
      difficulty,
      status: 'pending',
      question_ids: [],
      score: null,
      rag_chunks_count: relatedChunks.length,
      created_at: now.toISOString(),
      completed_at: null
    };

    const examResult = await db.collection('user_exams').add({
      data: examData
    });

    // 创建题目生成队列任务
    const queueData = {
      student_id: openid,
      subject,
      grade,
      semester: 'all',
      mode: 'exclusive',
      num_questions: questionCount,
      difficulty_distribution: {
        [difficulty]: 1.0
      },
      exam_id: examResult._id,
      source_materials: materialIds,
      rag_chunks: relatedChunks.map(c => c._id),
      priority: 100,
      status: 'pending',
      created_at: now.toISOString()
    };

    await db.collection('question_queue').add({
      data: queueData
    });

    return {
      success: true,
      data: {
        exam_id: examResult._id,
        status: 'pending',
        message: '专属测评已创建，题目生成中...',
        quota_info: {
          remaining: quotaCheck.remaining - 1
        }
      }
    };

  } catch (error) {
    console.error('[startExclusiveExam] Error:', error);
    return {
      success: false,
      error_code: 'CREATE_FAILED',
      error: error.message || '创建专属测评失败'
    };
  }
};
