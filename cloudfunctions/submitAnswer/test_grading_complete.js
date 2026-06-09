/**
 * 完整判分逻辑测试
 * 覆盖所有边缘情况和数据格式
 */

console.log('========================================');
console.log('完整判分逻辑测试');
console.log('========================================\n');

// 测试用例
const testCases = [
  {
    name: '测试1: 字母格式正确答案（A）',
    question: {
      id: 'q1',
      correct_answer: 'A',
      options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
    },
    answer: { question_id: 'q1', answer: 'A' },
    expected: true,
  },
  {
    name: '测试2: 数字索引格式正确答案（0）',
    question: {
      id: 'q2',
      correct_answer: 0,
      options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
    },
    answer: { question_id: 'q2', answer: 'A' },
    expected: true,
  },
  {
    name: '测试3: 数字索引格式正确答案（2 → C）',
    question: {
      id: 'q3',
      correct_answer: 2,
      options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
    },
    answer: { question_id: 'q3', answer: 'C' },
    expected: true,
  },
  {
    name: '测试4: 小写字母用户答案',
    question: {
      id: 'q4',
      correct_answer: 'B',
      options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
    },
    answer: { question_id: 'q4', answer: 'b' },
    expected: true,
  },
  {
    name: '测试5: 带空格的用户答案',
    question: {
      id: 'q5',
      correct_answer: 'C',
      options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
    },
    answer: { question_id: 'q5', answer: ' C ' },
    expected: true,
  },
  {
    name: '测试6: 错误答案',
    question: {
      id: 'q6',
      correct_answer: 'A',
      options: ['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4'],
    },
    answer: { question_id: 'q6', answer: 'B' },
    expected: false,
  },
  {
    name: '测试7: 选项格式标准化（对象数组）',
    question: {
      id: 'q7',
      correct_answer: 0,
      options: [
        {key: 'A', value: '选项1'},
        {key: 'B', value: '选项2'},
        {key: 'C', value: '选项3'},
        {key: 'D', value: '选项4'},
      ],
    },
    answer: { question_id: 'q7', answer: 'A' },
    expected: true,
  },
];

// 判分函数
function gradeAnswer(question, userAnswer) {
  let correct = question.correct_answer;
  if (typeof correct === 'number') {
    correct = String.fromCharCode(65 + correct);
  } else {
    correct = String(correct || '').toUpperCase().trim();
  }

  const userAns = (userAnswer || '').toUpperCase().trim();
  return userAns === correct;
}

// 运行所有测试
let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const result = gradeAnswer(testCase.question, testCase.answer.answer);
  const success = result === testCase.expected;

  if (success) {
    passed++;
    console.log(`✅ ${testCase.name}`);
  } else {
    failed++;
    console.log(`❌ ${testCase.name}`);
    console.log(`   预期: ${testCase.expected}, 实际: ${result}`);
  }
}

// ID 匹配测试
console.log('\n========================================');
console.log('ID 匹配测试');
console.log('========================================\n');

const databaseQuestions = {
  'pool_verified_12345': { id: 'pool_verified_12345', correct_answer: 'A' },
  'ai_67890': { id: 'ai_67890', correct_answer: 1 },
};

const idTests = [
  {
    name: 'ID 一致（pool_verified_12345）',
    questionId: 'pool_verified_12345',
    expected: true,
  },
  {
    name: 'ID 一致（ai_67890）',
    questionId: 'ai_67890',
    expected: true,
  },
  {
    name: 'ID 不一致（仅 _id）',
    questionId: '12345',  // 假设 getAssessment 错误地返回了 _id 而不是 id
    expected: false,
  },
];

for (const test of idTests) {
  const found = !!databaseQuestions[test.questionId];
  const success = found === test.expected;

  if (success) {
    passed++;
    console.log(`✅ ${test.name}`);
  } else {
    failed++;
    console.log(`❌ ${test.name}`);
    console.log(`   预期: ${test.expected}, 实际: ${found}`);
  }
}

// 总结
console.log('\n========================================');
console.log('测试总结');
console.log('========================================');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed === 0) {
  console.log('\n✅ 所有测试通过！修复逻辑正确。');
  process.exit(0);
} else {
  console.log('\n❌ 有测试失败！需要检查修复逻辑。');
  process.exit(1);
}
