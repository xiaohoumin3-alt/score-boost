/**
 * 测试 db.command.in() 查询
 */

exports.main = async (event, context) => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();

  try {
    const question_ids = [
      '43834a186a27639800c3049467ad9695',
      '3fda1b3e6a27639800715292057d1ff2',
      '4a3e78116a276398006e21e41f9b5675',
      '4a3e78116a276399006e21e55d506038'
    ];

    console.log('Testing db.command.in() with', question_ids.length, 'IDs');

    // 方法1: 使用 db.command.in()
    try {
      const _ = db.command;
      const result1 = await db.collection('ai_question_pool')
        .where({ _id: _.in(question_ids) })
        .get();
      console.log('Method 1 (db.command.in()) result:', result1.data?.length || 0);
    } catch (e) {
      console.error('Method 1 failed:', e.message);
    }

    // 方法2: 直接使用 in 操作符
    try {
      const result2 = await db.collection('ai_question_pool')
        .where({
          _id: db.command.in(question_ids)
        })
        .get();
      console.log('Method 2 (where with in) result:', result2.data?.length || 0);
    } catch (e) {
      console.error('Method 2 failed:', e.message);
    }

    // 方法3: 手动查询每个ID
    const results = [];
    for (const id of question_ids) {
      const res = await db.collection('ai_question_pool')
        .where({ _id: id })
        .get();
      if (res.data && res.data.length > 0) {
        results.push(...res.data);
      }
    }
    console.log('Method 3 (individual queries) result:', results.length);

    return {
      success: true,
      method1Count: result1?.data?.length || 0,
      method3Count: results.length,
      questions: results.map(q => ({ _id: q._id, content: q.content?.substring(0, 30) }))
    };
  } catch (e) {
    console.error('Error:', e);
    return { success: false, error: e.message };
  }
};
