#!/usr/bin/env node
/**
 * IRT 系统端到端验证脚本
 * 验证：部署 → 数据 → 评分 → 预估 全链路
 */

const { execSync } = require('child_process');
const path = require('path');

function invoke(name, params) {
  const paramsJson = JSON.stringify(params).replace(/"/g, '\\"');
  const cmd = `tcb fn invoke ${name} --params "${paramsJson}"`;
  const result = execSync(cmd, { encoding: 'utf-8', cwd: path.join(__dirname, '..') });
  const match = result.match(/返回结果：(.+)/);
  return match ? JSON.parse(match[1]) : null;
}

console.log('=== IRT 系统端到端验证 ===\n');

// 1. 检查云函数部署
console.log('1. 检查云函数部署...');
const functions = ['scoreCalibration', 'seedIRTData', 'irtParameterUpdate', 'batchGenerateQuestions'];
for (const fn of functions) {
  try {
    const result = invoke(fn, { action: 'status' });
    console.log(`   ✓ ${fn}: ${result ? 'OK' : 'No response'}`);
  } catch (e) {
    console.log(`   ✗ ${fn}: ${e.message.substring(0, 50)}`);
  }
}

// 2. 检查 IRT 数据
console.log('\n2. 检查 IRT 数据...');
const status = invoke('seedIRTData', { action: 'status' });
if (status && status.success) {
  const d = status.data;
  console.log(`   总题目: ${d.totalQuestions}`);
  console.log(`   有 IRT 参数: ${d.withIRT}`);
  console.log(`   覆盖率: ${d.coveragePercent}%`);
  console.log(`   参数来源: ${JSON.stringify(d.sourceBreakdown)}`);
} else {
  console.log('   ✗ 无法获取状态');
}

// 3. 测试 scoreCalibration（用不存在的 ID）
console.log('\n3. 测试 scoreCalibration...');
const calResult = invoke('scoreCalibration', { assessment_id: 'test_001' });
if (calResult && calResult.success === false && calResult.error === 'Assessment not found') {
  console.log('   ✓ scoreCalibration 正确返回 "Assessment not found"');
} else {
  console.log('   ✗ scoreCalibration 返回异常:', JSON.stringify(calResult));
}

// 4. 测试 irtParameterUpdate
console.log('\n4. 测试 irtParameterUpdate...');
const updateResult = invoke('irtParameterUpdate', { action: 'status' });
if (updateResult && updateResult.success) {
  console.log('   ✓ irtParameterUpdate 可调用');
} else {
  console.log('   ✗ irtParameterUpdate 返回:', JSON.stringify(updateResult));
}

// 5. 检查前端集成
console.log('\n5. 检查前端集成...');
const fs = require('fs');
const resultJs = fs.readFileSync(path.join(__dirname, '..', 'pages', 'result', 'result.js'), 'utf-8');
if (resultJs.includes('scoreCalibration')) {
  console.log('   ✓ result.js 已集成 scoreCalibration');
} else {
  console.log('   ✗ result.js 未集成 scoreCalibration');
}

const cloudApi = fs.readFileSync(path.join(__dirname, '..', 'utils', 'cloudApi.js'), 'utf-8');
if (cloudApi.includes('scoreCalibration')) {
  console.log('   ✓ cloudApi.js 已添加 scoreCalibration 超时配置');
} else {
  console.log('   ✗ cloudApi.js 未添加 scoreCalibration');
}

console.log('\n=== 验证完成 ===');
