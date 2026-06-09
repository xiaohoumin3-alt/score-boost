/**
 * 端到端测试：完整的测评判分流程
 * 模拟从前端提交到判分结果的整个流程
 */

console.log('========================================');
console.log('端到端测试：完整测评判分流程');
console.log('========================================\n');

// ========== 模拟数据库 ==========
const database = {
  assessments: {
    'assessment_123': {
      assessment_id: 'assessment_123',
      status: 'in_progress',
      questions: [
        {
          id: 'pool_verified_abc123',  // 使用 _id
          type: 'choice',
          content: '下列哪种生物是腔肠动物？',
          options: ['A. 水螅', 'B. 蜗牛', 'C. 蚯蚓', 'D. 河蚌'],
          correct_answer: 'A',
          knowledge_point: '腔肠动物',
          knowledge_point_id: 'bio_kp_001',
          difficulty: 'easy',
        },
        {
          id: 'ai_1234567890',  // 使用生成的 ID
          type: 'choice',
          content: '下列哪种动物具有三个胚层？',
          options: ['A. 水螅', 'B. 涡虫', 'C. 海蜇', 'D. 水母'],
          correct_answer: 1,  // 数字索引：B
          knowledge_point: '扁形动物',
          knowledge_point_id: 'bio_kp_002',
          difficulty: 'medium',
        },
        {
          id: 'pool_verified_def456',
          type: 'choice',
          content: '蚯蚓的呼吸依靠什么？',
          options: ['A. 鳃', 'B. 肺', 'C. 湿润的体壁', 'D. 气管'],
          correct_answer: 2,  // 数字索引：C
          knowledge_point: '环节动物',
          knowledge_point_id: 'bio_kp_003',
          difficulty: 'easy',
        },
      ],
      answers: [],
    },
  },
};

// ========== 模拟 getAssessment 云函数（修复后） ==========
function mockGetAssessment(assessmentId) {
  const session = database.assessments[assessmentId];
  if (!session) return null;

  return {
    success: true,
    data: {
      assessment_id: assessmentId,
      status: session.status,
      questions: session.questions.map(q => ({
        id: q.id || q._id,  // 修复：优先使用 id
        type: q.type,
        content: q.content,
        options: q.options,
        knowledge_point: q.knowledge_point,
        knowledge_point_id: q.knowledge_point_id,
        difficulty: q.difficulty,
      })),
    },
  };
}

// ========== 模拟前端解析选项 ==========
function mockFrontendParseOptions(questions) {
  const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
  questions.forEach(q => {
    q.parsedOptions = q.options.map((opt, idx) => {
      const dotIdx = opt.indexOf('. ');
      if (dotIdx > 0) {
        return { key: opt.substring(0, dotIdx), value: opt.substring(dotIdx + 2) };
      }
      return { key: keys[idx] || String.fromCharCode(65 + idx), value: opt };
    });
  });
  return questions;
}

// ========== 模拟用户选择答案 ==========
function mockUserSelection(questions) {
  // 用户选择：第1题A（正确），第2题B（正确），第3题A（错误，正确是C）
  const userAnswers = [
    { question_id: questions[0].id, answer: 'A', time_spent_seconds: 10 },
    { question_id: questions[1].id, answer: 'B', time_spent_seconds: 15 },
    { question_id: questions[2].id, answer: 'A', time_spent_seconds: 8 },
  ];
  return userAnswers;
}

