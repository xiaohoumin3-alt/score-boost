#!/usr/bin/env node
/**
 * 批量导入 IRT 种子数据到云数据库
 * 分批调用 seedIRTData 云函数
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SEED_FILE = path.join(__dirname, '..', 'data', 'irt-seed-questions.json');
const BATCH_SIZE = 100;  // 每批导入数量

function loadSeedData() {
  if (!fs.existsSync(SEED_FILE)) {
    console.error('Seed file not found:', SEED_FILE);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
}

function invokeCloudFunction(name, params) {
  const paramsJson = JSON.stringify(params).replace(/"/g, '\\"');
  const cmd = `tcb fn invoke ${name} --params "${paramsJson}"`;
  const result = execSync(cmd, { encoding: 'utf-8', cwd: path.join(__dirname, '..') });

  // 解析返回结果
  const match = result.match(/返回结果：(.+)/);
  if (match) {
    return JSON.parse(match[1]);
  }
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const seedData = loadSeedData();
  console.log(`Loaded ${seedData.length} seed questions`);

  const batches = [];
  for (let i = 0; i < seedData.length; i += BATCH_SIZE) {
    batches.push(seedData.slice(i, i + BATCH_SIZE));
  }

  console.log(`Split into ${batches.length} batches of ${BATCH_SIZE}`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\nBatch ${i + 1}/${batches.length} (${batch.length} items)...`);

    try {
      const result = invokeCloudFunction('seedIRTData', {
        action: 'import',
        seed_data: batch,
      });

      if (result && result.success) {
        totalImported += result.data.imported || 0;
        totalSkipped += result.data.skipped || 0;
        totalErrors += result.data.errors || 0;
        console.log(`  ✓ Imported: ${result.data.imported}, Skipped: ${result.data.skipped}, Errors: ${result.data.errors}`);
      } else {
        console.log(`  ✗ Failed: ${result ? result.error : 'No response'}`);
        totalErrors += batch.length;
      }
    } catch (e) {
      console.log(`  ✗ Error: ${e.message}`);
      totalErrors += batch.length;
    }

    // 速率限制：每批间隔 1 秒
    await sleep(1000);
  }

  console.log('\n=== Import Summary ===');
  console.log(`Total imported: ${totalImported}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log(`Total errors: ${totalErrors}`);
}

main().catch(console.error);
