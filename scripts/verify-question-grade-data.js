/**
 * 验证题库数据质量
 * 检查题目的知识点与年级标记是否匹配
 */

const fs = require('fs');

// 知识点-年级映射表
const knowledgePointGradeMap = {
  // 一年级（1年级）
  '20以内加减法': 1,
  '认识图形': 1,
  '认识时间': 1,
  '比较大小': 1,
  '分类整理': 1,

  // 二年级
  '100以内加减法': 2,
  '乘法口诀': 2,
  '除法初步': 2,
  '长度单位': 2,
  '认识角': 2,

  // 八年级（8年级）
  '勾股定理': 8,
  '一次函数': 8,
  '全等三角形': 8,
  '轴对称': 8,
  '数据的分析': 8,
  '实数': 8,
  '整式的乘法': 8,
  '因式分解': 8,
  '分式': 8,
  '二次根式': 8,
  '平行四边形': 8,
  '概率': 8,

  // 九年级
  '一元二次方程': 9,
  '二次函数': 9,
  '圆': 9,
  '相似三角形': 9,
  '锐角三角函数': 9,
};

/**
 * 判断题目年级是否合理
 */
function isGradeAppropriate(knowledgePoint, markedGrade) {
  const expectedGrade = knowledgePointGradeMap[knowledgePoint];

  if (!expectedGrade) {
    return { valid: false, reason: '未知知识点' };
  }

  // 允许 ±1 年级的误差
  const diff = Math.abs(markedGrade - expectedGrade);

  if (diff === 0) {
    return { valid: true, reason: '完全匹配' };
  } else if (diff <= 1) {
    return { valid: true, reason: `允许误差范围内（标记为${markedGrade}年级，应为${expectedGrade}年级）` };
  } else {
    return { valid: false, reason: `严重错误（标记为${markedGrade}年级，应为${expectedGrade}年级）` };
  }
}

/**
 * 分析示例数据
 */
function analyzeSampleData() {
  // 从实际调用返回的样本数据
  const sampleQuestions = [
    { knowledge_point: '一次函数', content: '一次函数y = 2x + 1的图像经过哪个点？' },
    { knowledge_point: '勾股定理', content: '一个直角三角形的两条直角边分别为3和4，则斜边长为？' },
    { knowledge_point: '全等三角形', content: '两个三角形全等，其中一个三角形的一个角是50°...' },
    { knowledge_point: '数据的分析', content: '一组数据2,3,4,5,6的中位数是多少？' },
    { knowledge_point: '概率', content: '掷一枚均匀的硬币，正面朝上的概率是？' },
  ];

  console.log('=== 示例题目年级验证（假设这些题被标记为1年级）===\n');

  let incorrectCount = 0;

  sampleQuestions.forEach((q, i) => {
    const result = isGradeAppropriate(q.knowledge_point, 1);

    console.log(`题目 ${i + 1}: ${q.knowledge_point}`);
    console.log(`  内容: ${q.content.substring(0, 50)}...`);
    console.log(`  标记年级: 1`);
    console.log(`  验证结果: ${result.valid ? '✅' : '❌'} ${result.reason}`);
    console.log('');

    if (!result.valid) {
      incorrectCount++;
    }
  });

  console.log(`\n=== 统计 ===`);
  console.log(`总题目数: ${sampleQuestions.length}`);
  console.log(`年级标记错误: ${incorrectCount}`);
  console.log(`错误率: ${Math.round(incorrectCount / sampleQuestions.length * 100)}%`);
}

// 运行分析
analyzeSampleData();

console.log('\n=== 建议 ===');
console.log('1. 检查题库数据中题目的 grade 字段是否正确');
console.log('2. 使用脚本批量更新题库数据，根据知识点内容重新标记年级');
console.log('3. 短期方案：parentAssessment 改用 AI 生成题目，避免使用题库');
