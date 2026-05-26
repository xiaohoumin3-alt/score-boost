# AI题目异步预生成系统设计方案

**日期：** 2026-05-27
**项目：** score-boost-mini 云函数优化
**目标：** 解决AI题目生成超时问题（60秒限制），实现 B+C 混合方案

---

## 1. 问题背景

### 1.1 当前问题
- 用户请求20题测评时，全部走AI生成需要 ~160秒（20题 × 8秒/题）
- 云函数超时上限 60秒 + 客户端超时 60秒
- 导致大量测评请求超时失败

### 1.2 约束条件
- 云函数单次执行超时：60秒
- AI生成单题耗时：6-10秒
- 测评需要即时响应，不能让用户等待

---

## 2. 解决方案概述

### 方案 B：预生成队列（Background Pre-generation）
提前生成题目存入池中，测评时直接取用。

### 方案 C：异步生成 + 推送通知（Async Generation + Notification）
测评请求立即返回"生成中"状态，后台生成后通过微信通知用户。

### B+C 混合架构
```
┌─────────────────────────────────────────────────────────────────┐
│                        用户请求流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  用户发起测评 ──→ startAssessment ──→ 检查题池                  │
│                                              │                   │
│                        ┌─────────────────────┼─────────────────┐ │
│                        │                     │                 │ │
│                    有题可用              有预生成队列          无队列  │
│                        │                     │                 │ │
│                    立即返回              立即返回            异步生成  │
│                   (同步模式)           (预生成模式)        (排队模式) │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心组件设计

### 3.1 新增集合：question_queue

```javascript
// question_queue 集合结构
{
  _id: "queue_xxx",
  student_id: "student_123",        // 学生ID
  openid: "oHF0C7xxxxx",          // 微信openid
  subject: "biology",              // 科目
  grade: "7",                     // 年级
  semester: "down",                // 学期
  mode: "quick",                   // 模式
  num_questions: 20,              // 题目数量
  difficulty_distribution: {       // 难度分布
    easy: 0.5,
    medium: 0.3,
    hard: 0.2
  },
  status: "pending",              // pending | processing | completed | failed
  priority: 1,                    // 优先级（数字越大优先级越高）
  generated_assessment_id: null,   // 完成后关联的assessment_id
  created_at: "2026-05-27T01:00:00Z",
  updated_at: "2026-05-27T01:00:00Z",
  expires_at: "2026-05-28T01:00:00Z"  // 24小时后过期
}
```

### 3.2 新增云函数：questionGenerator

**职责：** 后台定时处理 question_queue 中的待生成任务

**触发方式：** 定时触发（每分钟检查一次）

**处理流程：**
```
1. 扫描 question_queue，筛选 status=pending 的记录
2. 按 priority 降序、created_at 升序排序
3. 每次最多处理 3 个任务（避免超时）
4. 对每个任务：
   a. 更新状态为 processing
   b. 调用 AI 生成题目
   c. 保存到 ai_question_pool（标记 verified=false）
   d. 创建 assessment 记录
   e. 更新队列状态为 completed
   f. 推送微信通知（如果启用了订阅消息）
5. 失败则标记 status=failed，重试次数+1
```

### 3.3 修改 startAssessment

**新增逻辑：**
```
1. 尝试从 ai_question_pool 获取题目（有缓存直接返回）
2. 如果题池不足：
   a. 检查 question_queue 是否有该学生的预生成任务
   b. 如果有且已完成，直接关联返回
   c. 如果有但未完成，返回 "queued" 状态
   d. 如果没有，创建新的预生成任务，返回 "queued" 状态
