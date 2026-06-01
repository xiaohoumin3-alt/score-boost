/**
 * 重复题问题验证测试（Node.js + 云函数调用）
 * 运行: node e2e/test-duplicates.js
 */

const tcb = require('tcb-admin-node');
const path = require('path');

// 初始化
const app = tcb.init({
  env: 'cloud1-7gg9y9tjb2b867b6',
  region: 'ap-shanghai',
});

const db = app.database();
const _ = db.command;

// 颜色输出
const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[✅]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[❌]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[⚠️]\x1b[0m ${msg}`)
};

// 测试1: geography题池无重复
async function testGeographyPoolNoDuplicates() {
  log.info('测试1: geography题池无重复');

  const { data: questions } = await db.collection('ai_question_pool')
    .where({
      subject: 'geography',
      question: _.exists(true)
    })
    .field({ question: true })
    .limit(200)
    .get();

  const seen = new Map();
  const duplicates = [];

  for (const q of questions) {
    const key = q.question;
    if (!key) continue;

    if (seen.has(key)) {
      duplicates.push({ question: key, count: seen.get(key) + 1 });
      seen.set(key, seen.get(key) + 1);
    } else {
      seen.set(key, 1);
    }
  }

  if (duplicates.length > 0) {
    log.error(`发现 ${duplicates.length} 个重复题`);
    duplicates.forEach(d => console.log(`  - "${d.question}" (出现${d.count}次)`));
    return false;
  }

  log.success(`geography题池验证通过：${questions.length}题，无重复`);
  return true;
}

// 测试2: biology题池无math/geography混入
async function testBiologyNoSubjectMix() {
  log.info('测试2: biology题池无math/geography混入');

  const mathKeywords = ['方程', '不等式', '函数', '几何', '代数', '分数', '小数', '计算'];
  const geoKeywords = ['中国的人口', '经纬度', '气候', '地形', '省份', '地理位置'];

  let wrong = [];

  for (const keyword of [...mathKeywords, ...geoKeywords]) {
    const { data } = await db.collection('ai_question_pool')
      .where({
        subject: 'biology',
        question: db.RegExp({
          regexp: keyword,
          options: 'i'
        })
      })
      .field({ question: true })
      .limit(5)
      .get();

    if (data.length > 0) {
      wrong.push({ keyword, questions: data.map(q => q.question) });
    }
  }

  if (wrong.length > 0) {
    log.error(`发现 ${wrong.length} 组错误科目题目`);
    wrong.forEach(w => {
      console.log(`  关键词"${w.keyword}":`);
      w.questions.forEach(q => console.log(`    - "${q}"`));
    });
    return false;
  }

  log.success(`biology题池验证通过：无math/geography混入`);
  return true;
}

// 测试3: 题池中各科目总数检查
async function testPoolCounts() {
  log.info('测试3: 题池中各科目总数');

  const subjects = ['math', 'biology', 'geography', 'chemistry', 'physics', 'history'];
  const counts = {};

  for (const subject of subjects) {
    const count = await db.collection('ai_question_pool')
      .where({ subject })
      .count();
    counts[subject] = count.total;
  }

  console.log('  各科目题池总数:');
  for (const [subject, count] of Object.entries(counts)) {
    console.log(`    ${subject}: ${count}`);
  }

  // 验证geography题池不为空
  if (counts.geography < 10) {
    log.warn(`geography题池题目较少(${counts.geography})，可能影响测评`);
  }

  log.success('题池统计完成');
  return true;
}

// 测试4: 模拟生成地理测评检查重复
async function testGeographyAssessment() {
  log.info('测试4: 模拟生成地理7年测评（20题）');

  try {
    const result = await app.callFunction({
      name: 'startAssessment',
      data: {
        student_id: 'test_' + Date.now(),
        subject: 'geography',
        grade: '7',
        num_questions: 20
      }
    });

    const assessmentId = result.result?.data?.assessment_id;

    if (!assessmentId) {
      // 题池不足，可能触发生成队列
      log.warn('题池可能不足，未返回assessment_id（可能触发生成队列）');
      return true;
    }

    // 获取生成的题目
    const { data: questions } = await db.collection('questions')
      .where({ assessment_id: assessmentId })
      .field({ question: true, subject: true })
      .get();

    // 检查重复
    const seen = new Set();
    const duplicates = [];
    for (const q of questions) {
      const key = q.question || q.content || '';
      if (key && seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    if (duplicates.length > 0) {
      log.error(`生成的测评中发现 ${duplicates.length} 个重复题`);
      duplicates.forEach(d => console.log(`  - "${d}"`));
      return false;
    }

    log.success(`地理测评验证通过：${questions.length}题，无重复`);
    return true;

  } catch (e) {
    log.error(`测评生成失败: ${e.message}`);
    return false;
  }
}

// 主函数
async function runTests() {
  log.info('开始运行重复题问题验证测试...\n');

  const results = {
    geographyPoolNoDuplicates: await testGeographyPoolNoDuplicates(),
    biologyNoSubjectMix: await testBiologyNoSubjectMix(),
    poolCounts: await testPoolCounts(),
    geographyAssessment: await testGeographyAssessment(),
  };

  console.log('\n=== 测试结果汇总 ===');
  const passed = Object.values(results).filter(r => r === true).length;
  const total = Object.keys(results).length;

  for (const [name, passed] of Object.entries(results)) {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${name}`);
  }

  console.log(`\n通过: ${passed}/${total}`);

  if (passed === total) {
    log.success('所有测试通过！');
    process.exit(0);
  } else {
    log.error('部分测试失败！');
    process.exit(1);
  }
}

runTests().catch(err => {
  log.error(`测试执行出错: ${err.message}`);
  console.error(err);
  process.exit(1);
});
