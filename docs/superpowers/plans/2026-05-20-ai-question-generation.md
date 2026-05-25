# AI题目自动生成系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 实现热度驱动的AI题目自动生成系统，解决题目池静态增长问题

**架构:** 用户练习 → 请求统计 → 热度计算 → 预生成触发 → LLM生成 → 双重验证 → 题池扩充 → 服务用户

**技术栈:** 微信云开发 (wx-server-sdk), 云函数, 云数据库, 通义千问API

---

## Phase 1: 数据库集合创建

### Task 1: 创建 kp_request_log 集合索引

**文件:**
- 修改: 数据库索引配置 (通过微信云开发控制台或云函数)

- [ ] **Step 1: 理解集合结构**

`kp_request_log` 存储每个知识点的请求统计和热度分数：
```javascript
{
  _id: "kp1_1",                      // 知识点ID作为主键
  request_count: 156,
  last_request_at: "2026-05-20T10:30:00Z",
  heat_score: 8.5,
  daily_log: [
    { date: "2026-05-20", count: 25 }
  ],
  updated_at: "2026-05-20T10:30:00Z"
}
```

- [ ] **Step 2: 创建索引脚本**

创建 `cloudfunctions/initDatabase/create_indexes.js`:
```javascript
/**
 * 创建AI题目生成相关索引
 */
exports.createAiQuestionIndexes = async (db) => {
  // kp_request_log 使用 _id 直接查询，无需额外索引

  // pregen_queue 索引: status + priority
  try {
    await db.collection('pregen_queue').createIndex({
      status: 1,
      priority: -1
    });
    console.log('[Index] pregen_queue status+priority index created');
  } catch (e) {
    if (e.errCode !== -1) console.error('[Index] pregen_queue error:', e);
  }

  // ai_question_pool 复合索引: kp_id + difficulty + verified
  try {
    await db.collection('ai_question_pool').createIndex({
      kp_id: 1,
      difficulty: 1,
      verified: 1
    });
    console.log('[Index] ai_question_pool kp_id+difficulty+verified index created');
  } catch (e) {
    if (e.errCode !== -1) console.error('[Index] ai_question_pool error:', e);
  }

  // ai_question_pool 单字段索引: used_count (用于题目轮换策略)
  try {
    await db.collection('ai_question_pool').createIndex({
      used_count: 1
    });
    console.log('[Index] ai_question_pool used_count index created');
  } catch (e) {
    if (e.errCode !== -1) console.error('[Index] used_count error:', e);
  }
};
```

- [ ] **Step 3: 验证索引创建成功**

运行 `initDatabase` 云函数，检查日志输出:
```bash
# 预期日志:
[Index] pregen_queue status+priority index created
[Index] ai_question_pool kp_id+difficulty+verified index created
[Index] ai_question_pool used_count index created
```

---

### Task 2: 初始化冷启动数据

**文件:**
- Create: `cloudfunctions/initDatabase/cold_start.js`

- [ ] **Step 1: 创建冷启动脚本**

```javascript
/**
 * 冷启动：为所有知识点预生成初始题目
 * 每个 KP × 3 难度 × 5 题 = 210 题初始题池
 */
const INITIAL_QUESTIONS_PER_KP_DIFFICULTY = 5;

async function coldStartAiQuestions(db) {
  const { loadKnowledgeTree } = require('../practice_v2/knowledge-tree');
  const tree = loadKnowledgeTree('math', '8', '下');

  // 扁平化所有知识点
  const allKps = [];
  function traverseKps(node) {
    if (node.kp_id) {
      allKp.push({ kp_id: node.kp_id, kp_name: node.kp_name, chapter: node.chapter });
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
      // 这里只是创建占位，实际题目由 pregenWorker 填充
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
  if (batch.length > 0) {
    await db.collection('ai_question_pool').add({
      data: batch
    });
    console.log(`[ColdStart] Created ${batch.length} placeholder records`);
  }

  return { created: batch.length, kp_count: allKps.length };
}

module.exports = { coldStartAiQuestions };
```

- [ ] **Step 2: 在 initDatabase 中集成冷启动**

修改 `cloudfunctions/initDatabase/index.js`:
```javascript
const { coldStartAiQuestions } = require('./cold_start');
const { createAiQuestionIndexes } = require('./create_indexes');

exports.main = async (event, context) => {
  const db = cloud.database();

  // 创建索引
  await createAiQuestionIndexes(db);

  // 冷启动
  const coldStartResult = await coldStartAiQuestions(db);

  return {
    success: true,
    indexes_created: true,
    cold_start: coldStartResult
  };
};
```

- [ ] **Step 3: 验证冷启动成功**

运行 `initDatabase` 云函数，检查返回:
```bash
# 预期返回:
{
  "success": true,
  "indexes_created": true,
  "cold_start": {
    "created": 42,
    "kp_count": 14
  }
}
```

---

## Phase 2: 热度计算系统

### Task 3: 创建热度计算器

**文件:**
- Create: `cloudfunctions/shared/heat-calculator.js`

- [ ] **Step 1: 实现热度计算逻辑**

