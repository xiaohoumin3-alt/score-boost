/**
 * 测试脚本：验证数据库连接和云函数调用
 * 用法：node test-cloud-functions.js
 */

const cloud = require('wx-server-sdk');

// 初始化云开发
const ENV_ID = 'cloud1-7gg9y9tjb2b867b6';
cloud.init({ env: ENV_ID });
const db = cloud.database();

console.log(`🔧 测试环境: ${ENV_ID}\n`);

async function testDatabaseConnection() {
  console.log('📊 测试数据库连接...');

  const collections = [
    'user_points',
    'point_records',
    'kp_progress',
    'practices',
    'ai_question_pool'
  ];

  const results = {};

  for (const name of collections) {
    try {
      const result = await db.collection(name).limit(1).get();
      results[name] = { status: '✓ OK', count: result.data.length };
      console.log(`  ✓ ${name}: 存在 (${result.data.length} 条记录)`);
    } catch (e) {
      results[name] = { status: '✗ ERROR', error: e.message };
      console.log(`  ✗ ${name}: ${e.message}`);
    }
  }

  return results;
}

async function testPointsManager() {
  console.log('\n🎯 测试 pointsManager 云函数...');

  try {
    const result = await cloud.callFunction({
      name: 'pointsManager',
      data: { action: 'getPoints' }
    });

    if (result.result && result.result.success) {
      console.log('  ✓ pointsManager 调用成功');
      console.log('    返回数据:', JSON.stringify(result.result.data));
      return { status: '✓ OK', data: result.result };
    } else {
      console.log('  ✗ pointsManager 返回失败:', result.result?.error);
      return { status: '✗ FAILED', error: result.result?.error };
    }
  } catch (e) {
    console.log('  ✗ pointsManager 调用异常:', e.message);
    return { status: '✗ ERROR', error: e.message };
  }
}

async function runTests() {
  const summary = {
    database: await testDatabaseConnection(),
    pointsManager: await testPointsManager()
  };

  console.log('\n📋 测试汇总:');
  console.log(JSON.stringify(summary, null, 2));

  return summary;
}

// 运行测试
if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('测试失败:', err);
      process.exit(1);
    });
}

module.exports = { testDatabaseConnection, testPointsManager, testPracticeV2 };
