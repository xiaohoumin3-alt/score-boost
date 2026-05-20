# AI题目自动生成系统设计文档

**版本**: 1.0
**日期**: 2026-05-20
**状态**: 待审批

---

## 1. 问题背景

### 1.1 当前问题

- 题目不会自动增加，不会"长出来"
- 静态题库约60-80道题目，随着使用量增长，用户会遇到重复题目
- 现有题目是LLM生成的，质量可以但难度标注不太准确

### 1.2 核心目标

| 目标 | 定义 | 成功标准 |
|------|------|----------|
| 目标1 | 题目能够自动扩充，可持续增长 | 题池每日净增长 > 0 |
| 目标2 | 质量有保障（数学准确性+难度匹配）| 验证通过率 > 80% |
| 目标3 | 成本可控（热度驱动的预生成）| 每日LLM调用 < 1000次 |

---

## 2. 解决方案概述

### 2.1 方案选择

**方案A：渐进式智能题池**（已选定）

借鉴DeepTutor的两阶段生成模式，实现热度驱动的预生成闭环系统。

### 2.2 架构图

```
用户练习请求
    ↓
┌─────────────────────────────────────────────┐
│              请求统计记录器                   │
│         (kp_request_log collection)          │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│              热度计算器                       │
│    (7天滑动窗口 → heat_score 0-10)           │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│             预生成触发器                     │
│   (热度>7且题池<20 OR 题池<5时触发)           │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│           预生成任务队列                     │
│       (pregen_queue collection)              │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│          pregenWorker云函数                  │
│    ┌──────────────────────────────────┐     │
│    │ 1. LLM生成题目                  │     │
│    │ 2. 双重验证（准确性+难度）        │     │
│    │ 3. 写入ai_question_pool         │     │
│    └──────────────────────────────────┘     │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│           AI题目池 (ai_question_pool)        │
│            ← 题池扩充                       │
└─────────────────┬───────────────────────────┘
                  ↓
              [消费查询]
                  ↓
            返回题目给用户
```

---

## 3. 核心组件设计

### 3.1 请求统计记录器

**职责**: 记录每次练习请求，用于热度计算

**数据结构**:
```javascript
// collection: kp_request_log
{
  _id: "kp1_1",                      // 知识点ID
  request_count: 156,                 // 累计请求次数
  last_request_at: "2026-05-20T10:30:00Z",
  heat_score: 8.5,                    // 热度分数 0-10
  daily_log: [                        // 最近7天的请求记录
    { date: "2026-05-20", count: 25 },
    { date: "2026-05-19", count: 18 },
    ...
  ],
  updated_at: "2026-05-20T10:30:00Z"
}
```

**触发时机**: 每次用户发起练习请求

**验证标准**: 练习请求后，request_count +1，heat_score更新

---

### 3.2 热度计算器

**职责**: 基于请求频率计算知识点热度

**计算公式**:
```javascript
function calculateHeatScore(log) {
  const now = Date.now();
  const daysSinceLastRequest = (now - new Date(log.last_request_at)) / (1000 * 60 * 60 * 24);

  // 基础热度：请求次数的对数（避免头部效应）
  const baseScore = Math.log10(log.request_count + 1) * 3;

  // 时间衰减：最近请求的权重更高
  const timeDecay = Math.max(0.1, 1 - daysSinceLastRequest * 0.1);

  return Math.min(10, baseScore * timeDecay);
}
```

**热度分级**:
- 高热 (7-10): Top 20% → 强预生成（目标20题）
- 中热 (4-7): Middle 60% → 弱预生成（目标5题）
- 低热 (0-4): Bottom 20% → 保底生成（目标2题）

**验证标准**: 热度分数在0-10之间，且排名分布符合预期

---

### 3.3 预生成触发器

**职责**: 判断是否需要为某知识点预生成题目

**触发条件** (OR关系):
```javascript
async function shouldPreGenerate(kpId) {
  const log = await getKpLog(kpId);
  const pool = await getKpPool(kpId);

  // 条件1：热度高且题池不足
  const condition1 = log.heat_score >= 7 && pool.available_count < 20;

  // 条件2：热度中且题池耗尽
  const condition2 = log.heat_score >= 4 && pool.available_count < 5;

  // 条件3：低热知识点至少保底2题
  const condition3 = pool.available_count < 2;

  return condition1 || condition2 || condition3;
}
```

**验证标准**: 触发条件可精确判定，无歧义

---

### 3.4 预生成任务队列

**职责**: 存储待处理的预生成任务

