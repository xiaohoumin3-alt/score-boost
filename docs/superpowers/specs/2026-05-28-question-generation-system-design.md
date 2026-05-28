# 题目生成系统架构升级设计文档

**日期:** 2026-05-28
**版本:** 1.2
**方案:** 方案C - 激进扩展（预生成引擎 + Redis缓存 + 批量API + 轮询进度查询 + 动态题库扩容）

**变更记录:**
- v1.2 (2026-05-28): 修复pregenProcessor设计（改为复用questionGenerator），添加队列架构说明，修复阶段顺序
- v1.1 (2026-05-28): SSE改为轮询（微信云函数约束），补充Redis部署方案，补充批量API降级策略
- v1.0 (2026-05-28): 初始版本

---

## 一、目标

### 1.1 性能目标

| 指标 | 当前 | 目标 | 测量方式 |
|------|------|------|---------|
| 题库命中响应 | N/A | <100ms | p95延迟 |
| 实时生成响应 | ~34秒/3题 | <5秒（首题<2秒） | 端到端时间 |
| 题库命中率 | 0% | 80% | 缓存命中统计 |
| API成本 | 基准 | -50% | 批量API折扣 |

### 1.2 核心设计洞察

基于深度调研报告提取的关键设计原则：

1. **数据网络效应**（Gizmo.ai）：用户生成内容 → 题库增长 → 命中率提升
2. **感知速度 ≠ 实际速度**：轮询进度查询让用户实时看到生成进度，改善感知速度
3. **题库命中 = 零延迟**：二八定律，20%知识点覆盖80%请求
4. **批量API成本优化**：单次调用生成多题，降低API成本约50%

### 1.3 技术约束说明

**微信云函数环境限制:**
- 不支持SSE（Server-Sent Events），需采用轮询方案
- 超时限制60秒，批量生成需在此时间内完成
- 网络请求可能受限于微信小程序域名白名单

**应对方案:**
- 轮询替代SSE：客户端每500ms查询一次生成进度
- 批量API控制在3题/批次，确保<15秒完成
- 降级策略：批量失败时自动切换到单题生成

---

## 二、架构概览

### 2.1 分层兜底架构

```
用户请求
    ↓
┌─────────────────────────────────────┐
│ L1: Redis缓存层 (题库命中)          │ → <100ms, 80%命中
├─────────────────────────────────────┤
│ L2: 数据库查询 (题库未命中)          │ → <500ms
├─────────────────────────────────────┤
│ L3: 批量实时生成 + 轮询进度查询     │ → <5秒, 20%兜底
└─────────────────────────────────────┘
```

**架构说明:**
- **L1缓存层**: Redis缓存高频题目，TTL=7天，LRU淘汰
- **L2数据库**: 微信云数据库ai_question_pool，作为缓存miss时的后备
- **L3实时生成**: 批量API并行生成，客户端轮询查询进度

### 2.2 核心组件

| 组件 | 职责 | 优先级 | 状态 |
|------|------|--------|------|
| kp_request_log | 记录知识点请求，计算热度 | P0 | 新建 |
| heat-calculator | 热度评分（0-10分） | P0 | 已有 |
| pregen-trigger | 预生成触发判断 | P0 | 已有 |
| pregenProcessor | 预生成任务处理器 | P0 | 新建 |
| Redis缓存 | 题目缓存层 | P1 | 新建 |
| 批量API | 单次调用生成多题 | P1 | 改造 |
| 轮询查询 | 客户端查询生成进度 | P2 | 新建 |
| 题库扩容引擎 | 基于热度动态扩容 | P1 | 新建 |

---

## 三、核心组件设计

### 3.1 kp_request_log（请求日志）

**数据结构:**
```javascript
{
  _id: "log_xxx",
  kp_id: "kp_cell_structure",       // 知识点ID
  kp_name: "细胞结构",                // 知识点名称
  subject: "biology",                 // 科目
  student_id: "student_xxx",         // 学生ID（可选）
  requested_at: Date,                 // 请求时间
  source: "assessment" | "practice"  // 请求来源
}
```

**用途:**
- 热度计算的数据源
- 预生成触发的依据

### 3.2 heat-calculator（热度计算器）

**已有模块，位于 `shared/heat-calculator.js`**

**热度评分公式:**
```javascript
score = count * decay_factor

decay_factor:
  - 1小时内: 1.0
  - 24小时内: 0.5
  - 7天内: 0.2
  - 7天以上: 0.1
```

