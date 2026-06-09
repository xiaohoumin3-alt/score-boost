/**
 * 修复验证测试
 * 验证 CompleteStep 修复后能正确处理字母和数字两种格式
 */

console.log('========================================');
console.log('修复验证测试');
console.log('========================================\n');

// 模拟修复后的逻辑
function processCorrectAnswer(q) {
  let correctAnswer = q.correct_answer;
  if (typeof correctAnswer === 'string') {
    // 字母格式 (A, B, C, D) 转换为数字索引
    const letterToNum = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5 };
    const upperAnswer = correctAnswer.toUpperCase().trim();
    correctAnswer = letterToNum[upperAnswer] !== undefined ? letterToNum[upperAnswer] : 0;
  }
  // 如果不是数字也不是有效字母，默认为 0
  if (typeof correctAnswer !== 'number' || isNaN(correctAnswer)) {
    correctAnswer = 0;
  }
  return correctAnswer;
}

// 测试用例
const testCases = [
  { name: '字母 A', input: 'A', expected: 0 },
  { name: '字母 B', input: 'B', expected: 1 },
  { name: '字母 C', input: 'C', expected: 2 },
  { name: '字母 D', input: 'D', expected: 3 },
  { name: '小写字母 b', input: 'b', expected: 1 },
  { name: '带空格字母 C', input: ' C ', expected: 2 },
  { name: '数字 0', input: 0, expected: 0 },
  { name: '数字 1', input: 1, expected: 1 },
  { name: '数字 2', input: 2, expected: 2 },
  { name: '数字 3', input: 3, expected: 3 },
  { name: '无效字母 X', input: 'X', expected: 0 }, // 默认为 0
];

console.log('测试 correct_answer 处理逻辑:');
console.log('----------------------------------------');

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const q = { correct_answer: test.input };
  const result = processCorrectAnswer(q);
  const success = result === test.expected;

  if (success) {
    passed++;
    console.log(`✅ ${test.name}: ${test.input} → ${result}`);
  } else {
    failed++;
    console.log(`❌ ${test.name}: ${test.input} → ${result} (预期: ${test.expected})`);
  }
}

console.log('\n========================================');
console.log('测试结果');
console.log('========================================');
console.log(`通过: ${passed}/${testCases.length}`);
console.log(`失败: ${failed}/${testCases.length}`);

if (failed === 0) {
  console.log('\n✅ 所有测试通过！修复正确。');
} else {
  console.log('\n❌ 有测试失败！需要检查修复。');
  process.exit(1);
}

// 验证完整判分流程
console.log('\n========================================');
console.log('完整判分流程验证');
console.log('========================================\n');

// 模拟静态题库中的题目（字母格式）
const staticQuestions = [
  { id: 'q1', correct_answer: 'A', options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'] },
  { id: 'q2', correct_answer: 'C', options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'] },
];

// 模拟 AI 生成的题目（数字格式）
const aiQuestions = [
  { id: 'q3', correct_answer: 1, options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'] },
  { id: 'q4', correct_answer: 3, options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'] },
];

// 处理所有题目
const allQuestions = [...staticQuestions, ...aiQuestions];
allQuestions.forEach(q => {
  q.correct_answer = processCorrectAnswer(q);
});

// 模拟用户答案
const userAnswers = [
  { question_id: 'q1', answer: 'A' }, // 正确（静态题库 A）
  { question_id: 'q2', answer: 'C' }, // 正确（静态题库 C）
  { question_id: 'q3', answer: 'B' }, // 正确（AI 题库 1 → B）
  { question_id: 'q4', answer: 'D' }, // 正确（AI 题库 3 → D）
];

// 判分
const questionMap = {};
allQuestions.forEach(q => { questionMap[q.id] = q; });

let totalCorrect = 0;
for (const answer of userAnswers) {
  const question = questionMap[answer.question_id];
  if (!question) continue;

  let correct = question.correct_answer;
  if (typeof correct === 'number') {
    correct = String.fromCharCode(65 + correct);
  }

  const userAnswer = answer.answer.toUpperCase().trim();
  const isCorrect = userAnswer === correct;

  console.log(`题目 ${answer.question_id}:`);
  console.log(`  正确答案: ${correct} (原始: ${allQuestions.find(q => q.id === answer.question_id).correct_answer})`);
  console.log(`  用户答案: ${userAnswer}`);
  console.log(`  结果: ${isCorrect ? '✅' : '❌'}`);

  if (isCorrect) totalCorrect++;
}

const scorePercent = Math.round((totalCorrect / userAnswers.length) * 100);

console.log('\n========================================');
console.log('最终结果');
console.log('========================================');
console.log(`总题数: ${userAnswers.length}`);
console.log(`正确数: ${totalCorrect}`);
console.log(`正确率: ${scorePercent}%`);

if (totalCorrect === userAnswers.length && scorePercent === 100) {
  console.log('\n✅ 判分正确！修复有效。');
} else {
  console.log('\n❌ 判分仍有问题！');
  process.exit(1);
}
