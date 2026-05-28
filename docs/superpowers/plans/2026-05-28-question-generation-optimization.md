# 题目生成系统性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将题目生成响应时间从34秒/3题降低到80%请求<100ms、20%请求<5秒，同时降低API成本50%

**Architecture:** 分层兜底架构（L1:Redis缓存/L2:数据库/L3:批量生成+轮询），复用questionGenerator处理两种队列（用户任务优先、预生成任务后台填充）

**Tech Stack:** 微信云函数、云数据库、heat-calculator（已有）、pregen-trigger（已有）

---

## 文件结构概览

### 新建文件
- `cloudfunctions/shared/kp-request-logger.js` - 知识点请求日志记录器
- `cloudfunctions/shared/queue-manager.js` - 队列管理器（支持两种队列）
- `cloudfunctions/queryProgress/index.js` - 进度查询云函数
- `cloudfunctions/generateQuestions/index.js` - 生成任务云函数（返回task_id）

### 修改文件
- `cloudfunctions/questionGenerator/index.js` - 支持pregen_queue处理
- `cloudfunctions/generateAiQuestion/index.js` - 支持批量生成
- `cloudfunctions/startAssessment/index.js` - 记录kp_request_log

### 新建集合
- `kp_request_log` - 知识点请求日志
- `generation_tasks` - 生成任务状态
- `pregen_queue` - 预生成任务队列（如果不存在）

---

## 阶段0：补全现有机制（优先级最高）

### Task 1: 创建数据库初始化云函数

**Files:**
- Create: `cloudfunctions/initDatabase/index.js`
- Create: `cloudfunctions/initDatabase/package.json`

- [ ] **Step 1: 创建initDatabase云函数**

```javascript
/**
 * initDatabase 云函数
 * 功能：初始化数据库集合和索引
 * 用途：一次性运行，确保kp_request_log和generation_tasks集合存在
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const results = { collections: [], errors: [] };

  try {
    console.log('[InitDatabase] Started at', new Date().toISOString());

    // 初始化kp_request_log集合
    try {
      await db.collection('kp_request_log').add({
        _id: '__init__',
        created_at: new Date(),
        note: '初始化标记，运行后可删除'
      });
      results.collections.push('kp_request_log');
      console.log('[InitDatabase] Created kp_request_log collection');
    } catch (e) {
      if (e.errCode === -1) {
        results.collections.push('kp_request_log (already exists)');
        console.log('[InitDatabase] kp_request_log already exists');
      } else {
        throw e;
      }
    }

    // 初始化generation_tasks集合
    try {
      await db.collection('generation_tasks').add({
        _id: '__init__',
        created_at: new Date(),
        note: '初始化标记，运行后可删除'
      });
      results.collections.push('generation_tasks');
      console.log('[InitDatabase] Created generation_tasks collection');
    } catch (e) {
      if (e.errCode === -1) {
        results.collections.push('generation_tasks (already exists)');
        console.log('[InitDatabase] generation_tasks already exists');
      } else {
        throw e;
      }
    }

    // 初始化pregen_queue集合（如果不存在）
    try {
      await db.collection('pregen_queue').add({
        _id: '__init__',
        created_at: new Date(),
        note: '初始化标记，运行后可删除'
      });
      results.collections.push('pregen_queue');
      console.log('[InitDatabase] Created pregen_queue collection');
    } catch (e) {
      if (e.errCode === -1) {
        results.collections.push('pregen_queue (already exists)');
        console.log('[InitDatabase] pregen_queue already exists');
      } else {
        throw e;
      }
    }

    return {
      success: true,
      results
    };

  } catch (e) {
    console.error('[InitDatabase] Error:', e.message);
    return {
      success: false,
      error: e.message,
      results
    };
  }
};
```

- [ ] **Step 2: 创建package.json**

```bash
mkdir -p cloudfunctions/initDatabase
```

```json
{
  "name": "initDatabase",
  "version": "1.0.0",
  "description": "数据库初始化云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 3: 部署并运行一次**

```bash
# 在微信开发者工具中：
# 1. 创建云函数initDatabase
# 2. 上传并部署
# 3. 手动触发一次运行
# 4. 验证集合创建成功
```

Expected: 返回success: true，collections包含3个集合

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/initDatabase/
git commit -m "feat(initDatabase): add database initialization cloud function"
```

---

### Task 2: 创建请求日志记录器

**Files:**
- Create: `cloudfunctions/shared/kp-request-logger.js`

- [ ] **Step 1: 创建kp-request-logger.js**

```javascript
/**
 * 知识点请求日志记录器
 * 用途：记录每次知识点请求，用于热度计算和预生成触发
 */

/**
 * 记录知识点请求
 * @param {Object} db - 数据库实例
 * @param {Object} params - 请求参数
 * @returns {Promise<void>}
 */
async function logKpRequest(db, params) {
  const { kp_id, kp_name, subject, student_id, source = 'assessment' } = params;

  try {
    await db.collection('kp_request_log').add({
      kp_id,
      kp_name,
      subject,
      student_id,
      source,
      requested_at: new Date()
    });
    console.log('[KpLogger] Logged request:', kp_id, kp_name);
  } catch (e) {
    console.error('[KpLogger] Failed to log:', e.message);
    // 记录失败不影响主流程
  }
}

/**
 * 获取知识点请求统计（用于热度计算）
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @param {number} days - 统计天数
 * @returns {Promise<Object>} 统计结果
 */
async function getKpRequestStats(db, kpId, days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await db.collection('kp_request_log')
      .where({
        kp_id: kpId,
        requested_at: db.command.gte(startDate)
      })
      .count();

    return {
      kp_id: kpId,
      count: result.total || 0,
      days
    };
  } catch (e) {
    console.error('[KpLogger] Failed to get stats:', e.message);
    return { kp_id: kpId, count: 0, days };
  }
}

module.exports = {
  logKpRequest,
  getKpRequestStats
};
```

