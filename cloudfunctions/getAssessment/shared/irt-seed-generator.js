/**
 * IRT 题目种子数据生成器
 * 基于知识点难度分布预设 IRT 参数，批量生成种子题目
 * 目标：让 IRT 模型从第一天就有真实参数，而非冷启动默认值
 * 版本: v1.0
 */

const path = require('path');
const fs = require('fs');

/**
 * 教育研究参考：各难度等级的 IRT 参数范围
 * 基于中国中考选择题的实证研究
 */
const DIFFICULTY_IRT_PARAMS = {
  easy: {
    bRange: [-2.5, -0.8],   // 难度：大部分学生能答对
    bDefault: -1.5,
    aRange: [0.6, 1.4],     // 区分度：中等
    aDefault: 1.0,
    expectedCorrectRate: 0.80,  // 预期正确率 80%
  },
  medium: {
    bRange: [-0.5, 0.5],    // 难度：中等
    bDefault: 0.0,
    aRange: [0.8, 1.8],     // 区分度：较高
    aDefault: 1.2,
    expectedCorrectRate: 0.55,  // 预期正确率 55%
  },
  hard: {
    bRange: [0.8, 2.5],     // 难度：大部分学生答错
    bDefault: 1.5,
    aRange: [1.0, 2.2],     // 区分度：高
    aDefault: 1.5,
    expectedCorrectRate: 0.30,  // 预期正确率 30%
  },
};

/**
 * 科目难度修正系数
 * 不同科目的选择题难度分布不同
 */
const SUBJECT_DIFFICULTY_ADJUST = {
  math:      { easy: 0, medium: 0, hard: 0 },
  chinese:   { easy: 0.1, medium: 0, hard: -0.1 },  // 语文选择题相对简单
  english:   { easy: 0, medium: 0, hard: 0 },
  physics:   { easy: -0.1, medium: 0, hard: 0.1 },   // 物理选择题偏难
  chemistry: { easy: -0.1, medium: 0, hard: 0.1 },
  biology:   { easy: 0.2, medium: 0, hard: -0.2 },   // 生物选择题偏简单
  geography: { easy: 0.2, medium: 0, hard: -0.2 },
  history:   { easy: 0.15, medium: 0, hard: -0.15 },
  politics:  { easy: 0.15, medium: 0, hard: -0.15 },
};

/**
 * 年级难度修正系数
 * 低年级题目相对简单（b 更低）
 */
const GRADE_DIFFICULTY_ADJUST = {
  1: -0.5, 2: -0.45, 3: -0.4, 4: -0.3, 5: -0.2, 6: -0.1,
  7: 0, 8: 0.1, 9: 0.2,
};

/**
 * 根据知识点的 difficulty_weight 生成 IRT 参数
 * @param {object} kp - 知识点记录
 * @param {string} difficulty - easy/medium/hard
 * @returns {{ a: number, b: number, source: string }}
 */
function generateIRTParams(kp, difficulty) {
  const diffConfig = DIFFICULTY_IRT_PARAMS[difficulty] || DIFFICULTY_IRT_PARAMS.medium;
  const subjectAdj = SUBJECT_DIFFICULTY_ADJUST[kp.subject] || { easy: 0, medium: 0, hard: 0 };
  const gradeAdj = GRADE_DIFFICULTY_ADJUST[kp.grade] || 0;

  // 基础 b 值
  let b = diffConfig.bDefault;

  // 应用科目修正
  b += subjectAdj[difficulty] || 0;

  // 应用年级修正
  b += gradeAdj;

  // 在范围内加入随机扰动（±0.3）
  const range = diffConfig.bRange;
  b = Math.max(range[0], Math.min(range[1], b + (Math.random() - 0.5) * 0.6));

  // 区分度 a：基于知识点的 difficulty_weight 分布
  // 如果 easy/medium/hard 分布均匀，区分度更高
  const dw = kp.difficulty_weight || { easy: 0.4, medium: 0.4, hard: 0.2 };
  const entropy = -(
    (dw.easy || 0.01) * Math.log2(dw.easy || 0.01) +
    (dw.medium || 0.01) * Math.log2(dw.medium || 0.01) +
    (dw.hard || 0.01) * Math.log2(dw.hard || 0.01)
  );
  // 熵越高（分布越均匀），区分度越高
  const aBase = diffConfig.aDefault + (entropy / 1.585 - 0.5) * 0.5;  // 1.585 = max entropy for 3 categories
  const a = Math.max(diffConfig.aRange[0], Math.min(diffConfig.aRange[1],
    aBase + (Math.random() - 0.5) * 0.4
  ));

  return {
    a: Math.round(a * 100) / 100,
    b: Math.round(b * 100) / 100,
    source: 'research_based',
  };
}

