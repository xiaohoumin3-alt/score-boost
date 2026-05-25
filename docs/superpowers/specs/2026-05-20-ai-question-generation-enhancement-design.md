# AI题目生成系统增强方案

> **目标**：实现"润物细无声"的AI题目生成，随着使用量增长自动扩展题库

**日期**：2026-05-20

**状态**：草稿

---

## 1. 背景与目标

### 1.1 当前状态

- `generateAiQuestion` 云函数已能调用MiniMax API生成选择题
- 题目已能写入 `ai_question_pool` 数据库集合
- `practice` 云函数使用预置题库 `question_bank.js`

### 1.2 核心目标

**"润物细无声"**：随着用户使用量增长，AI自动扩展题库，用户无感知地获得越来越丰富的练习体验。

### 1.3 四个增强方向

| 编号 | 功能 | 目标 |
|------|------|------|
| A | 增强题目质量 | 选项均衡约束、防重复机制、prompt优化 |
| B | RAG知识检索 | 建立知识点知识库，生成时注入上下文 |
| C | 扩展题型 | 支持choice/written/coding三种题型 |
| D | 集成练习流程 | practice云函数调用generateAiQuestion自动补足题库 |

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     练习流程 (practice)                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐   │
│  │ 题库优先    │ → │ AI补充      │ → │ 实时生成        │   │
│  │ (QUESTION_  │    │ (ai_question│    │ (generateAi     │   │
│  │  BANK)     │    │  _pool查询) │    │  Question调用)  │   │
│  └─────────────┘    └─────────────┘    └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  generateAiQuestion 增强                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Prompt优化  │  │ RAG检索     │  │ 多题型支持   │      │
│  │ ·选项均衡    │  │ ·知识库构建  │  │ ·choice     │      │
│  │ ·防重复     │  │ ·上下文注入  │  │ ·written    │      │
│  │ ·质量约束   │  │              │  │ ·coding     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户请求练习
    ↓
practice云函数接收kp_list
    ↓
┌────────────────────────────────────────────┐
│ 1. 从question_bank获取预置题目              │
│ 2. 从ai_question_pool查询已生成题目         │
│ 3. 如果某kp题目不足minQuestionsPerKp：       │
│    → 调用generateAiQuestion实时生成         │
└────────────────────────────────────────────┘
    ↓
返回组合后的题目列表给用户
```

---

## 3. 功能设计

### 3.1 功能A：增强题目质量

#### 3.1.1 选项均衡约束

**问题**：当前生成的选择题选项长度可能差异大，容易被猜出答案。

**解决方案**：优化prompt，添加选项均衡约束。

**Prompt增强（参考DeepTutor generator.yaml）**：
```
要求：
- 若为选择题，必须提供恰好 4 个选项且仅 1 个正确答案
- 选择题的各选项长度应大致均衡，不要让正确选项明显比干扰项更长或更详细
- 所有选项应具有合理的迷惑性，风格和长度相近
- 避免考生通过选项长度猜出答案
```

#### 3.1.2 防重复机制

**问题**：AI可能重复生成相似题目。

**解决方案**：
1. 生成前查询 `ai_question_pool` 最近N条相同kp_id的题目
2. 将已有题目的concentration字段传给LLM
3. Prompt中添加："不要生成与以下题目相同或高度相似的题目"

**实现**：
```javascript
async function getExistingConcentrations(kp_id, limit = 10) {
  const db = getDb();
  const results = await db.collection('ai_question_pool')
    .where({ kp_id })
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();
  return results.data.map(q => q.concentration || q.question);
}
```

#### 3.1.3 Prompt质量优化

**当前Prompt**：
```
请为以下知识点生成一道${difficultyText}难度的选择题：
知识点：${kp_name}
章节：${chapter || '通用'}
...
```

**增强后Prompt**：
```
请为以下知识点生成一道${difficultyText}难度的${questionType}题：

知识点：${kp_name}
章节：${chapter || '通用'}

知识上下文：
${knowledge_context}

用户当前启用的工具：
${available_tools}

对话上下文：
${history_context}

已生成的相似题目（请避免生成相同或高度相似的）：
${previous_questions}

