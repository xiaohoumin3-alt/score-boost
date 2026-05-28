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

## 5. 接口设计

### 5.1 云函数接口

#### 5.1.1 startAssessment

**功能：** 发起测评或检查预生成队列状态

**请求参数：**
```javascript
{
  student_id: string,      // 学生ID（必填）
  subject: string,         // 科目（必填）：math | biology | english | chinese | physics | chemistry
  grade: string,           // 年级（必填）：7 | 8 | 9
  semester: string,        // 学期（可选）：up | down
  mode: string,            // 模式（可选）：quick | full | wrong_book
  num_questions: number    // 题目数量（可选），默认20
}
```

**响应格式：**
```javascript
// 同步模式：题池充足
{
  success: true,
  status: "ready",
  data: {
    assessment_id: string,
    questions: Array<{
      id: string,
      content: string,
      options: string[],
      answer: string,
      difficulty: string,
      knowledge_point: string
    }>
  }
}

// 预生成模式：有已完成的队列任务
{
  success: true,
  status: "ready",
  data: {
    assessment_id: string,
    from_cache: true,  // 标识来自预生成
    questions: [...]
  }
}

// 异步队列模式：需要等待生成
{
  success: true,
  status: "queued",
  data: {
    queue_id: string,
    estimated_time: number,  // 预计等待时间（秒）
    message: "题目正在生成中，请稍候..."
  }
}

// 错误响应
{
  success: false,
  error: string,
  error_code: number
}
```

**错误码：**
| error_code | 说明 |
|-----------|------|
| 400 | 参数错误（缺少必填参数） |
| 429 | 请求过于频繁（同一学生有进行中的任务） |
| 500 | 服务器错误 |

---

#### 5.1.2 checkQueueStatus

**功能：** 检查队列任务状态

**请求参数：**
```javascript
{
  queue_id: string  // 队列任务ID（必填）
}
```

**响应格式：**
```javascript
// pending/processing 状态
{
  success: true,
  data: {
    status: "pending" | "processing",
    queue_id: string,
    message: "题目正在排队生成中..." | "题目正在生成中...",
    progress: {  // 可选，进度信息
      total: number,
      completed: number,
      percentage: number
    }
  }
}

// completed 状态
{
  success: true,
  data: {
    status: "completed",
    queue_id: string,
    assessment_id: string,
    message: "题目已生成完成"
  }
}

// failed 状态
{
  success: true,
  data: {
    status: "failed",
    queue_id: string,
    error: string,      // 失败原因
    retry_count: number,  // 已重试次数
    message: "题目生成失败"
  }
}

// cancelled 状态
{
  success: true,
  data: {
    status: "cancelled",
    queue_id: string,
    message: "任务已取消"
  }
}

// 队列不存在或已过期
{
  success: false,
  error: "Queue task not found or has expired"
}
```

---

#### 5.1.3 questionGenerator

**功能：** 后台定时处理队列任务（定时触发，不直接调用）

**处理流程：**
```
1. 查询 question_queue 中 status=pending 的任务
2. 按 priority DESC, created_at ASC 排序
3. 每次最多处理 3 个任务
4. 对每个任务执行：
   a. 更新状态为 processing
   b. 调用 AI 生成题目
   c. 保存到 ai_question_pool
   d. 创建 assessment 记录
   e. 更新状态为 completed
   f. （可选）发送订阅消息
5. 清理过期任务
```

**返回格式（内部日志）：**
```javascript
{
  processed: number,      // 处理的任务数
  success: number,        // 成功完成任务数
  failed: number,         // 失败任务数
  cleaned: number,        // 清理的过期任务数
  errors: Array<{        // 错误详情
    task_id: string,
    error: string
  }>
}
```

---

### 5.2 数据库接口

#### 5.2.1 question_queue 集合操作

