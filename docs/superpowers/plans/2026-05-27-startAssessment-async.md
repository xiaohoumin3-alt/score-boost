# startAssessment 异步优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决 startAssessment 云函数超时问题，将同步生成改为异步队列模式

**Architecture:** 三层缓存架构（预置题库→云数据库题池→异步队列），轮询等待模式

**Tech Stack:** 微信云开发, JavaScript, 云数据库

---

## 文件结构

```
cloudfunctions/
├── initQuestionBank/          # 新增：题库迁移云函数
│   └── index.js
├── startAssessment/            # 改造：增加队列模式
│   └── index.js
├── questionGenerator/          # 验证：确认自动创建 assessment
│   └── index.js
├── shared/
│   └── question_bank.js       # 保留：代码中预置题（迁移后备用）
└── ...

utils/
└── cloudApi.js               # 已实现：轮询封装

pages/
├── assessment/
│   └── assessment.js          # 已实现：队列模式处理
└── waiting/
    └── waiting.js            # 已实现：等待页面
```

---

## Task 1: 创建 initQuestionBank 云函数

**Files:**
- Create: `cloudfunctions/initQuestionBank/index.js`

- [ ] **Step 1: 创建目录和配置文件**

```bash
mkdir -p /Users/seanxx/score-boost-mini/cloudfunctions/initQuestionBank
```

创建 `cloudfunctions/initQuestionBank/package.json`:
```json
{
  "name": "initQuestionBank",
  "version": "1.0.0",
  "description": "题库迁移工具：将预置题库迁移到云数据库"
}
```

创建 `cloudfunctions/initQuestionBank/cloudbaserc.json`:
```json
{
  "envId": "cloud1-7gg9y9tjb2b867b6"
}
```

- [ ] **Step 2: 编写 initQuestionBank 云函数**

创建 `cloudfunctions/initQuestionBank/index.js`:

