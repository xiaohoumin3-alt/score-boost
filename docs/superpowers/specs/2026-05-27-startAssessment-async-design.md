# startAssessment 超时优化设计

**日期**: 2026-05-27
**问题**: cloudFunction 超时 60 秒 (errCode: -504003)
**方案**: 异步队列 + 三层缓存 + 题库迁移

---

## 1. 目标

解决 `startAssessment` 云函数因 AI 生成题目耗时过长导致的超时问题，同时建立可持续的题库丰富机制。

---

## 2. 架构设计

### 2.1 整体流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户请求流程                              │
└─────────────────────────────────────────────────────────────────┘

用户点击「开始测评」
        │
        ▼
┌─────────────────┐
│ startAssessment │ ← 快速返回（<3秒）
│   (云函数)       │
└────────┬────────┘
         │
         ├──────────────────────┬──────────────────────┐
         ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ 预置题库命中     │  │ 云数据库题池     │  │ 题池不足        │
│ (直接返回)       │  │ (直接返回)       │  │ (进入队列)      │
└─────────────────┘  └─────────────────┘  └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │ question_queue  │
                                          │ (记录任务)       │
                                          └────────┬────────┘
                                                   │
┌──────────────────────────────────────────────────────────────────┐
│                        后台处理流程                                │
└──────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │ questionGenerator│
                                          │ (定时触发/异步)  │
                                          └────────┬────────┘
                                                   │
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                     ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
                     │ AI生成题目   │      │ 存入题池    │      │ 更新任务状态 │
                     └─────────────┘      └─────────────┘      └─────────────┘
                              │                    │                    │
                              └────────────────────┼────────────────────┘
                                                   ▼
                                          ┌─────────────────┐
                                          │  用户轮询/推送   │
                                          │  (题目已就绪)    │
                                          └─────────────────┘
```

### 2.2 三层缓存架构

| 层级 | 数据源 | 延迟 | 用途 | 启用条件 |
|------|--------|------|------|----------|
| 优先级1 | 预置题库 (seed) | 0ms | 快速冷启动，数学科目覆盖 | 仅迁移前可用 |
| 优先级2 | 云数据库题池 | <100ms | 日常运行，AI生成题库存放 | 迁移后启用 |
| 优先级3 | 异步队列 + AI生成 | 0ms返回，5-30s后可用 | 补足题池，扩大覆盖 | 始终可用 |

**迁移前后差异**：

| 阶段 | 优先级1 | 优先级2 | 说明 |
|------|---------|---------|------|
| 迁移前 | `question_bank.js` | `ai_question_pool` (空) | 预置题在代码中，直接查询 |
| 迁移后 | `ai_question_pool` (seed) | `ai_question_pool` (ai) | 预置题迁移到云数据库，统一查询 |

**命中逻辑**:
```
请求知识点 → 查预置题库 → 命中? → 返回 ✓
    ↓ 否
  查云数据库题池 → 足够? → 返回 ✓
    ↓ 否
  创建队列任务 → 立即返回 queue_id
