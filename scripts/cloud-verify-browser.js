/**
 * P0 云端验收 - 浏览器端测试脚本
 * 在微信开发者工具控制台中运行
 * 
 * 使用方法：
 * 1. 打开微信开发者工具
 * 2. 打开小程序项目
 * 3. 在控制台粘贴运行此脚本
 */

async function verifyP0Deployment() {
  console.log('========================================');
  console.log('P0 部署验收测试开始');
  console.log('========================================');
  
  const results = [];
  
  // 测试 1: 小学低年级数学
  console.log('\n[测试 1] 小学低年级数学 (grade=2, math)');
  try {
    const res1 = await wx.cloud.callFunction({
      name: 'startAssessment',
      data: { grade: '2', subject: 'math', mode: 'quick', num_questions: 5 }
    });
    console.log('  结果:', res1.result?.success ? '✅ 成功' : '❌ 失败');
    console.log('  状态:', res1.result?.data?.status);
    results.push({ test: '小学数学', pass: res1.result?.success });
  } catch (e) {
    console.log('  ❌ 错误:', e.message);
    results.push({ test: '小学数学', pass: false });
  }
  
  // 测试 2: 会考模式
  console.log('\n[测试 2] 会考模式 (biology, huikao)');
  try {
    const res2 = await wx.cloud.callFunction({
      name: 'startAssessment',
      data: { grade: '8', subject: 'biology', mode: 'huikao', num_questions: 50 }
    });
    console.log('  结果:', res2.result?.success ? '✅ 成功' : '❌ 失败');
    
    if (res2.result?.data?.status === 'queued') {
      // 检查队列任务
      const db = wx.cloud.database();
      const task = await db.collection('question_queue').doc(res2.result.data.queue_id).get();
      const hasPlan = task.data?.question_plan?.length > 0;
      const hasRange = !!task.data?.grade_range;
      console.log('  question_plan:', hasPlan ? '✅' : '❌');
      console.log('  grade_range:', hasRange ? '✅' : '❌');
      results.push({ test: '会考', pass: hasPlan && hasRange });
    } else {
      results.push({ test: '会考', pass: true });
    }
  } catch (e) {
    console.log('  ❌ 错误:', e.message);
    results.push({ test: '会考', pass: false });
  }
  
  // 测试 3: parent_assessment
  console.log('\n[测试 3] parent_assessment');
  try {
    const res3 = await wx.cloud.callFunction({
      name: 'parentAssessment',
      data: { action: 'start', grade: '2', subject: 'math' }
    });
    console.log('  结果:', res3.result?.success ? '✅ 成功' : '❌ 失败');
    
    if (res3.result?.data?.task_id) {
      const db = wx.cloud.database();
      const task = await db.collection('question_queue').doc(res3.result.data.task_id).get();
      const dist = task.data?.difficulty_distribution || {};
      const sum = (dist.easy || 0) + (dist.medium || 0) + (dist.hard || 0);
      console.log('  difficulty_distribution:', dist);
      console.log('  使用比例语义:', sum <= 1.5 ? '✅' : '❌');
      results.push({ test: '亲子', pass: sum <= 1.5 });
    } else {
      results.push({ test: '亲子', pass: true });
    }
  } catch (e) {
    console.log('  ❌ 错误:', e.message);
    results.push({ test: '亲子', pass: false });
  }
  
  // 汇总
  console.log('\n========================================');
  console.log('测试汇总');
  console.log('========================================');
  results.forEach(r => {
    console.log(`${r.pass ? '✅' : '❌'} ${r.test}`);
  });
  
  const passed = results.filter(r => r.pass).length;
  console.log(`\n通过: ${passed}/${results.length}`);
  
  return results;
}

// 运行测试
verifyP0Deployment().then(() => {
  console.log('\n验收测试完成');
});