**热度等级:**
- High (≥7分): 目标题池20题
- Medium (≥4分): 目标题池5题
- Low (<4分): 目标题池2题

### 3.3 pregenTrigger（预生成触发器）

**复用questionGenerator云函数，支持两种队列**

**设计方案:**
- 不新建云函数，修改questionGenerator支持处理pregen_queue
- 通过queueType参数区分队列类型
- 用户任务（question_queue）优先级高于预生成任务（pregen_queue）

**伪代码:**
```javascript
// 修改fetchPendingTasks支持队列类型
async function fetchPendingTasks(db, maxTasks = 3, queueType = 'question_queue') {
  const collection = queueType === 'pregen_queue' ? 'pregen_queue' : 'question_queue';
  return await db.collection(collection)
    .where({ status: 'pending' })
    .orderBy('priority', 'desc')
    .orderBy('created_at', 'asc')
    .limit(maxTasks)
    .get();
}

// questionGenerator入口
exports.main = async (event, context) => {
  // 优先处理用户任务
  const userTasks = await fetchPendingTasks(db, 3, 'question_queue');

  if (userTasks.length > 0) {
    // 处理用户任务
    return processTasks(userTasks);
  }

  // 用户队列为空时，处理预生成任务
  const pregenTasks = await fetchPendingTasks(db, 5, 'pregen_queue');
  return processTasks(pregenTasks);
};
```

**优势:**
- 复用现有代码，减少维护成本
- 用户任务优先级自动保证
- 无需新建云函数

### 队列架构说明

| 队列 | 用途 | 处理器 | 优先级 | 触发方式 |
|------|------|--------|--------|---------|
| question_queue | 用户发起的评估任务 | questionGenerator | 高（用户优先） | 用户请求 |
| pregen_queue | 后台预生成任务 | questionGenerator（复用） | 低（后台填充） | 定时触发 |

**优先级保证:**
- questionGenerator优先处理question_queue
- question_queue为空时才处理pregen_queue
- 用户请求不受预生成任务影响

### 3.4 Redis缓存层

**部署方案:**
- **推荐方案**: 使用微信云开发自带的缓存服务（云数据库内置缓存）
- **备选方案**: 独立Redis实例（需额外部署）
- **简化方案**: 阶段0-1暂不引入Redis，直接使用云数据库，阶段2再评估

**缓存键设计:**
```
question:pool:{kp_id}:{difficulty} → Array<question>
```

**缓存策略:**
- TTL: 7天
- 淘汰策略: LRU
- 预热: 高热度知识点优先缓存

**降级策略:**
```javascript
async function fetchQuestions(kpId, difficulty) {
  try {
    return await redisGet(`question:pool:${kpId}:${difficulty}`);
  } catch (e) {
    console.warn('[Fallback] Redis failed, using DB');
    return await dbQuery(kpId, difficulty);
  }
}
```

**实施建议:**
阶段0-1使用云数据库直连，验证热度计算和预生成机制有效后，阶段2再引入Redis缓存。这样可以：
1. 降低初期部署复杂度
2. 先验证核心逻辑（热度→预生成→命中率）
3. 根据实际命中率决定是否需要Redis

### 3.5 批量API改造

**修改generateAiQuestion云函数，支持批量生成**

**新接口:**
```javascript
// 请求
{
  kp_id: string,
  kp_name: string,
  difficulty: string,
  count: number,      // 1-5题
  skip_image: boolean
}

// 响应
{
  success: true,
  questions: [
    { pool_id, question, options, correct_answer, ... },
    ...
  ],
  metadata: {
    total_requested: 3,
    successful: 2,
    failed: 1
  }
}
```

**批量Prompt:**
```
请生成{count}道关于{kp_name}的{difficulty}难度选择题。
返回JSON数组格式，每题包含question、options、correct_answer、explanation。
```

**降级策略:**
```javascript
async function generateWithFallback(kpId, kpName, difficulty, count) {
  try {
    // 尝试批量生成
    const result = await generateBatch(kpId, kpName, difficulty, count);
    if (result.questions.length > 0) {
      return result;
    }
  } catch (e) {
    console.warn('[Batch] Failed, falling back to single:', e.message);
  }

  // 降级：逐个单题生成
  const questions = [];
  for (let i = 0; i < count; i++) {
    try {
      const q = await generateSingle(kpId, kpName, difficulty);
      if (q) questions.push(q);
    } catch (e) {
      console.error(`[Single] Question ${i+1} failed:`, e.message);
    }
  }

  return { success: true, questions, metadata: { fallback: true } };
}
```