```

### 2.3 用户交互

**轮询模式**:
```
1. 用户点击「开始测评」
2. 立即进入「等待页面」(显示进度条/动画)
3. 前端轮询 checkQueueStatus
4. 题目就绪后自动跳转答题页面
```

---

## 3. 数据模型

### 3.1 question_queue 集合

```javascript
{
  _id: "queue_xxx",          // 队列任务ID
  student_id: "student_123", // 学生ID
  subject: "math",           // 科目
  grade: "8",                // 年级
  semester: "下",             // 学期
  mode: "pre_test",          // 测评模式
  num_questions: 20,          // 题目数量
  status: "pending",          // pending | processing | completed | failed | cancelled
  priority: 5,                // 优先级（热度分数）
  generated_assessment_id: null, // 完成后关联的测评ID
  error: null,                // 错误信息
  retry_count: 0,             // 重试次数
  created_at: "2026-05-27T10:00:00Z",
  updated_at: "2026-05-27T10:00:00Z"
}
```

### 3.2 ai_question_pool 集合

```javascript
{
  _id: "q_xxx",
  kp_id: "kp1_1",            // 知识点ID
  kp_name: "二次根式定义",    // 知识点名称
  subject: "math",           // 科目
  difficulty: "easy",         // easy | medium | hard
  question: "...",           // 题目内容
  options: [...],            // 选项
  correct_answer: "A",       // 正确答案
  verified: true,            // 是否已验证
  correct_rate: 0.85,        // 正确率（反馈循环）
  used_count: 5,             // 使用次数
  source: "seed",            // seed | ai | user
  created_at: "2026-05-27T10:00:00Z",
  last_used_at: "2026-05-27T12:00:00Z"
}
```

---

## 4. 云函数改造

### 4.1 startAssessment 改造

**修改点**:
1. 添加预置题库快速通道
2. 优先查云数据库题池
3. 题池不足时**创建队列任务**而非同步生成
4. 快速返回 queue_id

**核心流程**:
```javascript
// startAssessment 改造后的核心逻辑
async function startAssessment(params) {
  const { subject, grade, semester, mode, num_questions, student_id } = params;

  // 1. 加载知识点计划
  const plan = generateQuestionPlan(tree, num_questions);

  // 2. 收集所有需要题目的 kp_id
  const neededKpIds = plan.map(item => item.kp?.kp_id);

  // 3. 查询题目（迁移前后的差异）
  let poolQuestions = [];

  // 迁移前：直接从代码中的预置题库查询
  if (isSeedMigrated === false) {
    poolQuestions = fetchFromLocalQuestionBank(neededKpIds);
  }

  // 迁移后：从云数据库题池查询（包含预置题 + 历史AI题）
  if (isSeedMigrated === true) {
    poolQuestions = await batchFetchFromPool(db, neededKpIds, student_id);
  }

  // 4. 计算命中数量
  const hitCount = poolQuestions.length;

  if (hitCount >= num_questions) {
    // ✅ 情况1：题池充足，直接返回
    return {
      success: true,
      data: {
        assessment_id: generateUUID(),
        status: 'ready',
        questions: poolQuestions.slice(0, num_questions)
      }
    };
  }

  // 5. 题池不足时：计算还需要的数量
  const remaining = num_questions - hitCount;

  // 6. 计算优先级（基于知识点热度，可复用 heat-calculator）
  const priority = calculatePriority(neededKpIds);

  // 7. 创建队列任务
  const queueTask = {
    student_id,
    subject,
    grade,
    semester,
    mode,
    num_questions: remaining,  // 仅记录缺少的数量
    status: 'pending',
    priority,
    created_at: new Date().toISOString()
  };
  await db.collection('question_queue').add({ data: queueTask });

  // 8. 立即返回（已命中的题目可先返回，提升体验）
  return {
    success: true,
    data: {
      queue_id: queueTask._id,  // 队列任务ID
      status: 'queued',
      existing_questions: poolQuestions  // 可选：返回已有的题目
    }
  };
}

/**
 * 从本地预置题库查询（迁移前使用）
 * @param {Array<string>} kpIds - 知识点ID数组
 * @returns {Array} 匹配到的题目
 */
function fetchFromLocalQuestionBank(kpIds) {
  const { QUESTION_BANK } = require('../../shared/question_bank');
  const questions = [];

  for (const kpId of kpIds) {
    const kpQuestions = QUESTION_BANK[kpId] || [];
    questions.push(...kpQuestions.map(q => ({
      ...q,
      kp_id: kpId,
      source: 'seed_local'  // 标记：本地预置题（未迁移）
    })));
  }

  return questions;
}
```

**返回格式**:
```javascript
// 情况1：立即返回（题池充足，<100ms）
{ success: true, data: { assessment_id, status: 'ready', questions: [...] } }

// 情况2：需要等待（题池不足，<50ms）
{ success: true, data: { queue_id: 'xxx', status: 'queued' } }

