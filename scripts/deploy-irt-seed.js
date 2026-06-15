#!/usr/bin/env node
/**
 * IRT 种子数据部署脚本
 * 用法: node scripts/deploy-irt-seed.js [--status] [--import] [--update]
 *
 * 功能：
 * --status  查看当前 IRT 参数覆盖情况
 * --import  导入种子数据到 ai_question_pool
 * --update  更新已有题目的 IRT 参数
 */

const path = require('path');
const fs = require('fs');

const SEED_FILE = path.join(__dirname, '..', 'data', 'irt-seed-questions.json');

function loadSeedData() {
  if (!fs.existsSync(SEED_FILE)) {
    console.error(`Seed file not found: ${SEED_FILE}`);
    console.error('Run: node cloudfunctions/shared/irt-seed-generator.js first');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
}

function printStatus(data) {
  console.log('\n=== IRT 参数覆盖情况 ===');
  console.log(`总题目数: ${data.totalQuestions}`);
  console.log(`有 IRT 参数: ${data.withIRT}`);
  console.log(`覆盖率: ${data.coveragePercent}%`);
  console.log(`参数来源分布:`, data.sourceBreakdown);
}

function printImportResult(data) {
  console.log('\n=== 导入结果 ===');
  console.log(`导入成功: ${data.imported}`);
  console.log(`跳过(已存在): ${data.skipped}`);
  console.log(`失败: ${data.errors}`);
  console.log(`总计: ${data.total}`);
}

// CLI 入口
const args = process.argv.slice(2);
const action = args[0] || '--status';

if (action === '--status') {
  console.log('查看 IRT 参数覆盖情况...');
  console.log('请在微信开发者工具中调用 seedIRTData 云函数，action: "status"');
  console.log('\n或者直接查看数据库: db.collection("ai_question_pool").where({irt_a: _.exists(true)}).count()');
} else if (action === '--import') {
  const seedData = loadSeedData();
  console.log(`Loaded ${seedData.length} seed questions`);
  console.log('\n请在微信开发者工具中调用 seedIRTData 云函数，action: "import"');
  console.log('或者使用以下数据:');
  console.log(JSON.stringify(seedData.slice(0, 5), null, 2));
  console.log(`... 共 ${seedData.length} 条`);
} else if (action === '--update') {
  const seedData = loadSeedData();
  console.log(`Loaded ${seedData.length} seed questions`);
  console.log('\n请在微信开发者工具中调用 seedIRTData 云函数，action: "updateIRT"');
} else {
  console.log('用法: node scripts/deploy-irt-seed.js [--status|--import|--update]');
}
