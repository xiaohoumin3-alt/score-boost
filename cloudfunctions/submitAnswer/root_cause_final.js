/**
 * 0%正确率问题根因分析
 *
 * 问题发现：有两种不同的题目生成流程，导致 correct_answer 格式不一致
 */

console.log('========================================');
console.log('0%正确率问题根因分析');
console.log('========================================\n');

// ========== 流程1: startAssessment 直接模式 ==========
console.log('流程1: startAssessment 直接模式');
console.log('----------------------------------------');
console.log('触发条件: 题库有足够题目');
console.log('执行步骤:');
console.log('  1. startAssessment 从题库读取题目');
console.log('  2. 构建题目时转换 correct_answer: 数字 → 字母');
console.log('     代码: String.fromCharCode(65 + pq.correct_answer)');
console.log('  3. 直接保存到 assessments 集合');
console.log('  4. 返回给前端（不包含 correct_answer）');
console.log('');
console.log('数据格式:');
console.log('  - 题库 (ai_question_pool): correct_answer = 1 (数字)');
console.log('  - assessments.questions: correct_answer = "B" (字母)');
console.log('  - 前端题目: 不包含 correct_answer');
console.log('');

// ========== 流程2: questionGenerator 队列模式 ==========
console.log('流程2: questionGenerator 队列模式');
console.log('----------------------------------------');
console.log('触发条件: 题库题目不足');
console.log('执行步骤:');
console.log('  1. startAssessment 创建队列任务并返回');
console.log('  2. questionGenerator 处理队列');
console.log('  3. CompleteStep 从题库读取题目');
console.log('  4. CompleteStep 保存时处理 correct_answer:');
console.log('     代码: typeof q.correct_answer === "number" ? q.correct_answer : 0');
console.log('  5. 更新 assessments 集合');
console.log('');
console.log('数据格式:');
console.log('  - 题库 (ai_question_pool): correct_answer = 1 (数字)');
console.log('  - assessments.questions: correct_answer = 1 (数字)');
console.log('  - getAssessment 返回: 不包含 correct_answer');
console.log('');

// ========== 判分逻辑 ==========
console.log('判分逻辑 (submitAnswer)');
console.log('----------------------------------------');
console.log('从 assessments.questions 读取题目');
console.log('判分代码:');
console.log('  let correct = question.correct_answer;');
console.log('  if (typeof correct === "number") {');
console.log('    correct = String.fromCharCode(65 + correct);');
console.log('  } else {');
console.log('    correct = String(correct || "").toUpperCase().trim();');
console.log('  }');
console.log('');

// ========== 问题分析 ==========
console.log('========================================');
console.log('问题分析');
console.log('========================================\n');

console.log('测试1: 流程1 数据');
console.log('----------------------------------------');
const process1Question = { correct_answer: 'B' }; // 字母格式
let correct1 = process1Question.correct_answer;
if (typeof correct1 === 'number') {
  correct1 = String.fromCharCode(65 + correct1);
} else {
  correct1 = String(correct1 || '').toUpperCase().trim();
}
console.log(`输入: correct_answer = "B" (字母)`);
console.log(`输出: correct = "${correct1}"`);
console.log(`用户选择 "B": ${'B' === correct1 ? '✅ 正确' : '❌ 错误'}`);
console.log('');

console.log('测试2: 流程2 数据');
console.log('----------------------------------------');
const process2Question = { correct_answer: 1 }; // 数字格式
let correct2 = process2Question.correct_answer;
if (typeof correct2 === 'number') {
  correct2 = String.fromCharCode(65 + correct2);
} else {
  correct2 = String(correct2 || '').toUpperCase().trim();
}
console.log(`输入: correct_answer = 1 (数字)`);
console.log(`输出: correct = "${correct2}"`);
console.log(`用户选择 "B": ${'B' === correct2 ? '✅ 正确' : '❌ 错误'}`);
console.log('');

console.log('测试3: 格式错误情况（如果题库中 correct_answer 不是数字也不是字母）');
console.log('----------------------------------------');
const process3Question = { correct_answer: 0 }; // 被强制设为 0
let correct3 = process3Question.correct_answer;
if (typeof correct3 === 'number') {
  correct3 = String.fromCharCode(65 + correct3);
} else {
  correct3 = String(correct3 || '').toUpperCase().trim();
}
console.log(`输入: correct_answer = 0 (被强制设为 0)`);
console.log(`输出: correct = "${correct3}"`);
console.log(`用户选择 "B" (实际答案是 "C"): ${'B' === correct3 ? '✅ 正确' : '❌ 错误'}`);
console.log(`⚠️ 所有题目都会被判定为 "A" 正确！`);
console.log('');

// ========== 根因 ==========
console.log('\n========================================');
console.log('根因');
console.log('========================================\n');

console.log('1. 判分逻辑本身是正确的');
console.log('2. 两种流程的数据格式应该都能正确判分');
console.log('3. 但是！如果题库中的 correct_answer 格式错误，会导致问题');
console.log('');

console.log('可能的问题场景:');
console.log('----------------------------------------');
console.log('场景1: scheduledTaskGenerator 写入的题目');
console.log('  - 写入到 questions 集合（不是 ai_question_pool）');
console.log('  - correct_answer 格式: 字母 (A、B、C、D)');
console.log('  - 如果被读取并转换，可能出错');
console.log('');

console.log('场景2: 题库数据损坏');
console.log('  - correct_answer 字段缺失或格式错误');
console.log('  - CompleteStep 强制设为 0');
console.log('  - 所有题目都变成 "A" 正确');
console.log('');

console.log('场景3: 题目 ID 不匹配');
console.log('  - 用户提交的 question_id 与数据库中的不一致');
console.log('  - 判分时找不到题目');
console.log('  - 导致正确数少于预期');
console.log('');

// ========== 修复建议 ==========
console.log('\n========================================');
console.log('修复建议');
console.log('========================================\n');

console.log('立即修复:');
console.log('  1. 添加诊断日志到 submitAnswer');
console.log('  2. 检查实际数据库中的题目格式');
console.log('  3. 确保所有题库使用一致的 correct_answer 格式');
console.log('');

console.log('长期修复:');
console.log('  1. 统一 correct_answer 格式（建议使用数字索引）');
console.log('  2. 添加数据库验证约束');
console.log('  3. 创建数据库索引解决超时问题');
console.log('');

console.log('========================================');
console.log('分析完成');
console.log('========================================');
