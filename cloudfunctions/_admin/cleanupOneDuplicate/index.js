/**
 * 题池清理 - 诊断版本，先看 aggregate 返回什么
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const $ = _.aggregate;

  const startTime = Date.now();
  const MAX_TIME = 12000;
  let totalDeleted = event.totalDeleted || 0;

  try {
    // 诊断：查看 aggregate 返回了什么
    const groups = await db.collection('ai_question_pool')
      .aggregate()
      .group({
        _id: '$question',
        count: $.sum(1)
      })
      .match({
        count: $.gt(1)
      })
      .sort({ count: -1 })
      .limit(5)
      .end();

    console.log('诊断结果:', JSON.stringify(groups.data));

    if (!groups.data || groups.data.length === 0) {
      return {
        success: true,
        done: true,
        message: '没有找到重复题目！',
        totalDeleted: totalDeleted,
        diagnostic: 'aggregate返回空'
      };
    }

    // 有重复！开始处理
    for (const group of groups.data) {
      if (Date.now() - startTime >= MAX_TIME) break;

      const questionText = group._id;
      if (!questionText || typeof questionText !== 'string') continue;

      console.log(`处理重复组: "${questionText.substring(0, 30)}..." (${group.count}条)`);

      // 获取该题目的所有记录
      const records = await db.collection('ai_question_pool')
        .where({ question: questionText })
        .field({ _id: true, verified: true, created_at: true })
        .get();

      if (records.data.length <= 1) continue;

      // 排序：verified优先，然后按时间
      records.data.sort((a, b) => {
        if (a.verified && !b.verified) return -1;
        if (!a.verified && b.verified) return 1;
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      });

      // 删除多余的
      const toDelete = records.data.slice(1);
      for (const doc of toDelete) {
        if (Date.now() - startTime >= MAX_TIME) break;
        try {
          await db.collection('ai_question_pool').doc(doc._id).remove();
          totalDeleted++;
        } catch (e) {
          console.error('删除失败:', doc._id, e.message);
        }
      }
    }

    return {
      success: true,
      done: false,
      totalDeleted: totalDeleted,
      foundGroups: groups.data.length,
      topDuplicate: groups.data[0] ? `${groups.data[0]._id.substring(0, 30)}... (${groups.data[0].count}条)` : '无',
      message: `找到 ${groups.data.length} 组重复，已删除 ${totalDeleted} 条`
    };

  } catch (e) {
    console.error('Error:', e);
    return { success: false, error: e.message, totalDeleted: totalDeleted };
  }
};