/**
 * 从知识点文件加载所有知识点
 * @param {string} dataDir - 数据目录路径
 * @returns {object[]} 知识点数组
 */
function loadKnowledgePoints(dataDir) {
  const allKpPath = path.join(dataDir, '_all_knowledge_points.json');
  if (fs.existsSync(allKpPath)) {
    return JSON.parse(fs.readFileSync(allKpPath, 'utf-8'));
  }
  return [];
}

/**
 * 为每个知识点生成种子题目参数
 * @param {object[]} knowledgePoints - 知识点数组
 * @param {number} questionsPerKp - 每个知识点生成几道题
 * @returns {object[]} 种子题目数组
 */
function generateSeedQuestions(knowledgePoints, questionsPerKp = 3) {
  const seeds = [];

  for (const kp of knowledgePoints) {
    const dw = kp.difficulty_weight || { easy: 0.4, medium: 0.4, hard: 0.2 };
    const totalWeight = (dw.easy || 0) + (dw.medium || 0) + (dw.hard || 0);

    // 根据 difficulty_weight 分配各难度的题目数量
    const easyCount = Math.round(questionsPerKp * (dw.easy || 0) / totalWeight);
    const mediumCount = Math.round(questionsPerKp * (dw.medium || 0) / totalWeight);
    const hardCount = questionsPerKp - easyCount - mediumCount;

    const difficulties = [
      ...Array(easyCount).fill('easy'),
      ...Array(mediumCount).fill('medium'),
      ...Array(Math.max(0, hardCount)).fill('hard'),
    ];

    for (let i = 0; i < difficulties.length; i++) {
      const difficulty = difficulties[i];
      const irtParams = generateIRTParams(kp, difficulty);

      seeds.push({
        kp_id: kp.kp_id,
        kp_name: kp.kp_name,
        subject: kp.subject,
        grade: String(kp.grade),
        chapter: kp.chapter || '',
        difficulty,
        irt_a: irtParams.a,
        irt_b: irtParams.b,
        irt_source: irtParams.source,
        difficulty_weight: dw,
      });
    }
  }

  return seeds;
}

/**
 * 生成种子题目 JSON 文件（用于导入数据库）
 * @param {string} dataDir - 数据目录
 * @param {string} outputPath - 输出路径
 * @param {number} questionsPerKp - 每个知识点生成几道题
 */
function generateSeedFile(dataDir, outputPath, questionsPerKp = 3) {
  const kps = loadKnowledgePoints(dataDir);
  console.log(`Loaded ${kps.length} knowledge points`);

  const seeds = generateSeedQuestions(kps, questionsPerKp);
  console.log(`Generated ${seeds.length} seed questions`);

  fs.writeFileSync(outputPath, JSON.stringify(seeds, null, 2), 'utf-8');
  console.log(`Saved to ${outputPath}`);

  // 输出统计
  const stats = { easy: 0, medium: 0, hard: 0 };
  const subjectStats = {};
  for (const s of seeds) {
    stats[s.difficulty]++;
    subjectStats[s.subject] = (subjectStats[s.subject] || 0) + 1;
  }
  console.log('Difficulty distribution:', stats);
  console.log('Subject distribution:', subjectStats);

  return seeds;
}

module.exports = {
  DIFFICULTY_IRT_PARAMS,
  SUBJECT_DIFFICULTY_ADJUST,
  GRADE_DIFFICULTY_ADJUST,
  generateIRTParams,
  loadKnowledgePoints,
  generateSeedQuestions,
  generateSeedFile,
};

// CLI 入口
if (require.main === module) {
  const dataDir = path.join(__dirname, '..', 'startAssessment', 'data');
  const outputPath = path.join(__dirname, '..', '..', 'data', 'irt-seed-questions.json');
  generateSeedFile(dataDir, outputPath, 3);
}
