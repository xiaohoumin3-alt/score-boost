#!/usr/bin/env node
/**
 * 多科目数据积累执行脚本
 * 为所有科目生成模拟测评数据，扩展 IRT 参数覆盖
 *
 * 用法: node scripts/multi-subject-data-accumulation.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLOUD_FUNCTION = 'multiSubjectMockAssessments';

// 科目配置：每个科目的目标数据量
const SUBJECT_TARGETS = {
  math: { count: 20, grades: [7, 8, 9], priority: 'high' },
  chinese: { count: 15, grades: [7, 8, 9], priority: 'medium' },
  english: { count: 15, grades: [7, 8, 9], priority: 'medium' },
  physics: { count: 15, grades: [8, 9], priority: 'high' },
  chemistry: { count: 15, grades: [9], priority: 'high' },
  biology: { count: 10, grades: [7, 8, 9], priority: 'medium' },
  geography: { count: 10, grades: [7, 8, 9], priority: 'low' },
  history: { count: 10, grades: [7, 8, 9], priority: 'low' },
  politics: { count: 10, grades: [7, 8, 9], priority: 'low' },
};

function invokeCloudFunction(name, params) {
  const paramsJson = JSON.stringify(params).replace(/"/g, '\\"');
  const cmd = `tcb fn invoke ${name} --params "${paramsJson}"`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', cwd: path.join(__dirname, '..') });
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

async function checkCoverage() {
  console.log('=== 检查各科目题目覆盖 ===\n');

  const result = invokeCloudFunction(CLOUD_FUNCTION, { action: 'checkCoverage' });
  if (result && result.success) {
    const stats = result.data.stats;
    console.log('科目题目数量:');
    for (const [subject, count] of Object.entries(stats)) {
      const target = SUBJECT_TARGETS[subject];
      const status = count > 0 ? '✓' : '✗';
      console.log(`  ${status} ${subject.padEnd(12)} ${count.toString().padStart(4)} 题`);
    }
    return stats;
  } else {
    console.log('✗ 无法获取覆盖情况');
    return {};
  }
}

async function generateForSubject(subject, config) {
  console.log(`\n处理 ${subject}...`);
  const totalNeeded = config.count * config.grades.length;

  let generated = 0;
  let failed = 0;

  for (const grade of config.grades) {
    console.log(`  年级 ${grade}...`);
    const result = invokeCloudFunction(CLOUD_FUNCTION, {
      action: 'generateBySubject',
      subject: subject,
      grade: grade,
      count: config.count,
    });

    if (result && result.success) {
      generated += result.data.generated || 0;
      failed += (config.count - (result.data.generated || 0));
      console.log(`    ✓ 生成 ${result.data.generated}/${config.count} 条测评数据`);
    } else {
      failed += config.count;
      console.log(`    ✗ 生成失败`);
    }

    await sleep(300);
  }

  console.log(`  ${subject} 完成: ${generated} 生成, ${failed} 失败`);
  return { generated, failed };
}

async function main() {
  console.log('=== 多科目 IRT 数据积累 ===\n');

  // 1. 检查当前覆盖
  const currentStats = await checkCoverage();

  // 2. 按优先级生成数据
  console.log('\n=== 生成模拟测评数据 ===\n');

  const byPriority = { high: [], medium: [], low: [] };
  for (const [subject, config] of Object.entries(SUBJECT_TARGETS)) {
    byPriority[config.priority].push({ subject, config });
  }

  let totalGenerated = 0;
  let totalFailed = 0;

  for (const priority of ['high', 'medium', 'low']) {
    if (byPriority[priority].length === 0) continue;
    console.log(`\n[${priority.toUpperCase()} 优先级]`);

    for (const { subject, config } of byPriority[priority]) {
      const { generated, failed } = await generateForSubject(subject, config);
      totalGenerated += generated;
      totalFailed += failed;
      await sleep(500);
    }
  }

  // 3. 总结
  console.log('\n=== 完成 ===');
  console.log(`总生成: ${totalGenerated} 条测评数据`);
  console.log(`失败: ${totalFailed}`);

  // 4. 再次检查覆盖
  console.log('\n最终覆盖情况:');
  await checkCoverage();
}

main().catch(console.error);
