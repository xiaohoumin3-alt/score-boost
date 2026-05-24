/**
 * 测试云函数部署状态
 */

const cloud = require('wx-server-sdk').init;
const env = 'cloud1-7gg9y9tjb2b867b6';

// 初始化
cloud.init({
  env: env
});

const db = cloud.database();
const _ = db.command;

async function testCloudFunctions() {
  console.log('========================================');
  console.log('云函数测试');
  console.log('========================================');
  console.log('环境:', env);
  console.log('');

  // 1. 测试initDatabase
  console.log('1. 测试 initDatabase...');
  try {
    const initResult = await cloud.callFunction({
      name: 'initDatabase',
      data: {}
    });
    console.log('✅ initDatabase 调用成功');
    console.log('结果:', JSON.stringify(initResult.result, null, 2).substring(0, 500));
  } catch (e) {
    console.log('❌ initDatabase 调用失败:', e.message);
  }

  // 2. 检查ai_question_pool集合
  console.log('\n2. 检查 ai_question_pool 集合...');
  try {
    const poolResult = await db.collection('ai_question_pool').count();
    console.log('✅ ai_question_pool 存在，记录数:', poolResult.total);

    if (poolResult.total > 0) {
      const sample = await db.collection('ai_question_pool').limit(1).get();
      console.log('示例记录:', JSON.stringify(sample.data[0], null, 2).substring(0, 300));
    }
  } catch (e) {
    console.log('❌ ai_question_pool 检查失败:', e.message);
  }

  // 3. 检查kp_heat集合
  console.log('\n3. 检查 kp_heat 集合...');
  try {
    const heatResult = await db.collection('kp_heat').count();
    console.log('✅ kp_heat 存在，记录数:', heatResult.total);
  } catch (e) {
    console.log('❌ kp_heat 检查失败:', e.message);
  }

  // 4. 测试generateAiQuestion
  console.log('\n4. 测试 generateAiQuestion...');
  try {
    const genResult = await cloud.callFunction({
      name: 'generateAiQuestion',
      data: {
        kp_name: '测试知识点',
        difficulty: 'easy',
        chapter: '测试章节'
      }
    });
    console.log('✅ generateAiQuestion 调用成功');
    console.log('结果:', JSON.stringify(genResult.result, null, 2).substring(0, 500));
  } catch (e) {
    console.log('❌ generateAiQuestion 调用失败:', e.message);
    if (e.errMsg.includes('-501007')) {
      console.log('   提示: 可能需要先配置MINIMAX_API_KEY环境变量');
    }
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

// 在小程序环境中运行
if (typeof getApp === 'function') {
  // 在小程序中
  testCloudFunctions();
} else {
  // 本地测试需要先登录
  console.log('请在微信小程序开发者工具的云函数控制台中运行此测试');
  console.log('或者在小程序代码中调用此测试脚本');
}
