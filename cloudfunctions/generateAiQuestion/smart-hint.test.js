/**
 * 智能提示系统测试
 * Phase 4: Smart Hint
 *
 * 测试规则：
 * - Level 1（直接提示）: 粗心错误，指出问题所在
 * - Level 2（步骤提示）: 计算错误，给出解题步骤框架
 * - Level 3（概念提示）: 概念错误，引导回顾相关知识点
 */

const assert = require('assert');

// 导入被测试的模块
const { analyzeErrorPattern, selectHintLevel, generateHint } = require('./smart-hint.js');

// ============ 测试用例 ============

async function runTests() {
  console.log('=== 智能提示系统测试开始 ===\n');

  // 测试1: 错误模式识别 - 计算错误（使用复杂表达式）
  console.log('测试1: 识别计算错误');
  const pattern1 = analyzeErrorPattern('勾股定理', '3 + 4 = 6', 'medium');
  assert.strictEqual(pattern1.type, 'calculation', '应识别为计算错误');
  assert.ok(pattern1.confidence > 0.5, '置信度应大于0.5');
  console.log('✓ 通过:', pattern1.type, '置信度:', pattern1.confidence);
  console.log('');

  // 测试2: 错误模式识别 - 概念错误
  console.log('测试2: 识别概念错误');
  const pattern2 = analyzeErrorPattern('绝对值', '|-5| = -5', 'easy');
  assert.strictEqual(pattern2.type, 'concept', '应识别为概念错误');
  assert.ok(pattern2.confidence > 0.7, '置信度应大于0.7');
  console.log('✓ 通过:', pattern2.type, '置信度:', pattern2.confidence);
  console.log('');

  // 测试3: 错误模式识别 - 粗心错误
  console.log('测试3: 识别粗心错误');
  const pattern3 = analyzeErrorPattern('二次根式', '√25 = 4', 'easy');
  assert.strictEqual(pattern3.type, 'careless', '应识别为粗心错误');
  assert.ok(pattern3.confidence > 0.6, '置信度应大于0.6');
  console.log('✓ 通过:', pattern3.type, '置信度:', pattern3.confidence);
  console.log('');

  // 测试4: 提示级别选择 - 计算错误选择Level 2
  console.log('测试4: 计算错误选择Level 2提示');
  const level1 = selectHintLevel({ type: 'calculation', confidence: 0.8 });
  assert.strictEqual(level1, 2, '计算错误应选择Level 2');
  console.log('✓ 通过: 提示级别 =', level1);
  console.log('');

  // 测试5: 提示级别选择 - 概念错误选择Level 3
  console.log('测试5: 概念错误选择Level 3提示');
  const level2 = selectHintLevel({ type: 'concept', confidence: 0.9 });
  assert.strictEqual(level2, 3, '概念错误应选择Level 3');
  console.log('✓ 通过: 提示级别 =', level2);
  console.log('');

  // 测试6: 提示级别选择 - 粗心错误选择Level 1
  console.log('测试6: 粗心错误选择Level 1提示');
  const level3 = selectHintLevel({ type: 'careless', confidence: 0.7 });
  assert.strictEqual(level3, 1, '粗心错误应选择Level 1');
  console.log('✓ 通过: 提示级别 =', level3);
  console.log('');

  // 测试7: 提示级别选择 - 低置信度选择保守级别
  console.log('测试7: 低置信度选择Level 2（保守）');
  const level4 = selectHintLevel({ type: 'unknown', confidence: 0.3 });
  assert.strictEqual(level4, 2, '低置信度应选择Level 2');
  console.log('✓ 通过: 提示级别 =', level4);
  console.log('');

  // 测试8: 生成Level 1提示（直接提示）
  console.log('测试8: 生成Level 1提示');
  const hint1 = await generateHint('二次根式', '√25 = 4', 'careless', 1);
  assert.ok(hint1.includes('4'), '提示应包含学生的错误答案');
  assert.ok(hint1.includes('5') || hint1.includes('正确'), '提示应包含正确答案或正确性提示');
  assert.ok(hint1.length < 100, 'Level 1提示应简洁');
  console.log('✓ 通过:', hint1);
  console.log('');

  // 测试9: 生成Level 2提示（步骤提示）
  console.log('测试9: 生成Level 2提示');
  const hint2 = await generateHint('勾股定理', '', 'calculation', 2);
  assert.ok(hint2.length > 30, 'Level 2提示应有内容');
  assert.ok(hint2.includes('步骤') || hint2.includes('首先') || hint2.includes('然后') || hint2.includes('勾股定理'), '提示应包含步骤引导');
  console.log('✓ 通过:', hint2.substring(0, 50) + '...');
  console.log('');

  // 测试10: 生成Level 3提示（概念提示）
  console.log('测试10: 生成Level 3提示');
  const hint3 = await generateHint('绝对值', '|-5| = -5', 'concept', 3);
  assert.ok(hint3.includes('概念') || hint3.includes('定义') || hint3.includes('回顾') || hint3.includes('绝对值'), '提示应引导回顾概念');
  assert.ok(hint3.length > 40, 'Level 3提示应详细');
  console.log('✓ 通过:', hint3.substring(0, 50) + '...');
  console.log('');

  console.log('=== 所有测试通过 ===');
  console.log('智能提示系统测试完成');
}

// 运行测试
runTests().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
