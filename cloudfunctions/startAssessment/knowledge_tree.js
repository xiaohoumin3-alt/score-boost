/**
 * 知识树加载和题目规划
 */

const fs = require('fs');
const path = require('path');

function loadKnowledgeTree(subject, grade, semester = '下') {
  console.log('[loadKnowledgeTree] ========== 开始加载知识树 ==========');
  console.log('[loadKnowledgeTree] 输入参数:', { subject, grade, semester });

  // 微信云函数环境：data 目录已复制到 cloudfunctions/startAssessment/data/
  try {
    // 云函数环境：data 目录在云函数目录内
    const dataDir = __dirname;
    console.log('[loadKnowledgeTree] __dirname:', dataDir);

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

    console.log('[loadKnowledgeTree] 构建路径组件:', { subjectKey, grade, semesterKey });
    console.log('[loadKnowledgeTree] 目标文件路径:', dataFile);
    console.log('[loadKnowledgeTree] 文件是否存在:', fs.existsSync(dataFile));

    if (fs.existsSync(dataFile)) {
      const content = fs.readFileSync(dataFile, 'utf-8');
      const tree = JSON.parse(content);
      console.log('[loadKnowledgeTree] ✅ 从文件加载成功');
      console.log('[loadKnowledgeTree] tree信息:', {
        subject: tree.subject,
        grade: tree.grade,
        semester: tree.semester,
        chapters: tree.chapters?.length || 0,
        firstChapter: tree.chapters?.[0] ? {
          name: tree.chapters[0].name || tree.chapters[0].chapter_name,
          kpCount: tree.chapters[0].knowledge_points?.length || 0
        } : null
      });
      return tree;
    }

    console.log('[loadKnowledgeTree] ❌ 文件不存在，将使用默认数据');
    return getEmbeddedData(grade, subjectKey);
  } catch (e) {
    console.log('[loadKnowledgeTree] ❌ 加载失败，错误:', e.message);
    console.log('[loadKnowledgeTree] 将使用默认数据');
    return getEmbeddedData(grade, subject);
  }
}