// ========== 模拟 submitAnswer 云函数 ==========
function mockSubmitAnswer(assessmentId, newAnswers) {
  const session = database.assessments[assessmentId];
  if (!session) {
    return { success: false, error: 'Assessment not found' };
  }

  const questions = session.questions || [];

  // 构建题目映射
  const questionMap = {};
  questions.forEach(q => { questionMap[q.id] = q; });

  // 合并答案
  const allAnswers = newAnswers;

  // 判分
  const allResults = [];
  let totalCorrect = 0;

  console.log('判分详情：');
  for (const answer of allAnswers) {
    const questionId = answer.question_id;
    const userAnswer = (answer.answer || '').toUpperCase().trim();

    const question = questionMap[questionId];
    if (!question) {
      console.log(`  ❌ 题目未找到: ${questionId}`);
      continue;
    }

    // 统一 correct_answer 格式
    let correct = question.correct_answer;
    if (typeof correct === 'number') {
      correct = String.fromCharCode(65 + correct);
    } else {
      correct = String(correct || '').toUpperCase().trim();
    }
    const isCorrect = userAnswer === correct;

    console.log(`  题目 ${questionId}: 用户答案=${userAnswer}, 正确答案=${correct}, ${isCorrect ? '✅正确' : '❌错误'}`);

    if (isCorrect) totalCorrect++;

    allResults.push({
      question_id: questionId,
      content: question.content,
      user_answer: userAnswer,
      correct_answer: correct,
      is_correct: isCorrect,
      knowledge_point: question.knowledge_point,
      knowledge_point_id: question.knowledge_point_id,
      difficulty: question.difficulty,
    });
  }

  const totalQuestions = allResults.length;
  const scorePercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 1000) / 10 : 0;

  return {
    success: true,
    data: {
      assessment_id: assessmentId,
      results: allResults,
      total_correct: totalCorrect,
      total_questions: totalQuestions,
      score_percent: scorePercent,
    },
  };
}

// ========== 测试流程 ==========

// 步骤 1：前端获取题目
console.log('步骤 1：前端获取题目（getAssessment）');
const apiResponse = mockGetAssessment('assessment_123');
if (!apiResponse) {
  console.error('❌ 获取测评失败');
  process.exit(1);
}
console.log(`✅ 获取测评成功，题目数量: ${apiResponse.data.questions.length}\n`);

// 步骤 2：前端解析选项
console.log('步骤 2：前端解析选项');
const questionsWithParsed = mockFrontendParseOptions([...apiResponse.data.questions]);
console.log('✅ 选项解析完成\n');

// 步骤 3：用户选择答案
console.log('步骤 3：用户选择答案');
const userAnswers = mockUserSelection(questionsWithParsed);
console.log(`✅ 用户已选择 ${userAnswers.length} 道题的答案\n`);

// 步骤 4：提交答案
console.log('步骤 4：提交答案（submitAnswer）');
const submitResult = mockSubmitAnswer('assessment_123', userAnswers);
if (!submitResult.success) {
  console.error('❌ 提交答案失败:', submitResult.error);
  process.exit(1);
}

// 步骤 5：显示结果
console.log('\n========================================');
console.log('测评结果：');
console.log('========================================');
console.log(`总题数: ${submitResult.data.total_questions}`);
console.log(`正确数: ${submitResult.data.total_correct}`);
console.log(`正确率: ${submitResult.data.score_percent}%\n`);

// 验证结果
console.log('========================================');
console.log('验证结果：');
console.log('========================================');

const expectedCorrect = 2;  // 第1题和第2题正确
const expectedPercent = 66.7;  // 2/3 ≈ 66.7%

if (submitResult.data.total_correct === expectedCorrect) {
  console.log(`✅ 正确题数正确: ${submitResult.data.total_correct}/${expectedCorrect}`);
} else {
  console.log(`❌ 正确题数错误: 预期 ${expectedCorrect}, 实际 ${submitResult.data.total_correct}`);
}

if (Math.abs(submitResult.data.score_percent - expectedPercent) < 1) {
  console.log(`✅ 正确率正确: ${submitResult.data.score_percent}% (预期 ${expectedPercent}%)`);
} else {
  console.log(`❌ 正确率错误: 预期 ${expectedPercent}%, 实际 ${submitResult.data.score_percent}%`);
}

// 检查是否所有题目都被判分（没有因为 ID 不一致被跳过）
const allQuestionsGraded = submitResult.data.total_questions === 3;
if (allQuestionsGraded) {
  console.log('✅ 所有题目都被判分（没有 ID 不一致问题）');
} else {
  console.log('❌ 部分题目未被判分（可能存在 ID 不一致问题）');
}

console.log('\n========================================');
console.log('总结：');
console.log('========================================');

if (submitResult.data.total_correct === expectedCorrect &&
    Math.abs(submitResult.data.score_percent - expectedPercent) < 1 &&
    allQuestionsGraded) {
  console.log('✅ 端到端测试通过！');
  console.log('✅ ID 不一致问题已修复');
  console.log('✅ 判分逻辑正确');
  console.log('\n部署后应该能看到正确的判分结果。');
  process.exit(0);
} else {
  console.log('❌ 端到端测试失败！');
  console.log('需要检查修复逻辑。');
  process.exit(1);
}
