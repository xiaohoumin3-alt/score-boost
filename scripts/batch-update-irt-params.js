#!/usr/bin/env node
/**
 * 批量更新所有题目的 IRT 参数
 * 为缺失 IRT 参数的题目生成参数（基于知识点和难度）
 *
 * 用法: node scripts/batch-update-irt-params.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLOUD_FUNCTION = 'updateIRTParams';

function invokeCloudFunction(name, params) {
  const paramsJson = JSON.stringify(params).replace(/"/g, '\\"');
  const cmd = `tcb fn invoke ${name} --params "${paramsJson}"`;
  const result = execSync(cmd, { encoding: 'utf-8', cwd: path.join(__dirname, '..') });

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
  console.log('=== 批量更新 IRT 参数 ===\n');

  // 1. 检查当前状态
  console.log('1. 检查当前状态...');
  const status = invokeCloudFunction(CLOUD_FUNCTION, { action: 'status' });
  if (status && status.success) {
    const d = status.data;
    console.log(`   总题目: ${d.totalQuestions}`);
    console.log(`   有 IRT 参数: ${d.withIRT}`);
    console.log(`   缺失 IRT 参数: ${d.missingIRT}`);
    console.log(`   覆盖率: ${d.coveragePercent}%`);
  } else {
    console.log('   ✗ 无法获取状态');
    process.exit(1);
  }

  // 2. 批量更新（使用 updateAll）
  console.log('\n2. 批量更新 IRT 参数...');
  const totalMissing = status.data.missingIRT;

  if (totalMissing === 0) {
    console.log('   ✓ 所有题目已有 IRT 参数');
    return;
  }

  console.log(`   需要更新: ${totalMissing} 道题目`);

  const BATCH_SIZE = 50;
  const batches = Math.ceil(totalMissing / BATCH_SIZE);

  let updatedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < batches; i++) {
    console.log(`   批次 ${i + 1}/${batches}...`);

    try {
      const result = invokeCloudFunction(CLOUD_FUNCTION, {
        action: 'updateBatch',
        batchIndex: i,
        batchSize: BATCH_SIZE,
      });

      if (result && result.success) {
        updatedCount += result.data.updated || 0;
        errorCount += result.data.errors || 0;
        console.log(`     ✓ 已更新: ${result.data.updated}, 错误: ${result.data.errors}`);

        // 如果这批没有更新任何题目，说明已经处理完了
        if (result.data.updated === 0) {
          console.log('   ✓ 所有题目已处理完毕');
          break;
        }
      } else {
        console.log(`     ✗ 失败: ${result ? result.error : 'No response'}`);
        errorCount += BATCH_SIZE;
      }
    } catch (e) {
      console.log(`     ✗ 错误: ${e.message}`);
      errorCount += BATCH_SIZE;
    }

    await sleep(500);
  }

  console.log('\n=== 更新完成 ===');
  console.log(`总更新: ${updatedCount}`);
  console.log(`错误: ${errorCount}`);

  // 3. 验证最终状态
  console.log('\n3. 验证最终状态...');
  const finalStatus = invokeCloudFunction(CLOUD_FUNCTION, { action: 'status' });
  if (finalStatus && finalStatus.success) {
    const d = finalStatus.data;
    console.log(`   总题目: ${d.totalQuestions}`);
    console.log(`   有 IRT 参数: ${d.withIRT}`);
    console.log(`   覆盖率: ${d.coveragePercent}%`);
  }
}

main().catch(console.error);