**向后兼容:**
- count参数可选，默认1（保持现有单题调用兼容）
- 单题调用时返回格式不变

### 3.6 轮询进度查询（替代SSE）

**为什么不用SSE:**
微信云函数不支持`text/event-stream`响应，无法实现服务端推送。采用轮询方案作为替代。

**后端实现:**
```javascript
// 1. 生成任务云函数（异步执行）
exports.main = async (event, context) => {
  const { kp_id, difficulty, count } = event;

  // 创建生成任务记录
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.collection('generation_tasks').add({
    _id: taskId,
    kp_id,
    difficulty,
    count,
    status: 'processing',
    progress: 0,
    questions: [],
    created_at: new Date()
  });

  // 异步生成（不阻塞响应）
  generateQuestionsAsync(taskId, kp_id, difficulty, count);

  // 立即返回任务ID
  return { success: true, task_id: taskId };
};

// 2. 进度查询云函数
exports.queryProgress = async (event, context) => {
  const { task_id } = event;

  const task = await db.collection('generation_tasks').doc(task_id).get();

  return {
    success: true,
    status: task.data.status,        // processing | completed | failed
    progress: task.data.progress,    // 当前进度
    total: task.data.count,           // 总数
    questions: task.data.questions    // 已生成的题目
  };
};

// 3. 异步生成函数
async function generateQuestionsAsync(taskId, kpId, difficulty, count) {
  const batchSize = 3;
  let progress = 0;

  for (let i = 0; i < count; i += batchSize) {
    const batchCount = Math.min(batchSize, count - i);

    // 批量生成
    const batch = await generateBatch(kpId, difficulty, batchCount);

    // 更新进度
    progress += batch.length;
    await db.collection('generation_tasks').doc(taskId).update({
      progress,
      questions: db.command.push(...batch)
    });
  }

  // 标记完成
  await db.collection('generation_tasks').doc(taskId).update({
    status: 'completed'
  });
}
```

**前端实现:**
```javascript
// 发起生成请求
const response = await wx.cloud.callFunction({
  name: 'generateQuestions',
  data: { kp_id, difficulty, count: 3 }
});

const taskId = response.result.task_id;

// 轮询查询进度
const pollInterval = setInterval(async () => {
  const progress = await wx.cloud.callFunction({
    name: 'queryProgress',
    data: { task_id: taskId }
  });

  const { status, progress: current, total, questions } = progress.result;

  // 更新UI
  updateProgress(current, total);
  renderQuestions(questions);

  // 完成或失败时停止轮询
  if (status === 'completed' || status === 'failed') {
    clearInterval(pollInterval);
  }
}, 500); // 每500ms查询一次
```

**轮询优化:**
- 初始间隔500ms，连续5次无变化后延长到1000ms
- 最多轮询60次（30秒），超时后提示用户
- 题目边生成边渲染，用户实时看到进度

---

## 四、数据流

### 4.1 用户请求流程（题库命中）

```
用户发起请求
    ↓
记录kp_request_log
    ↓
查询Redis缓存 → 命中
    ↓
返回题目（<100ms）
```

### 4.2 用户请求流程（题库未命中）

```
用户发起请求
    ↓
记录kp_request_log
    ↓
查询Redis缓存 → 未命中
    ↓
查询数据库 → 未命中
    ↓
发起批量生成请求 → 返回task_id
    ↓
客户端轮询查询进度（每500ms）
    ↓
批量生成完成 → 保存到题库+Redis
    ↓
轮询返回完成状态 → 展示题目（<5秒）
```

### 4.3 预生成流程（后台）

```
定时触发（每5分钟）
    ↓
pregenProcessor扫描kp_request_log
    ↓
计算热度（heat-calculator）
    ↓
判断是否需要预生成（pregen-trigger）
    ↓
创建任务到pregen_queue
    ↓
questionGenerator处理任务
    ↓
批量生成并保存到题库
    ↓
更新Redis缓存
```

---

## 五、错误处理

### 5.1 错误分类与处理策略

