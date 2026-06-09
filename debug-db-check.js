/**
 * 调试脚本：检查数据库数据和云函数状态
 */

const tcb = require('@cloudbase/node-sdk');

// 初始化
const app = tcb.init({
  env: 'cloud1-7gg9y9tjb2b867b6'
});

async function checkDatabase() {
  console.log('=== 数据库调试 ===');

  // 1. 检查 kp_progress 集合
  console.log('\n1. 检查 kp_progress 集合...');
  try {
    const kpProgressResult = await app.database().collection('kp_progress').limit(5).get();
    console.log(`   记录数: ${kpProgressResult.data.length}`);
    if (kpProgressResult.data.length > 0) {
      console.log('   示例记录:', JSON.stringify(kpProgressResult.data[0], null, 2));
    }
  } catch (e) {
    console.error('   查询失败:', e.message);
  }

  // 2. 检查 knowledge_points 集合
  console.log('\n2. 检查 knowledge_points 集合...');
  try {
    const kpResult = await app.database().collection('knowledge_points').limit(5).get();
    console.log(`   记录数: ${kpResult.data.length}`);
    if (kpResult.data.length > 0) {
      console.log('   示例记录:', JSON.stringify(kpResult.data[0], null, 2));
    }
  } catch (e) {
    console.error('   查询失败:', e.message);
  }

  // 3. 检查 student_memory 集合
  console.log('\n3. 检查 student_memory 集合...');
  try {
    const memResult = await app.database().collection('student_memory').limit(5).get();
    console.log(`   记录数: ${memResult.data.length}`);
    if (memResult.data.length > 0) {
      console.log('   示例记录:', JSON.stringify(memResult.data.data[0], null, 2));
    }
  } catch (e) {
    console.error('   查询失败:', e.message);
  }

  // 4. 测试云函数调用
  console.log('\n4. 测试 generateDailyTask 云函数...');
  try {
    const fnResult = await app.callFunction({
      name: 'generateDailyTask',
      data: {
        student_id: 'debug-test',
        subject: '数学',
        grade: '八年级'
      }
    });
    console.log('   调用成功:', JSON.stringify(fnResult.result, null, 2));
  } catch (e) {
    console.error('   调用失败:', e.message);
  }
}

checkDatabase().then(() => {
  console.log('\n=== 调试完成 ===');
  process.exit(0);
}).catch(err => {
  console.error('调试失败:', err);
  process.exit(1);
});
