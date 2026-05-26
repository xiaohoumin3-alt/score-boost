/**
 * 异步队列系统回滚脚本
 * 用于清理 question_queue 集合和相关数据，恢复到同步模式
 *
 * 使用方法：
 * 1. 在云开发控制台 → 云函数 → 创建临时云函数
 * 2. 将此文件内容复制到 index.js
 * 3. 部署并调用云函数执行回滚
 * 4. 执行完成后删除临时云函数
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 检查当前系统状态
 */
async function checkSystemStatus() {
  const results = {
    queue_collection_exists: false,
    queue_tasks_count: 0,
    queue_tasks_by_status: {},
    assessments_from_queue_count: 0,
    waiting_page_exists: false
  };

  try {
    // 检查 question_queue 集合
    const queueCount = await db.collection('question_queue').count();
    results.queue_collection_exists = true;
    results.queue_tasks_count = queueCount.total || 0;

    // 按状态统计
    const statuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    for (const status of statuses) {
      const count = await db.collection('question_queue').where({ status }).count();
      results.queue_tasks_by_status[status] = count.total || 0;
    }
  } catch (e) {
    console.log('[check] question_queue collection does not exist or error:', e.message);
  }

  try {
    // 检查 assessments 中由队列生成的记录
    const assessments = await db.collection('assessments')
      .where({
        created_at: db.RegExp({
          regexp: '.*',
          options: 'i'
        })
      })
      .limit(1)
      .get();

    results.assessments_from_queue_count = assessments.data.length;
  } catch (e) {
    console.log('[check] assessments collection check error:', e.message);
  }

  return results;
}

/**
 * 清理 question_queue 集合
 * @param {Object} options - 选项 { dryRun: boolean, status: string }
 */
async function cleanupQueue(options = {}) {
  const { dryRun = true, status = null } = options;
  const results = {
    dry_run: dryRun,
    deleted_count: 0,
    errors: []
  };

  try {
    const collection = db.collection('question_queue');
    const query = status ? collection.where({ status }) : collection;

    if (dryRun) {
      const countResult = await query.count();
      results.would_delete = countResult.total || 0;
      console.log(`[dryRun] Would delete ${results.would_delete} tasks${status ? ' with status: ' + status : ''}`);
    } else {
      // 注意：微信云开发不支持批量删除，需要逐条删除
      const { data } = await query.limit(100).get();
      for (const doc of data) {
        try {
          await collection.doc(doc._id).remove();
          results.deleted_count++;
        } catch (e) {
          results.errors.push({ id: doc._id, error: e.message });
        }
      }
      console.log(`[cleanup] Deleted ${results.deleted_count} tasks`);
    }
  } catch (e) {
    results.errors.push({ error: e.message });
  }

  return results;
}

/**
 * 回滚到同步模式
 * @param {Object} options - 选项
 */
async function rollbackToSync(options = {}) {
  const { dryRun = true, confirm = false } = options;
  const results = {
    steps: [],
    success: false
  };

  if (!confirm && !dryRun) {
    results.error = 'Rollback requires confirm=true or dryRun=true';
    return results;
  }

  try {
    // Step 1: 检查当前状态
    console.log('=== Step 1: 检查当前状态 ===');
    const status = await checkSystemStatus();
    results.steps.push({ step: 'check_status', data: status });
    console.log('Current status:', JSON.stringify(status, null, 2));

    // Step 2: 清理 pending/processing 任务
    console.log('\n=== Step 2: 清理未完成任务 ===');
    const pendingResult = await cleanupQueue({ dryRun, status: 'pending' });
    const processingResult = await cleanupQueue({ dryRun, status: 'processing' });
    results.steps.push({ step: 'cleanup_pending', data: pendingResult });
    results.steps.push({ step: 'cleanup_processing', data: processingResult });

    // Step 3: 清理 failed 任务
    console.log('\n=== Step 3: 清理失败任务 ===');
    const failedResult = await cleanupQueue({ dryRun, status: 'failed' });
    results.steps.push({ step: 'cleanup_failed', data: failedResult });

    // Step 4: 保留 completed 任务用于审计（可选清理）
    console.log('\n=== Step 4: completed 任务保留用于审计 ===');
    console.log(`[info] ${status.queue_tasks_by_status.completed || 0} completed tasks preserved`);

    if (!dryRun) {
      console.log('\n=== Step 5: 手动清理步骤 ===');
      console.log('请手动完成以下步骤：');
      console.log('1. 删除或重命名 pages/waiting 目录');
      console.log('2. 从 app.json 中移除 waiting 页面配置');
      console.log('3. 恢复 startAssessment 云函数到同步模式');
      console.log('4. 删除 questionGenerator 云函数的定时触发器');
      console.log('5. 删除 checkQueueStatus 云函数');
      console.log('6. 从 cloudApi.js 中移除队列相关函数');
    }

    results.success = true;
  } catch (e) {
    results.error = e.message;
    console.error('[rollback] Error:', e);
  }

  return results;
}

/**
 * 完全清理（危险操作）
 * @param {Object} options - 选项 { confirm: boolean }
 */
async function fullCleanup(options = {}) {
  const { confirm = false } = options;
  const results = {
    success: false,
    deleted_counts: {}
  };

  if (!confirm) {
    results.error = 'Full cleanup requires confirm=true';
    return results;
  }

  try {
    // 清理所有状态的队列任务
    const statuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    for (const status of statuses) {
      const result = await cleanupQueue({ dryRun: false, status });
      results.deleted_counts[status] = result.deleted_count;
    }

    results.success = true;
    console.log('[fullCleanup] All queue tasks deleted');
  } catch (e) {
    results.error = e.message;
    console.error('[fullCleanup] Error:', e);
  }

  return results;
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action = 'status', options = {} } = event;

  console.log('=== rollback-queue-system === action:', action);

  try {
    switch (action) {
      case 'status':
        return await checkSystemStatus();

      case 'check':
        const status = await checkSystemStatus();
        return {
          success: true,
          action: 'check',
          data: status
        };

      case 'dryRun':
        const rollbackResult = await rollbackToSync({ dryRun: true, ...options });
        return {
          success: true,
          action: 'dryRun',
          data: rollbackResult
        };

      case 'rollback':
        const realRollbackResult = await rollbackToSync({ dryRun: false, confirm: options.confirm, ...options });
        return {
          success: true,
          action: 'rollback',
          data: realRollbackResult
        };

      case 'fullCleanup':
        const cleanupResult = await fullCleanup(options);
        return {
          success: true,
          action: 'fullCleanup',
          data: cleanupResult
        };

      default:
        return {
          success: false,
          error: 'Unknown action: ' + action
        };
    }
  } catch (e) {
    console.error('rollback-queue-system error:', e);
    return {
      success: false,
      error: e.message || String(e)
    };
  }
};