```javascript
/**
 * initQuestionBank 云函数
 * 功能：将预置题库迁移到云数据库 ai_question_pool
 */

let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  cloud = null;
}

// 导入预置题库
const { QUESTION_BANK } = require('../shared/question_bank');

// 导入知识树（用于获取知识点名称）
const { loadKnowledgeTree } = require('../shared/knowledge_tree');

/**
 * 从知识树构建知识点名称映射
 * kp_id → kp_name
 */
function buildKpNameMap() {
  const tree = loadKnowledgeTree('math', '8', '下');
  const map = {};

  for (const chapter of (tree.chapters || [])) {
    for (const kp of (chapter.knowledge_points || [])) {
      // 同时支持 id 和 name 作为键
      map[kp.id] = kp.name || kp.id;
    }
  }

  return map;
}

/**
 * 获取知识点名称
 * @param {string} kpId - 知识点ID (如 "kp1_1")
 * @returns {string} 知识点名称
 */
function getKpName(kpId) {
  const kpNameMap = buildKpNameMap();
  return kpNameMap[kpId] || kpId;
}

/**
 * 格式化选项为统一格式
 * @param {Array} options - 原始选项数组
 * @returns {Array} 格式化后的选项
 */
function formatOptions(options) {
  if (!options || !Array.isArray(options)) return [];

  const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
  return options.map((opt, idx) => {
    // 处理 "A. xxx" 格式
    if (typeof opt === 'string') {
      const dotIdx = opt.indexOf('. ');
      if (dotIdx > 0) {
        return { key: opt.substring(0, dotIdx), value: opt.substring(dotIdx + 2) };
      }
      return { key: keys[idx], value: opt };
    }
    // 处理对象格式 { key, value } 或 { value }
    return { key: opt.key || keys[idx], value: opt.value || opt };
  });
}

/**
 * 迁移题库到云数据库
 * 注意：微信云数据库 add() 一次只能添加一条记录
 */
async function migrateToCloud(db) {
  const questions = [];
  const timestamp = new Date().toISOString();

  // 遍历预置题库
  for (const [kp_id, kp_questions] of Object.entries(QUESTION_BANK)) {
    for (const q of kp_questions) {
      questions.push({
        kp_id,
        kp_name: getKpName(kp_id),
        subject: 'math',  // 预置题库目前只有数学
        difficulty: q.difficulty || 'medium',
        question: q.content,
        options: formatOptions(q.options),
        correct_answer: q.correct_answer,
        verified: true,           // 预置题视为已验证
        correct_rate: 0,
        used_count: 0,
        source: 'seed',
        created_at: timestamp,
        last_used_at: null
      });
    }
  }

  // 检查已迁移数量
  const existingCount = await db.collection('ai_question_pool')
    .where({ source: 'seed' })
    .count();

  if (existingCount.total >= questions.length) {
    return { success: true, migrated: 0, total: questions.length, message: '已迁移，跳过' };
  }

  // 分批写入（每批20条，避免超时）
  // 微信云数据库每次 add 只支持一条，需要循环写入
  const BATCH_SIZE = 20;
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);

    for (const q of batch) {
      try {
        await db.collection('ai_question_pool').add({ data: q });
        migrated++;
      } catch (e) {
        console.error('[initQuestionBank] 写入失败:', e.message);
        failed++;
      }
    }
  }

  return { success: true, migrated, total: questions.length, failed };
}

/**
 * 查询迁移状态
 */
async function getMigrationStatus(db) {
  const seedCount = await db.collection('ai_question_pool')
    .where({ source: 'seed' })
    .count();

  const totalCount = await db.collection('ai_question_pool').count();

  return {
    seed_count: seedCount.total,
    total_count: totalCount.total,
    migrated: seedCount.total > 0
  };
}

/**
 * 检查迁移状态（用于 startAssessment 判断是否走云数据库题池）
 */
async function checkMigrationDone(db) {
  const seedCount = await db.collection('ai_question_pool')
    .where({ source: 'seed' })
    .count();

  return seedCount.total >= 50;  // 阈值：至少迁移50条认为迁移完成
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  if (!cloud) {
    return { success: false, error: 'wx-server-sdk not available' };
  }

  const db = cloud.database();
  const { action = 'migrate' } = event.data || event;

  try {
    console.log('[initQuestionBank] action:', action);

    if (action === 'migrate') {
      const result = await migrateToCloud(db);
      console.log('[initQuestionBank] 迁移结果:', result);
      return result;
    }

    if (action === 'status') {
      return await getMigrationStatus(db);
    }

    if (action === 'check') {
      return await checkMigrationDone(db);
    }

    return { success: false, error: `Unknown action: ${action}` };
  } catch (e) {
    console.error('[initQuestionBank] error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
```

- [ ] **Step 3: 验证文件创建**

```bash
ls -la /Users/seanxx/score-boost-mini/cloudfunctions/initQuestionBank/
cat /Users/seanxx/score-boost-mini/cloudfunctions/initQuestionBank/index.js | head -30
```

Expected: 文件存在，包含迁移逻辑，导入 knowledge_tree

---

## Task 2: 改造 startAssessment 云函数

**Files:**
- Modify: `cloudfunctions/startAssessment/index.js`

- [ ] **Step 1: 备份现有文件**

```bash
cp /Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/index.js \
   /Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/index.js.bak
```

- [ ] **Step 2: 添加迁移状态检查函数**

在文件顶部（require 语句后）添加：

```javascript
/**
 * 检查题库是否已迁移到云数据库
 * @param {Object} db - 数据库实例
 * @returns {Promise<boolean>}
 */
async function isSeedMigrated(db) {
  try {
    const result = await db.collection('ai_question_pool')
      .where({ source: 'seed' })
      .count();
    return result.total >= 50;  // 阈值：至少迁移50条认为迁移完成
  } catch (e) {
    console.error('[isSeedMigrated] error:', e);
    return false;
  }
}
```

- [ ] **Step 3: 添加队列任务写入逻辑**

找到 `fetchQuestionsFromPool` 调用后（约第165-180行），在 AI 生成逻辑之前添加队列模式：

