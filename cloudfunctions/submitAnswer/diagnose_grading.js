/**
 * 判分问题诊断脚本
 * 模拟整个流程：生成题目 → 保存到 assessment → 前端获取 → 提交答案 → 判分
 */

console.log('========================================');
console.log('判分问题诊断');
console.log('========================================\n');

// ========== 步骤1: 模拟题库数据 ==========
console.log('步骤1: 模拟题库数据');
console.log('----------------------------------------');

const poolData = [
  {
    _id: 'pool_001',
    pool_id: 'pool_001',
    question: '1 + 1 = ?',
    options: ['A. 1', 'B. 2', 'C. 3', 'D. 4'],
    correct_answer: 1,  // 数字索引，表示 B
    kp_id: 'kp1',
    kp_name: '基础运算',
    difficulty: 'easy',
  },
  {
    _id: 'pool_002',
    pool_id: 'pool_002',
    question: '2 + 2 = ?',
    options: ['A. 2', 'B. 3', 'C. 4', 'D. 5'],
    correct_answer: 2,  // 数字索引，表示 C
    kp_id: 'kp1',
    kp_name: '基础运算',
    difficulty: 'easy',
  },
];

console.log('题库数据:');
poolData.forEach((q, i) => {
  console.log(`  题目${i + 1}: id=${q._id}, correct_answer=${q.correct_answer} (${String.fromCharCode(65 + q.correct_answer)})`);
});

// ========== 步骤2: 模拟 CompleteStep 保存到 assessments ==========
console.log('\n步骤2: 模拟 CompleteStep 保存到 assessments');
console.log('----------------------------------------');

const assessmentQuestions = poolData.map(q => ({
  id: q.pool_id || q._id,
  type: 'choice',
  content: q.question,
  options: Array.isArray(q.options) ? q.options : [],
  correct_answer: typeof q.correct_answer === 'number' ? q.correct_answer : 0,
  knowledge_point: q.kp_name,
  knowledge_point_id: q.kp_id,
  difficulty: q.difficulty,
}));

console.log('Assessment questions:');
assessmentQuestions.forEach((q, i) => {
  console.log(`  题目${i + 1}: id=${q.id}, correct_answer=${q.correct_answer} (${String.fromCharCode(65 + q.correct_answer)})`);
});

// ========== 步骤3: 模拟前端获取题目（getAssessment） ==========
console.log('\n步骤3: 模拟前端获取题目（getAssessment）');
console.log('----------------------------------------');

const apiQuestions = assessmentQuestions.map(q => ({
  id: q.id || q._id,
  type: q.type || 'choice',
  content: q.content || q.question,
  options: q.options,
  // 注意：getAssessment 不返回 correct_answer
}));

// 前端解析选项
apiQuestions.forEach(q => {
  if (q.options && typeof q.options[0] === 'string') {
    const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
    q.parsedOptions = q.options.map((opt, idx) => {
      const dotIdx = opt.indexOf('. ');
      if (dotIdx > 0) {
        return { key: opt.substring(0, dotIdx), value: opt.substring(dotIdx + 2) };
      }
      return { key: keys[idx] || String.fromCharCode(65 + idx), value: opt };
    });
  }
});

console.log('前端解析后的选项:');
apiQuestions.forEach((q, i) => {
  console.log(`  题目${i + 1}: id=${q.id}`);
  q.parsedOptions.forEach(opt => {
    console.log(`    ${opt.key}: ${opt.value}`);
  });
});

// ========== 步骤4: 模拟用户选择和提交 ==========
console.log('\n步骤4: 模拟用户选择和提交');
console.log('----------------------------------------');

// 模拟用户选择：第1题选 B，第2题选 C
const userAnswers = [
  { question_id: apiQuestions[0].id, answer: 'B', time_spent_seconds: 10 },
  { question_id: apiQuestions[1].id, answer: 'C', time_spent_seconds: 15 },
];

console.log('用户提交的答案:');
userAnswers.forEach((a, i) => {
  console.log(`  答案${i + 1}: question_id=${a.question_id}, answer=${a.answer}`);
});

// ========== 步骤5: 模拟后端判分（submitAnswer） ==========
console.log('\n步骤5: 模拟后端判分（submitAnswer）');
console.log('----------------------------------------');

// 构建题目映射（使用 assessment 中的数据）
const questionMap = {};
assessmentQuestions.forEach(q => {
  questionMap[q.id] = q;
});

console.log('题目映射:');
Object.keys(questionMap).forEach(id => {
  const q = questionMap[id];
  console.log(`  ${id}: correct_answer=${q.correct_answer} (${String.fromCharCode(65 + q.correct_answer)})`);
});

// 判分
const results = [];
let totalCorrect = 0;

for (const answer of userAnswers) {
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
  console.log(`  正确答案: ${correct} (原始: ${question.correct_answer}, 类型: ${typeof question.correct_answer})`);
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

// ========== 总结 ==========
console.log('\n========================================');
console.log('诊断结果');
console.log('========================================');
console.log(`总题数: ${results.length}`);
console.log(`正确数: ${totalCorrect}`);
console.log(`正确率: ${scorePercent}%`);

if (totalCorrect === results.length && scorePercent === 100) {
  console.log('\n✅ 判分逻辑正确：所有答案都被正确判定');
} else if (totalCorrect === 0) {
  console.log('\n❌ 严重问题：所有答案都被判定为错误！');
  console.log('可能原因:');
  console.log('  1. 题目 ID 不匹配');
  console.log('  2. correct_answer 格式错误');
  console.log('  3. 判分逻辑有 bug');
} else {
  console.log('\n⚠️ 部分答案正确：可能存在特定问题');
}

// ========== 额外检查：常见问题 ==========
console.log('\n========================================');
console.log('常见问题检查');
console.log('========================================');

// 检查1: ID 一致性
console.log('\n检查1: ID 一致性');
const idMatch = userAnswers.every(a => questionMap[a.question_id]);
console.log(`  用户答案的 question_id 都能在题目映射中找到: ${idMatch ? '✅' : '❌'}`);

if (!idMatch) {
  console.log('  ❌ 问题：题目 ID 不一致！');
  console.log('  用户提交的 question_id:', userAnswers.map(a => a.question_id));
  console.log('  题目映射中的 id:', Object.keys(questionMap));
}

// 检查2: correct_answer 格式
console.log('\n检查2: correct_answer 格式');
const allNumbers = assessmentQuestions.every(q => typeof q.correct_answer === 'number');
const allStrings = assessmentQuestions.every(q => typeof q.correct_answer === 'string');
console.log(`  所有题目都使用数字格式: ${allNumbers ? '✅' : '❌'}`);
console.log(`  所有题目都使用字符串格式: ${allStrings ? '✅' : '❌'}`);

if (!allNumbers && !allStrings) {
  console.log('  ⚠️ 警告：题目使用了混合格式！');
  assessmentQuestions.forEach(q => {
    console.log(`    ${q.id}: ${typeof q.correct_answer}`);
  });
}

// 检查3: 选项解析
console.log('\n检查3: 选项解析');
apiQuestions.forEach((q, i) => {
  const hasParsedOptions = q.parsedOptions && q.parsedOptions.length > 0;
  console.log(`  题目${i + 1}: ${hasParsedOptions ? '✅' : '❌'} ${hasParsedOptions ? q.parsedOptions.length + ' 个选项' : '选项解析失败'}`);
});

console.log('\n========================================');
console.log('诊断完成');
console.log('========================================');
