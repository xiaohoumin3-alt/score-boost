/**
 * 队列状态检查脚本
 * 直接查询数据库，验证队列任务状态
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: 'cloud1-7gg9y9tjb2b867b6'
});

async function checkQueue() {
  const db = cloud.database();

  try {
    // 查询所有 pending 状态的任务
    const result = await db.collection('question_queue')
      .where({ status: 'pending' })
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();

    console.log('=== Pending Queue Tasks ===');
    console.log(`Found: ${result.data.length} pending tasks`);

    if (result.data.length > 0) {
      result.data.forEach((task, idx) => {
        console.log(`\n[${idx + 1}] Task ID: ${task._id}`);
        console.log(`    Student ID: ${task.student_id}`);
        console.log(`    Subject: ${task.subject}`);
        console.log(`    Grade: ${task.grade}`);
        console.log(`    Status: ${task.status}`);
        console.log(`    Created: ${task.created_at}`);
        console.log(`    Updated: ${task.updated_at}`);
      });
    } else {
      console.log('No pending tasks found');
    }

    // 查询所有 processing 状态的任务（可能卡住）
    const processingResult = await db.collection('question_queue')
      .where({ status: 'processing' })
      .limit(5)
      .get();

    console.log('\n=== Processing Queue Tasks (possibly stuck) ===');
    console.log(`Found: ${processingResult.data.length} processing tasks`);

    if (processingResult.data.length > 0) {
      processingResult.data.forEach((task, idx) => {
        console.log(`\n[${idx + 1}] Task ID: ${task._id}`);
        console.log(`    Student ID: ${task.student_id}`);
        console.log(`    Subject: ${task.subject}`);
        console.log(`    Created: ${task.created_at}`);
        console.log(`    Updated: ${task.updated_at}`);
        const age = Date.now() - new Date(task.created_at).getTime();
        console.log(`    Age: ${Math.round(age / 1000)} seconds`);
      });
    }

  } catch (e) {
    console.error('Error checking queue:', e);
  }
}

checkQueue().then(() => process.exit(0));
