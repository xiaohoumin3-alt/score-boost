/**
 * 配额管理模块
 * 管理用户上传材料配额（按月重置）
 *
 * 配额规则：
 * - 普通用户：个人资料5个/月，教材资料2个/月
 * - VIP用户：个人资料20个/月，教材资料10个/月
 */

/**
 * 配额限制配置
 */
const QUOTA_LIMITS = {
  personal: {
    normal: 5,   // 普通用户个人资料配额
    vip: 20      // VIP用户个人资料配额
  },
  textbook: {
    normal: 2,   // 普通用户教材资料配额
    vip: 10      // VIP用户教材资料配额
  }
};

/**
 * 材料类型映射
 */
const MATERIAL_TYPES = {
  'personal': 'personal',  // 个人资料
  'textbook': 'textbook'   // 教材资料
};

/**
 * 检查用户是否为有效VIP
 * @param {Object} user - 用户信息
 * @returns {boolean} 是否为有效VIP
 */
function isValidVip(user) {
  if (!user || user.vip_status !== 'vip') {
    return false;
  }

  // 检查VIP是否过期
  if (user.vip_expire_at) {
    const expireTime = new Date(user.vip_expire_at).getTime();
    const now = Date.now();
    return expireTime > now;
  }

  return false;
}

/**
 * 获取用户配额限制
 * @param {Object} user - 用户信息
 * @param {string} materialType - 材料类型 (personal/textbook)
 * @returns {number} 配额数量
 */
function getQuotaLimit(user, materialType) {
  const isVip = isValidVip(user);
  const type = MATERIAL_TYPES[materialType];

  if (!type) {
    throw new Error(`Invalid material type: ${materialType}`);
  }

  return isVip ? QUOTA_LIMITS[type].vip : QUOTA_LIMITS[type].normal;
}

/**
 * 获取当月起始时间戳
 * @returns {number} 当月起始时间戳
 */
function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * 查询用户当月上传使用量
 * @param {string} openid - 用户openid
 * @param {string} materialType - 材料类型
 * @param {Object} db - 数据库实例
 * @returns {Promise<number>} 当月已使用配额
 */
async function getQuotaUsage(openid, materialType, db) {
  const monthStart = getMonthStart();
  const monthStartDate = new Date(monthStart).toISOString();

  try {
    const result = await db
      .collection('materials')
      .where({
        openid: openid,
        material_type: materialType,
        created_at: db.command.gte(monthStartDate)
      })
      .count();

    return result.total || 0;
  } catch (error) {
    console.error('getQuotaUsage error:', error);
    // 查询失败时返回0，避免阻塞上传
    return 0;
  }
}

/**
 * 检查用户配额
 * @param {string} openid - 用户openid
 * @param {string} materialType - 材料类型 (personal/textbook)
 * @param {Object} db - 数据库实例
 * @param {Object} user - 用户信息（可选，用于VIP判断）
 * @returns {Promise<Object>} 配额检查结果
 */
async function checkQuota(openid, materialType, db, user = null) {
  // 如果未提供用户信息，从数据库查询
  if (!user) {
    try {
      const userResult = await db
        .collection('users')
        .where({ openid })
        .field({ vip_status: true, vip_expire_at: true })
        .get();

      user = userResult.data[0] || { vip_status: 'free' };
    } catch (error) {
      console.error('checkQuota getUser error:', error);
      user = { vip_status: 'free' };
    }
  }

  // 获取配额限制
  const quotaLimit = getQuotaLimit(user, materialType);

  // 获取当前使用量
  const usage = await getQuotaUsage(openid, materialType, db);

  // 检查是否超限
  const allowed = usage < quotaLimit;

  if (!allowed) {
    const isVip = isValidVip(user);
    const typeName = materialType === 'personal' ? '个人资料' : '教材资料';
    const vipStatus = isVip ? 'VIP用户' : '普通用户';

    return {
      allowed: false,
      reason: `${vipStatus}${typeName}每月配额已用完（${usage}/${quotaLimit}）。升级VIP可享受更高配额，个人资料20个/月，教材资料10个/月。`,
      usage,
      limit: quotaLimit,
      remaining: 0
    };
  }

  return {
    allowed: true,
    reason: null,
    usage,
    limit: quotaLimit,
    remaining: quotaLimit - usage
  };
}

/**
 * 配额验证错误码
 */
const QUOTA_ERRORS = {
  EXCEEDED: 'QUOTA_EXCEEDED',
  INVALID_TYPE: 'INVALID_MATERIAL_TYPE',
  QUERY_FAILED: 'QUOTA_QUERY_FAILED'
};

/**
 * 生成配额超限错误响应
 * @param {string} materialType - 材料类型
 * @param {Object} user - 用户信息
 * @param {number} usage - 当前使用量
 * @param {number} limit - 配额限制
 * @returns {Object} 错误响应
 */
function generateQuotaErrorResponse(materialType, user, usage, limit) {
  const typeName = materialType === 'personal' ? '个人资料' : '教材资料';
  const isVip = isValidVip(user);
  const vipStatus = isVip ? 'VIP用户' : '普通用户';

  return {
    success: false,
    error_code: QUOTA_ERRORS.EXCEEDED,
    error: `${vipStatus}${typeName}每月配额已用完（${usage}/${limit}）`,
    message: `本月${typeName}上传次数已达上限。升级VIP可享更高配额：个人资料20个/月，教材资料10个/月。`,
    upgrade_vip: !isVip,
    vip_quota: materialType === 'personal' ? 20 : 10
  };
}

module.exports = {
  QUOTA_LIMITS,
  QUOTA_ERRORS,
  checkQuota,
  getQuotaUsage,
  isValidVip,
  getQuotaLimit,
  generateQuotaErrorResponse
};
