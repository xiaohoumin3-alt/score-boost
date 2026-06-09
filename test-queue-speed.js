/**
 * 真实场景验收测试：30秒内完成测评题目生成
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

async function test() {
  console.log('=== 真实场景验收测试 ===');
  console.log('目标: 30秒内生成完整测评题目\n');

  const testStudentId = 'test_queue_speed_' + Date.now();
  const startTime = Date.now();

  try {
    // 1. 创建测评任务
    console.log('【1】创建测评任务...');
    const startResult = await cloud.callFunction({
      name: 'startAssessment',
      data: {
        student_id: testStudentId,
        grade: '8',
        subject: 'math',
        num_questions: 5,
        difficulty: 'medium'
      }
    });

    if (!startResult.result?.success) {
      throw new Error('创建测评失败: ' + JSON.stringify(startResult.result));
    }

    const { queue_id } = startResult.result.data;
    console.log(`✅ 任务已创建，queue_id: ${queue_id}`);

    // 2. 轮询队列状态，最多等待30秒
    console.log('\n【2】轮询队列状态（最多30秒）...');
    let completed = false;
    const maxWait = 30000;
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWait) {
      const statusResult = await cloud.callFunction({
        name: 'checkQueueStatus',
        data: { queue_id }
      });

      const status = statusResult.result?.data?.status;
      const elapsed = Date.now() - startTime;

      console.log(`  [${elapsed/1000}s] 状态: ${status}`);

      if (status === 'completed') {
        completed = true;
        console.log(`\n✅ 测试通过！题目生成耗时: ${elapsed}ms`);
        console.log(`assessment_id: ${statusResult.result.data.assessment_id}`);
        break;
      }

      if (status === 'failed') {
        throw new Error('任务失败: ' + statusResult.result.data.error);
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }

    if (!completed) {
      throw new Error('测试失败：30秒内未完成');
    }

    process.exit(0);

  } catch (e) {
    console.error('\n❌ 测试失败:', e.message);
    console.error('详情:', e);
    process.exit(1);
  }
}

test();
