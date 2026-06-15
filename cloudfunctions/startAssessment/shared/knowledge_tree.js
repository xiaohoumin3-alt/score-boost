/**
 * 知识树加载和题目规划
 * 
 * 合并来源：
 *   - practice_v2/knowledge_tree.js (loadKnowledgeTreeFromDb, 完整科目映射)
 *   - startAssessment/knowledge_tree.js (loadExamKnowledgeTree)
 */

const fs = require('fs');
const path = require('path');

function loadKnowledgeTree(subject, grade, semester = '下') {
  // 微信云函数环境：从云存储或本地打包文件读取
  const subjectMap = {
    'math': 'math', '数学': 'math',
    'biology': 'biology', '生物': 'biology',
    'geography': 'geography', '地理': 'geography',
    'chinese': 'chinese', '语文': 'chinese',
    'english': 'english', '英语': 'english',
    'physics': 'physics', '物理': 'physics',
    'chemistry': 'chemistry', '化学': 'chemistry',
    'history': 'history', '历史': 'history',
    'politics': 'politics', '政治': 'politics'
  };
  const semesterMap = { '上': 'up', 'up': 'up', '下': 'down', 'down': 'down' };
  const dbSubject = subjectMap[subject] || subject || 'math';
  const semesterKey = semesterMap[semester] || semester;

  try {
    // 修复：直接使用__dirname（shared目录）而不是其父目录
    const dataDir = __dirname;
    // 尝试加载科目对应的数据文件
    const dataFile = path.join(dataDir, 'data', `${dbSubject}-grade${grade}-${semesterKey}.json`);

    if (fs.existsSync(dataFile)) {
      const content = fs.readFileSync(dataFile, 'utf-8');
      return JSON.parse(content);
    }

    // 回退到内嵌数据，根据科目返回不同知识树
    const embedded = getEmbeddedData(dbSubject, grade);
    if (embedded && embedded.chapters && embedded.chapters.length > 0) {
      return embedded;
    }

    // 内嵌数据也没有，返回空树（调用方会处理）
    return { subject: dbSubject, grade, semester, chapters: [] };
  } catch (e) {
    return getEmbeddedData(dbSubject, grade) || { subject: dbSubject, grade, semester, chapters: [] };
  }
}

/**
 * 从数据库动态加载知识树（异步版本）
 * 用于没有内嵌数据的科目
 */
async function loadKnowledgeTreeFromDb(db, subject, grade) {
  try {
    const subjectMap = {
      'math': 'math', '数学': 'math',
      'biology': 'biology', '生物': 'biology',
      'geography': 'geography', '地理': 'geography',
      'chinese': 'chinese', '语文': 'chinese',
      'english': 'english', '英语': 'english',
      'physics': 'physics', '物理': 'physics',
      'chemistry': 'chemistry', '化学': 'chemistry',
      'history': 'history', '历史': 'history',
      'politics': 'politics', '政治': 'politics'
    };
    const dbSubject = subjectMap[subject] || subject;

    const result = await db.collection('knowledge_points')
      .where({ subject: dbSubject })
      .limit(100)
      .get();

    if (!result.data || result.data.length === 0) {
      return null;
    }

    // 按 chapter 分组
    const chapterMap = {};
    for (const kp of result.data) {
      const chId = kp.chapter_id || kp.chapter || 'default';
      const chName = kp.chapter || kp.chapter_name || '未分类';
      if (!chapterMap[chId]) {
        chapterMap[chId] = { id: chId, name: chName, knowledge_points: [] };
      }
      chapterMap[chId].knowledge_points.push({
        id: kp.kp_id,
        name: kp.kp_name,
        difficulty_weight: kp.difficulty_weight || { easy: 0.5, medium: 0.3, hard: 0.2 }
      });
    }

    return {
      subject: dbSubject,
      grade: grade,
      chapters: Object.values(chapterMap)
    };
  } catch (e) {
    console.error('[loadKnowledgeTreeFromDb] Error:', e.message);
    return null;
  }
}

function getEmbeddedData(subject, grade) {
  // 兼容旧版单参数调用（grade 作为第一个参数传入）
  if (arguments.length === 1 && typeof subject !== 'string') {
    grade = subject;
    subject = 'math';
  }

  // 数学知识树（覆盖 8 年级下）
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

  // 生物知识树（覆盖 7 年级下）
  if (subject === 'biology') {
    return {
      subject: 'biology',
      grade: grade,
      semester: '下',
      chapters: [
        { id: 'bio_ch1', name: '动物的主要类群', knowledge_points: [
          { id: 'bio_kp1', name: '腔肠动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp2', name: '扁形动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ]
    };
  }

  // 其他科目暂无内嵌数据
  return null;
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

  // 空树时直接返回空数组
  if (!tree || !tree.chapters || tree.chapters.length === 0) {
    return [];
  }

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

  // 没有知识点时返回空数组
  if (allKps.length === 0) {
    return [];
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

/**
 * 加载考试知识树（合并多个年级）
 * @param {string} subject - 科目
 * @param {string} examType - 考试类型: huikao | zhongkao | gaokao
 * @returns {Object} 合并后的知识树
 */
function loadExamKnowledgeTree(subject, examType = 'huikao') {
  const subjectMap = {
    'math': 'math', '数学': 'math',
    'biology': 'biology', '生物': 'biology',
    'geography': 'geography', '地理': 'geography',
    'chinese': 'chinese', '语文': 'chinese',
    'english': 'english', '英语': 'english',
    'physics': 'physics', '物理': 'physics',
    'chemistry': 'chemistry', '化学': 'chemistry',
    'history': 'history', '历史': 'history',
    'politics': 'politics', '政治': 'politics'
  };
  const subjectKey = subjectMap[subject] || 'biology';

  // 根据考试类型确定年级范围
  let grades = [];
  if (examType === 'huikao') {
    grades = ['7', '8'];
  } else if (examType === 'zhongkao') {
    grades = ['7', '8', '9'];
  } else if (examType === 'gaokao') {
    grades = ['10', '11', '12'];
  }

  const semesters = ['up', 'down'];
  const allChapters = [];

  // 遍历所有年级和学期，合并知识点
  for (const grade of grades) {
    for (const semester of semesters) {
      try {
        const tree = loadKnowledgeTree(subjectKey, grade, semester);
        if (tree && tree.chapters) {
          const prefixedChapters = tree.chapters.map(chapter => ({
            ...chapter,
            id: `${grade}_${semester}_${chapter.id}`,
            grade: grade,
            semester: semester
          }));
          allChapters.push(...prefixedChapters);
        }
      } catch (e) {
        console.log(`[loadExamKnowledgeTree] 跳过不存在的数据: ${subjectKey}-grade${grade}-${semester}`);
      }
    }
  }

  return {
    subject: subjectKey,
    exam_type: examType,
    grade_range: grades,
    chapters: allChapters,
    total_chapters: allChapters.length
  };
}

/**
 * 加载会考知识树（别名函数，兼容 index.js）
 */
function loadHuikaoTree(subject) {
  return loadExamKnowledgeTree(subject, 'huikao');
}

/**
 * 生成会考模式题目计划
 */
function generateHuikaoPlan(tree, numQuestions) {
  const difficultyDistribution = { easy: 0.3, medium: 0.4, hard: 0.3 };
  return generateQuestionPlan(tree, numQuestions, difficultyDistribution);
}

module.exports = {
  loadKnowledgeTree,
  loadKnowledgeTreeFromDb,
  loadExamKnowledgeTree,
  loadHuikaoTree,
  generateQuestionPlan,
  generateHuikaoPlan,
};
