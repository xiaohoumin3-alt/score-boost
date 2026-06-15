#!/usr/bin/env node
/**
 * 使用已部署的 generateMockAssessments 云函数
 * 循环为多科目生成模拟测评数据
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLOUD_FUNCTION = 'generateMockAssessments';

// 科目和年级配置
const SUBJECTS_GRADES = [
  { subject: 'math', grades: [7, 8, 9], count: 10 },
  { subject: 'chinese', grades: [7, 8, 9], count: 8 },
  { subject: 'english', grades: [7, 8, 9], count: 8 },
  { subject: 'physics', grades: [8, 9], count: 8 },
  { subject: 'chemistry', grades: [9], count: 8 },
  { subject: 'biology', grades: [7, 8, 9], count: 6 },
  { subject: 'geography', grades: [7, 8, 9], count: 5 },
  { subject: 'history', grades: [7, 8, 9], count: 5 },
  { subject: 'politics', grades: [7, 8, 9], count: 5 },
];

function invokeCloudFunction(params) {
  const paramsJson = JSON.stringify(params).replace(/"/g, '\\"');
  const cmd = `tcb fn invoke ${CLOUD_FUNCTION} --params "${paramsJson}"`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8' });
    const match = result.match(/返回结果：(.+)/);
    if (match) {
      return JSON.parse(match[1]);
    }
    return null;
  } catch (e) {
    console.error(`调用失败: ${e.message}`);
    return null;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== 多科目数据积累 ===\n');

  let totalGenerated = 0;
  let totalFailed = 0;

  for (const { subject, grades, count } of SUBJECTS_GRADES) {
    console.log(`\n科目: ${subject}`);

    for (const grade of grades) {
      console.log(`  年级 ${grade}...`);

      for (let i = 0; i < count; i++) {
        const result = invokeCloudFunction({
          action: 'generate',
          subject: subject,
          grade: grade,
          count: 1,
        });

        if (result && result.success && result.data) {
          totalGenerated += result.data.generated || 0;
          totalFailed += result.data.failed || 0;

          if (i === 0 || (i + 1) % 5 === 0) {
            console.log(`    进度: ${i + 1}/${count}, 生成: ${result.data.generated || 0}`);
          }
        } else {
          totalFailed += 1;
          console.log(`    ✗ 第 ${i + 1} 次失败`);
        }

        await sleep(200); // 避免调用过快
      }

      console.log(`    ✓ 年级 ${grade} 完成`);
      await sleep(500);
    }
  }

  console.log('\n=== 完成 ===');
  console.log(`总生成: ${totalGenerated} 条测评数据`);
  console.log(`失败: ${totalFailed}`);
  console.log('\n下一步：运行数据统计检查');
  console.log('tcb fn invoke testIRTSystem --params \'{"action":"checkStats"}\'');
}

main().catch(console.error);