**查询操作：**
```javascript
// 获取学生的活跃任务
db.collection('question_queue')
  .where({
    student_id: 'xxx',
    status: _.in(['pending', 'processing'])
  })
  .get()

// 获取待处理任务（questionGenerator使用）
db.collection('question_queue')
  .where({ status: 'pending' })
  .where({ expires_at: _.gt(new Date()) })
  .orderBy('priority', 'desc')
  .orderBy('created_at', 'asc')
  .limit(3)
  .get()

// 获取单个任务状态
db.collection('question_queue').doc(queue_id).get()
```

**写入操作：**
```javascript
// 创建新任务
db.collection('question_queue').add({
  student_id: string,
  openid: string,
  subject: string,
  grade: string,
  semester: string,
  mode: string,
  num_questions: number,
  difficulty_distribution: object,
  status: 'pending',
  priority: 1,
  created_at: new Date(),
  updated_at: new Date(),
  expires_at: new Date(Date.now() + 24*3600*1000)
})

// 更新任务状态
db.collection('question_queue').doc(queue_id).update({
  status: string,
  updated_at: new Date(),
  generated_assessment_id: string,  // completed时
  error: string,                     // failed时
  retry_count: number                // 失败重试时
})

// 删除过期任务
db.collection('question_queue')
  .where({
    status: _.in(['completed', 'failed']),
    expires_at: _.lte(new Date())
  })
  .remove()
```

**索引要求：**
```javascript
// 索引1：查询学生活跃任务
db.collection('question_queue').createIndex({
  student_id: 1,
  status: 1,
  created_at: -1
})

// 索引2：优先级排序
db.collection('question_queue').createIndex({
  priority: -1,
  created_at: 1
})

// 索引3：过期清理
db.collection('question_queue').createIndex({
  status: 1,
  expires_at: 1
})
```

---

### 5.3 前端API接口

#### 5.3.1 cloudApi.js 方法

**startAssessment：**
```javascript
/**
 * 发起测评请求
 * @param {Object} params - 测评参数
 * @param {string} params.subject - 科目
 * @param {string} params.grade - 年级
 * @param {number} params.numQuestions - 题目数量
 * @returns {Promise<Object>} 响应结果
 */
startAssessment: function(params) {
  return callCloudFunction('startAssessment', {
    subject: params.subject,
    grade: params.grade,
    semester: params.semester || 'down',
    mode: params.mode || 'quick',
    num_questions: params.numQuestions || 20
  });
}
```

**checkQueueStatus：**
```javascript
/**
 * 检查队列状态
 * @param {string} queueId - 队列任务ID
 * @returns {Promise<Object>} 状态结果
 */
checkQueueStatus: function(queueId) {
  return callCloudFunction('checkQueueStatus', { queue_id: queueId });
}
```

**pollQueueStatus（轮询封装）：**
```javascript
/**
 * 轮询队列状态直到完成
 * @param {string} queueId - 队列任务ID
 * @param {Object} options - 轮询选项
 * @param {number} options.interval - 轮询间隔（毫秒），默认3000
 * @param {number} options.timeout - 超时时间（毫秒），默认60000
 * @param {Function} options.onProgress - 进度回调
 * @returns {Promise<Object>} 完成后的结果
 */
pollQueueStatus: function(queueId, options = {}) {
  const { interval = 3000, timeout = 60000, onProgress } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() - startTime > timeout) {
        reject(new Error('Queue status polling timeout'));
        return;
      }

      try {
        const result = await this.checkQueueStatus(queueId);
        
        if (result.data.status === 'completed') {
          resolve(result);
        } else if (result.data.status === 'failed') {
          reject(new Error(result.data.error || '题目生成失败'));
        } else if (result.data.status === 'cancelled') {
          reject(new Error('任务已取消'));
        } else {
          // 继续轮询
          if (onProgress) onProgress(result.data);
          setTimeout(poll, interval);
        }
      } catch (e) {
        reject(e);
      }
    };

    poll();
  });
}
```

---

### 5.4 响应格式规范