- [ ] **Step 2: 提交**

```bash
git add cloudfunctions/shared/kp-request-logger.js
git commit -m "feat(shared): add kp-request-logger module"
```

---

### Task 3: 在startAssessment中集成请求日志

**Files:**
- Modify: `cloudfunctions/startAssessment/index.js`

- [ ] **Step 1: 读取startAssessment主文件，找到请求处理位置**

```bash
# 查看startAssessment文件结构
grep -n "exports.main" cloudfunctions/startAssessment/index.js
```

Expected: 找到exports.main的行号（通常在文件末尾）

- [ ] **Step 2: 在文件顶部添加导入**

在 `let cloud;` 之前添加：
```javascript
const { logKpRequest } = require('../shared/kp-request-logger');
```

- [ ] **Step 3: 在请求处理逻辑中添加日志记录**

找到处理知识点的代码位置（通常在解析event参数后），添加：
```javascript
// 记录知识点请求（异步，不阻塞主流程）
if (event.kp_id && event.kp_name) {
  logKpRequest(db, {
    kp_id: event.kp_id,
    kp_name: event.kp_name,
    subject: event.subject || 'biology',
    student_id: event.student_id || null,
    source: 'assessment'
  }).catch(e => console.error('[StartAssessment] Log failed:', e.message));
}
```

- [ ] **Step 4: 部署并测试**

```bash
# 部署startAssessment云函数
# 在微信开发者工具中：云开发 → 云函数 → startAssessment → 上传并部署
```

- [ ] **Step 5: 验证日志记录**

调用startAssessment云函数，然后检查数据库：
```bash
# 在云开发控制台 → 数据库 → kp_request_log
# 验证有新记录生成
```

Expected: kp_request_log集合有新记录，包含kp_id、kp_name、requested_at字段

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/startAssessment/index.js
git commit -m "feat(startAssessment): log kp requests to kp_request_log"
```

---

### Task 4: 创建队列管理器

**Files:**
- Create: `cloudfunctions/shared/queue-manager.js`

- [ ] **Step 1: 创建queue-manager.js**

```javascript
/**
 * 队列管理器
 * 用途：支持questionGenerator处理两种队列（用户任务、预生成任务）
 */

/**
 * 获取待处理的队列任务
 * @param {Object} db - 数据库实例
 * @param {number} maxTasks - 最大任务数
 * @param {string} queueType - 队列类型：'question_queue' | 'pregen_queue'
 * @returns {Promise<Array>} 任务列表
 */
async function fetchPendingTasks(db, maxTasks = 3, queueType = 'question_queue') {
  const collection = queueType === 'pregen_queue' ? 'pregen_queue' : 'question_queue';

  try {
    const result = await db.collection(collection)
      .where({ status: 'pending' })
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'asc')
      .limit(maxTasks)
      .get();

    console.log(`[QueueManager] Fetched ${result.data?.length || 0} tasks from ${collection}`);
    return result.data || [];
  } catch (e) {
    console.error(`[QueueManager] Error fetching ${collection}:`, e.message);
    return [];
  }
}

/**
 * 创建预生成任务
 * @param {Object} db - 数据库实例
 * @param {Object} taskData - 任务数据
 * @returns {Promise<string>} 任务ID
 */
async function createPreGenTask(db, taskData) {
  try {
    const { kp_id, kp_name, subject, difficulty, count = 5 } = taskData;

    const result = await db.collection('pregen_queue').add({
      kp_id,
      kp_name,
      subject: subject || 'biology',
      difficulty,
      count,
      status: 'pending',
      priority: 1, // 预生成任务低优先级
      created_at: new Date()
    });

    console.log('[QueueManager] Created pregen task:', result.id);
    return result.id;
  } catch (e) {
    console.error('[QueueManager] Failed to create pregen task:', e.message);
    throw e;
  }
}

module.exports = {
  fetchPendingTasks,
  createPreGenTask
};
```

- [ ] **Step 2: 提交**

```bash
git add cloudfunctions/shared/queue-manager.js
git commit -m "feat(shared): add queue-manager module"
```

---

### Task 5: 修改questionGenerator支持两种队列

**Files:**
- Modify: `cloudfunctions/questionGenerator/index.js`

- [ ] **Step 1: 读取当前fetchPendingTasks函数**

```bash
grep -n "async function fetchPendingTasks" cloudfunctions/questionGenerator/index.js
```

Expected: 找到函数定义（约第39行）

- [ ] **Step 2: 删除或注释掉原有fetchPendingTasks函数**

在函数定义前添加注释：
```javascript
// fetchPendingTasks现在由queue-manager提供，此处保留引用以便后续清理
// async function fetchPendingTasks(db, maxTasks = 3) { ... }
```

然后找到函数结束位置（约第79行），注释掉整个函数。

- [ ] **Step 3: 在文件顶部添加queue-manager导入**

在 `// ========== 辅助函数导入 ==========` 后添加：
```javascript
const { fetchPendingTasks: fetchTasks, createPreGenTask } = require('./shared/queue-manager');
```