// 情况3：完全失败
{ success: false, error: '系统错误' }
```

### 4.2 questionGenerator 改造

**修改点**:
1. 从 question_queue 读取待处理任务
2. 支持定时触发（云开发定时器）
3. 生成后**回写 ai_question_pool 题池**
4. **自动创建 assessment 记录**
5. 更新队列任务状态为 completed

**完成后数据同步流程**:
```javascript
// questionGenerator 处理完成后：
async function onTaskCompleted(task, generatedQuestions) {
  // 1. 回写题池（供后续使用）
  await db.collection('ai_question_pool').add({
    data: generatedQuestions.map(q => ({
      ...q,
      source: 'ai',
      verified: false,  // AI生成的题目需要验证
      created_at: new Date().toISOString()
    }))
  });

  // 2. 创建 assessment 记录（供用户获取）
  const assessmentId = generateUUID();
  await db.collection('assessments').add({
    data: {
      assessment_id: assessmentId,
      student_id: task.student_id,
      questions: generatedQuestions,
      status: 'in_progress',
      created_at: new Date().toISOString()
    }
  });

  // 3. 更新队列状态
  await db.collection('question_queue').doc(task._id).update({
    data: {
      status: 'completed',
      generated_assessment_id: assessmentId,
      updated_at: new Date().toISOString()
    }
  });
}
```

### 4.3 checkQueueStatus 改造

已有云函数，验证以下返回格式：

```javascript
// cloudApi.checkQueueStatus 返回值（已解包 data）
{
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled',
  queue_id: 'xxx',
  assessment_id: 'xxx',  // 仅 completed 时有
  error: 'error msg',   // 仅 failed 时有
  retry_count: 0
}

// cloudApi.pollQueueStatus 封装轮询逻辑
{
  status: 'completed' | 'failed' | 'cancelled' | 'timeout',
  assessment_id: 'xxx',
  error: '...',
  exceededMaxAttempts: false
}
```

---

## 5. 题库迁移（核心组件）

### 5.1 迁移策略

**目标**: 将预置题库一次性迁移到云数据库题池

**原则**:
- 预置题作为高质量种子数据 (verified=true)
- 迁移后预置题库代码可保留作为备份，但业务逻辑全部走云数据库
- 迁移脚本仅执行一次

### 5.2 迁移函数 initQuestionBank

```javascript
// cloudfunctions/initQuestionBank/index.js

// 导入预置题库和知识树（用于获取知识点名称）
const { QUESTION_BANK } = require('../../shared/question_bank');
const { loadKnowledgeTree } = require('../../shared/knowledge_tree');

/**
 * 获取知识点名称
 * @param {string} kpId - 知识点ID (如 "kp1_1")
 * @returns {string} 知识点名称
 */
function getKpName(kpId) {
  // 从知识树中查找知识点名称
  const tree = loadKnowledgeTree('math', '8', '下');
  for (const chapter of tree.chapters || []) {
    for (const kp of chapter.knowledge_points || []) {
      if (kp.kp_id === kpId || kp.id === kpId) {
        return kp.kp_name || kp.name || kpId;
      }
    }
  }
  return kpId; // 回退：返回原始ID
}

/**
 * 格式化选项为统一格式
 * @param {Array} options - 原始选项数组
 * @returns {Array} 格式化后的选项
 */
function formatOptions(options) {
  if (!options) return [];
  return options.map((opt, idx) => ({
    key: String.fromCharCode(65 + idx),
    value: typeof opt === 'string' ? opt.replace(/^[A-D]\.\s*/, '') : (opt.value || opt)
  }));
}

/**
 * 初始化题库迁移
 *
 * 功能：
 * 1. 读取预置题库 question_bank.js
 * 2. 批量写入 ai_question_pool
 * 3. 标记 source='seed' 以区分来源
 * 4. 支持幂等（重复执行不影响）
 *
 * 执行方式：部署后手动调用一次
 */
