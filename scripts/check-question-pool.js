/**
 * 题库统计脚本
 * 查询 ai_question_pool 题目数量和分布
 */

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

async function checkQuestionPool() {
  console.log('========================================');
  console.log('题库统计工具');
  console.log('========================================\n');

  try {
    // 1. 获取总题目数
    const countResult = await db.collection('ai_question_pool').count();
    const total = countResult.total || 0;
    console.log(`【总题目数】${total} 道\n`);

    // 2. 按科目统计
    console.log('【按科目分布】');
    const subjects = ['math', 'biology', 'geography'];
    for (const subject of subjects) {
      const result = await db.collection('ai_question_pool')
        .where({ subject })
        .count();
      console.log(`  ${subject}: ${result.total || 0} 道`);
    }
    console.log('');

    // 3. 按验证状态统计
    console.log('【按验证状态】');
    const verifiedResult = await db.collection('ai_question_pool')
      .where({ verified: true })
      .count();
    const unverifiedResult = await db.collection('ai_question_pool')
      .where({ verified: false })
      .count();
    console.log(`  已验证: ${verifiedResult.total || 0} 道`);
    console.log(`  未验证: ${unverifiedResult.total || 0} 道`);
    console.log('');

    // 4. 按难度统计
    console.log('【按难度分布】');
    const difficulties = ['easy', 'medium', 'hard'];
    for (const difficulty of difficulties) {
      const result = await db.collection('ai_question_pool')
        .where({ difficulty })
        .count();
      console.log(`  ${difficulty}: ${result.total || 0} 道`);
    }
    console.log('');

    // 5. 按题目类型统计
    console.log('【按题目类型】');
    const types = await db.collection('ai_question_pool')
      .field({ type: true })
      .get();
    const typeCount = {};
    (types.data || []).forEach(q => {
      typeCount[q.type] = (typeCount[q.type] || 0) + 1;
    });
    for (const [type, count] of Object.entries(typeCount)) {
      console.log(`  ${type}: ${count} 道`);
    }
    console.log('');

    // 6. 最近添加的题目
    console.log('【最近添加的题目】（前5道）');
    const recent = await db.collection('ai_question_pool')
      .orderBy('created_at', 'desc')
      .limit(5)
      .field({ content: true, difficulty: true, subject: true, created_at: true })
      .get();
    (recent.data || []).forEach((q, i) => {
      const content = q.content ? q.content.substring(0, 30) + '...' : 'N/A';
      console.log(`  ${i + 1}. [${q.difficulty || '?'}] ${q.subject || '?'} - ${content} (${q.created_at || 'N/A'})`);
    });
    console.log('');

    console.log('========================================');
    console.log(`统计完成：总计 ${total} 道题目`);
    console.log('========================================');

  } catch (e) {
    console.error('查询失败:', e);
  }
}

checkQuestionPool();
