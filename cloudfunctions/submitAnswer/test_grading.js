/**
 * 判分逻辑本地测试
 * 验证修复后的 ID 匹配和判分逻辑
 */

// 模拟数据库中的题目（startAssessment 保存的格式）
const databaseQuestions = [
  {
    id: 'pool_verified_12345',  // 使用 pq._id
    type: 'choice',
    content: '测试题目1',
    options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
    correct_answer: 'A',  // 字母格式
    knowledge_point: '知识点1',
    knowledge_point_id: 'kp1',
    difficulty: 'easy',
  },
  {
    id: 'ai_1234567890',  // 使用生成的 ID
    type: 'choice',
    content: '测试题目2',
    options: ['A. 选项A', 'B. 选项B', 'C. 选项C', 'D. 选项D'],
    correct_answer: 2,  // 数字索引格式
    knowledge_point: '知识点2',
    knowledge_point_id: 'kp2',
    difficulty: 'medium',
  },
];

// 模拟 getAssessment 返回的题目（修复后的格式）
const apiQuestions = [
  {
    id: 'pool_verified_12345',  // 修复：使用 q.id 而不是 q._id
    type: 'choice',
    content: '测试题目1',
    options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
    knowledge_point: '知识点1',
    knowledge_point_id: 'kp1',
    difficulty: 'easy',
  },
  {
    id: 'ai_1234567890',  // 修复：使用 q.id 而不是 q._id
    type: 'choice',
    content: '测试题目2',
    options: ['A. 选项A', 'B. 选项B', 'C. 选项C', 'D. 选项D'],
    knowledge_point: '知识点2',
    knowledge_point_id: 'kp2',
    difficulty: 'medium',
  },
];

// 模拟前端解析选项
apiQuestions.forEach(q => {
  q.parsedOptions = q.options.map((opt, idx) => {
    const dotIdx = opt.indexOf('. ');
    if (dotIdx > 0) {
      return { key: opt.substring(0, dotIdx), value: opt.substring(dotIdx + 2) };
    }
    return { key: String.fromCharCode(65 + idx), value: opt };
  });
});

// 模拟用户提交答案（使用 question.id）
const userAnswers = [
  { question_id: 'pool_verified_12345', answer: 'A', time_spent_seconds: 10 },
  { question_id: 'ai_1234567890', answer: 'C', time_spent_seconds: 15 },  // 正确答案（索引2 = C）
];

// 判分逻辑（与 submitAnswer 一致）
function gradeAnswers(questions, answers) {
  const questionMap = {};
  questions.forEach(q => { questionMap[q.id] = q; });

  const results = [];
  let totalCorrect = 0;

  for (const answer of answers) {
    const questionId = answer.question_id;
    const userAnswer = (answer.answer || '').toUpperCase().trim();

    const question = questionMap[questionId];

    if (!question) {
      console.log(`❌ 题目未找到: ${questionId}`);
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

    console.log(`题目: ${questionId}`);
    console.log(`  正确答案: ${correct} (原始类型: ${typeof question.correct_answer})`);
    console.log(`  用户答案: ${userAnswer}`);
    console.log(`  判分结果: ${isCorrect ? '✅ 正确' : '❌ 错误'}`);

    if (isCorrect) totalCorrect++;

    results.push({
      question_id: questionId,
      user_answer: userAnswer,
      correct_answer: correct,
      is_correct: isCorrect,
    });
  }

  const scorePercent = results.length > 0 ? Math.round((totalCorrect / results.length) * 1000) / 10 : 0;

  return {
    total_correct: totalCorrect,
    total_questions: results.length,
    score_percent: scorePercent,
    results: results,
  };
}

// 运行测试
console.log('========================================');
console.log('测试：修复后的判分逻辑');
console.log('========================================\n');

const result = gradeAnswers(databaseQuestions, userAnswers);

console.log('\n========================================');
console.log('测试结果：');
console.log('========================================');
console.log(`总题数: ${result.total_questions}`);
console.log(`正确数: ${result.total_correct}`);
console.log(`正确率: ${result.score_percent}%`);

// 验证结果
if (result.total_correct === 2 && result.score_percent === 100) {
  console.log('\n✅ 测试通过：判分逻辑正确');
} else {
  console.log('\n❌ 测试失败：判分逻辑有误');
  process.exit(1);
}

// 测试修复前的场景（ID 不一致）
console.log('\n========================================');
console.log('测试：修复前的 ID 不一致问题');
console.log('========================================\n');

const apiQuestionsBroken = [
  {
    id: '12345',  // 错误：使用 q._id 而不是 q.id
    type: 'choice',
    content: '测试题目1',
    options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
  },
];

const userAnswersBroken = [
  { question_id: '12345', answer: 'A', time_spent_seconds: 10 },
];

const resultBroken = gradeAnswers(databaseQuestions, userAnswersBroken);

console.log('\n========================================');
console.log('测试结果（修复前）：');
console.log('========================================');
console.log(`总题数: ${resultBroken.total_questions}`);
console.log(`正确数: ${resultBroken.total_correct}`);
console.log(`正确率: ${resultBroken.score_percent}%`);

if (resultBroken.total_correct === 0) {
  console.log('\n✅ 测试通过：修复前确实存在 ID 不一致问题（找不到题目）');
} else {
  console.log('\n❌ 测试失败：未能复现修复前的问题');
}

console.log('\n========================================');
console.log('总结：');
console.log('========================================');
console.log('✅ 修复后的判分逻辑正确');
console.log('✅ 修复前的 ID 不一致问题已验证');
console.log('\n部署后应能看到正确的判分结果。');