**数据结构**:
```javascript
// collection: pregen_queue
{
  _id: "auto",
  kp_id: "kp1_1",
  priority: 8.5,                      // 优先级 = 热度分数
  target_count: 20,                   // 目标题数
  status: "pending",                  // pending | processing | completed
  created_at: "2026-05-20T10:30:00Z",
  processed_at: null,
  completed_at: null,
  generated_count: 0                  // 实际生成数
}
```

**验证标准**: 任务状态流转正确，无重复处理

---

### 3.5 LLM题目生成器

**职责**: 调用LLM生成数学题目

**Prompt设计** (借鉴DeepTutor):

```javascript
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

  user: (kpName, difficulty, previous) => `
知识点：${kpName}
难度：${difficulty}

本次会话已生成题目：
${previous.map(q => `- ${q.question}`).join('\n')}

请生成新题目，必须与上述所有题目不同。
`
};
```

**LLM服务配置**:
- 默认: 通义千问（qwen-plus）
- 备选: 文心一言（ERNIE-Bot-4）
- 扩展: 支持OpenAI（通过代理）

**验证标准**: LLM返回的JSON可正确解析，包含所有必需字段

---

### 3.6 双重验证器

**职责**: 验证生成题目的质量和难度

**验证维度**:

| 维度 | 验证内容 | 通过标准 |
|------|---------|----------|
| 数学准确性 | 答案是否正确 | correct = true |
| 难度匹配 | 难度是否符合标注 | difficulty_match = true |
| 题目清晰度 | 表述是否无歧义 | 无issues |

**Prompt设计**:
```javascript
const VERIFIER_PROMPT = {
  system: `你是数学题目验证专家。

返回JSON格式：
{
  "math_correct": true|false,
  "difficulty_match": true|false,
  "issues": ["问题列表"],
  "suggested_fix": "修复建议（如有）"
}`,

  user: (question) => `
题目：${question.content}
选项：${JSON.stringify(question.options)}
答案：${question.correct_answer}
标称难度：${question.difficulty}

请验证：
1. 答案是否准确？
2. 难度是否匹配？
3. 题目表述是否清晰？
`
};
```

**验证标准**: 验证通过率 > 80%，失败题目自动丢弃

---

### 3.7 AI题目池

**职责**: 存储验证通过的AI生成题目

**数据结构**:
```javascript
// collection: ai_question_pool
{
  _id: "auto",
  kp_id: "kp1_1",
  difficulty: "easy",
  question_type: "choice",
  question: "题目内容",
  options: {"A": "...", "B": "...", "C": "...", "D": "..."},
  correct_answer: "A",
  explanation: "详细解释",
  verified: true,
  verified_at: "2026-05-20T10:30:00Z",
  used_count: 0,                      // 被使用次数
  created_at: "2026-05-20T10:30:00Z"
}
```

**索引设计**:
```javascript
// 复合索引：kp_id + difficulty + verified
db.collection('ai_question_pool').createIndex({
  kp_id: 1,
  difficulty: 1,
  verified: 1
});
```

**验证标准**: 题目可正确写入和查询，verified字段确保质量

---

## 4. 闭环流程验证

### 4.1 完整闭环

```
用户使用 → 热度上升 → 预生成触发 → 题池扩充 → 更好服务 → 更多使用
   ↑                                                           ↓
   └───────────────────────────────────────────────────────────┘
```

### 4.2 环节验证

| 环节 | 输入 | 输出 | 验证方法 |
|------|------|------|----------|
| 请求统计 | 练习请求 | request_count+1 | 数据库查询 |
| 热度计算 | 请求日志 | heat_score | 公式计算 |
| 触发判断 | 热度+题池 | boolean | 条件判定 |
| 任务入队 | 触发结果 | queue记录 | 数据库写入 |
| LLM生成 | 任务记录 | 原始题目 | API调用 |
| 双重验证 | 原始题目 | 验证结果 | API调用 |
| 题池写入 | 验证通过 | 新题目 | 数据库写入 |
| 题池消费 | 练习请求 | 返回题目 | 数据库查询 |

---

## 5. 实施策略

### 5.1 分Phase实施

| Phase | 目标 | 组件 | 工作量 |
|-------|------|------|--------|
| Phase 1 | 核心闭环 | 请求统计、热度计算、触发器、简化生成器 | ~400行，2-3天 |
| Phase 2 | 质量保障 | 双重验证器、难度校准器 | ~200行，1-2天 |
| Phase 3 | 成本优化 | 多LLM抽象、智能缓存、Idea阶段 | ~300行，2-3天 |