3. "queued" 状态时，前端显示 "题目生成中，请稍候..."
```

### 3.4 前端适配

**assessment.js 改造：**
```javascript
// 获取题目后的状态处理
if (result.status === 'ready') {
  // 正常流程，进入答题页面
  this.showQuestions(result.data.questions);
} else if (result.status === 'queued') {
  // 异步生成模式，显示等待页面
  this.showQueuedMessage(result.data.queue_id);
} else if (result.status === 'generating') {
  // 预生成模式，显示 "正在准备题目..."
  this.showGeneratingMessage();
}
```

**新增轮询逻辑：**
```javascript
// 轮询检查队列状态
async pollQueueStatus(queueId) {
  const result = await api.checkQueueStatus(queueId);
  if (result.status === 'completed') {
    // 获取生成的题目
    const assessment = await api.getAssessment(result.assessment_id);
    this.showQuestions(assessment.questions);
  } else if (result.status === 'failed') {
    wx.showToast({ title: '题目生成失败，请重试', icon: 'none' });
  } else {
    // 继续轮询
    setTimeout(() => this.pollQueueStatus(queueId), 3000);
  }
}
```

---

## 4. 数据流设计

### 4.1 同步模式（题池充足时）
```
用户 → startAssessment → ai_question_pool → 返回题目 → 完成
                           │
                           ↓
                    更新 last_used_at
```

### 4.2 预生成模式（有预生成队列时）
```
用户 → startAssessment → 检查队列 → 有已完成任务 → 返回 assessment_id
                                                        │
                                                        ↓
                                               获取题目 → 完成
```

### 4.3 异步队列模式（无预生成时）
```
用户 → startAssessment → 创建队列任务 → 返回 queue_id + queued 状态
                                │
                                ↓
                    questionGenerator 定时处理
                                │
                                ↓
                    AI生成题目 → 保存 → 更新队列状态
                                │
                                ↓
                    微信订阅消息通知用户
                                │
                                ↓
                    用户再次进入 → 获取题目 → 完成
```

---

## 5. 通知机制

### 5.1 微信订阅消息（Phase 4可选项）

**模板定义：**
```javascript
// 订阅消息模板
{
  "template_id": "需在微信公众平台配置", // 待补充实际模板ID
  "title": "题目生成完成通知",
  "content": {
    "thing1": {"value": "生物测评"}, // 科目
    "thing2": {"value": "七年级下"},  // 年级学期
    "phrase3": {"value": "已生成"},   // 状态
    "date4": {"value": "2026-05-27 12:00:00"} // 完成时间
  },
  "page": "pages/assessment/assessment?id=xxx" // 跳转路径
}
```

**发送逻辑（questionGenerator中）：**
```javascript
// 任务完成后检查是否订阅了消息
const subscription = await checkSubscription(openid);
if (subscription.enabled) {
  await wxapi.subscribeMessage.send({
    touser: openid,
    template_id: TEMPLATE_ID,
    data: { /* ... */ }
  });
}
```

**配置依赖：**
- ⚠️ 需在微信公众平台申请订阅消息模板
- ⚠️ 需配置模板ID和字段映射
- ⚠️ 需处理用户订阅状态（用户可能拒绝订阅）

### 5.2 轮询机制（Phase 3必需，作为主方案）

**API接口：**
```javascript
// 云函数：checkQueueStatus
// 检查队列状态
GET /api/queue/{queue_id}/status

// 返回格式
{
  "success": true,
  "data": {
    "status": "pending" | "processing" | "completed" | "failed" | "cancelled",
    "assessment_id": "xxx", // status=completed时存在
    "error": "错误信息",      // status=failed时存在
    "progress": {
      "total": 20,
      "completed": 5
    }
  }
}
```

---

### 6. 安全与边界处理

### 6.1 队列状态机

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                      状态转换图                            │
                    └─────────────────────────────────────────────────────────┘

  ┌─────────┐   创建队列   ┌────────────┐   开始处理   ┌────────────┐   完成/失败   ┌─────────────┐
  │         │ ──────────→ │            │ ──────────→ │            │ ────────────→ │             │
  │  (无)   │             │  pending  │             │ processing │               │ completed   │
  │         │             │            │             │            │               │   /failed   │
  └─────────┘             └────────────┘             └────────────┘               └─────────────┘
                                     │                   │
                                     │ 超时/失败         │ 成功
                                     ↓                   ↓
                              重试(最多3次)         ┌────────────┐
                              → 仍失败            │   通知     │
                              → failed           └────────────┘
```

**状态说明：**
- `pending`：等待处理
- `processing`：正在生成题目
- `completed`：生成完成，可获取题目
- `failed`：生成失败（重试3次后仍失败）

