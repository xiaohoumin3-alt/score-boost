/**
 * 创建所需的数据库集合
 */
const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({
  env: 'cloud1-7gg9y9tjb2b867b6'
});

const db = app.database();

async function createCollections() {
  const collections = ['analytics', 'redeem_codes', 'point_records'];

  for (const name of collections) {
    try {
      // Try to read from it — if it exists this will succeed
      await db.collection(name).limit(1).get();
      console.log(`✓ 集合 ${name} 已存在`);
    } catch (e) {
      // Collection doesn't exist, try to create it by adding and deleting a doc
      try {
        const res = await db.collection(name).add({ data: { _init: true } });
        await db.collection(name).doc(res.id).remove();
        console.log(`✓ 集合 ${name} 已创建`);
      } catch (e2) {
        console.log(`⚠ 集合 ${name}: ${e2.message}`);
      }
    }
  }

  // Create a test redeem code
  try {
    const existing = await db.collection('redeem_codes')
      .where({ code: 'TEST100' })
      .get();

    if (existing.data.length === 0) {
      await db.collection('redeem_codes').add({
        data: {
          code: 'TEST100',
          points: 100,
          used: false,
          created_at: new Date().toISOString()
        }
      });
      console.log('✓ 测试兑换码已创建: TEST100 (100积分)');
    } else {
      console.log('✓ 测试兑换码 TEST100 已存在');
    }
  } catch (e) {
    console.log(`⚠ 兑换码: ${e.message}`);
  }

  console.log('\n完成！');
  process.exit(0);
}

createCollections().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