```javascript
/**
 * 热度计算器
 * 基于请求频率和时间衰减计算知识点热度 (0-10)
 */

/**
 * 计算热度分数
 * @param {Object} log - kp_request_log 文档
 * @returns {number} 热度分数 0-10
 */
function calculateHeatScore(log) {
  if (!log) return 0;

  const now = Date.now();
  const lastRequest = new Date(log.last_request_at || log.updated_at || now).getTime();
  const daysSinceLastRequest = (now - lastRequest) / (1000 * 60 * 60 * 24);

  // 基础热度：请求次数的对数（避免头部效应）
  // log10(1) = 0, log10(10) = 1, log10(100) = 2, log10(1000) = 3
  const baseScore = Math.log10((log.request_count || 0) + 1) * 3;

  // 时间衰减：最近请求的权重更高
  // 1天衰减10%，7天衰减70%，30天完全衰减
  const timeDecay = Math.max(0.05, 1 - daysSinceLastRequest * 0.03);

  // 组合并限制在 0-10 范围内
  return Math.min(10, Math.max(0, baseScore * timeDecay));
}

/**
 * 更新每日日志
 * @param {Array} dailyLog - 现有的 daily_log 数组
 * @param {string} today - 今天的日期字符串 YYYY-MM-DD
 * @returns {Array} 更新后的 daily_log（最多保留7天）
 */
function updateDailyLog(dailyLog = [], today = null) {
  const dateStr = today || new Date().toISOString().split('T')[0];

  // 查找今天是否已存在
  const existingIndex = dailyLog.findIndex(entry => entry.date === dateStr);

  if (existingIndex >= 0) {
    // 增加今天的计数
    dailyLog[existingIndex].count = (dailyLog[existingIndex].count || 0) + 1;
  } else {
    // 添加今天的记录
    dailyLog.push({ date: dateStr, count: 1 });
  }

  // 只保留最近7天
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

  return dailyLog.filter(entry => entry.date >= cutoffDate);
}

/**
 * 获取热度等级
 * @param {number} heatScore - 热度分数
 * @returns {string} 'high' | 'medium' | 'low'
 */
function getHeatLevel(heatScore) {
  if (heatScore >= 7) return 'high';
  if (heatScore >= 4) return 'medium';
  return 'low';
}

/**
 * 根据热度等级获取目标题池大小
 * @param {string} heatLevel - 热度等级
 * @returns {number} 目标题目数量
 */
function getTargetPoolSize(heatLevel) {
  switch (heatLevel) {
    case 'high': return 20;
    case 'medium': return 5;
    case 'low': return 2;
    default: return 2;
  }
}

module.exports = {
  calculateHeatScore,
  updateDailyLog,
  getHeatLevel,
  getTargetPoolSize
};
```

- [ ] **Step 2: 验证计算正确性**

创建测试用例（可在Node.js环境运行）:
```javascript
// 测试边界条件
console.log(calculateHeatScore(null)); // 0
console.log(calculateHeatScore({ request_count: 0 })); // 0
console.log(calculateHeatScore({ request_count: 100, last_request_at: new Date().toISOString() })); // 约 6
console.log(calculateHeatScore({ request_count: 1000, last_request_at: new Date().toISOString() })); // 约 9
```

预期输出: 0, 0, 6.x, 9.x

---

## Phase 3: 请求统计记录器

### Task 4: 创建 recordKpRequest 云函数

**文件:**
- Create: `cloudfunctions/recordKpRequest/index.js`
- Create: `cloudfunctions/recordKpRequest/package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "recordKpRequest",
  "version": "1.0.0",
  "description": "记录知识点练习请求，用于热度计算",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 2: 实现云函数主逻辑**

```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const {
  calculateHeatScore,
  updateDailyLog
} = require('../shared/heat-calculator');

/**
 * 记录知识点练习请求
 *
 * @param {string} kp_id - 知识点ID
 * @returns {Object} { success: true, heat_score: number }
 */
exports.main = async (event, context) => {
  const { kp_id } = event.data || event;

  if (!kp_id) {
    return { success: false, error: 'kp_id is required' };
  }

  const db = cloud.database();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  try {
    // 使用 _id 作为 kp_id 的唯一记录
    const collection = db.collection('kp_request_log');
    const docId = String(kp_id);

    // 检查记录是否存在
    const existing = await collection.doc(docId).get();

    if (existing.data && existing.data.length > 0) {
      // 更新现有记录
      const log = existing.data[0];
      const newDailyLog = updateDailyLog(log.daily_log, today);
      const newRequestCount = (log.request_count || 0) + 1;
      const newHeatScore = calculateHeatScore({
        request_count: newRequestCount,
        last_request_at: now
      });

      await collection.doc(docId).update({
        data: {
          request_count: newRequestCount,
          last_request_at: now,
          heat_score: newHeatScore,
          daily_log: newDailyLog,
          updated_at: now
        }
      });

      return {
        success: true,
        heat_score: newHeatScore,
        request_count: newRequestCount
      };
    } else {
      // 创建新记录
      const initialLog = {
        request_count: 1,
        last_request_at: now,
        heat_score: calculateHeatScore({ request_count: 1, last_request_at: now }),
        daily_log: [{ date: today, count: 1 }],
        updated_at: now
      };

      await collection.add({
        data: {
          _id: docId,
          ...initialLog
        }
      });

      return {
        success: true,
        heat_score: initialLog.heat_score,
        request_count: 1
      };
    }
  } catch (error) {
    console.error('[recordKpRequest] Error:', error);
    return {
      success: false,
      error: error.message || error.errMsg || 'Unknown error'
    };
  }
};
```

- [ ] **Step 3: 部署并测试云函数**

```bash
# 部署云函数
# 在微信开发者工具中右键 cloudfunctions/recordKpRequest → 上传并部署

# 测试调用（在云开发控制台或小程序中）
wx.cloud.callFunction({
  name: 'recordKpRequest',
  data: { kp_id: 'kp1_1' }
}).then(res => {
  console.log('[Test] recordKpRequest result:', res.result);
  // 预期: { success: true, heat_score: ~1.5, request_count: 1 }
});
```

- [ ] **Step 4: 验证数据库写入**

在云开发控制台 → 数据库 → `kp_request_log` 集合：
```bash
# 预期看到一条记录:
{
  "_id": "kp1_1",
  "request_count": 1,
  "last_request_at": "2026-05-20T...",
  "heat_score": 1.5,
  "daily_log": [{ "date": "2026-05-20", "count": 1 }],
  "updated_at": "2026-05-20T..."
}
```

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/recordKpRequest/ cloudfunctions/shared/heat-calculator.js
git commit -m "feat: add recordKpRequest cloud function and heat calculator"
```