- [ ] **Step 4: 修改exports.main入口逻辑**

找到 `// 1. 获取待处理任务（最多3个）` 部分，修改为：
```javascript
// 1. 优先获取用户任务
let tasks = await fetchTasks(db, 3, 'question_queue');
let queueSource = 'question_queue';

// 2. 如果用户队列为空，处理预生成任务
if (tasks.length === 0) {
  tasks = await fetchTasks(db, 5, 'pregen_queue');
  queueSource = 'pregen_queue';
}

const fetchDuration = Date.now() - fetchStart;
console.log(`[questionGenerator] Fetched ${tasks.length} tasks from ${queueSource} in ${fetchDuration}ms`);
```

- [ ] **Step 5: 验证队列切换逻辑**

```bash
# 部署questionGenerator云函数
# 在微信开发者工具中：云开发 → 云函数 → questionGenerator → 上传并部署

# 触发questionGenerator，查看日志
# 日志应显示：Fetched X tasks from question_queue 或 pregen_queue
```

Expected: 日志显示正确的队列来源

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/questionGenerator/index.js
git commit -m "feat(questionGenerator): support two queue types with priority"
```

---

### Task 6: 创建预生成触发器云函数（复用已有模块）

**Files:**
- Create: `cloudfunctions/pregenTrigger/index.js`
- Create: `cloudfunctions/pregenTrigger/package.json`

**注意:** 复用`shared/pregen-trigger.js`已有实现，该文件包含`shouldPreGenerate`和`createPreGenTask`函数

- [ ] **Step 1: 创建pregenTrigger云函数入口**

```javascript
/**
 * pregenTrigger 云函数
 * 功能：定时触发（每5分钟），扫描kp_request_log并创建预生成任务
 * 复用：shared/pregen-trigger.js（已有完整实现）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { calculateHeatScore } = require('../shared/heat-calculator');
const { shouldPreGenerate, createPreGenTask: createPreGenTaskShared } = require('../shared/pregen-trigger');

/**
 * 获取高热度知识点列表
 * @param {Object} db - 数据库实例
 * @returns {Promise<Array>} 知识点列表
 */
async function getHotKnowledgePoints(db) {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await db.collection('kp_request_log')
      .where({
        requested_at: db.command.gte(sevenDaysAgo)
      })
      .field({ kp_id: true, kp_name: true, subject: true })
      .get();

    const kpStats = {};
    (result.data || []).forEach(log => {
      const key = log.kp_id;
      if (!kpStats[key]) {
        kpStats[key] = {
          kp_id: log.kp_id,
          kp_name: log.kp_name,
          subject: log.subject || 'biology',
          count: 0
        };
      }
      kpStats[key].count++;
    });

    const hotKps = Object.values(kpStats)
      .map(kp => ({
        ...kp,
        heat_score: calculateHeatScore({ count: kp.count, last_requested: Date.now() })
      }))
      .filter(kp => kp.heat_score >= 4)
      .sort((a, b) => b.heat_score - a.heat_score);

    console.log(`[PreGenTrigger] Found ${hotKps.length} hot knowledge points`);
    return hotKps;
  } catch (e) {
    console.error('[PreGenTrigger] Error getting hot KPs:', e.message);
    return [];
  }
}

/**
 * 获取知识点可用题目数量
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @returns {Promise<number>} 题目数量
 */
