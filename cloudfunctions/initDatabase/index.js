/**
 * initDatabase 云函数
 * 功能：检查集合状态 + 冷启动初始化
 * 注意：微信云数据库索引需要在控制台手动创建
 */

// 测试环境不使用 wx-server-sdk
let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  // 测试环境，cloud 将在测试中传入
  cloud = null;
}

// 导入知识树（用于冷启动）
let loadKnowledgeTree;
try {
  const kt = require('../practice_v2/knowledge_tree');
  loadKnowledgeTree = kt.loadKnowledgeTree;
} catch (e) {
  // 测试环境，使用mock
  loadKnowledgeTree = null;
}

/**
 * 检查集合是否存在（微信云数据库自动创建集合）
 * @param {Object} db - 数据库实例
 */
async function checkCollections(db) {
  const collections = ['ai_question_pool', 'pregen_queue', 'user_question_history'];
  const results = {};

  for (const name of collections) {
    try {
      const result = await db.collection(name).count();
      results[name] = { exists: true, count: result.total };
      console.log(`[Collection] ${name} exists, count: ${result.total}`);
    } catch (e) {
      results[name] = { exists: false, error: e.message };
      console.log(`[Collection] ${name} not exists:`, e.message);
    }
  }

  return results;
}

/**
 * 检查 user_question_history 集合
 * 注意：微信云数据库不支持通过API创建索引，需要在控制台手动创建
 * @param {Object} db - 数据库实例
 */
async function checkUserQuestionHistoryTable(db) {
  try {
    const result = await db.collection('user_question_history').count();
    console.log('[Table] user_question_history exists, count:', result.total);
    return { success: true, exists: true, count: result.total };
  } catch (e) {
    console.log('[Table] user_question_history not exists:', e.message);
    return { success: true, exists: false, note: 'Collection will be created on first write' };
  }
}

/**
 * 冷启动：为所有知识点预生成初始题目
 * @param {Object} db - 数据库实例
 */
async function coldStartAiQuestions(db) {
  const tree = loadKnowledgeTree('math', '8', '下');

  // 扁平化所有知识点
  const allKps = [];
  function traverseKps(node) {
    if (node.kp_id) {
      allKps.push({ kp_id: node.kp_id, kp_name: node.kp_name, chapter: node.chapter });
    }
    if (node.children) {
      node.children.forEach(traverseKps);
    }
  }
  tree.forEach(traverseKps);

  console.log(`[ColdStart] Found ${allKps.length} knowledge points`);

  // 为每个 KP 的每个难度创建占位记录
  const difficulties = ['easy', 'medium', 'hard'];
  const batch = [];

  for (const kp of allKps) {
    for (const difficulty of difficulties) {
      batch.push({
        kp_id: kp.kp_id,
        difficulty: difficulty,
        question_type: 'choice',
        question: `[COLD_START] ${kp.kp_name} - ${difficulty} placeholder`,
        options: null,
        correct_answer: null,
        explanation: null,
        verified: false,
        created_at: new Date().toISOString(),
        is_placeholder: true
      });
    }
  }

  // 批量写入
  let created = 0;
  if (batch.length > 0) {
    try {
      const result = await db.collection('ai_question_pool').add({
        data: batch
      });
      created = batch.length;
      console.log(`[ColdStart] Created ${created} placeholder records`);
    } catch (e) {
      console.error('[ColdStart] Batch write error:', e);
      // 尝试单个写入
      for (const item of batch) {
        try {
          await db.collection('ai_question_pool').add({ data: item });
          created++;
        } catch (e2) {
          console.error('[ColdStart] Single write error:', e2);
        }
      }
    }
  }

  return { created, kp_count: allKps.length };
}

/**
 * 原有的集合检查功能
 */
async function checkCollectionExists(db, name) {
  try {
    const result = await db.collection(name).count();
    console.log(`Collection ${name} exists, count: ${result.total}`);
    return { exists: true, name, count: result.total };
  } catch (e) {
    console.log(`Collection ${name} not found:`, e.message);
    return { exists: false, name, error: e.message };
  }
}

/**
 * 初始化kp_request_log和generation_tasks集合
 * @param {Object} db - 数据库实例
 */
async function initLogCollections(db) {
  const collections = ['kp_request_log', 'generation_tasks', 'pregen_queue'];
  const results = [];

  for (const name of collections) {
    try {
      await db.collection(name).add({
        _id: '__init__',
        created_at: new Date(),
        note: '初始化标记，运行后可删除'
      });
      results.push(name);
      console.log(`[Init] Created ${name} collection`);
    } catch (e) {
      if (e.errCode === -1) {
        results.push(`${name} (already exists)`);
        console.log(`[Init] ${name} already exists`);
      } else {
        throw e;
      }
    }
  }

  return results;
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { action = 'full' } = event.data || event;

  try {
    console.log('=== initDatabase === action:', action);

    const results = {};

    if (action === 'initCollections') {
      // 初始化日志和任务集合
      const collections = await initLogCollections(db);
      return {
        success: true,
        results: { collections }
      };
    }

    if (action === 'full' || action === 'check') {
      // 检查集合状态
      const collections = await checkCollections(db);
      results.collections = collections;
    }

    if (action === 'full' || action === 'coldstart') {
      // 冷启动
      const coldStart = await coldStartAiQuestions(db);
      results.cold_start = coldStart;
    }

    if (action === 'full' || action === 'initQuestionPool') {
      // 检查 user_question_history 表
      const userHistory = await checkUserQuestionHistoryTable(db);
      results.user_question_history = userHistory;
    }

    if (action === 'full') {
      // 检查现有集合
      results.old_collections = {
        assessments: await checkCollectionExists(db, 'assessments'),
        practices: await checkCollectionExists(db, 'practices')
      };
    }

    return {
      success: true,
      action,
      results,
      note: 'Indexes must be created manually in Tencent CloudBase console'
    };

  } catch (e) {
    console.error('initDatabase error:', e);
    return {
      success: false,
      error: e.message || String(e)
    };
  }
};

// 导出供测试使用（保留exports.main）
Object.assign(exports, {
  checkCollections,
  coldStartAiQuestions,
  checkCollectionExists,
  checkUserQuestionHistoryTable,
  initLogCollections
});
