/**
 * 监控埋点模块
 * 用途：记录系统关键指标，用于性能监控和优化
 */

/**
 * 记录题库查询命中
 * @param {Object} db - 数据库实例
 * @param {Object} params - 参数
 * @returns {Promise<void>}
 */
async function logPoolHit(db, params = {}) {
  const {
    kp_id,
    difficulty = 'unknown',
    cache_type = 'database',
    response_time_ms = 0
  } = params;

  try {
    await db.collection('telemetry_logs').add({
      event: 'pool_hit',
      timestamp: new Date(),
      kp_id,
      difficulty,
      cache_type,
      response_time_ms
    });
    console.log('[Telemetry] Pool hit:', kp_id, difficulty, `${response_time_ms}ms`);
  } catch (e) {
    console.warn('[Telemetry] Failed to log pool hit:', e.message);
    // 监控失败不影响主流程
  }
}

/**
 * 记录题库查询未命中
 * @param {Object} db - 数据库实例
 * @param {Object} params - 参数
 * @returns {Promise<void>}
 */
async function logPoolMiss(db, params = {}) {
  const {
    kp_id,
    difficulty = 'unknown',
    reason = 'unknown'
  } = params;

  try {
    await db.collection('telemetry_logs').add({
      event: 'pool_miss',
      timestamp: new Date(),
      kp_id,
      difficulty,
      reason
    });
    console.log('[Telemetry] Pool miss:', kp_id, reason);
  } catch (e) {
    console.warn('[Telemetry] Failed to log pool miss:', e.message);
  }
}

/**
 * 记录批量API成功
 * @param {Object} db - 数据库实例
 * @param {Object} params - 参数
 * @returns {Promise<void>}
 */
async function logBatchApiSuccess(db, params = {}) {
  const {
    kp_id,
    count_requested = 1,
    count_generated = 0,
    duration_ms = 0
  } = params;

  try {
    await db.collection('telemetry_logs').add({
      event: 'batch_api_success',
      timestamp: new Date(),
      kp_id,
      count_requested,
      count_generated,
      duration_ms
    });
    console.log('[Telemetry] Batch API success:', kp_id, `${count_generated}/${count_requested} in ${duration_ms}ms`);
  } catch (e) {
    console.warn('[Telemetry] Failed to log batch API success:', e.message);
  }
}

/**
 * 记录批量API失败
 * @param {Object} db - 数据库实例
 * @param {Object} params - 参数
 * @returns {Promise<void>}
 */
async function logBatchApiFailure(db, params = {}) {
  const {
    kp_id,
    error_code = 'UNKNOWN',
    error_message = ''
  } = params;

  try {
    await db.collection('telemetry_logs').add({
      event: 'batch_api_failure',
      timestamp: new Date(),
      kp_id,
      error_code,
      error_message
    });
    console.log('[Telemetry] Batch API failure:', kp_id, error_code);
  } catch (e) {
    console.warn('[Telemetry] Failed to log batch API failure:', e.message);
  }
}

/**
 * 记录轮询超时
 * @param {Object} db - 数据库实例
 * @param {Object} params - 参数
 * @returns {Promise<void>}
 */
async function logPollTimeout(db, params = {}) {
  const {
    task_id,
    poll_count = 0,
    elapsed_seconds = 0
  } = params;

  try {
    await db.collection('telemetry_logs').add({
      event: 'poll_timeout',
      timestamp: new Date(),
      task_id,
      poll_count,
      elapsed_seconds
    });
    console.log('[Telemetry] Poll timeout:', task_id, `${poll_count} polls, ${elapsed_seconds}s`);
  } catch (e) {
    console.warn('[Telemetry] Failed to log poll timeout:', e.message);
  }
}

/**
 * 记录降级触发
 * @param {Object} db - 数据库实例
 * @param {Object} params - 参数
 * @returns {Promise<void>}
 */
async function logFallbackTriggered(db, params = {}) {
  const {
    component = 'unknown',
    fallback_to = 'unknown',
    reason = 'unknown'
  } = params;

  try {
    await db.collection('telemetry_logs').add({
      event: 'fallback_triggered',
      timestamp: new Date(),
      component,
      fallback_to,
      reason
    });
    console.log('[Telemetry] Fallback triggered:', component, '→', fallback_to);
  } catch (e) {
    console.warn('[Telemetry] Failed to log fallback:', e.message);
  }
}

/**
 * 批量记录监控事件
 * @param {Object} db - 数据库实例
 * @param {Array} events - 事件数组
 * @returns {Promise<void>}
 */
async function logBatchEvents(db, events = []) {
  const promises = events.map(event => {
    const { event: eventName, ...data } = event;

    return db.collection('telemetry_logs').add({
      event: eventName,
      timestamp: new Date(),
      ...data
    }).catch(e => {
      console.warn(`[Telemetry] Failed to log ${eventName}:`, e.message);
    });
  });

  await Promise.allSettled(promises);
  console.log('[Telemetry] Batch logged:', events.length, 'events');
}

/**
 * 获取监控统计数据
 * @param {Object} db - 数据库实例
 * @param {Object} params - 查询参数
 * @returns {Promise<Object>} 统计结果
 */
async function getTelemetryStats(db, params = {}) {
  const {
    event,
    start_date,
    end_date = new Date()
  } = params;

  try {
    const whereCondition = { event };

    if (start_date) {
      // 使用云数据库的日期范围查询
      const cmd = db.command || {};
      whereCondition.timestamp = cmd.and ? cmd.and(
        cmd.gte ? cmd.gte(start_date) : start_date,
        cmd.lte ? cmd.lte(end_date) : end_date
      ) : { $gte: start_date, $lte: end_date };
    }

    const result = await db.collection('telemetry_logs')
      .where(whereCondition)
      .count();

    return {
      event,
      total: result.total || 0,
      start_date,
      end_date
    };
  } catch (e) {
    console.error('[Telemetry] Failed to get stats:', e.message);
    return { event, total: 0 };
  }
}

/**
 * 计算命中率
 * @param {Object} params - 参数
 * @returns {number} 命中率 (0-1)
 */
function calculateHitRate(params = {}) {
  const { hits = 0, misses = 0 } = params;
  const total = hits + misses;

  if (total === 0) {
    return 0;
  }

  return hits / total;
}

module.exports = {
  logPoolHit,
  logPoolMiss,
  logBatchApiSuccess,
  logBatchApiFailure,
  logPollTimeout,
  logFallbackTriggered,
  logBatchEvents,
  getTelemetryStats,
  calculateHitRate
};