---

## Phase 4: 预生成触发器

### Task 5: 在 practice_v2 中集成请求统计

**文件:**
- Modify: `cloudfunctions/practice_v2/index.js`

- [ ] **Step 1: 添加统计调用**

在 `practice_v2/index.js` 的 `main` 函数中，返回题目后添加统计调用：

```javascript
// 在 return 语句之前添加
const kpIds = questions.map(q => q.knowledge_point_id).filter(Boolean);

// 异步记录请求，不阻塞主流程
Promise.all(kpIds.map(kpId =>
  cloud.callFunction({
    name: 'recordKpRequest',
    data: { kp_id: kpId }
  }).catch(e => console.error('[recordKpRequest] Failed for', kpId, e))
)).catch(e => console.error('[recordKpRequest] Batch error:', e));

return {
  success: true,
  // ... 现有返回内容
};
```

完整上下文（找到 return 语句前插入）：
```javascript
    // 保存练习会话
    const db = cloud.database();
    await db.collection('practices').add({
      data: {
        session_id: sessionId,
        questions: questions,
        status: 'in_progress',
        answers: [],
        created_at: new Date().toISOString(),
      }
    });

    // ===== 新增: 异步记录请求统计 =====
    const kpIds = questions
      .map(q => q.knowledge_point_id)
      .filter(Boolean);

    if (kpIds.length > 0) {
      Promise.all(kpIds.map(kpId =>
        cloud.callFunction({
          name: 'recordKpRequest',
          data: { kp_id: kpId }
        }).catch(e => console.error('[recordKpRequest] Failed for', kpId, e))
      )).catch(e => console.error('[recordKpRequest] Batch error:', e));
    }
    // ===== 新增结束 =====

    return {
      success: true,
      data: {
        session_id: sessionId,
        questions: questions.map(q => ({
          id: q.id,
```

- [ ] **Step 2: 验证不阻塞主流程**

调用 `practice_v2` 云函数，检查返回时间无明显增加：
```bash
# 预期: 练习请求正常返回，request_count 在后台异步增加
```

- [ ] **Step 3: 提交**

```bash
git add cloudfunctions/practice_v2/index.js
git commit -m "feat: integrate request statistics in practice_v2"
```

---

### Task 6: 创建预生成触发器逻辑

**文件:**
- Create: `cloudfunctions/shared/pregen-trigger.js`

- [ ] **Step 1: 实现触发判断逻辑**

```javascript
/**
 * 预生成触发器
 * 判断是否需要为某知识点预生成题目
 */

const { getHeatLevel, getTargetPoolSize } = require('./heat-calculator');

/**
 * 判断是否应该触发预生成
 * @param {string} kpId - 知识点ID
 * @param {Object} requestLog - kp_request_log 文档
 * @param {number} availableCount - 当前可用题目数量
 * @returns {Object} { shouldTrigger: boolean, priority: number, targetCount: number }
 */
async function shouldPreGenerate(kpId, requestLog, availableCount) {
  if (!requestLog) {
    // 无请求记录，仅在题池完全耗尽时保底生成
    return {
      shouldTrigger: availableCount < 2,
      priority: 1,
      targetCount: 2,
      reason: 'no_log_but_empty'
    };
  }

  const heatScore = requestLog.heat_score || 0;
  const heatLevel = getHeatLevel(heatScore);
  const targetCount = getTargetPoolSize(heatLevel);

  // 触发条件 (OR关系):
  // 1. 热度高(>=7) 且 题池不足(<20)
  // 2. 热度中(>=4) 且 题池耗尽(<5)
  // 3. 低热知识点至少保底2题

  const condition1 = heatScore >= 7 && availableCount < targetCount;
  const condition2 = heatScore >= 4 && availableCount < 5;
  const condition3 = availableCount < 2;

  const shouldTrigger = condition1 || condition2 || condition3;

  let reason = 'none';
  if (condition1) reason = 'high_heat_insufficient';
  else if (condition2) reason = 'medium_heat_depleted';
  else if (condition3) reason = 'low_pool_minimum';

  return {
    shouldTrigger,
    priority: heatScore,
    targetCount,
    reason,
    heatLevel,
    heatScore
  };
}

/**
 * 创建预生成任务
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @param {Object} triggerResult - shouldPreGenerate 的返回值
 */
async function createPreGenTask(db, kpId, triggerResult) {
  const { priority, targetCount, reason } = triggerResult;

  try {
    // 检查是否已有 pending/processing 的任务
    const existing = await db.collection('pregen_queue')
      .where({
        kp_id: kpId,
        status: 'pending'
      })
      .get();

    if (existing.data && existing.data.length > 0) {
      return { created: false, reason: 'already_queued' };
    }

    await db.collection('pregen_queue').add({
      data: {
        kp_id: kpId,
        priority: priority,
        target_count: targetCount,
        status: 'pending',
        reason: reason,
        created_at: new Date().toISOString(),
        processed_at: null,
        completed_at: null,
        generated_count: 0
      }
    });

    return { created: true };
  } catch (error) {
    console.error('[createPreGenTask] Error:', error);
    return { created: false, error: error.message };
  }
}

module.exports = {
  shouldPreGenerate,
  createPreGenTask
};
```

- [ ] **Step 2: 验证触发条件**

测试用例:
```javascript
// 高热度，题池不足
shouldPreGenerate('kp1_1', { heat_score: 8 }, 10)
// 预期: { shouldTrigger: true, targetCount: 20, reason: 'high_heat_insufficient' }

// 高热度，题池充足
shouldPreGenerate('kp1_1', { heat_score: 8 }, 25)
// 预期: { shouldTrigger: false }

// 低热度，题池保底
shouldPreGenerate('kp1_1', { heat_score: 2 }, 1)
// 预期: { shouldTrigger: true, targetCount: 2, reason: 'low_pool_minimum' }
```

---

