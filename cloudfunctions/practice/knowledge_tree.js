/**
 * 知识树加载和题目规划
 */

const fs = require('fs');
const path = require('path');

function loadKnowledgeTree(subject, grade, semester = '下') {
  // 微信云函数环境：从云存储或本地打包文件读取
  try {
    const dataDir = path.dirname(__dirname);
    const dataFile = path.join(dataDir, 'data', `math-grade${grade}-${semester}.json`);

    if (fs.existsSync(dataFile)) {
      const content = fs.readFileSync(dataFile, 'utf-8');
      return JSON.parse(content);
    }

    return getEmbeddedData(grade);
  } catch (e) {
    return getEmbeddedData(grade);
  }
}

function getEmbeddedData(grade) {
  return {
    subject: '数学',
    grade: grade,
    semester: '下',
    chapters: [
      { id: 'ch1', name: '二次根式', knowledge_points: [
        { id: 'kp1_1', name: '二次根式的概念', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'kp1_2', name: '二次根式的性质', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        { id: 'kp1_3', name: '二次根式的运算', difficulty_weight: { easy: 0.3, medium: 0.5, hard: 0.2 } },
      ]},
      { id: 'ch2', name: '勾股定理', knowledge_points: [
        { id: 'kp2_1', name: '勾股定理', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        { id: 'kp2_2', name: '勾股定理的逆定理', difficulty_weight: { easy: 0.3, medium: 0.5, hard: 0.2 } },
        { id: 'kp2_3', name: '勾股定理的应用', difficulty_weight: { easy: 0.3, medium: 0.4, hard: 0.3 } },
      ]},
      { id: 'ch3', name: '平行四边形', knowledge_points: [
        { id: 'kp3_1', name: '平行四边形的性质', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        { id: 'kp3_2', name: '平行四边形的判定', difficulty_weight: { easy: 0.3, medium: 0.4, hard: 0.3 } },
        { id: 'kp3_3', name: '特殊的平行四边形', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
      ]},
      { id: 'ch4', name: '一次函数', knowledge_points: [
        { id: 'kp4_1', name: '函数的概念', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'kp4_2', name: '一次函数的图像', difficulty_weight: { easy: 0.3, medium: 0.4, hard: 0.3 } },
        { id: 'kp4_3', name: '一次函数的应用', difficulty_weight: { easy: 0.3, medium: 0.4, hard: 0.3 } },
      ]},
      { id: 'ch5', name: '数据的分析', knowledge_points: [
        { id: 'kp5_1', name: '数据的集中趋势', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'kp5_2', name: '数据的波动程度', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
      ]},
    ]
  };
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function generateQuestionPlan(tree, numQuestions, difficultyDistribution = null) {
  difficultyDistribution = difficultyDistribution || { easy: 0.5, medium: 0.3, hard: 0.2 };

  // 收集所有知识点
  const allKps = [];
  for (const chapter of (tree.chapters || [])) {
    for (const kp of (chapter.knowledge_points || [])) {
      allKps.push({
        kp_id: kp.id,
        kp_name: kp.name,
        chapter_name: chapter.name,
        chapter_id: chapter.id,
        weight: kp.difficulty_weight || { easy: 0.5, medium: 0.3, hard: 0.2 },
      });
    }
  }

  // 计算每种难度的题目数量
  const numEasy = Math.floor(numQuestions * (difficultyDistribution.easy || 0.5));
  const numMedium = Math.floor(numQuestions * (difficultyDistribution.medium || 0.3));
  const numHard = numQuestions - numEasy - numMedium;

  // 按难度分配题目
  const plan = [];
  const shuffledKps = shuffle([...allKps]);

  for (let i = 0; i < Math.min(numEasy, shuffledKps.length); i++) {
    plan.push({ kp: shuffledKps[i], difficulty: 'easy' });
  }
  for (let i = numEasy; i < Math.min(numEasy + numMedium, shuffledKps.length); i++) {
    plan.push({ kp: shuffledKps[i], difficulty: 'medium' });
  }
  for (let i = numEasy + numMedium; i < Math.min(numQuestions, shuffledKps.length); i++) {
    plan.push({ kp: shuffledKps[i], difficulty: 'hard' });
  }

  // 如果题目不够，循环补充
  while (plan.length < numQuestions) {
    const kp = shuffledKps[plan.length % shuffledKps.length];
    const diffs = ['easy', 'medium', 'hard'];
    plan.push({ kp, difficulty: diffs[plan.length % 3] });
  }

  return shuffle(plan).slice(0, numQuestions);
}

module.exports = {
  loadKnowledgeTree,
  generateQuestionPlan,
};
