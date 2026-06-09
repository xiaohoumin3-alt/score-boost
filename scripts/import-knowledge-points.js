/**
 * 批量导入知识点 - 从data目录的JSON文件导入到数据库
 * 转换格式以匹配数据库schema
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function convertKpToDbFormat(jsonData, filePath) {
  const kpList = [];

  const fileName = path.basename(filePath, '.json');
  const [subject, gradeStr, semester] = fileName.split('-');
  const grade = gradeStr.replace('grade', '');

  for (const chapter of jsonData.chapters) {
    for (const kp of chapter.knowledge_points) {
      const kpRecord = {
        kp_id: kp.id,
        kp_name: kp.name,
        chapter: chapter.name,
        subject: jsonData.subject,
        grade: parseInt(grade),
        semester: semester,
        version: jsonData.version || '人教版',
        sub_topics: kp.sub_topics || [],
        typical_questions: kp.typical_questions || [],
        knowledge_context: '',
        related_concepts: [],
        typical_mistakes: [],
        difficulty_weight: kp.difficulty_weight || { easy: 0.5, medium: 0.3, hard: 0.2 },
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
  const files = fs.readdirSync(DATA_DIR);
  return files
    .filter(f => f.endsWith('.json'))
    .filter(f => {
      const excludeFiles = [
        'data.json'
      ];
      return !excludeFiles.includes(f);
    })
    .filter(f => {
      const match = f.match(/^(chinese|math|physics|chemistry|biology|geography|history|politics)-grade/);
      return match !== null;
    });
}

function main() {
  const files = getAllJsonFiles();
  console.log(`Found ${files.length} JSON files to import`);

  let totalKps = 0;
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const kpList = convertKpToDbFormat(jsonData, filePath);
    console.log(`${file}: ${kpList.length} knowledge points`);
    totalKps += kpList.length;
  }

  console.log(`\nTotal knowledge points to import: ${totalKps}`);
  console.log('\nFiles to import:');
  files.forEach(f => console.log(`  - ${f}`));

  return { files, totalKps };
}

if (require.main === module) {
  main();
}

module.exports = { convertKpToDbFormat, getAllJsonFiles };