### Task 6.5: 实现自动触发机制（关键：实现"润物细无声"）

**目标:** 当热度上升触发预生成条件时，自动调用pregenWorker，无需人工干预

**文件:**
- Modify: `cloudfunctions/recordKpRequest/index.js`

- [ ] **Step 1: 添加自动触发逻辑**

在 `recordKpRequest/index.js` 中，更新热度后添加自动触发：

```javascript
const {
  calculateHeatScore,
  updateDailyLog
} = require('../shared/heat-calculator');
const { shouldPreGenerate, createPreGenTask } = require('../shared/pregen-trigger');

/**
 * 记录知识点练习请求（带自动触发）
 *
 * @param {string} kp_id - 知识点ID
 * @returns {Object} { success: true, heat_score: number, auto_triggered: boolean }
 */
exports.main = async (event, context) => {
  const { kp_id } = event.data || event;

  if (!kp_id) {
    return { success: false, error: 'kp_id is required' };
  }

  const db = cloud.database();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  try {
    const collection = db.collection('kp_request_log');
    const docId = String(kp_id);

    // 检查记录是否存在
    const existing = await collection.doc(docId).get();

    let newHeatScore, newRequestCount;

    if (existing.data && existing.data.length > 0) {
      // 更新现有记录
      const log = existing.data[0];
      const newDailyLog = updateDailyLog(log.daily_log, today);
      newRequestCount = (log.request_count || 0) + 1;
      newHeatScore = calculateHeatScore({
        request_count: newRequestCount,
        last_request_at: now
      });

      await collection.doc(docId).update({
        data: {
          request_count: newRequestCount,
          last_request_at: now,
          heat_score: newHeatScore,
          daily_log: newDailyLog,
          updated_at: now
        }
      });

    } else {
      // 创建新记录
      newRequestCount = 1;
      newHeatScore = calculateHeatScore({ request_count: 1, last_request_at: now });

      await collection.add({
        data: {
          _id: docId,
          request_count: newRequestCount,
          last_request_at: now,
          heat_score: newHeatScore,
          daily_log: [{ date: today, count: 1 }],
          updated_at: now
        }
      });
    }

    // ===== 新增: 自动触发预生成检查 =====
    let autoTriggered = false;
    let triggerReason = null;

    try {
      // 获取当前题池数量
      const poolResult = await db.collection('ai_question_pool')
        .where({ kp_id: kp_id, verified: true })
        .count();

      const availableCount = poolResult.total || 0;

      // 判断是否需要触发
      const triggerResult = await shouldPreGenerate(
        kp_id,
        { heat_score: newHeatScore, request_count: newRequestCount },
        availableCount
      );

      if (triggerResult.shouldTrigger) {
        // 创建预生成任务
        const taskResult = await createPreGenTask(db, kp_id, triggerResult);

        if (taskResult.created) {
          autoTriggered = true;
          triggerReason = triggerResult.reason;

          console.log(`[AutoTrigger] kp_id=${kp_id}, reason=${triggerReason}, heat_score=${newHeatScore}`);

          // 异步调用 pregenWorker（不等待结果）
          cloud.callFunction({
            name: 'pregenWorker',
            data: { async_mode: true }
          }).catch(e => console.error('[AutoTrigger] Worker call failed:', e));
        }
      }
    } catch (triggerError) {
      // 触发检查失败不影响主流程
      console.error('[AutoTrigger] Check failed:', triggerError.message);
    }
    // ===== 自动触发结束 =====

    return {
      success: true,
      heat_score: newHeatScore,
      request_count: newRequestCount,
      auto_triggered: autoTriggered,
      trigger_reason: triggerReason
    };

  } catch (error) {
    console.error('[recordKpRequest] Error:', error);
    return {
      success: false,
      error: error.message || error.errMsg || 'Unknown error'
    };
  }
};
```

- [ ] **Step 2: 验证自动触发**

测试流程：
```javascript
// 1. 清空测试知识点的题池
await db.collection('ai_question_pool').where({ kp_id: 'kp1_1' }).remove();

// 2. 多次调用练习请求，使热度上升
for (let i = 0; i < 20; i++) {
  const result = await wx.cloud.callFunction({
    name: 'recordKpRequest',
    data: { kp_id: 'kp1_1' }
  });
  console.log(`Request ${i+1}:`, result.result);

  // 检查是否触发自动预生成
  if (result.result.auto_triggered) {
    console.log('✅ Auto-triggered!', result.result.trigger_reason);
    break;
  }
}

// 3. 等待几秒后检查 pregen_queue
await new Promise(r => setTimeout(r, 5000));
const queue = await db.collection('pregen_queue').where({ kp_id: 'kp1_1' }).get();
console.log('Queue tasks:', queue.data);
// 预期: 至少有一条 status=pending 的任务

// 4. 检查 ai_question_pool 是否新增题目
await new Promise(r => setTimeout(r, 30000)); // 等待Worker完成
const pool = await db.collection('ai_question_pool').where({ kp_id: 'kp1_1', verified: true }).get();
console.log('Pool count:', pool.data.length);
// 预期: 题目数量 > 0
```

- [ ] **Step 3: 提交**

```bash
git add cloudfunctions/recordKpRequest/index.js
git commit -m "feat: add auto-trigger mechanism for pregeneration"
```

---

## Phase 5: LLM题目生成器

### Task 7: 创建 LLM 生成器模块

**文件:**
- Create: `cloudfunctions/pregenWorker/llm-generator.js`
- Create: `cloudfunctions/pregenWorker/package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "pregenWorker",
  "version": "1.0.0",
  "description": "AI题目预生成工作器",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3",
    "axios": "^0.27.2"
  }
}
```

- [ ] **Step 2: 实现LLM题目生成器**

```javascript
/**
 * LLM题目生成器
 * 调用通义千问API生成数学题目
 */

const QUESTION_TYPES = ['choice', 'written'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * 生成题目Prompt
 */
const MATH_GENERATOR_PROMPT = {
  system: `你是八年级数学题目生成专家。