exports.main = async (event, context) => {
  const { action = 'migrate' } = event.data || event;

  if (action === 'migrate') {
    // 1. 获取预置题库
    const { QUESTION_BANK } = require('./question_bank');

    // 2. 转换为 ai_question_pool 格式
    const questions = [];
    for (const [kp_id, kp_questions] of Object.entries(QUESTION_BANK)) {
      for (const q of kp_questions) {
        questions.push({
          kp_id,
          kp_name: getKpName(kp_id), // 从 knowledge_tree 获取
          difficulty: q.difficulty,
          question: q.content,
          options: formatOptions(q.options),
          correct_answer: q.correct_answer,
          verified: true,           // 预置题视为已验证
          correct_rate: 0,         // 新题暂无正确率
          used_count: 0,
          source: 'seed',         // 标记来源
          created_at: new Date().toISOString(),
          last_used_at: null
        });
      }
    }

    // 3. 批量写入（分批，每批100条）
    const BATCH_SIZE = 100;
    const results = [];
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);
      const res = await batchInsert(db, 'ai_question_pool', batch);
      results.push(res);
    }

    return {
      success: true,
      migrated_count: questions.length,
      batches: results.length
    };
  }
};
```

### 5.3 迁移后状态

| 指标 | 迁移前 | 迁移后 |
|------|--------|--------|
| 预置题存储位置 | 代码硬编码 | 云数据库 |
| 是否参与循环 | 否 | 是 |
| 能否统计正确率 | 否 | 是 |
| 能否触发预生成 | 否 | 是 |

---

## 6. 反馈循环

### 6.1 题目使用闭环

```
测评进行 → 记录作答结果 → 更新 ai_question_pool.correct_rate
    │
    └─────────────────────────────────────────┐
                                             ▼
                          ┌─────────────────────────────┐
                          │  recordKpRequest 触发热度   │
                          │  (已实现)                    │
                          └─────────────────────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
           ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
           │ 热度 >= 7       │      │ 热度 >= 4       │      │ 题池不足        │
           │ 题池 < 20       │      │ 题池 < 5        │      │ 题池 < 2        │
           └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
                    │                        │                        │
                    └────────────────────────┴────────────────────────┘
                                             │
                                             ▼
                                  ┌─────────────────────┐
                                  │ pregen_queue 入队   │
                                  │ (预生成触发)         │
                                  └─────────────────────┘
                                             │
                                             ▼
                                  ┌─────────────────────┐
                                  │ 异步生成新题目       │
                                  │ 回写 ai_question_pool│
                                  └─────────────────────┘
```

### 6.2 预生成机制

**已有组件**: `shared/pregen-trigger.js`

**使用方式**: 在 questionGenerator 中调用 `shouldPreGenerate()` 判断是否需要预生成。

---

## 7. 前端改造

### 7.1 等待页面实现

**改造点：assessment.js 中 `initAssessment` 函数**

```javascript
// 在 initAssessment 函数中添加状态判断
async function initAssessment() {
  try {
    const result = await cloudApi.startAssessment(grade, subject, mode);

    // ✅ 情况1：题目已就绪，直接进入答题
    if (result.status === 'ready' && result.questions?.length > 0) {
      this.setData({ questions: result.questions, assessmentId: result.assessment_id });
      return;
    }

    // ⏳ 情况2：需要等待（题池不足，题目生成中）
    if (result.queue_id) {
      this.setData({
        waitingQueueId: result.queue_id,
        showWaitingPage: true
      });
      this.pollQueueStatus(result.queue_id);
      return;
    }

    // ❌ 情况3：其他错误
    wx.showToast({ title: result.error || '请求失败', icon: 'none' });
  } catch (e) {
    console.error('[initAssessment] error:', e);
    wx.showToast({ title: '网络错误', icon: 'none' });
  }
}

/**
 * 轮询队列状态
 * 使用 cloudApi.pollQueueStatus 处理复杂轮询逻辑
 */
pollQueueStatus(queueId) {
  cloudApi.pollQueueStatus(queueId, {
    maxAttempts: 60,      // 最多轮询60次（约5分钟）
    intervalMs: 5000,    // 每5秒轮询一次
    onProgress: (progress) => {
      // 更新UI进度
      this.setData({
        pollingStatus: progress.status,
        pollingAttempt: progress.attempt
      });
    }
  }).then(result => {
    if (result.status === 'completed' && result.assessment_id) {
      // ✅ 题目生成完成，获取测评详情
      this.fetchAssessmentAndStart(result.assessment_id);
    } else if (result.status === 'failed') {
      // ❌ 生成失败
      this.setData({ showWaitingPage: false });
      wx.showModal({
        title: '题目生成失败',
        content: result.error || '请重试',
        confirmText: '重试',
        success: (res) => {
          if (res.confirm) this.pollQueueStatus(queueId);
        }
      });
    } else if (result.exceededMaxAttempts) {
      // ⏰ 超时
      this.setData({ showWaitingPage: false });
      wx.showToast({ title: '生成超时，请重试', icon: 'none' });
    }
  });
}

