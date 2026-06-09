const fs = require('fs');

const PRIMARY_SUBJECTS = ['chinese', 'math'];
const PRIMARY_GRADES = [1, 2, 3, 4, 5, 6];
const PRIMARY_SEMESTERS = ['up', 'down'];

const HIGH_SUBJECTS = ['chinese', 'math', 'physics', 'chemistry', 'biology', 'history', 'geography', 'politics'];

const SUBJECT_NAMES = {
  chinese: '语文',
  math: '数学',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
  history: '历史',
  geography: '地理',
  politics: '思想政治'
};

function generatePrimaryKnowledgePoints(subject, grade, semester) {
  const points = [];
  let id = 1;

  if (subject === 'chinese') {
    const chapters = [
      { name: '第一单元', topics: ['识字与写字', '汉语拼音', '课文阅读'] },
      { name: '第二单元', topics: ['口语交际', '看图说话', '阅读理解'] },
      { name: '第三单元', topics: ['古诗诵读', '日积月累', '写话练习'] }
    ];

    chapters.forEach((chapter, ci) => {
      chapter.topics.forEach(topic => {
        points.push({
          id: `${subject}-grade${grade}-${semester}-${ci + 1}-${id}`,
          name: topic,
          sub_topics: getChineseSubTopics(grade, topic),
          typical_questions: ['填空题', '选择题', '问答题'],
          difficulty_weight: { easy: 0.7 + grade * 0.05, medium: 0.3 - grade * 0.05, hard: 0 }
        });
        id++;
      });
    });

    return chapters.map((chapter, ci) => ({
      chapter_name: `${chapter.name}`,
      knowledge_points: points.slice(ci * 3, (ci + 1) * 3)
    }));
  }

  if (subject === 'math') {
    const chapters = [
      { name: '第一单元 数的认识', topics: ['认识数字', '数的大小比较', '加减法'] },
      { name: '第二单元 图形', topics: ['认识图形', '图形分类', '图形拼组'] },
      { name: '第三单元 应用', topics: ['应用题', '时间认识', '人民币'] }
    ];

    chapters.forEach((chapter, ci) => {
      chapter.topics.forEach(topic => {
        points.push({
          id: `${subject}-grade${grade}-${semester}-${ci + 1}-${id}`,
          name: topic,
          sub_topics: getMathSubTopics(grade, topic),
          typical_questions: ['计算题', '填空题', '应用题'],
          difficulty_weight: { easy: 0.7 + grade * 0.05, medium: 0.3 - grade * 0.05, hard: 0 }
        });
        id++;
      });
    });

    return chapters.map((chapter, ci) => ({
      chapter_name: chapter.name,
      knowledge_points: points.slice(ci * 3, (ci + 1) * 3)
    }));
  }
}

function getChineseSubTopics(grade, topic) {
  if (grade <= 2) {
    return ['基础概念', '简单应用'];
  }
  if (grade <= 4) {
    return ['基础概念', '阅读理解', '简单写作'];
  }
  return ['深度理解', '写作技巧', '综合应用'];
}

function getMathSubTopics(grade, topic) {
  if (grade <= 2) {
    return ['基础概念', '简单计算'];
  }
  if (grade <= 4) {
    return ['基础概念', '计算方法', '简单应用'];
  }
  return ['概念理解', '解题方法', '综合应用'];
}

function generateHighKnowledgePoints(subject, book) {
  const points = [];
  const chapterCount = getChapterCount(subject);
  const topicCount = 3;

  for (let ci = 1; ci <= chapterCount; ci++) {
    for (let ti = 1; ti <= topicCount; ti++) {
      points.push({
        id: `${subject}-high-${book}-${ci}-${ti}`,
        name: getTopicName(subject, ci, ti),
        sub_topics: getHighSubTopics(subject),
        typical_questions: getTypicalQuestions(subject),
        difficulty_weight: { easy: 0.2, medium: 0.5, hard: 0.3 }
      });
    }
  }

  const chapters = [];
  for (let ci = 1; ci <= chapterCount; ci++) {
    chapters.push({
      chapter_name: `第${ci}章 ${getChapterName(subject, ci)}`,
      knowledge_points: points.slice((ci - 1) * topicCount, ci * topicCount)
    });
  }

  return chapters;
}

function getChapterCount(subject) {
  const counts = {
    chinese: 5,
    math: 5,
    physics: 4,
    chemistry: 4,
    biology: 4,
    history: 4,
    geography: 4,
    politics: 4
  };
  return counts[subject] || 4;
}