要求：
- 题型必须是选择题(choice)或简答题(written)
- 选择题必须提供恰好4个选项且仅1个正确答案
- 选项长度应大致均衡，具有合理迷惑性
- 给出清晰解释

返回JSON格式：
{
  "question_type": "choice|written",
  "question": "题目内容",
  "options": {"A": "...", "B": "...", "C": "...", "D": "..."} | null,
  "correct_answer": "A 或 参考答案",
  "explanation": "详细解释"
}`,

  getUserPrompt: (kpName, difficulty, previousQuestions = []) => {
    const prevList = previousQuestions
      .map(q => `- ${q.question}`)
      .join('\n');

    return `知识点：${kpName}
难度：${difficulty}

${prevList ? `本次会话已生成题目：\n${prevList}\n` : ''}

请生成新题目，必须与上述所有题目不同。`;
  }
};

/**
 * 调用通义千问生成题目
 * @param {string} kpName - 知识点名称
 * @param {string} difficulty - 难度
 * @param {Array} previousQuestions - 已生成题目列表（避免重复）
 * @returns {Promise<Object>} 生成的题目对象
 */
async function generateQuestion(kpName, difficulty, previousQuestions = []) {
  // 使用微信云开发的AI能力（如果已配置）或直接HTTP调用
  // 这里使用HTTP调用通义千问的方式

  const axios = require('axios');

  // 配置：需要在云函数环境变量中设置 DASHSCOPE_API_KEY
  const apiKey = process.env.DASHSCOPE_API_KEY || '';

  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY not configured');
  }

  const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

  try {
    const response = await axios.post(url, {
      model: 'qwen-plus',
      input: {
        messages: [
          { role: 'system', content: MATH_GENERATOR_PROMPT.system },
          { role: 'user', content: MATH_GENERATOR_PROMPT.getUserPrompt(kpName, difficulty, previousQuestions) }
        ]
      },
      parameters: {
        result_format: 'message',
        temperature: 0.7
      }
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const content = response.data.output?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    // 解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const questionData = JSON.parse(jsonMatch[0]);

    // 验证必需字段
    if (!questionData.question || !questionData.correct_answer) {
      throw new Error('Invalid question structure');
    }

    return questionData;
  } catch (error) {
    console.error('[generateQuestion] Error:', error.message);
    throw error;
  }
}

/**
 * 批量生成题目
 * @param {string} kpName - 知识点名称
 * @param {string} difficulty - 难度
 * @param {number} count - 生成数量
 * @returns {Promise<Array>} 题目数组
 */
async function generateQuestionsBatch(kpName, difficulty, count) {
  const questions = [];
  const maxRetries = 3;

  for (let i = 0; i < count; i++) {
    let retries = 0;
    let success = false;

    while (retries < maxRetries && !success) {
      try {
        const question = await generateQuestion(kpName, difficulty, questions);
        questions.push(question);
        success = true;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          console.error(`[generateQuestionsBatch] Failed after ${maxRetries} retries for question ${i + 1}`);
        }
      }
    }
  }

  return questions;
}

module.exports = {
  generateQuestion,
  generateQuestionsBatch,
  MATH_GENERATOR_PROMPT
};
```

- [ ] **Step 3: 配置API密钥**

在微信云开发控制台 → 云函数 → pregenWorker → 配置：
```bash
环境变量:
DASHSCOPE_API_KEY=your_api_key_here
```

- [ ] **Step 4: 验证生成器**

测试调用（在云开发控制台）:
```javascript
// 测试单题生成
const result = await generateQuestion('二次根式的概念', 'easy', []);
console.log(result);
// 预期: 包含 question, correct_answer, explanation 等字段的对象
```

---

### Task 8: 创建双重验证器

**文件:**
- Create: `cloudfunctions/pregenWorker/verifier.js`

- [ ] **Step 1: 实现验证逻辑**

```javascript
/**
 * 题目验证器
 * 双重验证：数学准确性 + 难度匹配
 */

const VERIFIER_PROMPT = {
  system: `你是数学题目验证专家。

返回JSON格式：
{
  "math_correct": true|false,
  "difficulty_match": true|false,
  "issues": ["问题列表"],
  "suggested_fix": "修复建议（如有）"
}`,

  getUserPrompt: (question) => {
    const optionsStr = question.options
      ? JSON.stringify(question.options)
      : '无（简答题）';

    return `题目：${question.question}
选项：${optionsStr}
答案：${question.correct_answer}
标称难度：${question.difficulty}

