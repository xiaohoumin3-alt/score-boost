/**
 * seedIRTData 云函数
 * 将预生成的 IRT 种子数据导入 ai_question_pool
 * 为每道题预设 IRT 参数 (irt_a, irt_b)，使模型从第一天就有真实参数
 *
 * 使用方式：
 * 1. 将 data/irt-seed-questions.json 上传到云存储
 * 2. 调用此云函数，传入 { action: 'import', seed_data: [...] }
 * 3. 或传入 { action: 'status' } 查看导入状态
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { action = 'import' } = event;
  const db = cloud.database();
  const _ = db.command;

  if (action === 'status') {
    // 查询当前 IRT 参数覆盖情况
    const total = await db.collection('ai_question_pool').count();
    const withIRT = await db.collection('ai_question_pool')
      .where({ irt_a: _.exists(true) })
      .count();
    const bySource = {};

    // 采样统计
    const sample = await db.collection('ai_question_pool')
      .where({ irt_a: _.exists(true) })
      .limit(100)
      .field({ irt_source: true, irt_a: true, irt_b: true, subject: true, grade: true })
      .get();

    for (const q of sample.data) {
      const src = q.irt_source || 'unknown';
      bySource[src] = (bySource[src] || 0) + 1;
    }

    return {
      success: true,
      data: {
        totalQuestions: total.total,
        withIRT: withIRT.total,
        coveragePercent: total.total > 0 ? Math.round(withIRT.total / total.total * 100) : 0,
        sourceBreakdown: bySource,
      }
    };
  }

  if (action === 'import') {
    const seedData = event.seed_data || [];
    if (seedData.length === 0) {
      return { success: false, error: 'No seed data provided' };
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // 分批导入（云数据库一次最多写 20 条）
    for (let i = 0; i < seedData.length; i += 20) {
      const batch = seedData.slice(i, i + 20);

      for (const seed of batch) {
        try {
          // 检查是否已存在相同 kp_id + difficulty 的题目
          const existing = await db.collection('ai_question_pool')
            .where({
              kp_id: seed.kp_id,
              difficulty: seed.difficulty,
              irt_a: _.exists(true),
            })
            .count();

          if (existing.total > 0) {
            skipped++;
            continue;
          }

          // 写入种子题目
          await db.collection('ai_question_pool').add({
            data: {
              question: `[种子题目] ${seed.kp_name} - ${seed.difficulty}难度`,
              options: ['选项A', '选项B', '选项C', '选项D'],
              correct_answer: 'A',
              kp_id: seed.kp_id,
              kp_name: seed.kp_name,
              difficulty: seed.difficulty,
              explanation: '',
              question_type: 'choice',
              subject: seed.subject,
              grade: seed.grade,
              chapter: seed.chapter || '',
              source: 'irt_seed',
              verified: false,
              schema_version: '2.0',
              // IRT 参数
              irt_a: seed.irt_a,
              irt_b: seed.irt_b,
              irt_source: seed.irt_source || 'research_based',
              // 统计字段
              usage_count: 0,
              correct_count: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          });
          imported++;
        } catch (e) {
          errors++;
          console.warn('[seedIRTData] Failed to import seed:', seed.kp_id, e.message);
        }
      }
    }

    return {
      success: true,
      data: { imported, skipped, errors, total: seedData.length }
    };
  }

  if (action === 'updateIRT') {
    // 批量更新已有题目的 IRT 参数
    const seedData = event.seed_data || [];
    let updated = 0;

    for (const seed of seedData) {
      try {
        const result = await db.collection('ai_question_pool')
          .where({
            kp_id: seed.kp_id,
            difficulty: seed.difficulty,
          })
          .update({
            data: {
              irt_a: seed.irt_a,
              irt_b: seed.irt_b,
              irt_source: seed.irt_source || 'research_based',
              irt_updated_at: new Date().toISOString(),
            }
          });
        updated += result.stats.updated;
      } catch (e) {
        console.warn('[seedIRTData] Failed to update:', seed.kp_id, e.message);
      }
    }

    return {
      success: true,
      data: { updated, total: seedData.length }
    };
  }

  return { success: false, error: `Unknown action: ${action}` };
};
