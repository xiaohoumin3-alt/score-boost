/**
 * 知识点请求日志记录器
 * 用途：记录每次知识点请求，用于热度计算和预生成触发
 */

/**
 * 记录知识点请求
 * @param {Object} db - 数据库实例
 * @param {Object} params - 请求参数
 * @returns {Promise<void>}
 */
async function logKpRequest(db, params) {
  const { kp_id, kp_name, subject, student_id, source = 'assessment' } = params;

  try {
    await db.collection('kp_request_log').add({
      kp_id,
      kp_name,
      subject,
      student_id,
      source,
      requested_at: new Date()
    });
    console.log('[KpLogger] Logged request:', kp_id, kp_name);
  } catch (e) {
    console.error('[KpLogger] Failed to log:', e.message);
    // 记录失败不影响主流程
  }
}

/**
 * 获取知识点请求统计（用于热度计算）
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @param {number} days - 统计天数
 * @returns {Promise<Object>} 统计结果
 */
async function getKpRequestStats(db, kpId, days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await db.collection('kp_request_log')
      .where({
        kp_id: kpId,
        requested_at: db.command.gte(startDate)
      })
      .count();

    return {
      kp_id: kpId,
      count: result.total || 0,
      days
    };
  } catch (e) {
    console.error('[KpLogger] Failed to get stats:', e.message);
    return { kp_id: kpId, count: 0, days };
  }
}

module.exports = {
  logKpRequest,
  getKpRequestStats
};