请验证：
1. 答案是否准确？
2. 难度是否匹配？
3. 题目表述是否清晰？`;
  }
};

/**
 * 验证单道题目
 * @param {Object} question - 题目对象
 * @param {string} expectedDifficulty - 期望难度
 * @returns {Promise<Object>} { verified: boolean, result: Object }
 */
async function verifyQuestion(question, expectedDifficulty) {
  const axios = require('axios');
  const apiKey = process.env.DASHSCOPE_API_KEY || '';

  if (!apiKey) {
    // 无API密钥时，跳过LLM验证，只做基础验证
    return verifyQuestionBasic(question, expectedDifficulty);
  }

  try {
    const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

    const response = await axios.post(url, {
      model: 'qwen-plus',
      input: {
        messages: [
          { role: 'system', content: VERIFIER_PROMPT.system },
          { role: 'user', content: VERIFIER_PROMPT.getUserPrompt({ ...question, difficulty: expectedDifficulty }) }
        ]
      },
      parameters: {
        result_format: 'message',
        temperature: 0.3
      }
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const content = response.data.output?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty verifier response');
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    const verified = result && result.math_correct && result.difficulty_match;

    return {
      verified,
      result: result || { math_correct: true, difficulty_match: true, issues: [] }
    };
  } catch (error) {
    console.error('[verifyQuestion] LLM error, using basic verification:', error.message);
    return verifyQuestionBasic(question, expectedDifficulty);
  }
}

/**
 * 基础验证（无LLM时）
 */
function verifyQuestionBasic(question, expectedDifficulty) {
  const issues = [];

  // 检查必需字段
  if (!question.question || question.question.trim().length < 10) {
    issues.push('题目内容过短');
  }

  if (!question.correct_answer) {
    issues.push('缺少正确答案');
  }

  // 选择题特定检查
  if (question.question_type === 'choice') {
    if (!question.options || Object.keys(question.options).length !== 4) {
      issues.push('选择题必须有4个选项');
    }

    const validOptions = ['A', 'B', 'C', 'D'];
    if (!validOptions.includes(question.correct_answer)) {
      issues.push('选择题答案必须是A/B/C/D之一');
    }
  }

  return {
    verified: issues.length === 0,
    result: {
      math_correct: issues.length === 0,
      difficulty_match: true,
      issues: issues
    }
  };
}

/**
 * 批量验证题目
 * @param {Array} questions - 题目数组
 * @param {string} expectedDifficulty - 期望难度
 * @returns {Promise<Array>} 验证通过的题目数组
 */
async function verifyQuestionsBatch(questions, expectedDifficulty) {
  const verified = [];

  for (const question of questions) {
    const { verified: passed, result } = await verifyQuestion(question, expectedDifficulty);

    if (passed) {
      verified.push({ ...question, verification_result: result });
    } else {
      console.error('[verifyQuestionsBatch] Question failed verification:', result.issues);
    }
  }

  return verified;
}

module.exports = {
  verifyQuestion,
  verifyQuestionsBatch,
  VERIFIER_PROMPT
};
```

- [ ] **Step 2: 验证验证器**

```javascript
// 测试基础验证
const testQuestion = {
  question_type: 'choice',
  question: '1+1=?',
  options: { A: '1', B: '2', C: '3', D: '4' },
  correct_answer: 'B'
};

const result = await verifyQuestion(testQuestion, 'easy');
console.log(result);
// 预期: { verified: true, result: { math_correct: true, ... } }
```

---

### Task 9: 创建 pregenWorker 主逻辑

**文件:**
- Create: `cloudfunctions/pregenWorker/index.js`

- [ ] **Step 1: 实现工作器主逻辑**

```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { generateQuestionsBatch } = require('./llm-generator');
const { verifyQuestionsBatch } = require('./verifier');
const { loadKnowledgeTree } = require('../practice_v2/knowledge-tree');

/**
 * 预生成工作器
 * 处理 pregen_queue 中的任务
 */

/**
 * 获取知识点名称
 */
function getKpName(kpId) {
  const tree = loadKnowledgeTree('math', '8', '下');

  function findKp(node) {
    if (node.kp_id === kpId) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findKp(child);
        if (found) return found;
      }
    }
    return null;
  }

  for (const chapter of tree) {
    const kp = findKp(chapter);
    if (kp) return kp.kp_name;
  }

  return kpId; // fallback
}

/**
 * 处理单个预生成任务
 */
async function processTask(db, task) {
  const { kp_id, target_count, _id } = task;
  const kpName = getKpName(kp_id);

  console.log(`[pregenWorker] Processing task for ${kp_id} (${kpName}), target: ${target_count}`);

  const difficulties = ['easy', 'medium', 'hard'];
  const totalGenerated = { easy: 0, medium: 0, hard: 0 };
  const allVerifiedQuestions = [];

  // 为每个难度生成题目
  for (const difficulty of difficulties) {
    const perDifficultyCount = Math.ceil(target_count / 3);

    try {
      // 生成题目
      const rawQuestions = await generateQuestionsBatch(
        kpName,
        difficulty,
        perDifficultyCount
      );

      // 验证题目
      const verifiedQuestions = await verifyQuestionsBatch(rawQuestions, difficulty);

      // 写入题池
      for (const q of verifiedQuestions) {
        await db.collection('ai_question_pool').add({
          data: {
            kp_id: kp_id,
            difficulty: difficulty,
            question_type: q.question_type,
            question: q.question,
            options: q.options || null,
            correct_answer: q.correct_answer,
            explanation: q.explanation || '',
            verified: true,
            verified_at: new Date().toISOString(),
            used_count: 0,
            created_at: new Date().toISOString()
          }
        });
      }

      totalGenerated[difficulty] = verifiedQuestions.length;
      allVerifiedQuestions.push(...verifiedQuestions);

    } catch (error) {
      console.error(`[pregenWorker] Error generating ${difficulty} questions for ${kp_id}:`, error.message);
    }
  }

  const totalCount = Object.values(totalGenerated).reduce((a, b) => a + b, 0);

  // 更新任务状态
  await db.collection('pregen_queue').doc(_id).update({
    data: {
      status: 'completed',
      generated_count: totalCount,
      processed_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    }
  });

  console.log(`[pregenWorker] Task completed for ${kp_id}, generated: ${totalCount}`);

  return {
    success: true,
    kp_id,
    generated: totalCount,
    by_difficulty: totalGenerated
  };
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  try {
    // 获取一个 pending 任务（按优先级排序）
    const tasks = await db.collection('pregen_queue')
      .where({
        status: 'pending'
      })
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'asc')
      .limit(1)
      .get();

    if (!tasks.data || tasks.data.length === 0) {
      return {
        success: true,
        message: 'No pending tasks',
        processed: 0
      };
    }

    const task = tasks.data[0];

    // 标记为 processing
    await db.collection('pregen_queue').doc(task._id).update({
      data: {
        status: 'processing',
        processed_at: new Date().toISOString()
      }
    });

    // 处理任务
    const result = await processTask(db, task);

    return {
      success: true,
      processed: 1,
      result
    };

  } catch (error) {
    console.error('[pregenWorker] Error:', error);
    return {
      success: false,
      error: error.message || error.errMsg
    };
  }
};
```