/**
 * 获取生成的测评并开始答题
 */
async fetchAssessmentAndStart(assessmentId) {
  try {
    const assessment = await cloudApi.finishAssessment(assessmentId);
    if (assessment.status === 'completed') {
      this.setData({
        questions: assessment.results,  // 题目列表
        assessmentId: assessmentId,
        showWaitingPage: false
      });
    }
  } catch (e) {
    console.error('[fetchAssessmentAndStart] error:', e);
    wx.showToast({ title: '获取题目失败', icon: 'none' });
  }
}
```

### 7.2 等待页面 WXML + 样式

```xml
<!-- 等待页面（条件渲染） -->
<view wx:if="{{showWaitingPage}}" class="waiting-container">
  <view class="waiting-animation">
    <view class="loading-spinner"></view>
  </view>
  <text class="waiting-title">正在准备题目</text>
  <text class="waiting-status">
    {{pollingStatus === 'pending' ? '排队中...' :
      pollingStatus === 'processing' ? '生成中...' : '加载中...'}}
  </text>
</view>
```

**assessment.css / assessment.wxss 样式**:
```css
/* 等待容器 */
.waiting-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

/* 加载动画 */
.waiting-animation {
  width: 60px;
  height: 60px;
  margin-bottom: 24px;
}

.loading-spinner {
  width: 60px;
  height: 60px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 标题 */
.waiting-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
}

/* 状态文本 */
.waiting-status {
  font-size: 14px;
  opacity: 0.8;
}
```

### 7.3 UI 状态

| 状态 | 页面内容 |
|------|----------|
| queued | "正在准备题目..." + 加载动画 |
| processing | "题目生成中..." + 进度提示 |
| completed | 自动跳转答题页（无感知） |
| failed | 错误弹窗 + 重试按钮 |
| timeout | 超时提示 + 重新生成 |

---

## 8. 实现步骤

| 步骤 | 任务 | 验收标准 |
|------|------|----------|
| 8.1 | 创建 initQuestionBank 云函数 | 迁移后 ai_question_pool 有 235 条记录 |
| 8.2 | 改造 startAssessment 增加三层缓存逻辑 | 数学科目秒级返回 |
| 8.3 | 验证 questionGenerator 后台生成 | 队列任务能正常完成 |
| 8.4 | 改造前端等待页面 | 用户体验流畅 |
| 8.5 | 端到端测试 | 超时问题解决 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 迁移脚本执行失败 | 题库未初始化 | 支持幂等重跑 |
| 预生成队列堆积 | 用户等待时间长 | 设置优先级，热度低的任务可超时取消 |
| 云数据库写入瓶颈 | 迁移慢 | 分批写入，每批100条 |

---

## 10. 预期收益

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| startAssessment 响应时间 | >60s (超时) | <3s |
| 数学科目题库命中率 | 0% (未使用) | ~80% |
| 题库覆盖增长 | 静止 | 随使用自动增长 |
| 用户等待体验 | 60s无反馈 | 立即进入等待页 |

---

## 11. 决策记录

| 决策 | 选项 | 选择 | 原因 |
|------|------|------|------|
| 用户交互模式 | 轮询模式 / 同步等待 | 轮询模式 | 用户体验更好，可显示进度 |
| 题池不足处理 | 允许AI生成补足 / 直接失败 | 允许AI生成补足 | 保证有题可做 |
| 预置题库处理 | 保留代码 / 迁移到云数据库 | 迁移到云数据库 | 参与反馈循环，避免死水 |

---

## 12. 实现状态

| 步骤 | 状态 | 完成日期 |
|------|------|----------|
| initQuestionBank 创建 | ✅ | 2026-05-27 |
| startAssessment 队列改造 | ✅ | 2026-05-27 |
| questionGenerator 验证 | ✅ | 2026-05-27 |
| 端到端测试 | ⏳ | 待完成 |