### 6.2 队列过期与清理
- 队列任务 24 小时后自动过期
- questionGenerator 每分钟检查一次，删除过期的 completed/failed 任务
- 清理时同时删除关联的未完成 assessment

### 6.3 失败重试
- 队列任务失败最多重试 3 次
- 重试间隔：1分钟、2分钟、4分钟（指数退避）
- 3 次失败后标记为 failed，通知用户

### 6.4 并发控制
- questionGenerator 每次最多处理 3 个任务
- 避免同时占用过多 AI API 配额
- 使用数据库事务确保状态一致性

### 6.5 学生隔离与任务中断

**并发控制：**
- 每个学生只能有一个 pending/processing 状态的队列任务
- 新请求会取消旧任务（标记为 cancelled）

**Processing状态任务中断处理：**
```
当新任务到来时：
1. 检查是否有该学生的 processing 状态任务
2. 如果有：
   a. 标记旧任务为 cancelled（写入 question_queue.status）
   b. questionGenerator 检测到 cancelled 状态时：
      - 停止当前AI生成（如果正在进行）
      - 清理已生成的部分题目（删除 ai_question_pool 中的关联记录）
      - 更新队列状态为 cancelled
   c. 创建新任务
3. 如果没有：直接创建新任务
```

**中断检测机制（questionGenerator中）：**
```javascript
// 每生成一题后检查任务状态
const currentTask = await db.collection('question_queue').doc(queueId).get();
if (currentTask.data.status === 'cancelled') {
  // 清理已生成的题目
  await cleanupPartialQuestions(assessmentId);
  return; // 退出处理
}
```

---

## 6. 配置依赖检查清单

**实施前需确认：**

| 配置项 | 状态 | 说明 |
|--------|------|------|
| CloudBase云函数定时触发 | ⚠️ 需配置 | questionGenerator需每分钟触发 |
| question_queue集合索引 | ⚠️ 需创建 | student_id+status复合索引 |
| 微信订阅消息模板 | ⚠️ Phase 4需配置 | Phase 1-3可跳过 |
| AI API配额 | ✅ 已有 | MiniMax API已配置 |

**question_queue索引创建：**
```javascript
// 复合索引：快速查找学生的活跃任务
db.collection('question_queue').createIndex({
  student_id: 1,
  status: 1,
  created_at: -1
})

// 单字段索引：优先级排序
db.collection('question_queue').createIndex({
  priority: -1,
  created_at: 1
})
```

**定时触发配置（cloudbaserc.json）：**
```json
{
  "triggers": [{
    "name": "questionGeneratorTimer",
    "type": "timer",
    "config": "0 * * * * * *"  // 每分钟触发
  }]
}
```

---

## 7. 实施计划

### Phase 1：基础设施
1. 创建 `question_queue` 集合并建立索引
2. 部署 `questionGenerator` 云函数

### Phase 2：核心逻辑
3. 修改 `startAssessment` 支持队列模式
4. 实现 `checkQueueStatus` 接口

### Phase 3：前端适配
5. 修改 `assessment.js` 支持 queued 状态
6. 实现轮询逻辑

### Phase 4：通知增强（可选）
7. **微信订阅消息配置**（需先在微信公众平台配置）
   - 申请订阅消息模板
   - 配置模板ID和字段映射
   - 集成消息发送逻辑
8. 添加过期队列清理逻辑（questionGenerator中）

---

## 8. 验证标准

| 功能 | 验证方法 |
|------|----------|
| 队列创建 | 调用 startAssessment，检查返回 queue_id |
| 队列处理 | 查看 question_queue 中状态变为 completed |
| 题目生成 | 查看 ai_question_pool 中有新的未验证题目 |
| 状态轮询 | 调用 checkQueueStatus 接口验证状态更新 |
| 通知发送 | 用户收到微信订阅消息 |

---

## 9. 回滚方案

如果新系统出现问题：
1. 将 `startAssessment` 回滚到"题池优先 + AI补足"模式
2. 保留 question_queue 数据用于问题排查
3. 关闭 questionGenerator 定时触发