要求：
- ${quality_constraints}
- 严格对齐难度：${difficultyText}
- 给出清晰解释
```

---

### 3.2 功能B：RAG知识检索

#### 3.2.1 知识库结构

**存储位置**：`knowledge_points` 集合（已有）

**增强字段**：
```javascript
{
  kp_id: "kp_一元二次方程",
  kp_name: "一元二次方程",
  chapter: "代数",
  knowledge_context: "一元二次方程 ax²+bx+c=0(a≠0)。解法包括：直接开平方法、配方法、公式法、因式分解法。判别式Δ=b²-4ac...",
  related_concepts: ["因式分解", "配方法", "求根公式", "判别式"],
  typical_mistakes: ["符号错误", "忽略a≠0条件", "判别式计算错误"],
  difficulty_tags: ["简单", "中等", "困难"],
  updated_at: Date
}
```

#### 3.2.2 检索流程

```javascript
async function getKnowledgeContext(kp_id) {
  const db = getDb();
  try {
    const result = await db.collection('knowledge_points')
      .where({ kp_id })
      .limit(1)
      .get();
    if (result.data.length > 0) {
      const kp = result.data[0];
      return {
        knowledge_context: kp.knowledge_context || "",
        related_concepts: kp.related_concepts || [],
        typical_mistakes: kp.typical_mistakes || []
      };
    }
  } catch (e) {
    console.log('[RAG] Failed to fetch kp:', e.message);
  }
  return { knowledge_context: "", related_concepts: [], typical_mistakes: [] };
}
```

#### 3.2.3 上下文注入

生成题目时，将 `knowledge_context` 注入prompt，帮助LLM生成更准确的题目。

---

### 3.3 功能C：扩展题型

#### 3.3.1 题型定义

| 类型 | 数据结构 | 生成要求 |
|------|---------|---------|
| `choice` | `{options: ["A", "B", "C", "D"]}` | 4选项，1正确，长度均衡 |
| `written` | `{sample_answer: "..."}` | 无选项，简答/解释/分析 |
| `coding` | `{expected_code: "..."}` | 无选项，代码/伪代码/算法步骤 |

#### 3.3.2 数据结构增强

**ai_question_pool 新增字段**：
```javascript
{
  _id: ObjectId,
  kp_id: String,
  kp_name: String,
  difficulty: "easy" | "medium" | "hard",
  question_type: "choice" | "written" | "coding",
  question: String,
  options: [String] | null,           // choice题型
  correct_answer: Number | String,    // choice用index，其他用字符串
  explanation: String,
  sample_answer: String | null,        // written/coding题型
  expected_code: String | null,        // coding题型
  verified: Boolean,
  usage_count: Number,
  correct_count: Number,
  concentration: String,               // 题目关键词（用于防重复）
  created_at: Date,
  updated_at: Date
}
```

#### 3.3.3 Prompt设计（参考DeepTutor）

**choice题型Prompt**：
```yaml
generate: |
  若为选择题，必须提供恰好 4 个选项且仅 1 个正确答案。
  选择题的各选项长度应大致均衡，不要让正确选项明显比干扰项更长或更详细。
  所有选项应具有合理的迷惑性，风格和长度相近。
```

**written题型Prompt**：
```yaml
generate: |
  若为 written 题，不要提供选项，作答方式应为简答、解释或分析。
  如果非选择题仍然给出 A/B/C/D 选项，则该输出视为无效。
  给出清晰解释。
```

**coding题型Prompt**：
```yaml
generate: |
  若为 coding 题，不要提供选项，作答方式应为编写代码、伪代码或算法步骤。
  对于 written/coding 题，禁止要求学习者在若干选项中选择答案。
```

#### 3.3.4 题型支持优先级

1. **Phase 1**：`choice`（已实现，需优化）
2. **Phase 2**：`written`（简答题型）
3. **Phase 3**：`coding`（编程题型）

---

### 3.4 功能D：集成练习流程

#### 3.4.1 集成策略

**目标**：实现"润物细无声"——题库不足时自动补足，用户无感知。

**触发条件**：
- 当某知识点的可用题目 < `minQuestionsPerKp` 阈值时触发
- 阈值可配置（默认：每知识点最少3道）

#### 3.4.2 practice云函数改造

**修改文件**：`cloudfunctions/practice/index.js`

**新增逻辑**：
```javascript
async function generateQuestionPlan(kpList, numQuestions, options = {}) {
  const { enableAiFill = true, minQuestionsPerKp = 3 } = options;
  const questions = [];

  for (const kp of kpList) {
    // 1. 先从题库获取
    const fromBank = getFromQuestionBank(kp, numQuestions);

    // 2. 从ai_question_pool查询已生成题目
    const fromPool = enableAiFill ? await queryAiQuestionPool(kp) : [];

    let kpQuestions = [...fromBank, ...fromPool];

    // 3. 如果仍不足，调用AI生成
    if (kpQuestions.length < minQuestionsPerKp && enableAiFill) {
      const needed = minQuestionsPerKp - kpQuestions.length;
      const aiGenerated = await callGenerateAiQuestion(kp, needed);
      kpQuestions.push(...aiGenerated);
    }

    questions.push(...kpQuestions);
  }

  return questions;
}
```

#### 3.4.3 异步生成策略

**问题**：实时调用generateAiQuestion可能超时（云函数限制20秒）

**解决方案**：
1. **同步模式**：题目数量充足时直接返回
2. **异步模式**：题目不足时，先返回已有题目，后台触发AI生成
3. **预生成模式**：定时任务批量生成题目

**推荐实现**：同步模式（简单可靠）
- 当题库不足时，调用generateAiQuestion实时生成
- 云函数超时时间已设为20秒
- MiniMax API响应时间约6-8秒，可支持生成2-3道题

---

## 4. 接口设计

### 4.1 generateAiQuestion 增强

#### 请求参数

```javascript
{
  kp_id: String,           // 知识点ID
  kp_name: String,        // 知识点名称（可选，优先使用）
  chapter: String,         // 章节（可选）
  difficulty: String,      // "easy" | "medium" | "hard"（默认"medium"）
  question_type: String,   // "choice" | "written" | "coding"（默认"choice"）
  exclude_concentrations: [String]  // 用于防重复
}
```

#### 响应

```javascript
{
  success: true,
  data: {
    question: String,
    options: [String] | null,
    correct_answer: Number | String,
    explanation: String,
    sample_answer: String | null,
    question_type: String,
    difficulty: String,
    pool_id: String,       // 新增题目的数据库ID
    concentration: String   // 题目关键词
  }
}
```

### 4.2 practice 增强

#### 修改generateQuestionPlan

```javascript
// 新增参数
options = {
  enableAiFill: Boolean,     // 是否启用AI补足（默认true）
  minQuestionsPerKp: Number, // 每知识点最少题目数（默认3）
  maxRetriesPerKp: Number    // 每知识点最多重试次数（默认2）
}
```

---

## 5. 数据库设计

### 5.1 ai_question_pool 集合

```javascript
// 索引
{
  kp_id: 1,
  difficulty: 1,
  question_type: 1
}