function getEmbeddedData(grade, subject = 'math') {
  // 根据科目和年级返回默认数据
  console.log('[knowledge_tree] getEmbeddedData called with subject:', subject, 'grade:', grade);

  const subjectNames = {
    'math': '数学',
    'biology': '生物',
    'geography': '地理'
  };

  // 按年级组织的知识点数据
  const knowledgeByGrade = {
    math: {
      '1': [
        { id: 'ch1', name: '20以内加减法', knowledge_points: [
          { id: 'kp1_1', name: '10以内加减法', difficulty_weight: { easy: 0.6, medium: 0.3, hard: 0.1 } },
          { id: 'kp1_2', name: '20以内加减法', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
        { id: 'ch2', name: '认识图形', knowledge_points: [
          { id: 'kp2_1', name: '认识长方体', difficulty_weight: { easy: 0.6, medium: 0.3, hard: 0.1 } },
          { id: 'kp2_2', name: '认识正方体', difficulty_weight: { easy: 0.6, medium: 0.3, hard: 0.1 } },
        ]},
      ],
      '2': [
        { id: 'ch1', name: '100以内加减法', knowledge_points: [
          { id: 'kp1_1', name: '100以内加减法', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'kp1_2', name: '进位加法', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
        { id: 'ch2', name: '乘法口诀', knowledge_points: [
          { id: 'kp2_1', name: '乘法口诀', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'kp2_2', name: '乘法应用', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
        { id: 'ch3', name: '除法初步', knowledge_points: [
          { id: 'kp3_1', name: '除法的初步认识', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'kp3_2', name: '表内除法', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
        { id: 'ch4', name: '长度单位', knowledge_points: [
          { id: 'kp4_1', name: '厘米和米', difficulty_weight: { easy: 0.6, medium: 0.3, hard: 0.1 } },
          { id: 'kp4_2', name: '长度单位换算', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
        { id: 'ch5', name: '认识角', knowledge_points: [
          { id: 'kp5_1', name: '角的初步认识', difficulty_weight: { easy: 0.6, medium: 0.3, hard: 0.1 } },
          { id: 'kp5_2', name: '直角锐角钝角', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ],
      '3': [
        { id: 'ch1', name: '万以内加减法', knowledge_points: [
          { id: 'kp1_1', name: '万以内加减法', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
        { id: 'ch2', name: '多位数乘一位数', knowledge_points: [
          { id: 'kp2_1', name: '口算乘法', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'kp2_2', name: '笔算乘法', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
      ],
      '4': [
        { id: 'ch1', name: '大数的认识', knowledge_points: [
          { id: 'kp1_1', name: '亿以内数的认识', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
        { id: 'ch2', name: '三位数乘两位数', knowledge_points: [
          { id: 'kp2_1', name: '三位数乘两位数', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
      ],
      '5': [
        { id: 'ch1', name: '小数的意义和性质', knowledge_points: [
          { id: 'kp1_1', name: '小数的意义', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
        { id: 'ch2', name: '小数加减法', knowledge_points: [
          { id: 'kp2_1', name: '小数加减法', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
      ],
      '6': [
        { id: 'ch1', name: '分数乘法', knowledge_points: [
          { id: 'kp1_1', name: '分数乘法', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
        { id: 'ch2', name: '分数除法', knowledge_points: [
          { id: 'kp2_1', name: '分数除法', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
      ],
      '7': [
        { id: 'ch1', name: '有理数', knowledge_points: [
          { id: 'kp1_1', name: '正数和负数', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'kp1_2', name: '有理数', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
        { id: 'ch2', name: '整式的加减', knowledge_points: [
          { id: 'kp2_1', name: '整式', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'kp2_2', name: '整式的加减', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
      ],
      '8': [
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
        { id: 'ch3', name: '一次函数', knowledge_points: [
          { id: 'kp3_1', name: '一次函数', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
        { id: 'ch4', name: '平行四边形', knowledge_points: [
          { id: 'kp4_1', name: '平行四边形的性质', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
        { id: 'ch5', name: '全等三角形', knowledge_points: [
          { id: 'kp5_1', name: '全等三角形的判定', difficulty_weight: { easy: 0.3, medium: 0.5, hard: 0.2 } },
        ]},
      ],
      '9': [
        { id: 'ch1', name: '一元二次方程', knowledge_points: [
          { id: 'kp1_1', name: '一元二次方程的解法', difficulty_weight: { easy: 0.3, medium: 0.5, hard: 0.2 } },
        ]},
        { id: 'ch2', name: '二次函数', knowledge_points: [
          { id: 'kp2_1', name: '二次函数', difficulty_weight: { easy: 0.3, medium: 0.5, hard: 0.2 } },
        ]},
        { id: 'ch3', name: '圆', knowledge_points: [
          { id: 'kp3_1', name: '圆的性质', difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 } },
        ]},
      ],
    },
    biology: {
      '7': [
        { id: 'bio_ch1', name: '认识生物', knowledge_points: [
          { id: 'bio_kp1_1', name: '生物的特征', difficulty_weight: { easy: 0.6, medium: 0.3, hard: 0.1 } },
        ]},
        { id: 'bio_ch2', name: '生物圈是绿色植物', knowledge_points: [
          { id: 'bio_kp2_1', name: '藻类植物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ],
      '8': [
        { id: 'bio_ch1', name: '动物的主要类群', knowledge_points: [
          { id: 'bio_kp1_1', name: '腔肠动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp1_2', name: '扁形动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp1_3', name: '线形动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
          { id: 'bio_kp1_4', name: '环节动物', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ],
      '9': [
        { id: 'bio_ch1', name: '生物圈中的人', knowledge_points: [
          { id: 'bio_kp1_1', name: '人的营养', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ],
    },
    geography: {
      '7': [
        { id: 'geo_ch1', name: '地球和地图', knowledge_points: [
          { id: 'geo_kp1_1', name: '地球的形状和大小', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ],
      '8': [
        { id: 'geo_ch1', name: '从世界看中国', knowledge_points: [
          { id: 'geo_kp1_1', name: '中国的地理位置', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ],
      '9': [
        { id: 'geo_ch1', name: '世界地理', knowledge_points: [
          { id: 'geo_kp1_1', name: '世界地理概述', difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 } },
        ]},
      ],
    },
  };

  // 获取对应年级的知识点，回退到8年级
  const chapters = knowledgeByGrade[subject]?.[grade] || knowledgeByGrade[subject]?.['8'] || knowledgeByGrade.math['8'];

  return {
    subject: subjectNames[subject] || '数学',
    grade: grade,
    semester: '下',
    chapters: chapters
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