#### 5.4.1 统一响应结构

```javascript
// 成功响应
{
  success: true,
  data: {
    // 业务数据
  },
  timestamp?: number  // 可选，服务器时间戳
}

// 错误响应
{
  success: false,
  error: string,           // 错误描述
  error_code?: number,     // 可选，错误码
  details?: any            // 可选，错误详情
}
```

#### 5.4.2 HTTP状态码映射

| 状态码 | 说明 | 云函数响应 |
|-------|------|-----------|
| 200 | 成功 | success: true |
| 400 | 请求参数错误 | success: false, error: "Invalid parameter" |
| 404 | 资源不存在 | success: false, error: "Not found" |
| 429 | 请求过于频繁 | success: false, error: "Too many requests" |
| 500 | 服务器错误 | success: false, error: "Internal server error" |

---

### 5.5 接口调用示例

#### 5.5.1 完整流程示例

```javascript
// 步骤1：发起测评
const startResult = await api.startAssessment({
  subject: 'math',
  grade: '8',
  numQuestions: 50
});

if (startResult.success) {
  if (startResult.status === 'ready') {
    // 题目已准备好，直接进入答题
    console.log('获取到题目:', startResult.data.questions.length);
    // 跳转到答题页面
    wx.navigateTo({
      url: `/pages/assessment/assessment?id=${startResult.data.assessment_id}`
    });
  } else if (startResult.status === 'queued') {
    // 需要等待生成
    console.log('队列ID:', startResult.data.queue_id);
    
    // 显示等待页面
    wx.showLoading({ title: '题目生成中...', mask: true });
    
    // 步骤2：轮询检查状态
    try {
      const pollResult = await api.pollQueueStatus(
        startResult.data.queue_id,
        {
          interval: 3000,
          timeout: 60000,
          onProgress: (data) => {
            console.log('当前状态:', data.status, data.message);
          }
        }
      );
      
      wx.hideLoading();
      
      // 步骤3：获取生成的题目
      console.log('生成完成，assessment_id:', pollResult.data.assessment_id);
      wx.navigateTo({
        url: `/pages/assessment/assessment?id=${pollResult.data.assessment_id}`
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message, icon: 'none' });
    }
  }
}
```

---

## 6. 通知机制

### 6.1 微信订阅消息（Phase 4可选项）

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

### 6.2 轮询机制（Phase 3必需，作为主方案）

轮询机制已在 5.3.1 节（pollQueueStatus）中详细说明。

---

## 7. 安全与边界处理

### 7.1 队列状态机

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

### 7.2 队列过期与清理
- 队列任务 24 小时后自动过期
- questionGenerator 每分钟检查一次，删除过期的 completed/failed 任务
- 清理时同时删除关联的未完成 assessment

### 7.3 失败重试
- 队列任务失败最多重试 3 次
- 重试间隔：1分钟、2分钟、4分钟（指数退避）
- 3 次失败后标记为 failed，通知用户

### 7.4 并发控制
- questionGenerator 每次最多处理 3 个任务
- 避免同时占用过多 AI API 配额
- 使用数据库事务确保状态一致性

### 7.5 学生隔离与任务中断

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

## 8. 配置依赖检查清单

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

## 9. 实施计划

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

## 10. 验证标准

| 功能 | 验证方法 |
|------|----------|
| 队列创建 | 调用 startAssessment，检查返回 queue_id |
| 队列处理 | 查看 question_queue 中状态变为 completed |
| 题目生成 | 查看 ai_question_pool 中有新的未验证题目 |
| 状态轮询 | 调用 checkQueueStatus 接口验证状态更新 |
| 通知发送 | 用户收到微信订阅消息 |

---

## 11. 回滚方案

如果新系统出现问题：
1. 将 `startAssessment` 回滚到"题池优先 + AI补足"模式
2. 保留 question_queue 数据用于问题排查
3. 关闭 questionGenerator 定时触发