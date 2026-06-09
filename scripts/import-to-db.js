const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function convertKpToDbFormat(jsonData, filePath) {
  const kpList = [];
  const fileName = path.basename(filePath, '.json');
  const parts = fileName.split('-');
  const subject = parts[0];

  let grade, semester, book;
  
  if (parts[1] === 'high') {
    grade = 10;
    book = parseInt(parts[2]);
    semester = `必修${book}`;
  } else {
    const gradeStr = parts[1];
    semester = parts[2];
    grade = parseInt(gradeStr.replace('grade', ''));
  }

  for (const chapter of jsonData.chapters) {
    for (const kp of chapter.knowledge_points) {
      const kpRecord = {
        kp_id: kp.id,
        kp_name: kp.name,
        chapter: chapter.chapter_name || chapter.name,
        subject: jsonData.subject,
        grade: grade,
        semester: semester,
        version: jsonData.version || '人教版',
        sub_topics: kp.sub_topics || [],
        typical_questions: kp.typical_questions || [],
        knowledge_context: kp.knowledge_context || '',
        related_concepts: kp.related_concepts || [],
        typical_mistakes: kp.typical_mistakes || [],
        difficulty_weight: kp.difficulty_weight || { easy: 0.5, "medium": 0.3, "hard": 0.2 },
        source: 'jiaocai_import',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      kpList.push(kpRecord);
    }
  }

  return kpList;
}

function getAllJsonFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    return [];
  }

  const files = fs.readdirSync(DATA_DIR);
  return files
    .filter(f => f.endsWith('.json'))
    .filter(f => !f.startsWith('_'));
}

function main() {
  console.log('='.repeat(60));
  console.log('知识点批量导入工具');
  console.log('='.repeat(60));
  console.log('');

  const files = getAllJsonFiles();
  console.log(`找到 ${files.length} 个JSON文件\n`);

  let totalKps = 0;
  const allKps = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    try {
      const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const kpList = convertKpToDbFormat(jsonData, filePath);
      console.log(`[OK] ${file}: ${kpList.length} 个知识点`);
      totalKps += kpList.length;
      allKps.push(...kpList);
    } catch (e) {
      console.error(`[ERROR] ${file}: ${e.message}`);
    }
  }

  console.log('');
  console.log('-'.repeat(60));
  console.log(`总计: ${files.length} 个文件, ${totalKps} 个知识点`);
  console.log('-'.repeat(60));

  console.log('\n数据预览 (前5条):');
  console.log(JSON.stringify(allKps.slice(0, 5), null, 2));

  const outputPath = path.join(DATA_DIR, '_all_knowledge_points.json');
  fs.writeFileSync(outputPath, JSON.stringify(allKps, null, 2));
  console.log(`\n已保存所有知识点到: ${outputPath}`);

  console.log('\n下一步操作:');
  console.log('1. 在微信开发者工具中部署 cloudfunctions/batchInjectKnowledge');
  console.log('2. 调用该云函数导入数据到数据库');
  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = { convertKpToDbFormat, getAllJsonFiles };