```javascript
// 找到这段代码（约第181行）
// if (poolQuestions.length === 0 && llm) { ... }

// 在这之前添加：题池不足时创建队列任务
if (poolQuestions.length < finalNumQuestions && poolQuestions.length > 0) {
  // 有部分题目，先返回这些，同时创建队列任务补充不足部分
  const remaining = finalNumQuestions - poolQuestions.length;

  const priority = calculatePriority(plan.map(p => p.kp?.kp_id).filter(Boolean));

  const queueTask = {
    student_id: studentId,
    subject,
    grade: mode === 'huikao' ? '7-8' : grade,
    semester: mode === 'huikao' ? 'all' : semester,
    mode,
    num_questions: remaining,
    status: 'pending',
    priority,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const queueResult = await db.collection('question_queue').add({
      data: queueTask
    });

    console.log('[startAssessment] 队列任务已创建:', queueResult.id);
  } catch (e) {
    console.error('[startAssessment] 队列任务创建失败:', e.message);
  }

  // 返回已有题目 + 队列信息
  return {
    success: true,
    data: {
      queue_id: queueResult?.id,
      status: 'queued',
      questions: questions,  // 已有的题目
      message: `${poolQuestions.length} 道题目已就绪，还需要生成 ${remaining} 道`
    }
  };
}

// 如果题池完全为空，直接返回队列ID（不走 AI 生成路径）
if (poolQuestions.length === 0) {
  const priority = calculatePriority(plan.map(p => p.kp?.kp_id).filter(Boolean));

  const queueTask = {
    student_id: studentId,
    subject,
    grade: mode === 'huikao' ? '7-8' : grade,
    semester: mode === 'huikao' ? 'all' : semester,
    mode,
    num_questions: finalNumQuestions,
    status: 'pending',
    priority,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const queueResult = await db.collection('question_queue').add({
    data: queueTask
  });

  return {
    success: true,
    data: {
      queue_id: queueResult.id,
      status: 'queued',
      message: '题目生成中，请稍后刷新'
    }
  };
}
```

- [ ] **Step 4: 添加 calculatePriority 辅助函数**

在文件顶部添加：

```javascript
/**
 * 计算队列任务优先级
 * 基于知识点热度（可后续接入 heat-calculator）
 */
function calculatePriority(kpIds) {
  // 简单实现：返回中等优先级
  // 后续可接入 heat-calculator.getHeatLevel()
  return 5;
}
```

- [ ] **Step 5: 验证修改**

```bash
grep -n "question_queue" /Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/index.js
grep -n "isSeedMigrated" /Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/index.js
grep -n "calculatePriority" /Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/index.js
```

Expected: 找到队列相关代码

---

## Task 3: 验证 questionGenerator 自动创建 assessment

**Files:**
- Read: `cloudfunctions/questionGenerator/index.js`
- Read: `cloudfunctions/questionGenerator/workflow/steps/CreateAssessmentStep.js`

- [ ] **Step 1: 检查 CreateAssessmentStep**

```bash
cat /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CreateAssessmentStep.js
```

- [ ] **Step 2: 验证 assessment 创建逻辑**

确认 `CreateAssessmentStep` 中包含：
1. 创建 `assessments` 集合记录
2. 将 `assessment_id` 写入 `question_queue.generated_assessment_id`

Expected: 包含完整的 assessment 创建逻辑

如果 `CreateAssessmentStep.js` 不存在或逻辑不完整：

```bash
ls -la /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/
```

需要创建 `cloudfunctions/questionGenerator/workflow/steps/CreateAssessmentStep.js`:

```javascript
/**
 * CreateAssessmentStep - 创建 assessment 记录
 */

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function execute(task, context) {
  const db = context.db;
  const questions = context.questions || [];
  const stepOutput = context.stepOutput || {};

  // 生成 assessment_id
  const assessmentId = generateUUID();

  // 创建 assessment 记录
  await db.collection('assessments').add({
    data: {
      assessment_id: assessmentId,
      student_id: task.student_id,
      subject: task.subject,
      grade: task.grade,
      semester: task.semester,
      mode: task.mode,
      questions: questions,
      status: 'in_progress',
      created_at: new Date().toISOString()
    }
  });

  // 更新队列状态为 completed
  await db.collection('question_queue').doc(task._id).update({
    data: {
      status: 'completed',
      generated_assessment_id: assessmentId,
      updated_at: new Date().toISOString()
    }
  });

  // 保存到 stepOutput 供后续步骤使用
  stepOutput.assessment_id = assessmentId;

  console.log('[CreateAssessmentStep] assessment created:', assessmentId);

  return { assessment_id: assessmentId };
}

module.exports = { execute, generateUUID };
```

