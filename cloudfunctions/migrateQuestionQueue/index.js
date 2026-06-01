/**
 * migrateQuestionQueue 云函数
 * 功能：创建question_queue集合索引
 * TDD: Red-Green-Refactor
 *
 * 注意：微信云数据库索引需要在控制台执行createIndexes返回的命令
 */

let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  cloud = null;
}

/**
 * 验证question_queue索引是否存在
 * @param {Object} db - 数据库实例
 * @returns {Promise<Object>} 索引状态
 */
async function verifyIndexes(db) {
  try {
    const collection = db.collection('question_queue');
    const result = await collection.getIndexes();

    const indexes = result.indexes || [];
    const indexNames = indexes.map(idx => idx.name);

    return {
      question_queue_index1: indexNames.some(name =>
        name.includes('student_id') && name.includes('status')
      ),
      question_queue_index2: indexNames.some(name =>
        name.includes('priority')
      ),
      all_indexes: indexNames
    };
  } catch (e) {
    // 集合不存在或getIndexes失败时
    return {
      question_queue_index1: false,
      question_queue_index2: false,
      error: e.message
    };
  }
}

/**
 * 生成索引创建命令
 * 返回需要在控制台执行的MongoDB命令
 */
function createIndexes() {
  return [
    {
      collection: 'question_queue',
      name: 'student_id_1_status_1_created_at_-1',
      description: '复合索引：快速查找学生的活跃任务',
      keys: {
        student_id: 1,
        status: 1,
        created_at: -1
      }
    },
    {
      collection: 'question_queue',
      name: 'priority_-1_created_at_1',
      description: '优先级排序索引',
      keys: {
        priority: -1,
        created_at: 1
      }
    }
  ];
}

/**
 * 格式化索引创建命令为控制台可执行格式
 */
function formatConsoleCommands() {
  const indexes = createIndexes();

  return indexes.map(idx => {
    const keysStr = JSON.stringify(idx.keys);
    return `db.collection('${idx.collection}').createIndex(${keysStr}, { name: '${idx.name}' })`;
  });
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { action = 'verify' } = event.data || event;

  try {
    console.log('=== migrateQuestionQueue === action:', action);

    if (action === 'verify') {
      const result = await verifyIndexes(db);
      return {
        success: true,
        action: 'verify',
        ...result
      };
    }

    if (action === 'commands') {
      const commands = formatConsoleCommands();
      return {
        success: true,
        action: 'commands',
        commands,
        note: '请在云开发控制台->数据库->question_queue集合->索引管理中执行上述命令'
      };
    }

    return {
      success: false,
      error: `Unknown action: ${action}`
    };

  } catch (e) {
    console.error('migrateQuestionQueue error:', e);
    return {
      success: false,
      error: e.message || String(e)
    };
  }
};

// 导出供测试使用
Object.assign(exports, {
  verifyIndexes,
  createIndexes,
  formatConsoleCommands
});