- [ ] **Step 2: 部署并测试**

```bash
# 部署云函数
# 在微信开发者工具中右键 cloudfunctions/pregenWorker → 上传并部署

# 创建测试任务
db.collection('pregen_queue').add({
  data: {
    kp_id: 'kp1_1',
    priority: 5,
    target_count: 3,
    status: 'pending',
    created_at: new Date().toISOString()
  }
});

# 调用云函数
wx.cloud.callFunction({
  name: 'pregenWorker'
}).then(res => {
  console.log('[Test] pregenWorker result:', res.result);
});
```

- [ ] **Step 3: 验证题目生成**

检查 `ai_question_pool` 集合：
```bash
# 预期: 新增了3道题目，每个难度约1题
db.collection('ai_question_pool')
  .where({ kp_id: 'kp1_1', verified: true })
  .count()
```

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/pregenWorker/
git commit -m "feat: add pregenWorker with LLM generation and verification"
```

---

## Phase 6: 消费AI题目池

### Task 10: 修改题目查询逻辑以使用AI题池

**文件:**
- Modify: `cloudfunctions/practice_v2/question_bank.js`

- [ ] **Step 1: 添加AI题池查询函数**

在 `question_bank.js` 中添加：

```javascript
/**
 * 从AI题池查询题目
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @param {string} difficulty - 难度
 * @param {number} count - 需要的题目数量
 * @returns {Promise<Array>} 题目数组
 */
async function fetchFromAiPool(db, kpId, difficulty, count) {
  try {
    const _ = db.command;

    // 优先使用未被使用过的题目
    const result = await db.collection('ai_question_pool')
      .where({
        kp_id: kpId,
        difficulty: difficulty,
        verified: true
      })
      .orderBy('used_count', 'asc')
      .limit(count)
      .get();

    if (result.data && result.data.length > 0) {
      // 更新使用计数
      for (const q of result.data) {
        db.collection('ai_question_pool').doc(q._id).update({
          data: {
            used_count: _.inc(1)
          }
        }).catch(e => console.error('[update used_count] Error:', e));
      }

      return result.data.map(q => ({
        id: generateUUID(),
        knowledge_point_id: q.kp_id,
        knowledge_point: q.kp_id, // 兼容字段
        type: q.question_type,
        content: q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        difficulty: q.difficulty
      }));
    }

    return [];
  } catch (error) {
    console.error('[fetchFromAiPool] Error:', error);
    return [];
  }
}

// 导出函数
module.exports = {
  // ... 现有导出
  fetchFromAiPool
};
```

- [ ] **Step 2: 修改 generateQuestions 函数**

修改 `question_bank.js` 中的 `generateQuestions` 函数，添加AI题池fallback：

首先在文件顶部添加 `generateQuestionsFromStatic` 函数（将现有逻辑重命名）：

```javascript
// 原有的静态题库生成逻辑
function generateQuestionsFromStatic(plan, numQuestions = 5) {
  const questions = [];
  const kpCount = {};

  for (let i = 0; i < Math.min(numQuestions, plan.length); i++) {
    const item = plan[i];
    const kpId = item.kp.kp_id;
    const difficulty = item.difficulty;

    if (!kpCount[kpId]) kpCount[kpId] = 0;

    const bank = QUESTION_BANK[kpId];
    if (bank) {
      const matching = bank.filter(q => q.difficulty === difficulty);
      const source = matching.length > 0 ? matching : bank;
      const q = source[kpCount[kpId] % source.length];

      const optionsFormatted = q.options.map(opt => {
        const match = opt.match(/^([A-D])\.\s*(.+)$/);
        if (match) {
          return { key: match[1], value: match[2] };
        }
        return { key: '', value: opt };
      });

      questions.push({
        id: `q${kpCount[kpId] + 1}_${kpId}`,
        type: 'choice',
        content: q.content,
        options: optionsFormatted,
        correct_answer: q.correct_answer,
        knowledge_point: item.kp.kp_name,
        knowledge_point_id: kpId,
        difficulty: difficulty,
        chapter: item.kp.chapter_name,
      });
      kpCount[kpId]++;
    }
  }

  return questions;
}
```

然后替换 `generateQuestions` 函数：

```javascript
async function generateQuestions(plan, numQuestions = 5) {
  const db = cloud.database();
  const questions = [];

  // 首先尝试从AI题池获取
  for (const item of plan) {
    if (questions.length >= numQuestions) break;
    
    const { kp, difficulty } = item;
    const poolQuestions = await fetchFromAiPool(db, kp.kp_id, difficulty, 1);

    if (poolQuestions.length > 0) {
      questions.push({
        ...poolQuestions[0],
        knowledge_point: kp.kp_name,
        chapter: kp.chapter_name
      });
    }
  }

  // 如果AI题池不足，使用静态题库补充
  if (questions.length < numQuestions) {
    const remainingPlan = plan.slice(questions.length);
    const staticQuestions = generateQuestionsFromStatic(remainingPlan, numQuestions - questions.length);
    questions.push(...staticQuestions);
  }

  return questions;
}
```

更新导出：

```javascript
module.exports = {
  QUESTION_BANK,
  generateQuestions,
  generateQuestionsFromStatic,
  getAllKpIds,
  fetchFromAiPool
};
```

- [ ] **Step 3: 验证AI题池消费**

```bash
# 1. 确保 ai_question_pool 有数据
db.collection('ai_question_pool').where({ kp_id: 'kp1_1' }).get()

# 2. 调用 practice_v2
wx.cloud.callFunction({
  name: 'practice_v2',
  data: { knowledge_point_id: 'kp1_1', num_questions: 3 }
}).then(res => {
  console.log('[Test] questions:', res.result.data.questions);
  // 预期: 返回的题目来自 ai_question_pool
});

