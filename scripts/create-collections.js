/**
 * 创建数据库集合脚本
 * 在云开发控制台运行此脚本
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-7gg9y9tjb2b867b6' });
const db = cloud.database();

async function createCollections() {
  const collections = [
    'user_points',
    'point_records',
    'invite_records'
  ];

  for (const name of collections) {
    try {
      await db.collection(name).limit(1).get();
      console.log(`✓ ${name} 已存在`);
    } catch (e) {
      if (e.errCode === -1 || e.errMsg?.includes('collection not exists')) {
        try {
          await db.createCollection(name);
          console.log(`✓ ${name} 已创建`);
        } catch (createErr) {
          console.error(`✗ 创建 ${name} 失败:`, createErr.message);
        }
      }
    }
  }
}

createCollections().then(() => console.log('完成'));
