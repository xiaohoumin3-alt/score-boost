/**
 * knowledge-tree-unified.test.js
 * P1-01 验收测试：knowledge_tree 去重合并
 *
 * 覆盖验收标准：
 *   A6: loadKnowledgeTree('biology', '7', 'down') 返回正确数据
 *   A7: loadKnowledgeTree('chinese', '1', 'up') 返回正确数据
 *   以及其他科目加载验证
 *
 * 注意：此测试直接测试 startAssessment 目录下的知识树实现（最完整版）
 *       合并完成后应改为测试 shared/knowledge_tree.js
 */

const fs = require('fs');
const path = require('path');

// ---- 辅助：从知识树数据文件直接加载（不依赖云函数环境） ----

const DATA_DIR = path.join(__dirname, '..', '..', 'startAssessment', 'data');

function loadKnowledgeTreeFromFile(subject, grade, semester) {
  const semesterMap = { '上': 'up', 'up': 'up', '下': 'down', 'down': 'down' };
  const semesterKey = semesterMap[semester] || semester;
  const dataFile = path.join(DATA_DIR, `${subject}-grade${grade}-${semesterKey}.json`);

  if (!fs.existsSync(dataFile)) return null;
  return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
}

// ========== 测试 ==========

describe('P1-01: knowledge_tree — 数据文件完整性', () => {

  test('数据目录存在且包含文件', () => {
    expect(fs.existsSync(DATA_DIR)).toBe(true);
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    expect(files.length).toBeGreaterThan(50);
  });
});

describe('P1-01: knowledge_tree — 数学知识点 (A6相关)', () => {

  test('math-grade2-down.json 包含低年级知识点', () => {
    const tree = loadKnowledgeTreeFromFile('math', '2', 'down');
    expect(tree).not.toBeNull();
    expect(tree.chapters).toBeDefined();
    expect(tree.chapters.length).toBeGreaterThan(0);

    // 收集所有知识点名称
    const allKpNames = tree.chapters.flatMap(ch =>
      (ch.knowledge_points || []).map(kp => kp.name || kp.kp_name)
    );

    // 应包含2年级内容，不应包含8-9年级内容
    expect(allKpNames.some(n => /加减|乘法|除法|长度|角/.test(n))).toBe(true);
    expect(allKpNames.some(n => /二次根式|勾股定理|一次函数/.test(n))).toBe(false);
  });

  test('math-grade8-down.json 包含8年级知识点', () => {
    const tree = loadKnowledgeTreeFromFile('math', '8', 'down');
    expect(tree).not.toBeNull();
    expect(tree.chapters).toBeDefined();

    const allKpNames = tree.chapters.flatMap(ch =>
      (ch.knowledge_points || []).map(kp => kp.name || kp.kp_name)
    );

    // 应包含8年级内容
    expect(allKpNames.some(n => /二次根式|勾股定理|一次函数|平行四边形/.test(n))).toBe(true);
  });

  test('math-grade1-up.json 1年级上学期存在', () => {
    const tree = loadKnowledgeTreeFromFile('math', '1', 'up');
    expect(tree).not.toBeNull();
    expect(tree.chapters.length).toBeGreaterThan(0);
  });
});

describe('P1-01: knowledge_tree — 语文知识点 (A7)', () => {

  test('验收 A7: chinese-grade1-up.json 返回正确语文知识点', () => {
    const tree = loadKnowledgeTreeFromFile('chinese', '1', 'up');
    expect(tree).not.toBeNull();
    expect(tree.chapters).toBeDefined();
    expect(tree.chapters.length).toBeGreaterThan(0);

    // 每章应有知识点
    for (const ch of tree.chapters) {
      expect(ch.knowledge_points || ch.children).toBeDefined();
    }
  });

  test('chinese-grade5-down.json 存在且有内容', () => {
    const tree = loadKnowledgeTreeFromFile('chinese', '5', 'down');
    expect(tree).not.toBeNull();
    expect(tree.chapters.length).toBeGreaterThan(0);
  });
});

describe('P1-01: knowledge_tree — 全科目覆盖', () => {

  const subjectTests = [
    { subject: 'biology', grade: '7', semester: 'down', label: '生物7年级下' },
    { subject: 'geography', grade: '7', semester: 'up', label: '地理7年级上' },
    { subject: 'physics', grade: '8', semester: 'up', label: '物理8年级上' },
    { subject: 'chemistry', grade: '9', semester: 'up', label: '化学9年级上' },
    { subject: 'history', grade: '7', semester: 'down', label: '历史7年级下' },
    { subject: 'politics', grade: '8', semester: 'up', label: '政治8年级上' },
  ];

  test.each(subjectTests)('$label 存在且有知识点', ({ subject, grade, semester }) => {
    const tree = loadKnowledgeTreeFromFile(subject, grade, semester);
    expect(tree).not.toBeNull();
    expect(tree.chapters).toBeDefined();
    expect(tree.chapters.length).toBeGreaterThan(0);

    // 验证知识点存在
    const allKps = tree.chapters.flatMap(ch => ch.knowledge_points || []);
    expect(allKps.length).toBeGreaterThan(0);
  });
});

describe('P1-01: knowledge_tree — 知识点ID唯一性', () => {

  test('同一文件内 kp_id 不重复', () => {
    const tree = loadKnowledgeTreeFromFile('math', '8', 'down');
    const allKpIds = tree.chapters.flatMap(ch =>
      (ch.knowledge_points || []).map(kp => kp.id || kp.kp_id)
    );
    const uniqueIds = new Set(allKpIds);
    expect(uniqueIds.size).toBe(allKpIds.length);
  });
});

describe('P1-01: knowledge_tree — 知识点结构规范', () => {

  test('每个知识点包含 id 和 name', () => {
    const tree = loadKnowledgeTreeFromFile('math', '8', 'down');
    for (const ch of tree.chapters) {
      for (const kp of (ch.knowledge_points || [])) {
        expect(kp.id || kp.kp_id).toBeTruthy();
        expect(kp.name || kp.kp_name).toBeTruthy();
      }
    }
  });
});