| 错误类型 | 处理策略 | 用户感知 |
|---------|---------|---------|
| 题库命中失败 | 降级到实时生成 | 无感知 |
| 实时生成超时 | 返回部分结果+轮询继续 | 感知进度 |
| 批量API失败 | 降级到单题生成 | 延迟增加 |
| 轮询超时 | 提示用户重试 | 明确错误提示 |
| Redis不可用 | 直连数据库查询 | 轻微延迟 |

### 5.2 超时与重试策略

| 层级 | 超时设置 | 重试策略 |
|------|---------|---------|
| Redis查询 | 100ms | 不重试，降级 |
| 数据库查询 | 500ms | 不重试，降级 |
| 批量API | 30秒 | 指数退避，最多2次 |
| 单题生成 | 10秒 | 失败则跳过该题 |
| 轮询查询 | 30秒 | 超时后提示用户 |

### 5.3 错误日志与监控

```javascript
// 错误事件上报
{
  event: 'question_fetch_failed',
  kp_id: 'kp_123',
  layer: 'redis', // redis/db/api
  error: error.message,
  timestamp: Date.now(),
  recovery: 'fallback_to_db'
}
```

**监控指标:**
- 题库命中率（目标：80%）
- 平均响应时间（目标：<100ms）
- 轮询超时率（目标：<5%）
- 降级触发频率（目标：<10%）
- 批量API成功率（目标：>90%）

---

## 六、测试策略

### 6.1 测试金字塔

```
        /\
       /E2E\      关键路径：题库命中/未命中完整流程
      /----\
     /集成 \     API层：批量生成/SSE推送/缓存逻辑
    /------\
   /单元 \      工具函数：热度计算/预生成判断
  /--------\
```

### 6.2 关键测试用例

#### 单元测试
```javascript
describe('热度计算', () => {
  test('高热度：10次请求+1小时内', () => {
    const log = { count: 10, last_requested: Date.now() - 1800000 };
    expect(calculateHeatScore(log)).toBeGreaterThanOrEqual(7);
  });

  test('零热度：无请求记录', () => {
    expect(calculateHeatScore(null)).toBe(0);
  });
});
```

#### 集成测试
```javascript
describe('批量API', () => {
  test('一次调用生成3题', async () => {
    const result = await generateBatch({ kp_id: 'test', count: 3 });
    expect(result.questions.length).toBe(3);
  });

  test('部分失败时返回有效题目', async () => {
    const result = await generateBatch({ kp_id: 'test', count: 3, simulateFail: true });
    expect(result.questions.length).toBe(2);
  });
});
```

#### E2E测试
```javascript
test('完整流程：题库未命中触发实时生成+轮询查询', async ({ page }) => {
  await page.goto('/assessment/start');

  // 发起生成请求
  await page.selectOption('#knowledge-point', '冷门知识点');
  await page.click('#generate');

  // 验证返回task_id
  const taskId = await page.locator('#task-id').textContent();
  expect(taskId).toMatch(/^task_/);

  // 等待轮询完成
  await page.waitForSelector('.question-card', { timeout: 10000 });

  // 验证题目数量
  const questions = await page.locator('.question-card').count();
  expect(questions).toBe(3);
});
```

### 6.3 性能测试

| 场景 | 并发数 | 目标响应时间 | 测试工具 |
|------|-------|-------------|---------|
| 题库命中 | 100 | <100ms | JMeter |
| 实时生成（批量） | 10 | <5秒 | JMeter |
| 轮询查询 | 50 | 首次响应<500ms | Locust |

---

## 七、实施计划

### 7.1 阶段划分

| 阶段 | 目标 | 交付物 | 周期 |
|------|------|--------|------|
| 阶段0 | 补全现有机制 | kp_request_log + pregenProcessor | 1周 |
| 阶段1 | 批量API改造 | generateAiQuestion支持批量 | 1周 |
| 阶段2 | 轮询进度查询 | generation_tasks + 前端轮询 | 1周 |
| 阶段3 | 题库扩容 | 动态预生成 + Redis缓存（可选） | 2周 |
| 阶段4 | 监控与优化 | 埋点+性能调优 | 1周 |

**阶段调整说明:**
- 优先级：阶段0（激活现有机制）→ 阶段1（批量API）→ 阶段2（轮询）
- Redis作为可选优化，根据阶段0-2的效果决定是否引入
- 题库扩容改为"基于热度动态扩容"，而非固定5000题

### 7.2 阶段0：补全现有机制（优先级最高）

**目标:** 激活已有的预生成基础设施

