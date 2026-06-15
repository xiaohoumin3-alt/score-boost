#!/usr/bin/env node
/**
 * IRT 系统部署脚本
 * 一键部署所有 IRT 相关云函数
 *
 * 用法: node scripts/deploy-irt-system.js [--check|--deploy|--seed|--verify]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CLOUD_FUNCTIONS_DIR = path.join(__dirname, '..', 'cloudfunctions');

const IRT_FUNCTIONS = [
  'scoreCalibration',
  'irtParameterUpdate',
  'seedIRTData',
  'batchGenerateQuestions',
];

function run(cmd, cwd) {
  console.log(`  $ ${cmd}`);
  try {
    const output = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 120000 });
    return { success: true, output };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function checkFunctions() {
  console.log('\n=== 检查 IRT 云函数 ===\n');
  for (const fn of IRT_FUNCTIONS) {
    const fnDir = path.join(CLOUD_FUNCTIONS_DIR, fn);
    const exists = fs.existsSync(fnDir);
    const hasIndex = fs.existsSync(path.join(fnDir, 'index.js'));
    const hasPackage = fs.existsSync(path.join(fnDir, 'package.json'));

    const status = exists && hasIndex && hasPackage ? '✓' : '✗';
    console.log(`  ${status} ${fn}: ${exists ? 'exists' : 'MISSING'}${hasIndex ? '' : ' (no index.js)'}${hasPackage ? '' : ' (no package.json)'}`);
  }
}

function deployFunctions() {
  console.log('\n=== 部署 IRT 云函数 ===\n');
  for (const fn of IRT_FUNCTIONS) {
    const fnDir = path.join(CLOUD_FUNCTIONS_DIR, fn);
    if (!fs.existsSync(fnDir)) {
      console.log(`  ⏭ ${fn}: skipping (not found)`);
      continue;
    }

    console.log(`  📦 Deploying ${fn}...`);
    const result = run(`tcb fn deploy ${fn} --dir "${fnDir}"`, CLOUD_FUNCTIONS_DIR);
    if (result.success) {
      console.log(`  ✓ ${fn}: deployed`);
    } else {
      console.log(`  ✗ ${fn}: failed - ${result.error.substring(0, 100)}`);
    }
  }
}

function seedData() {
  console.log('\n=== 生成种子数据 ===\n');
  const seedFile = path.join(__dirname, '..', 'data', 'irt-seed-questions.json');
  if (!fs.existsSync(seedFile)) {
    console.log('  Generating seed data...');
    const result = run('node cloudfunctions/shared/irt-seed-generator.js', path.join(__dirname, '..'));
    if (result.success) {
      console.log('  ✓ Seed data generated');
    } else {
      console.log('  ✗ Failed to generate seed data');
    }
  } else {
    const data = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    console.log(`  ✓ Seed data exists: ${data.length} questions`);
  }
}

function runTests() {
  console.log('\n=== 运行 IRT 测试 ===\n');
  const result = run('npm test -- --testPathPattern="irt-seed-generator|item-bank-builder|score-estimator|irt-model|score-mapper|accuracy-verification|irt-validation"', path.join(__dirname, '..'));
  if (result.success) {
    console.log('  ✓ All IRT tests passed');
  } else {
    console.log('  ✗ Some tests failed');
    console.log(result.output || result.error);
  }
}

// CLI 入口
const args = process.argv.slice(2);
const action = args[0] || '--check';

switch (action) {
  case '--check':
    checkFunctions();
    break;
  case '--deploy':
    checkFunctions();
    deployFunctions();
    break;
  case '--seed':
    seedData();
    break;
  case '--verify':
    runTests();
    break;
  case '--all':
    checkFunctions();
    seedData();
    runTests();
    deployFunctions();
    break;
  default:
    console.log('用法: node scripts/deploy-irt-system.js [--check|--deploy|--seed|--verify|--all]');
}