# 3. 检查 used_count 增加
db.collection('ai_question_pool').where({ kp_id: 'kp1_1' }).get()
```

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/practice_v2/question_bank.js
git commit -m "feat: consume AI question pool in practice_v2"
```

---

## Phase 7: 闭环验证

### Task 11: 端到端验证

**目标:** 验证完整闭环：用户练习 → 热度上升 → 预生成触发 → 题池扩充

- [ ] **Step 1: 初始状态检查**

```bash
# 检查初始状态
db.collection('kp_request_log').where({ _id: 'kp1_1' }).get()
# 预期: 无记录或 request_count=0

db.collection('ai_question_pool').where({ kp_id: 'kp1_1' }).count()
# 预期: 题目数量 < 5
```

- [ ] **Step 2: 模拟用户练习**

```javascript
// 调用 practice_v2 10次
for (let i = 0; i < 10; i++) {
  await wx.cloud.callFunction({
    name: 'practice_v2',
    data: { knowledge_point_id: 'kp1_1', num_questions: 3 }
  });
  await new Promise(r => setTimeout(r, 500)); // 间隔500ms
}
```

- [ ] **Step 3: 检查热度上升**

```bash
db.collection('kp_request_log').doc('kp1_1').get()
# 预期: request_count=10, heat_score > 3
```

- [ ] **Step 4: 手动触发预生成**

```javascript
// 创建预生成任务
await db.collection('pregen_queue').add({
  data: {
    kp_id: 'kp1_1',
    priority: 8,
    target_count: 5,
    status: 'pending',
    created_at: new Date().toISOString()
  }
});

// 调用 pregenWorker
await wx.cloud.callFunction({ name: 'pregenWorker' });
```

- [ ] **Step 5: 验证题池扩充**

```bash
db.collection('ai_question_pool').where({ kp_id: 'kp1_1', verified: true }).count()
# 预期: 题目数量 >= 5
```

- [ ] **Step 6: 验证用户获得新题目**

```javascript
// 再次练习
const result = await wx.cloud.callFunction({
  name: 'practice_v2',
  data: { knowledge_point_id: 'kp1_1', num_questions: 5 }
});

console.log(result.result.data.questions);
// 预期: 返回的题目包含新生成的AI题目
```

---

## Phase 8: 监控与优化

### Task 12: 添加监控指标

**文件:**
- Create: `cloudfunctions/pregenWorker/metrics.js`

- [ ] **Step 1: 实现监控收集**

```javascript
/**
 * 监控指标收集
 */

async function recordMetrics(db, metrics) {
  try {
    await db.collection('pregen_metrics').add({
      data: {
        ...metrics,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[recordMetrics] Error:', error);
  }
}

async function getDailyStats(db, date = null) {
  const dateStr = date || new Date().toISOString().split('T')[0];
  const startOfDay = `${dateStr}T00:00:00.000Z`;
  const endOfDay = `${dateStr}T23:59:59.999Z`;

  const [tasksGenerated, questionsGenerated, avgGenerationTime] = await Promise.all([
    db.collection('pregen_queue')
      .where({
        created_at: db.command.gte(startOfDay).and(db.command.lte(endOfDay))
      })
      .count(),
    db.collection('ai_question_pool')
      .where({
        created_at: db.command.gte(startOfDay).and(db.command.lte(endOfDay))
      })
      .count(),
    // 平均生成时间可从任务记录计算
  ]);

  return {
    date: dateStr,
    tasks_generated: tasksGenerated.total || 0,
    questions_generated: questionsGenerated.total || 0
  };
}

module.exports = {
  recordMetrics,
  getDailyStats
};
```

- [ ] **Step 2: 设置成本告警**

每日生成量 < 1000次即满足目标，可设置：
- 每日统计生成次数
- 超过阈值时记录告警

---

## 验收标准

### 功能验收

- [ ] 用户练习后，`kp_request_log` 正确记录
- [ ] 热度计算公式正确，分数在 0-10 范围内
- [ ] 题池不足时，`pregen_queue` 正确创建任务
- [ ] **`recordKpRequest` 自动触发预生成（"润物细无声"核心）**
- [ ] **热度上升后自动创建预生成任务，无需人工干预**
- [ ] `pregenWorker` 成功生成并验证题目
- [ ] 验证通过的题目写入 `ai_question_pool`
- [ ] `practice_v2` 优先消费AI题池题目
- [ ] `used_count` 正确递增

### "润物细无声"验收（核心目标）

- [ ] **自动触发**: 用户练习达到阈值后，自动触发预生成
- [ ] **静默运行**: 用户无感知，题目"悄悄"增加
- [ ] **闭环验证**: 练习 → 热度↑ → 自动触发 → 题池↑ → 更好服务

### 性能验收

- [ ] 每日LLM调用 < 1000次
- [ ] 验证通过率 > 80%
- [ ] 题池每日净增长 > 0

### 数据验收

```bash
# 运行验收查询
db.collection('kp_request_log').count()
db.collection('pregen_queue').where({ status: 'completed' }).count()
db.collection('ai_question_pool').where({ verified: true }).count()
```

---

## 附录

### 环境变量配置

在云函数配置中设置：

```
DASHSCOPE_API_KEY=your_api_key_here
```

### 数据库索引汇总

| 集合 | 索引字段 | 类型 |
|------|---------|------|
| pregen_queue | status(1) + priority(-1) | 复合 |
| ai_question_pool | kp_id(1) + difficulty(1) + verified(1) | 复合 |
| ai_question_pool | used_count(1) | 单字段 |

### 知识点ID参考

| 章节 | 知识点ID |
|------|---------|
| 二次根式 | kp1_1, kp1_2, kp1_3 |
| 勾股定理 | kp2_1, kp2_2, kp2_3 |
| 平行四边形 | kp3_1, kp3_2, kp3_3 |
| 一次函数 | kp4_1, kp4_2, kp4_3 |
| 数据的分析 | kp5_1, kp5_2 |
