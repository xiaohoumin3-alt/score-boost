/**
 * 知识点同步云函数
 * 将 startAssessment/data/ 目录下的知识点 JSON 文件同步到 knowledge_points 数据库集合
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const fs = require('fs');
const path = require('path');

exports.main = async (event, context) => {
  const db = cloud.database();
  const dataDir = path.join(__dirname, '..', 'startAssessment', 'data');
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));

    for (const file of files) {
      const match = file.match(/^([a-z]+)-grade(\d+)-(up|down)\.json$/);
      if (!match) { skipped++; continue; }
      const [, subject, grade, semester] = match;

      try {
        const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
        const tree = JSON.parse(content);
        const chapters = tree.chapters || [];

        for (const ch of chapters) {
          for (const kp of (ch.knowledge_points || [])) {
            // Check if already exists
            const existing = await db.collection('knowledge_points')
              .where({ kp_id: kp.id || kp.kp_id, subject, grade })
              .limit(1)
              .get();

            if (existing.data && existing.data.length > 0) {
              skipped++;
              continue;
            }

            await db.collection('knowledge_points').add({
              data: {
                kp_id: kp.id || kp.kp_id,
                kp_name: kp.name || kp.kp_name,
                chapter_id: ch.id || ch.chapter_id || '',
                chapter_name: ch.name || ch.chapter_name || '',
                subject,
                grade,
                semester,
                difficulty_weight: kp.difficulty_weight || { easy: 0.5, medium: 0.3, hard: 0.2 },
                created_at: new Date().toISOString(),
              }
            });
            synced++;
          }
        }
      } catch (e) {
        console.error(`[sync] Failed for ${file}:`, e.message);
        errors++;
      }
    }

    return {
      success: true,
      data: { synced, skipped, errors, totalFiles: files.length }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