- [ ] **Step 3: 验证 step 注册**

检查 `cloudfunctions/questionGenerator/workflow/index.js` 是否导入了 `CreateAssessmentStep`：

```bash
grep -n "CreateAssessmentStep" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js
```

Expected: 在 getDefaultSteps 函数中包含 `new CreateAssessmentStep()`

---

## Task 4: 端到端测试验证

**Files:**
- Test: `cloudfunctions/__tests__/startAssessment.test.js` (如存在)

- [ ] **Step 1: 调用 initQuestionBank 迁移题库**

在云开发控制台调用 initQuestionBank：

```javascript
// 或通过测试脚本
await callCloudFunction('initQuestionBank', { action: 'migrate' });
```

验证：`db.collection('ai_question_pool').where({ source: 'seed' }).count()` 返回 235

- [ ] **Step 2: 验证迁移状态检查**

调用 `initQuestionBank` 的 `check` action：

```javascript
const status = await callCloudFunction('initQuestionBank', { action: 'check' });
console.log('Migration done:', status);  // 期望: true
```

- [ ] **Step 3: 测试 startAssessment 队列模式**

调用 startAssessment，观察：
1. 响应时间 < 3秒
2. 返回 `queue_id` 或 `status: 'ready'`

```javascript
const result = await callCloudFunction('startAssessment', {
  subject: 'math',
  grade: '8',
  semester: '下',
  mode: 'quick',
  num_questions: 20
});
console.log(result);
// 期望: { success: true, data: { status: 'queued', queue_id: 'xxx' } }
```

- [ ] **Step 4: 测试轮询流程**

1. 记录返回的 `queue_id`
2. 轮询 `checkQueueStatus` 直到 `status: 'completed'`
3. 验证 `assessment_id` 存在
4. 查询 `assessments` 集合，确认记录创建

```javascript
const status = await callCloudFunction('checkQueueStatus', {
  queue_id: result.data.queue_id
});
console.log('Status:', status.data.status);
console.log('Assessment ID:', status.data.assessment_id);
```

- [ ] **Step 5: 验证前端 waiting 页面跳转**

检查 `pages/assessment/assessment.js` 中的处理逻辑：

```bash
grep -n "queue_id" /Users/seanxx/score-boost-mini/pages/assessment/assessment.js
grep -n "waiting" /Users/seanxx/score-boost-mini/pages/assessment/assessment.js
```

验证：
1. `res.status === 'queued'` 时跳转到 waiting 页面 ✅
2. `res.status === 'ready'` 时直接加载题目 ✅
3. waiting 页面正确处理轮询结果 ✅

- [ ] **Step 6: 验证前端轮询逻辑**

检查 `pages/waiting/waiting.js`：

```bash
cat /Users/seanxx/score-boost-mini/pages/waiting/waiting.js | grep -A5 "handlePollResult"
```

验证 `handlePollResult` 函数：
1. `status === 'completed'` 时跳转到 assessment 页面 ✅
2. `status === 'failed'` 时显示错误弹窗 ✅
3. `exceededMaxAttempts` 时显示超时提示 ✅

---

## Task 5: 验收测试清单

| 验收项 | 验证方法 | 期望结果 | 状态 |
|--------|---------|----------|------|
| initQuestionBank 迁移 | count seed records | 235 条 | ⏳ |
| initQuestionBank 幂等 | 重复调用 | migrated: 0 | ⏳ |
| startAssessment 响应时间 | 计时 | < 3秒 | ⏳ |
| startAssessment 队列返回 | 检查 data.queue_id | 存在 | ⏳ |
| checkQueueStatus 解包 | 检查返回结构 | status, assessment_id | ⏳ |
| waiting 页面跳转 | 手动测试 | 跳转到 assessment | ⏳ |
| 轮询完成自动加载 | 手动测试 | 题目显示 | ⏳ |

