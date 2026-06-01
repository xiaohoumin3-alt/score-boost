/**
 * configPermissions 云函数
 * 功能：检查和配置question_queue集合权限
 */

let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  cloud = null;
}

/**
 * 检查集合权限配置
 */
async function checkCollectionPermissions(db, collectionName) {
  try {
    // 尝试读取集合
    const testResult = await db.collection(collectionName).limit(1).get();

    return {
      collection: collectionName,
      exists: true,
      readable: true,
      count: testResult.data.length
    };
  } catch (e) {
    return {
      collection: collectionName,
      exists: false,
      readable: false,
      error: e.message
    };
  }
}

/**
 * 创建测试文档验证写入权限
 */
async function testWritePermission(db, collectionName) {
  try {
    const testId = 'permission_test_' + Date.now();

    const result = await db.collection(collectionName).add({
      data: {
        _id: testId,
        test: true,
        created_at: new Date().toISOString()
      }
    });

    // 清理测试文档
    await db.collection(collectionName).doc(testId).remove();

    return {
      collection: collectionName,
      writable: true,
      test_id: testId
    };
  } catch (e) {
    return {
      collection: collectionName,
      writable: false,
      error: e.message
    };
  }
}

/**
 * 获取集合统计信息
 */
async function getCollectionStats(db, collectionName) {
  try {
    const countResult = await db.collection(collectionName).count();
    const sampleResult = await db.collection(collectionName).limit(1).get();

    return {
      collection: collectionName,
      total_count: countResult.total,
      has_data: sampleResult.data.length > 0,
      sample: sampleResult.data[0] || null
    };
  } catch (e) {
    return {
      collection: collectionName,
      error: e.message
    };
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { action, collection } = event;

  const collectionName = collection || 'question_queue';

  console.log('=== configPermissions === action:', action, 'collection:', collectionName);

  try {
    switch (action) {
      case 'check':
        const readPerm = await checkCollectionPermissions(db, collectionName);
        return {
          success: true,
          data: readPerm
        };

      case 'test_write':
        const writePerm = await testWritePermission(db, collectionName);
        return {
          success: true,
          data: writePerm
        };

      case 'stats':
        const stats = await getCollectionStats(db, collectionName);
        return {
          success: true,
          data: stats
        };

      case 'check_all':
        const collections = ['question_queue', 'assessments', 'questions'];
        const results = {};

        for (const col of collections) {
          const perm = await checkCollectionPermissions(db, col);
          const stat = await getCollectionStats(db, col);
          results[col] = { permission: perm, stats: stat };
        }

        return {
          success: true,
          data: results
        };

      default:
        return {
          success: false,
          error: 'Unknown action: ' + action
        };
    }
  } catch (e) {
    console.error('configPermissions error:', e);
    return {
      success: false,
      error: e.message || String(e)
    };
  }
};

// 导出供测试使用
Object.assign(exports, {
  checkCollectionPermissions,
  testWritePermission,
  getCollectionStats
});
