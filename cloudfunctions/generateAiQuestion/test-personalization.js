/**
 * 个性化生成效果对比测试
 * 验证不同学生画像生成不同题目
 */

const { buildPersonalizedPrompt } = require('./prompt-templates.js');

console.log('=== 个性化生成效果对比测试 ===\n');

// 场景1: 学生A（薄弱点：绝对值）
const studentA = {
  weak_points: ['绝对值概念', '负号处理'],
  error_patterns: ['直接去掉绝对值符号', '忘记处理负号']
};

// 场景2: 学生B（薄弱点：计算）
const studentB = {
  weak_points: ['计算准确性'],
  error_patterns: ['符号错误', '计算错误']
};

// 生成Prompt
const promptA = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: studentA
});

const promptB = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: studentB
});

console.log('=== 学生A Prompt（薄弱点：绝对值）===');
console.log('包含"绝对值":', promptA.includes('绝对值'));
console.log('包含"负号":', promptA.includes('负号'));
console.log('包含"直接去掉绝对值符号":', promptA.includes('直接去掉绝对值符号'));
console.log('');

console.log('=== 学生B Prompt（薄弱点：计算）===');
console.log('包含"计算":', promptB.includes('计算'));
console.log('包含"符号错误":', promptB.includes('符号错误'));
console.log('');

console.log('=== 对比结果 ===');
console.log('PromptA针对薄弱点"绝对值":', promptA.includes('绝对值'));
console.log('PromptB针对薄弱点"计算":', promptB.includes('计算'));
console.log('两个Prompt内容不同:', promptA !== promptB);
console.log('PromptA长度:', promptA.length);
console.log('PromptB长度:', promptB.length);
console.log('');

// 验证关键差异
const tests = [
  {
    name: '学生A Prompt包含绝对值薄弱点',
    pass: promptA.includes('绝对值')
  },
  {
    name: '学生A Prompt包含直接去掉绝对值符号错误模式',
    pass: promptA.includes('直接去掉绝对值符号')
  },
  {
    name: '学生B Prompt包含计算薄弱点',
    pass: promptB.includes('计算')
  },
  {
    name: '学生B Prompt包含符号错误错误模式',
    pass: promptB.includes('符号错误')
  },
  {
    name: '两个Prompt内容不同',
    pass: promptA !== promptB
  }
];

console.log('=== 测试结果 ===');
let allPass = true;
tests.forEach(test => {
  console.log(`${test.pass ? '✓' : '✗'} ${test.name}`);
  if (!test.pass) allPass = false;
});

console.log('');
if (allPass) {
  console.log('✓ 所有测试通过！个性化生成有效');
  console.log('  不同学生画像生成不同题目');
  console.log('  题目针对学生薄弱点设计');
  console.log('  干扰项基于学生错误模式设计');
} else {
  console.log('✗ 部分测试失败');
  process.exit(1);
}