---

## Task 5: 清理与文档

- [ ] **Step 1: 更新设计文档状态**

在 `docs/superpowers/specs/2026-05-27-startAssessment-async-design.md` 末尾添加：

```markdown
## 12. 实现状态

| 步骤 | 状态 | 完成日期 |
|------|------|----------|
| initQuestionBank 创建 | ✅ | 2026-05-27 |
| startAssessment 队列改造 | ✅ | 2026-05-27 |
| questionGenerator 验证 | ✅ | 2026-05-27 |
| 端到端测试 | ⏳ | 待完成 |
```

- [ ] **Step 2: 提交代码**

```bash
cd /Users/seanxx/score-boost-mini
git add cloudfunctions/initQuestionBank/
git add cloudfunctions/startAssessment/index.js
git commit -m "feat: add async queue mode for startAssessment

- Add initQuestionBank for seed data migration
- Modify startAssessment to create queue task when pool is insufficient
- Add CalculatePriority helper function

Closes: #startAssessment-timeout"
```

---

## 验收标准

| 验收项 | 标准 | 验证命令 |
|--------|------|----------|
| initQuestionBank | 迁移后 ai_question_pool 有 235 条 seed 记录 | `db.collection('ai_question_pool').where({source:'seed'}).count()` → ≥235 |
| initQuestionBank 幂等 | 重复执行不影响 | 再次调用 initQuestionBank → migrated: 0 |
| startAssessment 响应时间 | < 3秒 | 计时验证（手动） |
| 队列模式 | 题池不足时返回 queue_id | `result.data.queue_id` 存在 |
| questionGenerator | 完成后创建 assessment 记录 | 查询 assessments 集合有记录 |
| 前端 waiting 页面 | 队列时正确跳转 | 手动测试：queue_id → waiting |
| 轮询完成自动加载 | 题目正确显示 | 手动测试：轮询完成 → assessment |

### 自动化验证脚本（可选）

```javascript
// 验证脚本 - 保存为 test-async.js
const assert = require('assert');

async function testMigrate() {
  // 1. 调用迁移
  const migrateResult = await callCloudFunction('initQuestionBank', { action: 'migrate' });
  assert.strictEqual(migrateResult.success, true, 'Migration failed');

  // 2. 验证迁移数量
  const status = await callCloudFunction('initQuestionBank', { action: 'status' });
  assert.ok(status.seed_count >= 235, `Expected >=235, got ${status.seed_count}`);

  console.log('✅ Migration test passed:', status.seed_count, 'seed records');
}

async function testStartAssessment() {
  // 3. 调用 startAssessment
  const startResult = await callCloudFunction('startAssessment', {
    subject: 'math',
    grade: '8',
    semester: '下',
    mode: 'quick',
    num_questions: 20
  });

  // 验证返回格式
  assert.strictEqual(startResult.success, true, 'startAssessment failed');
  assert.ok(startResult.data.status === 'queued' || startResult.data.status === 'ready',
    'Unexpected status: ' + startResult.data.status);

  console.log('✅ startAssessment test passed:', startResult.data.status);
}

// 运行测试
(async () => {
  try {
    await testMigrate();
    await testStartAssessment();
    console.log('✅ All tests passed!');
  } catch (e) {
    console.error('❌ Test failed:', e.message);
    process.exit(1);
  }
})();
```

---

## 风险与回滚

| 风险 | 影响 | 回滚方案 |
|------|------|----------|
| 迁移脚本失败 | 题库未初始化 | 幂等重跑，source='seed' 防止重复 |
| startAssessment 改造引入 bug | 测评无法正常启动 | 恢复 `index.js.bak` |
| 队列任务堆积 | 用户等待时间长 | 设置超时自动取消 |