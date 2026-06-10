/**
 * 数据库集合初始化脚本
 * 检查并创建必要的数据库集合
 */

const cloud = require('wx-server-sdk');

async function initCollections() {
  // 初始化（需要提供环境ID或使用 DYNAMIC_CURRENT_ENV）
  const envId = process.env.TCB_ENV || 'cloud1-7gg9y9tjb2b867b6';
  cloud.init({ env: envId });
  const db = cloud.database();

  console.log(`[initCollections] Using env: ${envId}`);

  // 需要创建的集合列表
  const collections = [
    'user_points',           // 用户积分
    'point_records',         // 积分记录
    'invite_records',        // 邀请记录
    'practices',             // 练习会话
    'ai_question_pool',      // AI题目池
    'kp_progress',           // 知识点进度
    'knowledge_points',      // 知识点
    'assessments',           // 评估记录
    'question_queue',        // 题目生成队列
    'student_memory',        // 学生记忆
    'pregen_queue',          // 预生成队列
    'generation_tasks',      // 生成任务
    'user_feedback',         // 用户反馈
    'admin_materials',       // 管理素材
  ];

  const results = [];

  for (const name of collections) {
    try {
      // 尝试查询集合（检查是否存在）
      await db.collection(name).limit(1).get();
      console.log(`[initCollections] ✓ ${name} exists`);
      results.push({ name, status: 'exists' });
    } catch (e) {
      if (e.errCode === -1 || e.errMsg?.includes('collection not exists')) {
        try {
          // 创建集合
          await db.createCollection(name);
          console.log(`[initCollections] ✓ Created ${name}`);
          results.push({ name, status: 'created' });
        } catch (createErr) {
          console.error(`[initCollections] ✗ Failed to create ${name}:`, createErr);
          results.push({ name, status: 'failed', error: createErr.message });
        }
      } else {
        console.error(`[initCollections] ✗ Error checking ${name}:`, e);
        results.push({ name, status: 'error', error: e.message });
      }
    }
  }

  console.log('[initCollections] Summary:', results);
  return results;
}

// 如果直接运行此脚本
if (require.main === module) {
  initCollections()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { initCollections };