**任务清单:**
1. **kp_request_log记录机制**
   - 修改startAssessment云函数
   - 实现kp_request_log集合数据结构

2. **修改questionGenerator支持pregen_queue**
   - 修改fetchPendingTasks支持queueType参数
   - 实现队列优先级（用户任务>预生成任务）
   - 复用现有处理逻辑处理预生成任务

3. **测试验证**
   - 手动触发请求，验证日志记录
   - 验证预生成任务自动创建
   - 验证用户任务优先级

**验收标准:**
- kp_request_log有记录增长
- pregen_queue有任务自动创建
- 热度计算正确（0-10分）
- questionGenerator能处理两种队列

### 7.3 阶段1：批量API改造

**目标:** 单次调用生成多题，降低API成本50%

**任务清单:**
1. 修改generateAiQuestion接口支持count参数
2. MiniMax API批量调用（修改Prompt为批量生成）
3. 更新questionGenerator调用批量接口
4. 处理部分成功场景

**验收标准:**
- 批量生成3题耗时<15秒
- 单题失败不影响其他题
- 成本降低约50%

### 7.4 阶段2：轮询进度查询

**目标:** 实时查询生成进度，改善用户感知（替代SSE）

**任务清单:**
1. **后端实现**
   - 创建generation_tasks集合（存储任务状态）
   - 修改generateQuestions云函数返回task_id
   - 创建queryProgress云函数

2. **前端实现**
   - 轮询逻辑（每500ms查询一次）
   - 进度条UI更新
   - 超时处理（30秒）

3. **测试验证**
   - 正常流程测试
   - 超时场景测试
   - 并发请求测试

**验收标准:**
- 生成过程中用户实时看到进度
- 超时后有明确错误提示
- 首次进度查询<500ms

### 7.5 阶段3：题库动态扩容

**目标:** 基于热度动态扩容，覆盖80%请求

**任务清单:**
1. **评估阶段0-2效果**
   - 分析kp_request_log数据
   - 计算当前题库命中率
   - 识别高热度知识点

2. **Redis缓存（可选）**
   - 根据命中率决定是否引入
   - 部署Redis或使用云数据库内置缓存
   - 实现缓存读写逻辑

3. **动态扩容**
   - 基于热度优先扩容高热度知识点
   - 目标：高热度（≥7分）≥20题/知识点
   - 中热度（≥4分）≥5题/知识点

**验收标准:**
- 高热度知识点题库≥20题
- 题库命中率≥80%（或达到当前技术上限）
- 引入Redis后查询响应<100ms

### 7.6 阶段4：监控与优化

**任务清单:**
1. **埋点上报**
   - 题库命中率统计
   - 响应时间分布（p50/p95/p99）
   - 轮询超时率
   - 批量API成功率/降级率

2. **性能调优**
   - 根据监控数据调整缓存策略
   - 优化批量API Prompt
   - 调整轮询间隔

3. **压力测试**
   - 100并发验证
   - 确保p95响应时间达标

**验收标准:**
- 80%请求<100ms（题库命中）
- 20%请求<5秒（实时生成）
- 系统稳定（错误率<1%）

---

## 八、风险与约束

### 8.1 技术风险

| 风险 | 缓解措施 |
|------|---------|
| 微信云函数不支持SSE | ✅ 已采用轮询方案 |
| Redis部署复杂度 | 阶段3根据效果决定是否引入，优先使用云数据库内置缓存 |
| 批量API稳定性 | 降级到单题生成，确保部分成功 |
| 轮询增加网络开销 | 500ms间隔，连续无变化后延长到1000ms |

### 8.2 约束条件

**微信云函数环境:**
- 超时限制：60秒（批量生成3题需<15秒，安全）
- 不支持SSE：已采用轮询替代
- 网络请求：需确保域名在小程序白名单中

**数据存储:**
- 题库存储：云数据库免费额度约2GB，足够初期使用
- 超出后按量付费，需监控存储增长

**MiniMax API:**
- 配额限制：需确认批量调用限流
- 成本控制：批量API降低约50%成本

---

## 九、参考来源

- 并行Promise示例：Promise.all并发执行
- Anthropic Claude批量API说明：Message Batches API降低成本50%
- SSE流式传输方案：Dani Akabani案例，感知速度剧烈提升
- AI系统缓存与并行生成案例：AWS考试生成器架构
- LLM性能指标指南：TTFT、E2E、Goodput指标定义
