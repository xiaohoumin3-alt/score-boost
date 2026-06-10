/**
 * pointsManager 云函数测试脚本
 * 用于诊断积分系统问题
 */

const cloud = require('wx-server-sdk');

cloud.init({ env: 'cloud1-7gg9y9tjb2b867b6' });

async function testPointsManager() {
  console.log('=== 测试 pointsManager 云函数 ===\n');

  // 模拟云函数调用
  const mockContext = {
    OPENID: 'test_openid_for_diagnosis'
  };

  // 导入 pointsManager 的主函数
  const pointsManager = require('./cloudfunctions/pointsManager/index.js');

  try {
    // 测试数据库集合访问
    console.log('1. 测试数据库集合访问...');
    const testResult = await pointsManager.main(
      { action: 'testCollections' },
      mockContext
    );
    console.log('结果:', JSON.stringify(testResult, null, 2));

    if (testResult.success && testResult.data) {
      console.log('\n集合状态:');
      for (const [name, status] of Object.entries(testResult.data)) {
        console.log(`  ${name}: ${status.exists ? '✓ 存在' : '✗ 不存在'}`);
      }
    }

  } catch (e) {
    console.error('测试失败:', e);
  }
}

testPointsManager()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('脚本执行失败:', err);
    process.exit(1);
  });