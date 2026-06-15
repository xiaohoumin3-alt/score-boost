/**
 * P0 部署验收脚本
 * 用于验证云端部署后的功能正确性
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 测试 1: 小学低年级数学 (grade=2, subject=math)
 */
async function testGrade2Math() {
  console.log('\n=== 测试 1: 小学低年级数学 ===');
  
  try {
    const result = await cloud.callFunction({
      name: 'startAssessment',
      data: {
        grade: '2',
        subject: 'math',
        mode: 'quick',
        num_questions: 5
      }
    });
    
    console.log('结果:', JSON.stringify(result.result, null, 2));
    
    if (result.result.success) {
      if (result.result.data.status === 'ready') {
        console.log('✅ 题库充足，直接返回题目');
        // 检查题目内容
        const questions = result.result.data.questions || [];
        for (const q of questions.slice(0, 2)) {
          console.log(`  题目: ${q.content?.substring(0, 50)}...`);
        }
      } else if (result.result.data.status === 'queued') {
        console.log('✅ 题库不足，已创建队列任务:', result.result.data.queue_id);
        // 检查队列任务字段
        const queueTask = await db.collection('question_queue').doc(result.result.data.queue_id).get();
        const task = queueTask.data;
        console.log('  queue task:', {
          mode: task.mode,
          grade: task.grade,
          subject: task.subject,
          hasQuestionPlan: !!task.question_plan,
          hasTargetKps: !!task.target_kps
        });
      }
    }
    
    return result.result;
  } catch (e) {
    console.error('❌ 测试失败:', e.message);
    return null;
  }
}

/**
 * 测试 2: 会考模式 (subject=biology, mode=huikao)
 */
async function testHuikao() {
  console.log('\n=== 测试 2: 会考模式 ===');
  
  try {
    const result = await cloud.callFunction({
      name: 'startAssessment',
      data: {
        grade: '8',
        subject: 'biology',
        mode: 'huikao',
        num_questions: 50
      }
    });
    
    console.log('结果:', JSON.stringify(result.result, null, 2));
    
    if (result.result.success && result.result.data.status === 'queued') {
      const queueTask = await db.collection('question_queue').doc(result.result.data.queue_id).get();
      const task = queueTask.data;
      
      console.log('  queue task 验证:');
      console.log('    mode:', task.mode);
      console.log('    grade_range:', task.grade_range);
      console.log('    semester:', task.semester);
      console.log('    question_plan length:', task.question_plan?.length || 0);
      console.log('    target_kps length:', task.target_kps?.length || 0);
      
      if (task.question_plan && task.question_plan.length > 0) {
        console.log('    sample question_plan:', task.question_plan[0]);
      }
      
      const hasAllFields = task.mode === 'huikao' && 
                          task.grade_range && 
                          task.question_plan && 
                          task.question_plan.length > 0;
      
      if (hasAllFields) {
        console.log('✅ 会考字段完整');
      } else {
        console.log('❌ 会考字段缺失');
      }
    }
    
    return result.result;
  } catch (e) {
    console.error('❌ 测试失败:', e.message);
    return null;
  }
}

/**
 * 测试 3: parent_assessment
 */
async function testParentAssessment() {
  console.log('\n=== 测试 3: parent_assessment ===');
  
  try {
    const result = await cloud.callFunction({
      name: 'parentAssessment',
      data: {
        action: 'start',
        grade: '2',
        subject: 'math'
      }
    });
    
    console.log('结果:', JSON.stringify(result.result, null, 2));
    
    if (result.result.success) {
      const taskId = result.result.data?.task_id;
      if (taskId) {
        const queueTask = await db.collection('question_queue').doc(taskId).get();
        const task = queueTask.data;
        
        console.log('  queue task 验证:');
        console.log('    type:', task.type);
        console.log('    difficulty_distribution:', task.difficulty_distribution);
        console.log('    num_questions:', task.num_questions);
        
        const dist = task.difficulty_distribution || {};
        const sum = (dist.easy || 0) + (dist.medium || 0) + (dist.hard || 0);
        
        if (sum <= 1.5) {
          console.log('✅ difficulty_distribution 使用比例语义');
        } else {
          console.log('❌ difficulty_distribution 使用题数语义');
        }
      }
    }
    
    return result.result;
  } catch (e) {
    console.error('❌ 测试失败:', e.message);
    return null;
  }
}

/**
 * 测试 4: generateAiQuestion legacy
 */
async function testGenerateAiQuestionLegacy() {
  console.log('\n=== 测试 4: generateAiQuestion legacy ===');
  
  try {
    const result = await cloud.callFunction({
      name: 'generateAiQuestion',
      data: {
        kp_name: '100以内加减法',
        difficulty: 'easy',
        subject: 'math',
        grade: '2'
      }
    });
    
    console.log('结果:', JSON.stringify(result.result, null, 2));
    
    if (result.result.success) {
      console.log('✅ legacy 调用成功');
      
      // 检查保存的题目
      if (result.result.data) {
        console.log('  题目 subject:', result.result.data.subject);
        console.log('  题目 grade:', result.result.data.grade);
      }
    } else {
      console.log('❌ legacy 调用失败:', result.result.error);
    }
    
    return result.result;
  } catch (e) {
    console.error('❌ 测试失败:', e.message);
    return null;
  }
}

/**
 * 主测试函数
 */
async function runAllTests() {
  console.log('========================================');
  console.log('P0 部署验收测试');
  console.log('========================================');
  
  const results = {};
  
  // 运行测试
  results.grade2Math = await testGrade2Math();
  results.huikao = await testHuikao();
  results.parentAssessment = await testParentAssessment();
  results.generateAiQuestionLegacy = await testGenerateAiQuestionLegacy();
  
  // 汇总
  console.log('\n========================================');
  console.log('测试汇总');
  console.log('========================================');
  
  for (const [name, result] of Object.entries(results)) {
    const status = result?.success ? '✅' : '❌';
    console.log(`${status} ${name}`);
  }
  
  return results;
}

// 导出供测试使用
module.exports = {
  testGrade2Math,
  testHuikao,
  testParentAssessment,
  testGenerateAiQuestionLegacy,
  runAllTests
};

// 直接运行测试
if (require.main === module) {
  runAllTests().catch(console.error);
}