### 5.2 Phase 1 详细内容

**目标**: 实现题目自动扩充的最小闭环

**新增云函数**:
1. `recordKpRequest` - 记录练习请求
2. `pregenWorker` - 预生成任务处理器

**新增数据库集合**:
1. `kp_request_log` - 请求统计
2. `pregen_queue` - 任务队列
3. `ai_question_pool` - AI题目池

**修改现有云函数**:
1. `practice_v2` - 添加请求统计调用，修改题目查询逻辑

**验证标准**:
- 练习请求后热度+1
- 题池<5时自动触发预生成
- 生成成功后题池+1

---

## 6. 风险与缓解

### 6.1 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| LLM服务不稳定 | 高 | 中 | 多LLM备选，重试机制 |
| 题目质量不佳 | 高 | 中 | 双重验证，人工抽查 |
| 成本超预算 | 中 | 低 | 热度驱动，限制调用频次 |
| 数据库写入性能 | 低 | 低 | 批量写入，索引优化 |

### 6.2 成本预估

**单题成本**: 约0.001-0.003元（通义千问qwen-plus）

**每日成本** (假设100用户×5题):
- 生成调用: 500次 × 0.001 = 0.5元
- 验证调用: 500次 × 0.001 = 0.5元
- **总计**: 约1元/天

**月度成本**: 约30元

---

## 7. 数据库Schema

### 7.1 kp_request_log

```javascript
{
  _id: "kp1_1",
  request_count: 156,
  last_request_at: "2026-05-20T10:30:00Z",
  heat_score: 8.5,
  daily_log: [
    { date: "2026-05-20", count: 25 }
  ],
  updated_at: "2026-05-20T10:30:00Z"
}
```

### 7.2 pregen_queue

```javascript
{
  _id: "auto",
  kp_id: "kp1_1",
  priority: 8.5,
  target_count: 20,
  status: "pending",
  created_at: "2026-05-20T10:30:00Z",
  processed_at: null,
  completed_at: null,
  generated_count: 0
}
```

### 7.3 ai_question_pool

```javascript
{
  _id: "auto",
  kp_id: "kp1_1",
  difficulty: "easy",
  question_type: "choice",
  question: "...",
  options: {"A": "...", "B": "...", "C": "...", "D": "..."},
  correct_answer: "A",
  explanation: "...",
  verified: true,
  verified_at: "2026-05-20T10:30:00Z",
  used_count: 0,
  created_at: "2026-05-20T10:30:00Z"
}
```

---

## 8. 参考资料

### 8.1 DeepTutor项目

- **路径**: `/Users/seanxx/DeepTutor`
- **关键模块**:
  - `deeptutor/agents/question/` - 题目生成Agent
  - `deeptutor/agents/question/prompts/` - Prompt模板
  - `deeptutor/services/prompt/manager.py` - Prompt管理器

### 8.2 借鉴模式

1. **两阶段生成**: IdeaAgent → Generator
2. **选项均衡**: 选择题选项长度应大致均衡
3. **避免重复**: 追踪已生成题目，确保不重复
4. **双重验证**: 数学准确性 + 难度匹配

---

## 9. 附录

### 9.1 知识点列表

当前系统支持14个知识点：

| 章节 | 知识点ID | 名称 |
|------|---------|------|
| 二次根式 | kp1_1 | 二次根式的概念 |
| 二次根式 | kp1_2 | 二次根式的性质 |
| 二次根式 | kp1_3 | 二次根式的运算 |
| 勾股定理 | kp2_1 | 勾股定理 |
| 勾股定理 | kp2_2 | 勾股定理的逆定理 |
| 勾股定理 | kp2_3 | 勾股定理的应用 |
| 平行四边形 | kp3_1 | 平行四边形的性质 |
| 平行四边形 | kp3_2 | 平行四边形的判定 |
| 平行四边形 | kp3_3 | 特殊的平行四边形 |
| 一次函数 | kp4_1 | 函数的概念 |
| 一次函数 | kp4_2 | 一次函数的图像 |
| 一次函数 | kp4_3 | 一次函数的应用 |
| 数据的分析 | kp5_1 | 数据的集中趋势 |
| 数据的分析 | kp5_2 | 数据的波动程度 |

### 9.2 冷启动策略

系统初始化时，为所有14个知识点各预生成5道题目（每个难度）：

- easy: 5题 × 14KP = 70题
- medium: 5题 × 14KP = 70题
- hard: 5题 × 14KP = 70题

**总计**: 210题初始题池

---

**文档结束**
