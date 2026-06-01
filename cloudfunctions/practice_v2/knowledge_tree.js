/**
 * 知识树加载和题目规划
 */

const fs = require('fs');
const path = require('path');

function loadKnowledgeTree(subject, grade, semester = '下') {
  // 微信云函数环境：从云存储或本地打包文件读取
  const subjectMap = {
    'math': 'math',
    'biology': 'biology',
    'geography': 'geography',
    '数学': 'math',
    '生物': 'biology',
    '地理': 'geography'
  };
  const dbSubject = subjectMap[subject] || subject || 'math';

  try {
    const dataDir = path.dirname(__dirname);
    // 尝试加载科目对应的数据文件
    const dataFile = path.join(dataDir, 'data', `${dbSubject}-grade${grade}-${semester}.json`);

    if (fs.existsSync(dataFile)) {
      const content = fs.readFileSync(dataFile, 'utf-8');
      return JSON.parse(content);
    }

    // 回退到内嵌数据，根据科目返回不同知识树
    return getEmbeddedData(dbSubject, grade);
  } catch (e) {
    return getEmbeddedData(dbSubject, grade);
  }
}

function getEmbeddedData(subject, grade) {
  // 数学知识树
  if (subject === 'math') {
    return {
      subject: 'math',
      grade: grade,
      semester: '下',
      chapters: [
        { id: 'kp1', name: '二次根式', knowledge_points: [
          { id: 'kp1_1', name: '二次根式的概念', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'kp1_2', name: '二次根式的性质', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
        { id: 'kp2', name: '勾股定理', knowledge_points: [
          { id: 'kp2_1', name: '勾股定理', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
          { id: 'kp2_3', name: '勾股定理的应用', difficulty_weight: { easy: 0.3, medium: 0.4, hard: 0.3 } },
        ]},
      ]
    };
  }

  // 生物知识树
  if (subject === 'biology') {
    return {
      subject: 'biology',
      grade: grade,
      semester: '下',
      chapters: [
        { id: 'bio_ch1', name: '动物的主要类群', knowledge_points: [
          { id: 'bio_kp1', name: '腔肠动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp2', name: '扁形动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp3', name: '线形动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp4', name: '环节动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp5', name: '软体动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp6', name: '节肢动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp7', name: '鱼类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp8', name: '两栖类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp9', name: '爬行类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp10', name: '鸟类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp11', name: '哺乳类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
        { id: 'bio_ch2', name: '动物的运动和行为', knowledge_points: [
          { id: 'bio_kp12', name: '动物的运动', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp13', name: '动物的行为', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ]
    };
  }

  // 地理知识树
  if (subject === 'geography') {
    return {
      subject: 'geography',
      grade: grade,
      semester: '下',
      chapters: [
        { id: 'geo_ch1', name: '中国的疆域与行政区划', knowledge_points: [
          { id: 'geo_kp1', name: '中国的地理位置', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'geo_kp2', name: '中国的疆域', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'geo_kp3', name: '中国的行政区划', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'geo_kp4', name: '中国的人口与民族', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
        { id: 'geo_ch2', name: '中国的自然环境', knowledge_points: [
          { id: 'geo_kp5', name: '中国的地形', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'geo_kp6', name: '中国的主要山脉', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'geo_kp7', name: '中国的气候', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'geo_kp8', name: '中国的河流与湖泊', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ]
    };
  }

  // 默认返回数学
  return getEmbeddedData('math', grade);
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

function loadHuikaoTree(subject) {
  const subjectMap = {
    'math': 'math',
    'biology': 'biology',
    'geography': 'geography',
    '数学': 'math',
    '生物': 'biology',
    '地理': 'geography'
  };
  const dbSubject = subjectMap[subject] || subject;

  const configs = [
    { grade: '7', semester: 'up' },
    { grade: '7', semester: 'down' },
    { grade: '8', semester: 'up' },
    { grade: '8', semester: 'down' }
  ];

  const mergedChapters = [];
  const dataDir = path.dirname(__dirname);

  for (const config of configs) {
    const dataFile = path.join(dataDir, 'data', `${dbSubject}-grade${config.grade}-${config.semester}.json`);
    try {
      if (fs.existsSync(dataFile)) {
        const content = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
        const chapters = content.chapters || [];
        chapters.forEach(ch => {
          mergedChapters.push({
            ...ch,
            source: `grade${config.grade}-${config.semester}`
          });
        });
      }
    } catch (e) {
      console.error(`[loadHuikaoTree] Failed to load ${dataFile}:`, e.message);
    }
  }

  return {
    subject: dbSubject,
    mode: 'huikao',
    grade: '7-8',
    chapters: mergedChapters
  };
}

function generateHuikaoPlan(tree, numQuestions) {
  const chapters = tree.chapters || [];
  const questionsPerChapter = Math.max(1, Math.floor(numQuestions / chapters.length));
  const plan = [];

  for (const chapter of chapters) {
    const kps = chapter.knowledge_points || [];
    for (const kp of kps) {
      if (plan.length < numQuestions) {
        plan.push({
          kp: {
            kp_id: kp.id,
            kp_name: kp.name,
            chapter_name: chapter.name,
            chapter_id: chapter.id,
            source: chapter.source
          },
          difficulty: 'medium'
        });
      }
    }
  }

  return shuffle(plan).slice(0, numQuestions);
}

module.exports = {
  loadKnowledgeTree,
  loadHuikaoTree,
  generateQuestionPlan,
  generateHuikaoPlan,
};
