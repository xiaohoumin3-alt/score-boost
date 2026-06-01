/**
 * 知识树加载和题目规划
 */

const fs = require('fs');
const path = require('path');

function loadKnowledgeTree(subject, grade, semester = '下') {
  console.log('[loadKnowledgeTree] 输入参数:', { subject, grade, semester });

  // 微信云函数环境：从云存储或本地打包文件读取
  try {
    // data目录在项目根目录，需要从cloudfunctions/startAssessment向上两级
    const dataDir = path.join(__dirname, '..', '..');
    // 科目映射
    const subjectMap = {
      'math': 'math',
      '数学': 'math',
      'biology': 'biology',
      '生物': 'biology',
      'geography': 'geography',
      '地理': 'geography'
    };
    // 学期映射：中文转英文
    const semesterMap = {
      '上': 'up',
      'up': 'up',
      '下': 'down',
      'down': 'down'
    };
    const subjectKey = subjectMap[subject] || 'math';
    const semesterKey = semesterMap[semester] || semester;
    const dataFile = path.join(dataDir, 'data', `${subjectKey}-grade${grade}-${semesterKey}.json`);

    console.log('[loadKnowledgeTree] 文件路径:', dataFile);
    console.log('[loadKnowledgeTree] 文件是否存在:', fs.existsSync(dataFile));

    if (fs.existsSync(dataFile)) {
      const content = fs.readFileSync(dataFile, 'utf-8');
      const tree = JSON.parse(content);
      console.log('[loadKnowledgeTree] 从文件加载成功:', { subject: tree.subject, grade: tree.grade, chapters: tree.chapters?.length });
      return tree;
    }

    console.log('[loadKnowledgeTree] 文件不存在，使用默认数据');
    return getEmbeddedData(grade, subjectKey);
  } catch (e) {
    console.log('[loadKnowledgeTree] 加载失败，使用默认数据:', e.message);
    return getEmbeddedData(grade, subject);
  }
}

function getEmbeddedData(grade, subject = 'math') {
  // 根据科目返回默认数据
  console.log('[knowledge_tree] getEmbeddedData called with subject:', subject, 'grade:', grade);

  const subjectNames = {
    'math': '数学',
    'biology': '生物',
    'geography': '地理'
  };

  const chaptersBySubject = {
    'math': [
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
    ],
    'biology': [
      { id: 'bio_ch1', name: '动物的主要类群', knowledge_points: [
        { id: 'bio_kp1_1', name: '腔肠动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'bio_kp1_2', name: '扁形动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'bio_kp1_3', name: '线形动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'bio_kp1_4', name: '环节动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'bio_kp2_1', name: '鱼类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'bio_kp2_2', name: '两栖类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'bio_kp2_3', name: '爬行类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'bio_kp2_4', name: '鸟类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'bio_kp2_5', name: '哺乳类', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
      ]},
      { id: 'bio_ch2', name: '动物的运动和行为', knowledge_points: [
        { id: 'bio_kp3_1', name: '动物的运动', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'bio_kp3_2', name: '动物的行为', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
      ]},
    ],
    'geography': [
      { id: 'geo_ch1', name: '中国的疆域与行政区划', knowledge_points: [
        { id: 'geo_kp1_1', name: '中国的地理位置', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'geo_kp1_2', name: '中国的疆域', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'geo_kp1_3', name: '中国的行政区划', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'geo_kp1_4', name: '中国的人口与民族', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
      ]},
      { id: 'geo_ch2', name: '中国的自然环境', knowledge_points: [
        { id: 'geo_kp2_1', name: '中国的地形', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'geo_kp2_2', name: '中国的气候', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        { id: 'geo_kp2_3', name: '中国的河流与湖泊', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
      ]},
    ]
  };

  return {
    subject: subjectNames[subject] || '数学',
    grade: grade,
    semester: '下',
    chapters: chaptersBySubject[subject] || chaptersBySubject['math']
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

  console.log('[generateQuestionPlan] tree.subject:', tree.subject, 'tree.chapters:', tree.chapters?.length);

  // 根据 tree.subject 确定科目
  const subjectMap = {
    '数学': 'math',
    '生物': 'biology',
    '地理': 'geography'
  };
  const planSubject = subjectMap[tree.subject] || 'math';

  console.log('[generateQuestionPlan] planSubject:', planSubject);

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
        subject: planSubject,
      });
    }
  }

  console.log('[generateQuestionPlan] collected', allKps.length, 'knowledge points');
  console.log('[generateQuestionPlan] sample kp_ids:', allKps.slice(0, 3).map(kp => kp.kp_id));

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
 * 加载会考模式知识树（跨年级）
 * @param {string} subject - 科目
 * @param {string} examType - 考试类型 'huikao' | 'zhongkao' | 'gaokao'
 * @returns {object} 合并后的知识树
 */
function loadExamKnowledgeTree(subject, examType = 'huikao') {
  console.log('[loadExamKnowledgeTree] 输入参数:', { subject, examType });

  const subjectMap = {
    'math': 'math',
    '数学': 'math',
    'biology': 'biology',
    '生物': 'biology',
    'geography': 'geography',
    '地理': 'geography'
  };
  const subjectKey = subjectMap[subject] || 'biology';

  // 根据考试类型确定年级范围
  let grades = [];
  if (examType === 'huikao') {
    // 会考：七、八年级
    grades = ['7', '8'];
  } else if (examType === 'zhongkao') {
    // 中考：七、八、九年级
    grades = ['7', '8', '9'];
  } else if (examType === 'gaokao') {
    // 高考：高一、二、三年级（暂时用10、11、12表示）
    grades = ['10', '11', '12'];
  }

  const semesters = ['up', 'down'];
  const allChapters = [];
  const chapterIdMap = new Set(); // 防止章节ID重复

  // 遍历所有年级和学期，合并知识点
  for (const grade of grades) {
    for (const semester of semesters) {
      try {
        const tree = loadKnowledgeTree(subjectKey, grade, semester);
        if (tree && tree.chapters) {
          // 为每个章节添加年级和学期标识，避免ID冲突
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

  const subjectNames = {
    'math': '数学',
    'biology': '生物',
    'geography': '地理'
  };

  const result = {
    subject: subjectNames[subjectKey] || subject,
    exam_type: examType,
    grade_range: grades,
    chapters: allChapters,
    total_chapters: allChapters.length
  };

  console.log('[loadExamKnowledgeTree] 合并完成:', {
    subject: result.subject,
    examType: examType,
    gradeRange: grades,
    totalChapters: allChapters.length
  });

  return result;
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
  // 会考模式：简单、中等、困难按 3:4:3 分布
  const difficultyDistribution = { easy: 0.3, medium: 0.4, hard: 0.3 };
  return generateQuestionPlan(tree, numQuestions, difficultyDistribution);
}

module.exports = {
  loadKnowledgeTree,
  loadExamKnowledgeTree,
  loadHuikaoTree,
  generateQuestionPlan,
  generateHuikaoPlan,
};