async function countAvailableQuestions(db, kpId) {
  try {
    const result = await db.collection('ai_question_pool')
      .where({ knowledge_point_id: kpId })
      .count();
    return result.total || 0;
  } catch (e) {
    console.error('[PreGenTrigger] Error counting questions:', e.message);
    return 0;
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const startTime = Date.now();
  const db = cloud.database();

  try {
    console.log('[PreGenTrigger] Started at', new Date().toISOString());

    const hotKps = await getHotKnowledgePoints(db);

    if (hotKps.length === 0) {
      console.log('[PreGenTrigger] No hot KPs found');
      return { success: true, created: 0 };
    }

    let createdCount = 0;

    for (const kp of hotKps) {
      const available = await countAvailableQuestions(db, kp.kp_id);

      // 构造requestLog对象供shouldPreGenerate使用
      const requestLog = { count: kp.count };
      const trigger = shouldPreGenerate(kp.kp_id, requestLog, available);

      if (trigger.should) {
        // 复用shared/pregen-trigger.js的createPreGenTask
        const result = await createPreGenTaskShared(db, kp.kp_id, trigger);
        if (result.created) {
          createdCount++;
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[PreGenTrigger] Completed in ${duration}ms, created ${createdCount} tasks`);

    return {
      success: true,
      created: createdCount,
      duration
    };

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error('[PreGenTrigger] Error:', e.message);

    return {
      success: false,
      error: e.message,
      duration
    };
  }
};
```

- [ ] **Step 2: 创建package.json**

```bash
mkdir -p cloudfunctions/pregenTrigger
```

```json
{
  "name": "pregenTrigger",
  "version": "1.0.0",
  "description": "预生成触发器云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 3: 部署并测试**

```bash
# 在微信开发者工具中：
# 1. 创建云函数pregenTrigger
# 2. 设置定时触发器：cron表达式为 0 */5 * * * * （每5分钟）
# 3. 上传并部署
# 4. 手动触发一次测试

# 查看日志，验证：
# - 能正确获取高热度知识点
# - 能正确判断是否需要预生成
# - 能正确创建预生成任务
```

Expected: 日志显示"Created X tasks"，pregen_queue有新任务

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/pregenTrigger/
git commit -m "feat(pregenTrigger): add pre-generation trigger cloud function"
```

---

### Task 7: 阶段0验收测试

- [ ] **Step 1: 验证kp_request_log有记录增长**

```bash
# 在云开发控制台 → 数据库 → kp_request_log
# 执行查询：db.collection('kp_request_log').orderBy('requested_at', 'desc').limit(10).get()
```

Expected: 有最近10条记录，时间戳正确

- [ ] **Step 2: 验证pregen_queue有任务自动创建**

```bash
# 在云开发控制台 → 数据库 → pregen_queue
# 执行查询：db.collection('pregen_queue').where({status: 'pending'}).get()
```

Expected: 有自动创建的预生成任务

- [ ] **Step 3: 验证热度计算正确**

查看questionGenerator或pregenTrigger日志，确认热度分数在0-10范围内。

Expected: 热度分数在0-10之间

- [ ] **Step 4: 验证questionGenerator能处理两种队列**

手动向question_queue和pregen_queue各添加一条测试记录，触发questionGenerator，查看日志。

Expected: 日志显示"from question_queue"或"from pregen_queue"

- [ ] **Step 5: 阶段0验收完成**

如果以上4项验证全部通过，阶段0完成。

---

## 阶段1：批量API改造

### Task 8: 读取generateAiQuestion当前实现

**Files:**
- Read: `cloudfunctions/generateAiQuestion/index.js`

- [ ] **Step 1: 读取generateAiQuestion主文件**

```bash
# 查看文件结构
wc -l cloudfunctions/generateAiQuestion/index.js
head -100 cloudfunctions/generateAiQuestion/index.js
```

Expected: 了解当前单题生成的实现方式

- [ ] **Step 2: 找到MiniMax API调用位置**

```bash
grep -n "callFunction\|MiniMax\|API" cloudfunctions/generateAiQuestion/index.js
```

Expected: 找到API调用的具体代码位置

---

### Task 9: 修改generateAiQuestion支持批量生成

**Files:**
- Modify: `cloudfunctions/generateAiQuestion/index.js`

- [ ] **Step 1: 修改接口支持count参数**

找到exports.main函数，修改参数解析：
```javascript
exports.main = async (event, context) => {
  const { kp_id, kp_name, difficulty = 'medium', count = 1, skip_image = true } = event;

  // 向后兼容：如果没有kp_name但有kp_id，使用默认名称
  const finalKpName = kp_name || kp_id || 'unknown';

  console.log(`[GenerateAi] START kp:${kp_id} name:${finalKpName} difficulty:${difficulty} count:${count}`);

  // ... rest of the code
}
```

- [ ] **Step 2: 修改Prompt支持批量生成**

找到Prompt定义位置，修改为：
```javascript
// 批量生成Prompt
const prompt = count > 1
  ? `请生成${count}道关于${finalKpName}的${difficulty}难度选择题。返回JSON数组格式，每题包含question（题干）、options（选项数组，4个）、correct_answer（正确答案，0-3索引）、explanation（解析）。`
  : `请生成1道关于${finalKpName}的${difficulty}难度选择题。返回JSON格式，包含question、options（4个选项）、correct_answer（0-3索引）、explanation。`;
```

- [ ] **Step 3: 添加批量降级逻辑**

在API调用后添加：
```javascript
// 批量生成降级策略
async function generateWithFallback(kpId, kpName, difficulty, count) {
  const batchSize = 3;
  const allQuestions = [];

  // 尝试批量生成
  for (let batchStart = 0; batchStart < count; batchStart += batchSize) {
    const batchCount = Math.min(batchSize, count - batchStart);

    try {
      const batch = await generateBatch(kpId, kpName, difficulty, batchCount);
      allQuestions.push(...batch);
      console.log(`[GenerateAi] Batch ${Math.floor(batchStart / batchSize) + 1} completed: ${batch.length} questions`);
    } catch (e) {
      console.warn(`[GenerateAi] Batch failed, falling back to single:`, e.message);

      // 降级到单题生成
      for (let i = 0; i < batchCount; i++) {
        try {
          const q = await generateSingle(kpId, kpName, difficulty);
          if (q) allQuestions.push(q);
        } catch (e2) {
          console.error(`[GenerateAi] Single question failed:`, e2.message);
        }
      }
    }
  }

  return allQuestions;
}
```

- [ ] **Step 4: 修改返回格式支持metadata**

```javascript
return {
  success: true,
  questions: allQuestions,
  metadata: {
    total_requested: count,
    successful: allQuestions.length,
    failed: count - allQuestions.length,
    kp_id,
    difficulty
  }
};
```

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/generateAiQuestion/index.js
git commit -m "feat(generateAiQuestion): support batch generation with fallback"
```

---

### Task 10: 更新questionGenerator调用批量接口

**Files:**
- Modify: `cloudfunctions/questionGenerator/index.js`

- [ ] **Step 1: 找到generateAi调用位置**

```bash
grep -n "generateAi\|generateSingle" cloudfunctions/questionGenerator/index.js
```

Expected: 找到generateAi函数调用（约第206行）

- [ ] **Step 2: 修改generateAi函数支持count参数**

修改generateAi函数签名和实现：
```javascript
async function generateAi(task, difficulty, count) {
  const startTime = Date.now();
  console.log(`[generateAi] START task:${task._id} difficulty:${difficulty} count:${count}`);

  try {
    const kpList = knowledgePoints[task.subject] || knowledgePoints.math;

    // 批量生成：每次最多3道题并行
    const BATCH_SIZE = 3;
    const allQuestions = [];

    for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, count);
      const batchCount = batchEnd - batchStart;

      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const kpName = kpList[i % kpList.length];
        batchPromises.push(generateSingleQuestion(kpName, difficulty, task));
      }

      const batchResults = await Promise.all(batchPromises);
      allQuestions.push(...batchResults.filter(Boolean));

      if (batchEnd < count) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[generateAi] SUCCESS task:${task._id} count:${allQuestions.length}/${count} duration:${duration}ms`);

    return allQuestions;
  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`[generateAi] FAILED task:${task._id} duration:${duration}ms error:`, e.message);
    throw e;
  }
}
```

- [ ] **Step 3: 修改调用处传递count参数**

找到generateAi的调用位置，添加count参数：
```javascript
const result = await workflow.execute(task, db);

// 确保GenerateStep接收count参数
```

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/questionGenerator/index.js
git commit -m "refactor(questionGenerator): update generateAi to support batch count"
```

---

### Task 11: 阶段1验收测试

- [ ] **Step 1: 测试批量生成3题**

调用generateAiQuestion云函数，传入count=3，验证返回3题。

```bash
# 在微信开发者工具中：
# 云函数 → generateAiQuestion → 调用 → 参数：{"kp_id":"test","kp_name":"测试","difficulty":"medium","count":3}
```

Expected: 返回questions数组长度=3，metadata.total_requested=3

- [ ] **Step 2: 测试部分失败场景**

模拟API部分失败，验证降级逻辑正确。

Expected: 返回部分成功的题目，metadata.failed>0

- [ ] **Step 3: 测试向后兼容**

调用时不传count参数，验证默认生成1题。

Expected: 返回1题，格式与之前一致

- [ ] **Step 4: 验证成本降低**

对比单题调用和批量调用的耗时/成本。

Expected: 批量生成3题耗时<15秒，比串行3次单题调用快约50%

- [ ] **Step 5: 阶段1验收完成**

---

## 阶段2：轮询进度查询

### Task 12: 创建generation_tasks集合

**Files:**
- Modify: `cloudfunctions/questionGenerator/index.js`

- [ ] **Step 1: 添加generation_tasks初始化**

在ensureCollections函数中添加：
```javascript
async function ensureCollections(db) {
  try {
    // 创建kp_request_log集合索引
    const logResult = await db.collection('kp_request_log').doc('__init__').get();
    if (!logResult.data) {
      console.log('[Init] Creating kp_request_log index');
      await db.collection('kp_request_log').add({
        _id: '__init__',
        created_at: new Date()
      });
    }

    // 创建generation_tasks集合
    const genResult = await db.collection('generation_tasks').doc('__init__').get();
    if (!genResult.data) {
      console.log('[Init] Creating generation_tasks collection');
      await db.collection('generation_tasks').add({
        _id: '__init__',
        created_at: new Date()
      });
    }
  } catch (e) {
    console.log('[Init] Collection check:', e.message);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add cloudfunctions/questionGenerator/index.js
git commit -m "feat(questionGenerator): add generation_tasks collection init"
```

---

### Task 13: 创建generateQuestions云函数

**Files:**
- Create: `cloudfunctions/generateQuestions/index.js`
- Create: `cloudfunctions/generateQuestions/package.json`

- [ ] **Step 1: 创建generateQuestions云函数**

```javascript
/**
 * generateQuestions 云函数
 * 功能：异步生成题目，返回task_id供客户端轮询
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 异步生成题目（不阻塞响应）
 * @param {string} taskId - 任务ID
 * @param {Object} params - 生成参数
 */
async function generateQuestionsAsync(taskId, params) {
  const { kp_id, kp_name, difficulty, count } = params;
  const db = cloud.database();

  try {
    console.log(`[GenerateAsync] START task:${taskId} kp:${kp_id} count:${count}`);

    // 调用generateAiQuestion云函数
    const result = await cloud.callFunction({
      name: 'generateAiQuestion',
      data: {
        kp_id,
        kp_name,
        difficulty,
        count,
        skip_image: true
      }
    });

    if (result.result && result.result.success) {
      const questions = result.result.questions || [];

      // 更新任务进度
      await db.collection('generation_tasks').doc(taskId).update({
        status: 'completed',
        progress: questions.length,
        questions
      });

      console.log(`[GenerateAsync] COMPLETED task:${taskId} questions:${questions.length}`);
    } else {
      throw new Error(result.errMsg || 'Generate failed');
    }
  } catch (e) {
    console.error(`[GenerateAsync] FAILED task:${taskId}:`, e.message);

    await db.collection('generation_tasks').doc(taskId).update({
      status: 'failed',
      error: e.message
    });
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    const { kp_id, kp_name, difficulty = 'medium', count = 3 } = event;

    // 创建任务记录
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.collection('generation_tasks').add({
      _id: taskId,
      kp_id,
      kp_name,
      difficulty,
      count,
      status: 'processing',
      progress: 0,
      questions: [],
      created_at: new Date()
    });

    console.log(`[GenerateQuestions] Created task:${taskId}`);

    // 异步生成（不阻塞响应）
    generateQuestionsAsync(taskId, { kp_id, kp_name, difficulty, count });

    // 立即返回任务ID
    return {
      success: true,
      task_id: taskId
    };

  } catch (e) {
    console.error('[GenerateQuestions] Error:', e.message);
    return {
      success: false,
      error: e.message
    };
  }
};
```

- [ ] **Step 2: 创建package.json**

```bash
mkdir -p cloudfunctions/generateQuestions
```

```json
{
  "name": "generateQuestions",
  "version": "1.0.0",
  "description": "异步生成题目云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add cloudfunctions/generateQuestions/
git commit -m "feat(generateQuestions): add async question generation cloud function"
```

---

### Task 14: 创建queryProgress云函数

**Files:**
- Create: `cloudfunctions/queryProgress/index.js`
- Create: `cloudfunctions/queryProgress/package.json`

- [ ] **Step 1: 创建queryProgress云函数**

```javascript
/**
 * queryProgress 云函数
 * 功能：查询生成任务进度
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    const { task_id } = event;

    if (!task_id) {
      throw new Error('task_id is required');
    }

    const task = await db.collection('generation_tasks').doc(task_id).get();

    if (!task.data) {
      return {
        success: false,
        error: 'Task not found'
      };
    }

    return {
      success: true,
      status: task.data.status,
      progress: task.data.progress || 0,
      total: task.data.count || 0,
      questions: task.data.questions || [],
      error: task.data.error || null
    };

  } catch (e) {
    console.error('[QueryProgress] Error:', e.message);
    return {
      success: false,
      error: e.message
    };
  }
};
```

- [ ] **Step 2: 创建package.json**

```bash
mkdir -p cloudfunctions/queryProgress
```

```json
{
  "name": "queryProgress",
  "version": "1.0.0",
  "description": "查询生成任务进度",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add cloudfunctions/queryProgress/
git commit -m "feat(queryProgress): add query progress cloud function"
```

---

### Task 15: 前端轮询逻辑实现

**Files:**
- Modify: （前端页面文件，需根据实际项目确定）

- [ ] **Step 1: 确定前端文件位置**

```bash
# 查找前端页面文件
find pages -name "*assessment*" -o -name "*question*" 2>/dev/null | head -10
```

Expected: 找到相关的页面文件

- [ ] **Step 2: 实现轮询逻辑**

在生成题目的页面添加：
```javascript
// 发起生成请求
async function startGeneration(kpId, kpName, difficulty) {
  wx.showLoading({ title: '生成中...', mask: true });

  try {
    const response = await wx.cloud.callFunction({
      name: 'generateQuestions',
      data: { kp_id: kpId, kp_name: kpName, difficulty, count: 3 }
    });

    if (response.result.success) {
      const taskId = response.result.task_id;
      wx.hideLoading();

      // 开始轮询
      pollProgress(taskId);
    } else {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: '网络错误', icon: 'none' });
  }
}

// 轮询查询进度
function pollProgress(taskId) {
  let pollCount = 0;
  const maxPolls = 60; // 最多30秒
  let unchangedCount = 0;
  let lastProgress = 0;

  const pollInterval = setInterval(async () => {
    pollCount++;

    if (pollCount > maxPolls) {
      clearInterval(pollInterval);
      wx.showToast({ title: '生成超时', icon: 'none' });
      return;
    }

    try {
      const response = await wx.cloud.callFunction({
        name: 'queryProgress',
        data: { task_id: taskId }
      });

      const { status, progress, total, questions } = response.result;

      // 更新UI
      updateProgressUI(progress, total);
      renderQuestions(questions);

      // 检查进度变化
      if (progress === lastProgress) {
        unchangedCount++;
        if (unchangedCount > 5 && pollInterval) {
          // 连续5次无变化，延长轮询间隔
          clearInterval(pollInterval);
          setTimeout(() => pollProgress(taskId), 1000);
          return;
        }
      } else {
        unchangedCount = 0;
        lastProgress = progress;
      }

      // 完成或失败时停止轮询
      if (status === 'completed') {
        clearInterval(pollInterval);
        wx.showToast({ title: '生成完成', icon: 'success' });
      } else if (status === 'failed') {
        clearInterval(pollInterval);
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[Poll] Error:', e);
      // 出错继续轮询
    }
  }, 500); // 每500ms查询一次
}

// 更新进度UI
function updateProgressUI(current, total) {
  const percent = Math.floor((current / total) * 100);
  // 更新进度条或文本
  console.log(`[Progress] ${current}/${total} (${percent}%)`);
}

// 渲染题目
function renderQuestions(questions) {
  if (!questions || questions.length === 0) return;

  // 渲染题目到页面
  questions.forEach(q => {
    appendQuestionCard(q);
  });
}
```

- [ ] **Step 3: 提交**

```bash
git add pages/
git commit -m "feat(pages): add poll-based progress query for question generation"
```

---

### Task 16: 阶段2验收测试

- [ ] **Step 1: 测试完整生成流程**

调用generateQuestions → 获取task_id → 轮询queryProgress → 完成后显示题目。

Expected: 生成过程中实时看到进度，完成后显示3题

- [ ] **Step 2: 测试超时场景**

模拟生成超时，验证30秒后提示用户。

Expected: 显示"生成超时"提示

- [ ] **Step 3: 测试并发请求**

同时发起多个生成请求，验证各任务独立处理。

Expected: 各任务独立，互不影响

- [ ] **Step 4: 验证首次响应时间**

测量从发起请求到首次进度返回的时间。

Expected: 首次响应<500ms

- [ ] **Step 5: 阶段2验收完成**

---

## 阶段3：题库动态扩容（Redis可选）

### Task 17: 评估阶段0-2效果

- [ ] **Step 1: 分析kp_request_log数据**

```bash
# 在云开发控制台执行聚合查询
db.collection('kp_request_log').groupBy('kp_id').count().get()
```

Expected: 获取各知识点请求次数统计

- [ ] **Step 2: 计算当前题库命中率**

对比kp_request_log的请求次数和ai_question_pool的题目覆盖情况。

Expected: 得到当前命中率数据

- [ ] **Step 3: 识别高热度知识点**

根据请求次数排序，识别前20%的高热度知识点。

Expected: 高热度知识点列表

- [ ] **Step 4: 决定是否引入Redis**

根据命中率决定：
- 命中率>60%：暂不引入Redis
- 命中率<60%：考虑引入Redis

Expected: 决策结论

---

### Task 18: Redis缓存实现（可选）

**条件：** 仅在Task 17决定引入Redis时执行

**Files:**
- Create: `cloudfunctions/shared/cache-manager.js`

- [ ] **Step 1: 创建cache-manager.js**

```javascript
/**
 * 缓存管理器
 * 用途：管理题目缓存（Redis或云数据库）
 * 降级策略：缓存失败→直连数据库查询
 */

// 缓存配置
const CACHE_CONFIG = {
  enabled: false, // 根据阶段0-2效果决定
  provider: 'database', // 'redis' | 'database'
  ttl: 7 * 24 * 60 * 60 * 1000 // 7天
};

/**
 * 获取缓存题目（带降级）
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @param {string} difficulty - 难度
 * @returns {Promise<Array>} 题目列表
 */
async function getCachedQuestions(db, kpId, difficulty) {
  if (!CACHE_CONFIG.enabled) return null;

  try {
    const cacheKey = `question:pool:${kpId}:${difficulty}`;

    if (CACHE_CONFIG.provider === 'database') {
      const result = await db.collection('question_cache').doc(cacheKey).get();
      if (result.data && result.data.expires_at > new Date()) {
        return result.data.questions;
      }
      return null;
    }
    return null;
  } catch (e) {
    console.warn('[Cache] Get failed, falling back to DB:', e.message);
    return null; // 触发降级
  }
}

/**
 * 获取题目（带降级策略）
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @param {string} difficulty - 难度
 * @returns {Promise<Array>} 题目列表
 */
async function getQuestionsWithFallback(db, kpId, difficulty) {
  // L1: 尝试缓存
  const cached = await getCachedQuestions(db, kpId, difficulty);
  if (cached && cached.length > 0) {
    console.log('[Cache] HIT:', kpId, difficulty);
    return cached;
  }

  // L2: 缓存未命中，查询数据库
  console.log('[Cache] MISS, querying DB:', kpId, difficulty);
  try {
    const result = await db.collection('ai_question_pool')
      .where({
        knowledge_point_id: kpId,
        difficulty: difficulty
      })
      .limit(20)
      .get();

    const questions = result.data || [];

    // 更新缓存
    if (questions.length > 0) {
      await setCachedQuestions(db, kpId, difficulty, questions);
    }

    return questions;
  } catch (e) {
    console.error('[DB] Query failed:', e.message);
    return []; // 最终降级：返回空数组
  }
}

/**
 * 设置缓存题目
 * @param {Object} db - 数据库实例
 * @param {string} kpId - 知识点ID
 * @param {string} difficulty - 难度
 * @param {Array} questions - 题目列表
 */
async function setCachedQuestions(db, kpId, difficulty, questions) {
  if (!CACHE_CONFIG.enabled) return;

  try {
    const cacheKey = `question:pool:${kpId}:${difficulty}`;
    const expiresAt = new Date(Date.now() + CACHE_CONFIG.ttl);

    if (CACHE_CONFIG.provider === 'database') {
      await db.collection('question_cache').doc(cacheKey).set({
        kp_id: kpId,
        difficulty,
        questions,
        expires_at: expiresAt,
        created_at: new Date()
      });
    }
  } catch (e) {
    console.warn('[Cache] Set failed:', e.message);
  }
}

module.exports = {
  getCachedQuestions,
  setCachedQuestions,
  getQuestionsWithFallback,  // 新增：带降级的题目获取
  CACHE_CONFIG
};
```

- [ ] **Step 2: 提交**

```bash
git add cloudfunctions/shared/cache-manager.js
git commit -m "feat(shared): add cache manager with database fallback"
```

---

### Task 19: 动态扩容高热度知识点

- [ ] **Step 1: 创建扩容任务**

根据高热度知识点列表，创建预生成任务：
```javascript
// 在pregenTrigger中添加高热度扩容逻辑
const highHeatKps = hotKps.filter(kp => k.heat_score >= 7);

for (const kp of highHeatKps) {
  const available = await countAvailableQuestions(db, kp.kp_id);
  if (available < 20) {
    await createPreGenTask(db, {
      kp_id: kp.kp_id,
      kp_name: kp.kp_name,
      subject: kp.subject,
      difficulty: 'medium',
      count: 20 - available // 补足到20题
    });
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add cloudfunctions/pregenTrigger/index.js
git commit -m "feat(pregenTrigger): add high-heat kp expansion"
```

---

### Task 20: 阶段3验收测试

- [ ] **Step 1: 验证高热度知识点题库≥20题**

查询高热度知识点的题目数量。

Expected: 高热度知识点有≥20题

- [ ] **Step 2: 验证题库命中率≥80%**

统计最近请求的命中率。

Expected: 命中率≥80%或达到当前技术上限

- [ ] **Step 3: 验证Redis查询响应<100ms**（如果引入）

测试缓存查询速度。

Expected: 查询响应<100ms

- [ ] **Step 4: 阶段3验收完成**

---

## 阶段4：监控与优化

### Task 21: 添加监控埋点

- [ ] **Step 1: 在关键位置添加埋点**

在以下位置添加监控代码：
- 题库查询命中/未命中
- 批量API成功/失败
- 轮询超时
- 降级触发

- [ ] **Step 2: 提交**

```bash
git add cloudfunctions/
git commit -m "feat(monitoring): add telemetry for key metrics"
```

---

### Task 22: 性能调优

- [ ] **Step 1: 根据监控数据调整缓存策略**

根据命中率统计调整TTL和预热策略。

- [ ] **Step 2: 优化批量API Prompt**

根据生成成功率调整Prompt。

- [ ] **Step 3: 调整轮询间隔**

根据响应时间调整轮询间隔。

---

### Task 23: 压力测试

- [ ] **Step 1: 100并发测试**

使用JMeter或类似工具进行100并发测试。

Expected: 系统稳定，错误率<1%

- [ ] **Step 2: 验证p95响应时间**

统计各层级的p95响应时间。

Expected: 题库命中p95<100ms，实时生成p95<5秒

---

### Task 24: 阶段4验收测试

- [ ] **Step 1: 验证80%请求<100ms**

统计题库命中的响应时间。

Expected: p95<100ms

- [ ] **Step 2: 验证20%请求<5秒**

统计实时生成的响应时间。

Expected: p95<5秒

- [ ] **Step 3: 验证系统稳定性**

运行24小时稳定性测试。

Expected: 错误率<1%

- [ ] **Step 4: 整体验收完成**

---

## 验证命令汇总

| 验收项 | 命令/方法 | 预期输出 |
|-------|---------|---------|
| kp_request_log记录 | 数据库查询 | 有新记录 |
| pregen_queue任务 | 数据库查询 | 有自动创建任务 |
| 热度计算 | 查看日志 | 0-10分 |
| 双队列处理 | 查看日志 | 正确队列来源 |
| 批量生成3题 | 调用API | 3题，<15秒 |
| 部分失败 | 模拟失败 | 返回部分题目 |
| 向后兼容 | 调用无count | 1题，格式不变 |
| 轮询进度 | 调用generateQuestions | task_id + 进度 |
| 超时处理 | 模拟超时 | 30秒后提示 |
| 首次响应 | 测量响应时间 | <500ms |
| 高热度题库 | 数据库查询 | ≥20题 |
| 命中率 | 统计分析 | ≥80% |

---

## 实施顺序

```
阶段0（P0） → 验收 → 阶段1（P1） → 验收 → 阶段2（P1） → 验收 → 阶段3（P2） → 验收 → 阶段4（P2） → 验收
```

**关键路径：**
1. 必须完成阶段0（补全现有机制）才能进行后续阶段
2. 阶段1（批量API）可独立于阶段2（轮询）并行开发
3. 阶段3（Redis）是可选优化，根据阶段0-2效果决定

---

## 回滚计划

如果某个阶段验收失败，回滚策略：
- **阶段0失败**：检查kp_request_log和pregen_queue的数据结构
- **阶段1失败**：批量API降级到单题生成
- **阶段2失败**：轮询降级到同步等待
- **阶段3失败**：Redis降级到直连数据库

每个阶段都有独立验收标准，失败不影响其他阶段。
