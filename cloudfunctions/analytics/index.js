/**
 * analytics 云函数
 * 轻量级事件追踪，支持批量写入
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 记录单个事件
 */
async function trackEvent(openid, event, data) {
  const record = {
    openid: openid || 'anonymous',
    event: event,
    data: data || {},
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    hour: new Date().getHours()
  };

  try {
    await db.collection('analytics').add({ data: record });
    return { success: true };
  } catch (e) {
    console.error('[analytics] track error:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 批量记录事件
 */
async function trackBatch(openid, events) {
  if (!events || events.length === 0) return { success: true, count: 0 };

  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const hour = now.getHours();

    const records = events.map(e => ({
      openid: openid || 'anonymous',
      event: e.event,
      data: e.data || {},
      timestamp: now.toISOString(),
      date: dateStr,
      hour: hour
    }));

    // 云数据库批量 add 限制 20 条
    const batchSize = 20;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await db.collection('analytics').add({ data: batch });
    }

    return { success: true, count: records.length };
  } catch (e) {
    console.error('[analytics] batch error:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 查询聚合统计
 */
async function getStats(params) {
  const { start_date, end_date, event, group_by } = params;

  const query = {};
  if (start_date) query.date = _.gte(start_date);
  if (end_date) query.date = query.date ? _.and(query.date, _.lte(end_date)) : _.lte(end_date);
  if (event) query.event = event;

  try {
    const result = await db.collection('analytics')
      .where(query)
      .limit(1000)
      .get();

    const records = result.data || [];

    if (group_by === 'date') {
      const grouped = {};
      records.forEach(r => {
        if (!grouped[r.date]) grouped[r.date] = { date: r.date, count: 0, events: {} };
        grouped[r.date].count++;
        grouped[r.date].events[r.event] = (grouped[r.date].events[r.event] || 0) + 1;
      });
      return { success: true, data: Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date)) };
    }

    if (group_by === 'event') {
      const grouped = {};
      records.forEach(r => {
        if (!grouped[r.event]) grouped[r.event] = { event: r.event, count: 0 };
        grouped[r.event].count++;
      });
      return { success: true, data: Object.values(grouped).sort((a, b) => b.count - a.count) };
    }

    // 默认返回总数
    const eventCounts = {};
    records.forEach(r => {
      eventCounts[r.event] = (eventCounts[r.event] || 0) + 1;
    });

    const uniqueUsers = new Set(records.map(r => r.openid)).size;

    return {
      success: true,
      data: {
        total_events: records.length,
        unique_users: uniqueUsers,
        events: eventCounts
      }
    };
  } catch (e) {
    console.error('[analytics] stats error:', e.message);
    return { success: false, error: e.message };
  }
}

exports.main = async (event, context) => {
  const { action } = event;
  const openid = event.openid || (cloud.getWXContext ? cloud.getWXContext().OPENID : null);

  switch (action) {
    case 'track':
      return await trackEvent(openid, event.event, event.data);

    case 'batch':
      return await trackBatch(openid, event.events);

    case 'stats':
      return await getStats(event);

    default:
      return { success: false, error: 'Unknown action: ' + action };
  }
};
