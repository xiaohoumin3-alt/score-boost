/**
 * 测试云函数 - 验证回退机制
 * 直接调用 questionGenerator 的 processTask 逻辑
 */

let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  cloud = null;
}

// 导入必要的模块
const { TaskWorkflow } = require('./cloudfunctions/questionGenerator/workflow/TaskWorkflow');
const { InitStateStep } = require('./cloudfunctions/questionGenerator/workflow/steps/InitStateStep');
const { GenerateStep } = require('./cloudfunctions/questionGenerator/workflow/steps/GenerateStep');
const { SaveQuestionsStep } = require('./cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep');
const { CreateAssessmentStep } = require('./cloudfunctions/questionGenerator/workflow/steps/CreateAssessmentStep');
const { CompleteStep } = require('./cloudfunctions/questionGenerator/workflow/steps/CompleteStep');
const { generateQuestionsForTask } = require('./cloudfunctions/questionGenerator/workflow/utils/generateQuestions');

/**
 * AI生成函数（模拟429错误）
 */
async function generateAi(task, difficulty, count) {
  console.log(`[generateAi] Simulating 429 error for ${difficulty} x${count}`);
  // 模拟 MiniMax API 返回 429 Too many requests
  throw new Error('Too many requests');
}

/**
 * 获取默认工作流步骤
 */
function getDefaultSteps(options = {}) {
  const { generateAi } = options;
  return [
    new InitStateStep(),
    new GenerateStep(generateAi),
    new SaveQuestionsStep(),
    new CreateAssessmentStep(),
    new CompleteStep()
  ];
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    console.log('=== testFallback === START');

    // 测试任务
    const testTask = {
      _id: 'test_fallback_' + Date.now(),
      student_id: 'test_user',
      subject: 'math',
      grade: '九年级',
      semester: '上册',
      num_questions: 3,
      difficulty_distribution: { easy: 0.5, medium: 0.3, hard: 0.2 },
      chapter: '二次根式',
      mode: 'practice',
      status: 'pending',
      priority: 999,
      created_at: new Date().toISOString()
    };

    console.log('Creating test task:', testTask._id);

    // 创建队列任务
    await db.collection('question_queue').add({
      data: testTask
    });

    console.log('Test task created, calling processTask...');

    // 测试 generateQuestionsForTask
    const questions = await generateQuestionsForTask(testTask, generateAi, db);
    console.log('generateQuestionsForTask returned', questions.length, 'questions');

    if (questions.length === 0) {
      console.error('❌ FAILED: No questions generated!');
      return {
        success: false,
        error: 'No questions generated'
      };
    }

    console.log('✅ SUCCESS: Fallback mechanism works!');
    return {
      success: true,
      questions_count: questions.length,
      sample_question: questions[0]
    };

  } catch (e) {
    console.error('testFallback error:', e);
    return {
      success: false,
      error: e.message
    };
  }
};
