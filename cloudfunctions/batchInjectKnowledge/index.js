/**
 * 批量导入知识点到数据库 - 分批导入版
 *
 * 参数说明：
 * - test: true -> 导入3条测试数据
 * - importAll: true -> 导入全部326条知识点
 * - batch: true + start:0 + limit:100 -> 导入第0-100条
 * - batch: true + start:100 + limit:100 -> 导入第100-200条
 * - batch: true + start:200 + limit:100 -> 导入第200-300条
 * - batch: true + start:300 + limit:100 -> 导入第300-326条
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TEST_DATA = [
  { kp_id: 'test_kp1', kp_name: '二次根式的概念', chapter: '第十六章 二次根式', subject: '数学', grade: 8, semester: 'down', version: '人教版', sub_topics: ['二次根式的定义'], typical_questions: ['选择题'], knowledge_context: '二次根式定义', related_concepts: [], typical_mistakes: [], difficulty_weight: { easy: 0.5, medium: 0.3, hard: 0.2 }, source: 'jiaocai_import' },
  { kp_id: 'test_kp2', kp_name: '勾股定理', chapter: '第十七章 勾股定理', subject: '数学', grade: 8, semester: 'down', version: '人教版', sub_topics: ['勾股定理'], typical_questions: ['选择题'], knowledge_context: '勾股定理', related_concepts: [], typical_mistakes: [], difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 }, source: 'jiaocai_import' },
  { kp_id: 'test_kp3', kp_name: '光合作用', chapter: '绿色植物与生物圈', subject: '生物', grade: 7, semester: 'down', version: '人教版', sub_topics: ['光合作用'], typical_questions: ['选择题'], knowledge_context: '光合作用', related_concepts: [], typical_mistakes: [], difficulty_weight: { easy: 0.4, medium: 0.4, hard: 0.2 }, source: 'jiaocai_import' }
];

let ALL_KP_DATA = null;
try {
  ALL_KP_DATA = require('./kp-data.js');
} catch (e) {}

async function importData(db, collection, kpData) {
  let added = 0, updated = 0, errors = 0;

  for (const kp of kpData) {
    try {
      const exist = await collection.where({ kp_id: kp.kp_id }).limit(1).get();
      if (exist.data && exist.data.length > 0) {
        await collection.doc(exist.data[0]._id).update({
          data: {
            kp_name: kp.kp_name, chapter: kp.chapter, subject: kp.subject,
            grade: kp.grade, semester: kp.semester, version: kp.version,
            sub_topics: kp.sub_topics, typical_questions: kp.typical_questions,
            knowledge_context: kp.knowledge_context || '',
            related_concepts: kp.related_concepts || [],
            typical_mistakes: kp.typical_mistakes || [],
            difficulty_weight: kp.difficulty_weight,
            source: kp.source, updated_at: new Date().toISOString()
          }
        });
        updated++;
      } else {
        await collection.add({
          data: { ...kp, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        });
        added++;
      }
    } catch (e) {
      errors++;
    }
  }
  return { added, updated, errors };
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const collection = db.collection('knowledge_points');

  let kpData = [];

  if (event.test === true) {
    kpData = TEST_DATA;
  } else if (event.importAll === true) {
    if (!ALL_KP_DATA) return { success: false, error: 'kp-data.js not found' };
    kpData = ALL_KP_DATA;
  } else if (event.batch === true) {
    if (!ALL_KP_DATA) return { success: false, error: 'kp-data.js not found' };
    const start = parseInt(event.start) || 0;
    const limit = parseInt(event.limit) || 100;
    kpData = ALL_KP_DATA.slice(start, Math.min(start + limit, ALL_KP_DATA.length));
  } else {
    return { success: false, error: 'Invalid parameters', usage: ['{"test": true}', '{"importAll": true}', '{"batch": true, "start": 0, "limit": 100}'] };
  }

  console.log(`Importing ${kpData.length} items...`);
  const result = await importData(db, collection, kpData);

  return { success: true, total: kpData.length, ...result };
};
