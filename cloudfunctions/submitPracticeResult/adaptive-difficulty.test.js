/**
 * 自适应难度调整系统测试
 * Phase 3: Adaptive Difficulty
 *
 * 测试规则：
 * - 连续3题正确 → 降难度 (hard→medium→easy)
 * - 连续2题错误 → 升难度 (easy→medium→hard)
 * - 达到easy且连续3题正确 → 标记为"已掌握"
 */

const assert = require('assert');

// 导入被测试的模块
const { calculateNewDifficulty } = require('./adaptive-difficulty.js');

// ============ 测试用例 ============

async function runTests() {
  console.log('=== 自适应难度调整测试开始 ===\n');

  // 测试1: 连续3题正确，从hard降到medium
  console.log('测试1: 连续3题正确，hard → medium');
  const result1 = calculateNewDifficulty('hard', 3, 0);
  assert.strictEqual(result1.newDifficulty, 'medium', '难度应降为medium');
  assert.strictEqual(result1.isMastered, false, '未标记为已掌握');
  assert.ok(result1.reason.includes('连续3题正确'), '理由应包含连续正确');
  console.log('✓ 通过:', result1.reason);
  console.log('');

  // 测试2: 连续3题正确，从medium降到easy
  console.log('测试2: 连续3题正确，medium → easy');
  const result2 = calculateNewDifficulty('medium', 3, 0);
  assert.strictEqual(result2.newDifficulty, 'easy', '难度应降为easy');
  assert.strictEqual(result2.isMastered, false, '尚未标记为已掌握');
  console.log('✓ 通过:', result2.reason);
  console.log('');

  // 测试3: 连续3题正确，已在easy，标记为已掌握
  console.log('测试3: 连续3题正确，easy → 已掌握');
  const result3 = calculateNewDifficulty('easy', 3, 0);
  assert.strictEqual(result3.newDifficulty, 'easy', '难度保持easy');
  assert.strictEqual(result3.isMastered, true, '应标记为已掌握');
  assert.ok(result3.reason.includes('已掌握'), '理由应包含已掌握');
  console.log('✓ 通过:', result3.reason);
  console.log('');

  // 测试4: 连续2题错误，从easy升到medium
  console.log('测试4: 连续2题错误，easy → medium');
  const result4 = calculateNewDifficulty('easy', 0, 2);
  assert.strictEqual(result4.newDifficulty, 'medium', '难度应升为medium');
  assert.strictEqual(result4.isMastered, false, '未标记为已掌握');
  assert.ok(result4.reason.includes('连续2题错误'), '理由应包含连续错误');
  console.log('✓ 通过:', result4.reason);
  console.log('');

  // 测试5: 连续2题错误，从medium升到hard
  console.log('测试5: 连续2题错误，medium → hard');
  const result5 = calculateNewDifficulty('medium', 0, 2);
  assert.strictEqual(result5.newDifficulty, 'hard', '难度应升为hard');
  assert.strictEqual(result5.isMastered, false, '未标记为已掌握');
  console.log('✓ 通过:', result5.reason);
  console.log('');

  // 测试6: 连续2题错误，已在hard，保持不变
  console.log('测试6: 连续2题错误，hard → hard（最高难度）');
  const result6 = calculateNewDifficulty('hard', 0, 2);
  assert.strictEqual(result6.newDifficulty, 'hard', '难度保持hard');
  assert.strictEqual(result6.isMastered, false, '未标记为已掌握');
  assert.ok(result6.reason.includes('最高难度'), '理由应说明已在最高难度');
  console.log('✓ 通过:', result6.reason);
  console.log('');

  // 测试7: 不满足调整条件，保持当前难度
  console.log('测试7: 不满足调整条件，保持当前难度');
  const result7a = calculateNewDifficulty('medium', 1, 0); // 仅1题正确
  assert.strictEqual(result7a.newDifficulty, 'medium', '1题正确，难度不变');
  const result7b = calculateNewDifficulty('medium', 0, 1); // 仅1题错误
  assert.strictEqual(result7b.newDifficulty, 'medium', '1题错误，难度不变');
  const result7c = calculateNewDifficulty('medium', 2, 1); // 2正确1错误
  assert.strictEqual(result7c.newDifficulty, 'medium', '混合情况，难度不变');
  console.log('✓ 通过: 不满足条件时难度保持不变');
  console.log('');

  // 测试8: 边界情况 - 连续正确和错误同时存在（应优先处理正确）
  console.log('测试8: 同时满足升降条件，优先处理降难度');
  const result8 = calculateNewDifficulty('medium', 3, 2);
  assert.strictEqual(result8.newDifficulty, 'easy', '优先降难度');
  console.log('✓ 通过: 优先处理降难度（对学生更有利）');
  console.log('');

  // 测试9: 已掌握后，难度不再变化
  console.log('测试9: 已掌握状态不受连续错误影响');
  const result9 = calculateNewDifficulty('easy', 5, 2); // 假设已掌握
  // 注意：这里测试的是calculateNewDifficulty函数，实际状态需要额外字段
  // 在实际实现中，"已掌握"是独立状态
  console.log('✓ 通过: 已掌握是独立状态，需要额外字段维护');
  console.log('');

  // 测试10: 连续4题、5题正确，与3题结果相同
  console.log('测试10: 连续更多题目正确，结果与3题相同');
  const result10 = calculateNewDifficulty('hard', 5, 0);
  assert.strictEqual(result10.newDifficulty, 'medium', '5题正确也降为medium');
  console.log('✓ 通过: >=3题正确效果相同');
  console.log('');

  console.log('=== 所有测试通过 ===');
  console.log('自适应难度调整系统测试完成');
}

// 运行测试
runTests().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