// 现有字段 + 新增字段
{
  _id: ObjectId,
  kp_id: String,
  kp_name: String,
  chapter: String,
  difficulty: String,
  question_type: String,
  question: String,
  options: [String] | null,
  correct_answer: Number | String,
  explanation: String,
  sample_answer: String | null,
  expected_code: String | null,
  verified: Boolean,
  usage_count: Number,
  correct_count: Number,
  concentration: String,
  created_at: Date,
  updated_at: Date
}
```

### 5.2 knowledge_points 集合（已有，增强）

```javascript
// 新增字段
{
  knowledge_context: String,
  related_concepts: [String],
  typical_mistakes: [String],
  difficulty_tags: [String]
}
```

---

## 6. 验证标准

### 6.1 功能A（增强题目质量）

| 验证项 | 标准 | 测试方法 |
|--------|------|---------|
| 选项均衡 | 选择题4选项长度差异<20% | 生成100道choice题，统计选项长度标准差 |
| 防重复 | 相同kp连续生成10次无重复 | 连续调用generateAiQuestion 10次，检查question字段 |
| Prompt质量 | 生成题目与知识点相关性>80% | 人工抽检20道题目 |

### 6.2 功能B（RAG知识检索）

| 验证项 | 标准 | 测试方法 |
|--------|------|---------|
| 知识库完整 | 80%的kp有knowledge_context | 统计knowledge_points集合中有context的记录数 |
| 上下文注入 | 生成的题目包含context关键词 | 检查生成题目是否包含kp的related_concepts |

### 6.3 功能C（扩展题型）

| 验证项 | 标准 | 测试方法 |
|--------|------|---------|
| choice支持 | 能正常生成选择题 | 调用generateAiQuestion，验证返回格式 |
| written支持 | 能正常生成简答题 | 调用generateAiQuestion({question_type:"written"}) |
| coding支持 | 能正常生成编程题 | 调用generateAiQuestion({question_type:"coding"}) |

### 6.4 功能D（集成练习流程）

| 验证项 | 标准 | 测试方法 |
|--------|------|---------|
| 题库优先 | 预置题库充足时不用AI | 调用practice，检查是否调用generateAiQuestion |
| AI补足 | 题库不足时自动触发 | 模拟题库不足场景，检查是否触发生成 |
| 用户无感知 | 生成时间<5秒 | 计时从请求到返回 |

---

## 7. 实现顺序

### Phase 1：基础增强（1-2天）
1. 优化generateAiQuestion的prompt（选项均衡约束）
2. 添加防重复机制（查询已有题目，传入concentrations）
3. RAG知识检索（从knowledge_points获取context）

### Phase 2：题型扩展（2-3天）
4. 添加written题型支持
5. 添加coding题型支持
6. 更新数据库schema

### Phase 3：流程集成（2-3天）
7. 修改practice云函数，添加AI补足逻辑
8. 添加配置开关（enableAiFill）
9. 端到端测试

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| MiniMax API超时 | 用户等待时间长 | 设置合理超时（18秒），失败返回友好提示 |
| 题目重复 | 用户体验差 | 加强防重复机制，定期清理相似题目 |
| 数据库写入失败 | 题目丢失 | 添加重试机制，记录错误日志 |
| 题型扩展破坏现有功能 | regression | 每个题型单独测试，保持choice兼容性 |

---

## 9. 参考资料

- DeepTutor项目：`/Users/seanxx/DeepTutor`
  - `deeptutor/agents/question/prompts/zh/generator.yaml` - Prompt模板
  - `deeptutor/agents/question/agents/generator.py` - 生成器实现
  - `deeptutor/agents/question/agents/idea_agent.py` - IdeaAgent实现

- 当前实现：
  - `cloudfunctions/generateAiQuestion/index.js` - AI题目生成云函数
  - `cloudfunctions/practice/question_bank.js` - 预置题库