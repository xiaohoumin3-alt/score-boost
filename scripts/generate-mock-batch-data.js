#!/usr/bin/env node
/**
 * 直接数据库批量插入方案
 * 通过 tcb db import 或 direct db 操作
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 科目和年级配置
const SUBJECTS_GRADES = [
  { subject: 'math', grades: [7, 8, 9], count: 20 },
  { subject: 'chinese', grades: [7, 8, 9], count: 15 },
  { subject: 'english', grades: [7, 8, 9], count: 15 },
  { subject: 'physics', grades: [8, 9], count: 15 },
  { subject: 'chemistry', grades: [9], count: 15 },
  { subject: 'biology', grades: [7, 8, 9], count: 10 },
  { subject: 'geography', grades: [7, 8, 9], count: 10 },
  { subject: 'history', grades: [7, 8, 9], count: 10 },
  { subject: 'politics', grades: [7, 8, 9], count: 10 },
];

// 能力水平分布
const THETA_LEVELS = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5];

// 模拟答题结果
function generateMockResults(theta, questionCount) {
  const results = [];
  for (let i = 0; i < questionCount; i++) {
    // 基于 theta 模拟答对概率
    const p = 1 / (1 + Math.exp(-theta));
    results.push(Math.random() < p ? 1 : 0);
  }
  return results;
}

// 生成批量导入 JSON
function generateBatchImportJson() {
  const assessments = [];
  const timestamp = Date.now();

  let index = 0;
  for (const { subject, grades, count } of SUBJECTS_GRADES) {
    for (const grade of grades) {
      for (let i = 0; i < count; i++) {
        const theta = THETA_LEVELS[index % THETA_LEVELS.length];
        const questionCount = 20; // 假设每次测评20题
        const results = generateMockResults(theta, questionCount);
        const correctCount = results.filter(r => r === 1).length;

        assessments.push({
          assessment_id: `mock_${subject}_${grade}_${timestamp}_${i}`,
          subject: subject,
          grade: String(grade),
          status: 'completed',
          source: 'mock',
          theta: theta,
          results: results.map((r, idx) => ({
            question_id: `q_${subject}_${grade}_${idx}`,
            is_correct: r === 1,
            knowledge_point: `kp_${subject}_${grade}_${idx}`,
          })),
          score: {
            total_correct: correctCount,
            total_questions: questionCount,
            score_percent: Math.round(correctCount / questionCount * 1000) / 10,
          },
          created_at: new Date(timestamp + i * 1000).toISOString(),
          completed_at: new Date(timestamp + i * 1000 + 60000).toISOString(),
        });

        index++;
      }
    }
  }

  return assessments;
}

// 生成题目统计更新
function generateQuestionStats() {
  const stats = [];
  const timestamp = Date.now();

  let questionId = 0;
  for (const { subject, grades, count } of SUBJECTS_GRADES) {
    for (const grade of grades) {
      for (let i = 0; i < 20; i++) { // 每年级20道题
        // 模拟不同使用次数和正确率
        const usageCount = Math.floor(Math.random() * 50) + 10;
        const correctRate = 0.5 + (Math.random() - 0.5) * 0.4; // 0.3~0.7

        stats.push({
          _id: `q_${subject}_${grade}_${i}`,
          usage_count: usageCount,
          correct_count: Math.round(usageCount * correctRate),
          irt_a: 1.0 + (Math.random() - 0.5) * 0.5,
          irt_b: (Math.random() - 0.5) * 2,
        });

        questionId++;
      }
    }
  }

  return stats;
}

async function main() {
  console.log('=== 批量数据生成 ===\n');

  // 1. 生成测评数据
  console.log('1. 生成模拟测评数据...');
  const assessments = generateBatchImportJson();
  console.log(`   生成 ${assessments.length} 条测评记录`);

  // 2. 生成题目统计
  console.log('2. 生成题目统计数据...');
  const questionStats = generateQuestionStats();
  console.log(`   生成 ${questionStats.length} 道题的统计`);

  // 3. 写入文件
  const outputDir = path.join(__dirname, '..', 'data', 'mock-data');
  fs.mkdirSync(outputDir, { recursive: true });

  const assessmentsFile = path.join(outputDir, 'assessments.json');
  const statsFile = path.join(outputDir, 'question-stats.json');

  fs.writeFileSync(assessmentsFile, JSON.stringify(assessments, null, 2));
  fs.writeFileSync(statsFile, JSON.stringify(questionStats, null, 2));

  console.log(`\n3. 数据已写入:`);
  console.log(`   - ${assessmentsFile}`);
  console.log(`   - ${statsFile}`);

  // 4. 导入说明
  console.log('\n4. 导入方式:');
  console.log('   方式一：使用云开发控制台导入 JSON');
  console.log('   方式二：使用 tcb db import 命令（需要配置）');
  console.log('   方式三：创建临时云函数批量写入');

  // 5. 创建临时导入云函数
  console.log('\n5. 创建临时导入云函数...');
  const importFnDir = path.join(__dirname, '..', 'cloudfunctions', 'bulkImportMockData');
  fs.mkdirSync(importFnDir, { recursive: true });

  const importCode = `
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { action = 'importAssessments' } = event;
  const db = cloud.database();

  if (action === 'importAssessments') {
    // 读取 assessments.json
    const assessments = require('./data/mock-data/assessments.json');
    let imported = 0;
    let errors = 0;

    for (const record of assessments) {
      try {
        await db.collection('assessments').add({ data: record });
        imported++;
      } catch (e) {
        errors++;
        console.error('导入失败:', record.assessment_id, e.message);
      }
    }

    return { success: true, imported, errors, total: assessments.length };
  }

  if (action === 'updateQuestionStats') {
    // 读取 question-stats.json
    const stats = require('./data/mock-data/question-stats.json');
    let updated = 0;
    let errors = 0;

    for (const stat of stats) {
      try {
        await db.collection('ai_question_pool').doc(stat._id).update({
          data: {
            usage_count: stat.usage_count,
            correct_count: stat.correct_count,
            irt_a: stat.irt_a,
            irt_b: stat.irt_b,
          }
        });
        updated++;
      } catch (e) {
        errors++;
        // 忽略题目不存在的错误
      }
    }

    return { success: true, updated, errors, total: stats.length };
  }

  return { success: false, error: 'Unknown action' };
};
`;

  fs.writeFileSync(path.join(importFnDir, 'index.js'), importCode);
  console.log(`   - ${importFnDir}/index.js`);

  console.log('\n=== 完成 ===');
  console.log('请在云开发控制台或 CLI 中部署 bulkImportMockData 云函数');
  console.log('然后调用导入数据：');
  console.log('  1. tcb fn invoke bulkImportMockData --params \'{"action":"importAssessments"}\'');
  console.log('  2. tcb fn invoke bulkImportMockData --params \'{"action":"updateQuestionStats"}\'');
}

main().catch(console.error);