function getTopicName(subject, chapter, topic) {
  const topics = {
    chinese: [['现代文阅读', '古代诗歌', '文言文'], ['文学常识', '写作技巧', '修辞手法'], ['阅读理解', '表达技巧', '名篇赏析'], ['现代文写作', '古诗文阅读', '语言运用'], ['作文训练', '诗词鉴赏', '文言文翻译']],
    math: [['集合', '函数概念', '函数性质'], ['三角函数', '三角恒等变换', '解三角形'], ['数列', '等差数列', '等比数列'], ['导数', '导数应用', '定积分'], ['立体几何', '解析几何', '概率统计']],
    physics: [['运动学', '匀变速运动', '自由落体'], ['牛顿定律', '受力分析', '动量守恒'], ['电场', '电势', '电容器'], ['磁场', '电磁感应', '交流电']],
    chemistry: [['物质结构', '元素周期律', '化学键'], ['化学反应速率', '化学平衡', '电化学'], ['有机化合物', '烃类', '烃的衍生物'], ['化学实验', '物质检验', '定量分析']],
    biology: [['细胞结构', '细胞代谢', '细胞分裂'], ['遗传定律', 'DNA复制', '基因表达'], ['生态系统', '种群群落', '生态平衡'], ['生命调节', '神经调节', '体液调节']],
    history: [['古代中国', '先秦时期', '秦汉帝国'], ['近代中国', '鸦片战争', '辛亥革命'], ['现代中国', '新中国成立', '改革开放'], ['世界史', '文艺复兴', '工业革命']],
    geography: [['地球运动', '经纬网', '时区计算'], ['大气环流', '气候类型', '天气系统'], ['水循环', '洋流', '水资源'], ['人口城市', '产业区位', '区域发展']],
    politics: [['经济生活', '商品货币', '价值规律'], ['政治生活', '公民权利', '政府职能'], ['文化生活', '文化传承', '文化创新'], ['生活与哲学', '唯物论', '辩证法']]
  };
  return topics[subject]?.[chapter - 1]?.[topic - 1] || `知识点${topic}`;
}

function getChapterName(subject, chapter) {
  const names = {
    chinese: ['现代文阅读', '文学常识', '古诗文鉴赏', '语言运用', '写作训练'],
    math: ['集合与函数', '三角函数', '数列', '导数', '立体几何'],
    physics: ['力学', '电磁学', '热学', '光学'],
    chemistry: ['物质结构', '化学反应', '有机化学', '化学实验'],
    biology: ['细胞生物学', '遗传与进化', '生态学', '生命调节'],
    history: ['古代史', '近代史', '现代史', '世界史'],
    geography: ['自然地理', '人文地理', '区域地理', '地理信息技术'],
    politics: ['经济生活', '政治生活', '文化生活', '生活与哲学']
  };
  return names[subject]?.[chapter - 1] || `章节${chapter}`;
}

function getHighSubTopics(subject) {
  const subs = {
    chinese: ['概念理解', '分析方法', '应用实践'],
    math: ['定义定理', '解题方法', '综合应用'],
    physics: ['物理概念', '公式推导', '应用计算'],
    chemistry: ['物质性质', '反应原理', '实验操作'],
    biology: ['基本概念', '生理过程', '实验探究'],
    history: ['历史事件', '因果分析', '评价方法'],
    geography: ['地理原理', '区域特征', '综合分析'],
    politics: ['理论概念', '实际应用', '分析评价']
  };
  return subs[subject] || ['概念', '方法', '应用'];
}

function getTypicalQuestions(subject) {
  if (subject === 'math' || subject === 'physics' || subject === 'chemistry') {
    return ['选择题', '填空题', '计算题', '证明题'];
  }
  return ['选择题', '填空题', '问答题', '材料分析题'];
}

function writeFile(subject, gradeOrBook, semester = null) {
  let filename, content;
  
  if (semester) {
    filename = `${subject}-grade${gradeOrBook}-${semester}.json`;
    const chapters = generatePrimaryKnowledgePoints(subject, gradeOrBook, semester);
    content = {
      subject: SUBJECT_NAMES[subject],
      grade: gradeOrBook,
      semester: semester === 'up' ? '上册' : '下册',
      version: '人教版',
      chapters: chapters
    };
  } else {
    filename = `${subject}-high-${gradeOrBook}.json`;
    const chapters = generateHighKnowledgePoints(subject, gradeOrBook);
    content = {
      subject: SUBJECT_NAMES[subject],
      grade: '高中',
      book: `必修${gradeOrBook}`,
      version: '人教版',
      chapters: chapters
    };
  }

  fs.writeFileSync(`data/${filename}`, JSON.stringify(content, null, 2));
  console.log(`Created: ${filename}`);
}

console.log('Generating primary school knowledge points...');
PRIMARY_SUBJECTS.forEach(subject => {
  PRIMARY_GRADES.forEach(grade => {
    PRIMARY_SEMESTERS.forEach(semester => {
      writeFile(subject, grade, semester);
    });
  });
});

console.log('\nGenerating high school knowledge points...');
HIGH_SUBJECTS.forEach(subject => {
  const bookCount = subject === 'chinese' || subject === 'math' ? 5 : 4;
  for (let book = 1; book <= bookCount; book++) {
    writeFile(subject, book);
  }
});

console.log('\nAll files generated successfully!');
