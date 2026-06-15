# 深度测评题池兜底与生成队列闭环设计

日期：2026-06-15  
项目：提分神器小程序  
范围：`extendedAssessment` 深度测评启动/扩展取题、`assessment-depth` 前端等待态、`questionGenerator` 对深度测评队列的最小兼容、队列状态轮询

## 1. 背景与问题

用户在结果页看到低精度后点击“继续测评，提升精度”，进入深度测评页时出现：

> 当前题库中暂无可用题目，请稍后再试

线上只读调查结果：

| 查询 | 数量 |
|---|---:|
| `ai_question_pool` 总题数 | 3185 |
| `verified:true` | 0 |
| `verified:false` | 2264 |
| 缺失 `verified` 字段 | 约 921 |
| `grade:"2", subject:"math"` | 88 |
| `grade:"2", subject:"math", verified:true` | 0 |
| `grade:"2", subject:"math", verified` 缺失 | 88 |
| `grade:"2", subject:"数学", verified:false` | 36 |

当前 `cloudfunctions/extendedAssessment/index.js` 在第一阶段和第二阶段都固定查询：

```js
{
  grade: String(grade),
  subject,
  verified: true
}
```

线上有题，但没有 `verified:true` 题；因此深度测评必然查空。普通测评 `startAssessment` 已有更完整策略：先查 `verified:true`，再回退 `verified:false`，题目不足时创建 `question_queue`。深度测评缺少这些兜底。

## 2. 核心目标

| 目标 | 定义 |
|---|---|
| G1 深度测评可启动 | 当前年级/科目存在可用题时，不因 `verified:true` 为 0 直接失败 |
| G2 题池不足可等待生成 | 当前题池不足 5 道初始题时，创建生成队列并让前端进入等待/轮询 |
| G3 保持题目质量边界 | 不跨年级兜底，不批量把题目标为 `verified:true` |
| G4 不破坏现有普通测评 | 复用现有 `question_queue` / `checkQueueStatus` 能力，但避免污染普通测评数据 |

## 3. 非目标

- 不做全量题库审核系统。
- 不批量修改线上 `verified` 字段。
- 不跨年级兜底。
- 不重构 `questionGenerator` 主流程。
- 不改变普通测评 `startAssessment` 的队列协议。
- 不扩展 `extendedAssessment` 的 `grade/subject` 业务入参语义：前端仍传英文 canonical subject；仅新增内部闭环参数 `after_queue_id`，用于队列完成后防止无限重新排队。

## 4. Swarm 审查修订摘要

Phase 2 Swarm Review 发现原设计存在阻塞问题，本版已修订：

| 原问题 | 修订 |
|---|---|
| `semester:'all' + 空 question_plan` 可能让低年级 fallback 到高年级知识点 | 队列任务必须带合法内部 semester（`up/down`）和同年级 `question_plan/target_kps`；不再传 `semester:'all'` |
| 队列 completed 后重新 start 仍不足可能无限排队 | 新增 `after_queue_id` 一次性重试语义；队列后仍不足返回 `INSUFFICIENT_QUESTIONS_AFTER_GENERATION`，不再排队 |
| fallback 查询“命中即停/累积补足”不明确 | 明确按优先级累积补足到 `count`，全局去重，`excludeIds` 全程生效 |
| 前端可能把 queued 当 ready | 明确先判断 top-level `status:'queued'`；ready 必须有 `session_id` 和非空 `questions` |
| `checkQueueStatus` 响应 shape 不明确 | 明确读取 `result.result.data.status`；`data.message` 为 optional |
| 队列写入 `grade` 可能是数字，生成后查不到 | 深度测评队列写入必须使用 `grade:String(grade)`；如实现触达 `SaveQuestionsStep`，也要保证保存入池为字符串 |
| `type:'extended_assessment'` 会创建普通 assessment | `questionGenerator` 增加最小分支：跳过 `CreateAssessmentStep`，只生成并保存题目、完成队列 |
| `CompleteStep` 默认依赖/写回逻辑不兼容 extended | extended workflow 使用 `CompleteStep({ dependencies: [] })`；`CompleteStep` 对 extended 只写 `question_ids`，不更新/创建普通 `assessments` |
| `processTask` 只特判 parent 无 assessment 流程 | extended 成功返回 `question_ids/questions_count`，不得读取或要求 `assessment_id` |
| 跨云函数 require `startAssessment/queue_manager.js` 有打包风险 | `extendedAssessment` 内实现最小 `createExtendedAssessmentQueue` helper |
| `question_plan/target_kps` 数据来源不够明确 | 新增 `buildExtendedQuestionPlan`：使用 `extendedAssessment` 云函数目录内随函数打包的数据副本，内部 semester 为 `up/down` |
| session 存储题目若脱敏会导致无法判分 | 明确只有客户端响应使用 `sanitizeQuestionForClient`；`extended_sessions` 服务端题目必须保留 `correct_answer` 和 IRT/KP 字段 |
| completed 后 500ms retry timeout 无法清理 | 前端新增 `queueRetryTimer`，`stopQueuePolling/onUnload/onRetry/error/ready` 都必须清理 interval 与 timeout |
| 生成器 AI 失败 fallback 可能生成默认高年级题 | extended queue 禁止调用 `generateDefaultQuestions`；AI 失败或不足时只能同年级同科目题池 fallback，不足则 queue failed |
| 知识点数据副本/文件命名不够落地 | 明确新增 `cloudfunctions/extendedAssessment/data/` 文件清单、`physics-grade9.json` 兼容策略、缺失文件行为和打包验证 |
| 9 年级生物/地理支持矩阵不一致 | 创建队列前必须与 `questionGenerator` 支持矩阵对齐；不支持组合返回明确错误或同步修正生成器校验矩阵 |

## 5. 后端设计

### 5.0 常量定义

```js
// 第一阶段初始题数
const INITIAL_QUESTION_COUNT = 5;

// 第二阶段候选题数
const PHASE2_CANDIDATE_COUNT = 100;

// 第二阶段最大总题数（包含第一阶段）
const MAX_TOTAL_QUESTIONS = 50;

// 队列过期时间（分钟）
const QUEUE_EXPIRES_MINUTES = 30;

// 队列超时判断阈值
const QUEUE_STUCK_THRESHOLD_MS = 5 * 60 * 1000;  // processing超过5分钟视为stuck
const QUEUE_STALE_THRESHOLD_MS = 2 * 60 * 1000;  // pending超过2分钟视为stale
```

### 5.1 Subject 兼容范围

API 入参仍只接受英文 canonical subject：

```js
math, chinese, english, physics, chemistry, biology, history, geography, politics
```

前端 `assessment-depth` 已把中文科目映射成英文，`validateStartParams` 不扩展为接受中文。Subject alias 仅用于读取历史题池数据中混用的 `ai_question_pool.subject` 字段。

本地 helper：

```js
function getSubjectAliases(subject) {
  const aliases = {
    math: ['math', '数学'],
    chinese: ['chinese', '语文'],
    english: ['english', '英语'],
    physics: ['physics', '物理'],
    chemistry: ['chemistry', '化学'],
    biology: ['biology', '生物'],
    history: ['history', '历史'],
    geography: ['geography', '地理'],
    politics: ['politics', '政治', '道德与法治', '思想政治']
  };
  return aliases[subject] || [subject];
}
```

规则：

- 队列、session、业务字段统一存 canonical English subject。
- 查询题池时使用 aliases。
- aliases 查询时排除原始 subject，避免重复查询。
- 不做跨科目兜底。

### 5.2 题池查询 helper

新增本地 helper，先放在 `cloudfunctions/extendedAssessment/index.js` 内，不抽 shared：

```js
async function fetchQuestionsWithFallback(db, {
  grade,
  subject,
  count,
  excludeIds = []
})
```

#### 查询语义

按优先级**累积补足**，不是命中即停：

| 优先级 | subject | verified 条件 |
|---:|---|---|
| 1 | 原始 canonical subject | `true` |
| 2 | alias subjects（不含原始 subject） | `true` |
| 3 | 原始 canonical subject | `false` |
| 4 | alias subjects（不含原始 subject） | `false` |
| 5 | 原始 canonical subject | `db.command.exists(false)` |
| 6 | alias subjects（不含原始 subject） | `db.command.exists(false)` |

执行规则：

1. `const normalizedGrade = String(grade)`。
2. 每一级查询同年级：`grade: normalizedGrade`。
3. 每一级查询后先过滤 `excludeIds`，再按 `_id/question_id/id` 全局去重。
4. 累积到 `count` 后停止；所有来源耗尽仍不足则返回已有数量。
5. 每一级查询 limit 取 `Math.max(count * 2, count + excludeIds.length)`，避免先取到的题都被排除导致误判不足。
6. 如果某一级查询异常，记录日志并继续下一优先级；如果所有查询都异常，返回 `queryFailedAll:true` 并记录 `QUESTION_POOL_QUERY_FAILED` 日志，上层不得把数据库查询全失败伪装成题池不足并创建队列。
7. 缺失 `verified` 使用 CloudBase SDK 写法：`const _ = db.command; where.verified = _.exists(false)`。
8. alias subjects 使用：`where.subject = _.in(aliasSubjects)`；如果 aliasSubjects 为空则跳过该级。

#### 返回结构

helper 返回：

```js
{
  questions,
  queryFailedAll: false,
  sources: [
    { subject: 'math', verifiedMode: true, count: 2 },
    { subject: 'math', verifiedMode: false, count: 3 }
  ],
  errors: []
}
```

`queryFailedAll` 用于区分数据库/查询全失败与真实题池不足；`errors` 仅用于日志或诊断，不暴露给用户。

### 5.3 题目格式转换

`fetchQuestionsWithFallback` 返回的原始题池记录必须进入统一转换：

```js
{
  question_id: q._id || q.question_id || generatedId,
  content: q.question || q.content || '',
  options: q.options || [],
  correct_answer: normalizeChoice(q.correct_answer),
  difficulty: typeof q.difficulty === 'string'
    ? { easy: -1, medium: 0, hard: 1 }[q.difficulty] || 0
    : (q.difficulty || q.irt_b || 0),
  discrimination: q.discrimination || q.irt_a || 1.0,
  guessing: q.guessing || q.irt_c || 0.25,
  kp_id: q.kp_id || '',
  kp_name: q.kp_name || q.knowledge_point || '',
  knowledge_point_id: q.kp_id || ''
}
```

#### `sanitizeQuestionForClient` 脱敏字段清单

**脱敏目的**：防止客户端获取答案和评分参数，避免作弊

**必须移除的字段**：
```js
// sanitizeQuestionForClient 实现示例
function sanitizeQuestionForClient(question) {
  const sanitized = { ...question };
  // 移除答案相关字段
  delete sanitized.correct_answer;
  delete sanitized.answer;  // 如果存在
  // 移除IRT评分参数（可选，建议也移除）
  delete sanitized.difficulty;
  delete sanitized.discrimination;
  delete sanitized.guessing;
  delete sanitized.irt_a;
  delete sanitized.irt_b;
  delete sanitized.irt_c;
  return sanitized;
}
```

**使用场景**：
- ✅ 返回客户端响应前：必须调用 `sanitizeQuestionForClient`
- ❌ 写入 `extended_sessions` 时：不得调用，必须保留完整字段

客户端返回仍必须经过 `sanitizeQuestionForClient`，不得泄露 `correct_answer`。

#### session 存储与客户端脱敏边界

`sanitizeQuestionForClient` 只用于云函数响应给前端前的脱敏。`extended_sessions` 中用于服务端判分和 IRT 更新的可信题目副本不得使用会移除答案的 storage sanitizer。

写入 `extended_sessions.phase1.questions` 和 `extended_sessions.phase2.questions` 时必须保留：

```js
{
  question_id,
  content,
  options,
  correct_answer,      // 服务端判分必需；不得返回客户端
  difficulty,
  discrimination,
  guessing,
  kp_id,
  kp_name,
  knowledge_point_id
}
```

规则：

1. 创建/更新 session 时保存服务端完整题目对象。
2. 返回客户端时再对同一批题目调用 `sanitizeQuestionForClient`。
3. `submitPhase1Answers` / `submitAnswers` 判分必须从 session 中读取 `correct_answer`。
4. 测试必须覆盖 fallback ready 后提交 5 题可完成判分，防止“启动成功但提交失败”。

### 5.4 第一阶段 `startExtendedAssessment`

新增请求参数：

```js
after_queue_id?: string
```

该参数只由 `assessment-depth` 在某个队列 completed 后重新启动时传入，用于防止无限排队。

新行为：

1. 校验 `grade/subject`。
2. `grade` 规范化为字符串用于题池和队列；session 内可保留数字或字符串，但所有题池查询统一 `String(grade)`。
3. 调用 `fetchQuestionsWithFallback(... count: INITIAL_QUESTION_COUNT)`。
4. 如果题数 ≥ 5：创建 `extended_sessions` 并返回题目。
5. 如果 `fetchQuestionsWithFallback` 返回 `queryFailedAll:true`：返回 `QUESTION_POOL_QUERY_FAILED` 或等价数据库查询错误，不创建队列。
6. 如果题数 < 5 且存在 `after_queue_id`：先校验该队列属于当前 `userOpenid`、同 `grade`、同 `subject`、`source:'extendedAssessment'`、`type:'extended_assessment'`，且 `status === 'completed'`；可选校验 `timeline.completed_at` 或 `question_ids` 存在。校验失败时返回明确错误，不得用任意或未完成的 `after_queue_id` 抑制排队。若队列仍是 `pending/processing`，返回 queued 或 `QUEUE_NOT_COMPLETED`；若队列是 `failed/cancelled`，返回生成失败类错误。校验通过后返回错误，不再创建新队列：

```js
return createError(
  'INSUFFICIENT_QUESTIONS_AFTER_GENERATION',
  '题目生成后仍不足，请稍后再试'
);
```

7. 如果题数 < 5 且不存在 `after_queue_id`：创建或复用深度测评队列。
8. 队列创建成功时返回：

```js
{
  success: true,
  status: 'queued',
  queue_id,
  message: '题目正在生成中，请稍候...'
}
```

9. 队列创建失败时返回明确错误：

```js
return createError('QUEUE_CREATE_FAILED', '题目生成任务创建失败，请稍后重试');
```

### 5.5 第二阶段 `getNextQuestion`

当前直接查 `verified:true` 的 100 道候选题。新行为：

1. 先计算第二阶段已答题集合：`answeredPhase2QuestionIds`，来源为 `session.phase2.answers` 中已提交答案的 `question_id`。
2. 检查 `session.phase2.questions` 中是否存在未答题（`question_id` 不在 `answeredPhase2QuestionIds` 中）。如果存在：
   - 不再调用 IRT 选题；
   - 不再追加 `phase2.questions`；
   - 直接返回该未答题的脱敏版本；
   - 这就是网络重试、并发调用、重复点击“下一题”的幂等语义。
3. 只有不存在未答 phase2 题时，才调用 `fetchQuestionsWithFallback(db, { grade: session.grade, subject: session.subject, count: 100, excludeIds: allUsedIds })`。
4. `allUsedIds` 必须包含 phase1 已发题、phase2 已发题；`MAX_TOTAL_QUESTIONS` 或同类上限判断必须同时考虑已答题数和 outstanding 未答题，避免无限发题不答。
5. 保持现有 IRT `selectNextQuestion`、`calculateProgress`、停止条件，不调整 IRT 算法。

**IRT 算法依赖说明**：
- `selectNextQuestion` 函数位于 `cloudfunctions/extendedAssessment/irt.js` 或内联在 `index.js` 中
- 依赖参数：候选题数组、当前能力估值 (theta)、题目参数 (difficulty/discrimination/guessing)
- 返回：选中的下一题
- 本轮不修改 IRT 算法逻辑，只确保输入题目参数格式正确
6. `selectNextQuestion` 选出 `nextQuestion` 后，必须先把服务端完整题目追加/写入 `extended_sessions.phase2.questions`，再返回脱敏题给客户端。
7. 写入 `phase2.questions` 的对象必须保留与 session 判分一致的字段：`question_id/content/options/correct_answer/difficulty/discrimination/guessing/kp_id/kp_name/knowledge_point_id`。
8. 写入必须具备幂等/重复保护：若同一 `question_id` 已存在于 `phase2.questions`，不得重复追加；未答题存在时必须返回同一未答题，不得重新按已用题集合选新题。
9. **幂等检查时机（明确）**：
   - **入口检查**：`getNextQuestion` 入口立即读取 session，检查 `session.phase2.questions` 是否存在未答題
   - **选题前检查**：确认无未答題后，再调用 IRT 选题
   - **写入前检查**：写入前二次读取 session，再次确认无未答題
   - **写入后确认**：写入后再次读取，确认无重复 `question_id`
   - 如果二次读取发现已有未答题，放弃本次新题并返回已有未答题
   - 若发现多个 outstanding，返回最早追加的一题并记录 `PHASE2_OUTSTANDING_DUPLICATE` 日志，不自动删除其他题
10. 如果写入 `phase2.questions` 失败，不得把题返回客户端，必须返回明确错误并记录日志；否则前端提交后服务端无法判分。
11. 返回客户端前才调用 `sanitizeQuestionForClient(nextQuestion)`，不得泄露 `correct_answer`。
12. 如果候选为空，不创建队列，返回：

```js
return createError('INSUFFICIENT_QUESTIONS', '题库中无更多可用题目');
```

第二阶段不排队，原因：测评已进行中，临时等待生成会打断体验。本轮只保证启动闭环，第二阶段通过 fallback 降低中途断题概率。

### 5.6 第二阶段 `submitAnswers` 判分契约

当前 `submitAnswers` 应按 `question_id` 从服务端 session 题目副本判分，不得依赖客户端题目元数据或 answers 数组下标。

规则：

1. 构建 `questionMap` 时使用服务端可信题目：`session.phase2.questions`；如实现复用通用 helper，可包含 `phase1.questions`，但第二阶段提交的题必须存在于 phase2 集合中。
2. `questionMap` key 使用 `String(question.question_id)`；每个提交答案使用 `String(answer.question_id)` 查找。
3. 判分和 IRT 输入字段全部从服务端题目对象读取：`correct_answer/difficulty/discrimination/guessing/kp_id/kp_name/knowledge_point_id`。
4. 禁止按 `answers[index]` 对齐 `phase2.questions[index]` 读取题目属性；数组顺序不能作为判分依据。
5. 禁止信任客户端传来的 `correct_answer`、difficulty、IRT 参数或完整题目对象。
6. 未知 `question_id` 返回明确错误，如 `QUESTION_NOT_IN_SESSION`；session 题目缺少 `correct_answer` 返回服务端数据损坏错误，如 `QUESTION_ANSWER_MISSING`，不得静默判错。
7. 重复提交同一 `question_id` 必须有明确策略：幂等返回当前状态，或返回 `DUPLICATE_ANSWER`；不得重复追加 `phase2.answers/responses`。
8. 测试必须覆盖第二道及以后 phase2 题：提交时 difficulty/discrimination/guessing 来自对应 `question_id` 的题目，而不是第一道 phase2 题。

### 5.7 深度测评队列创建

不跨云函数目录 require `cloudfunctions/startAssessment/queue_manager.js`。在 `extendedAssessment/index.js` 内实现最小 helper：

```js
async function createExtendedAssessmentQueue(db, {
  userOpenid,
  grade,
  subject,
  questionPlan,
  targetKps,
  semester
})
```

写入字段：

```js
{
  type: 'extended_assessment',
  source: 'extendedAssessment',
  extended_mode: true,
  student_id: userOpenid,
  subject,                 // canonical English subject
  grade: String(grade),     // 必须是字符串
  semester,                 // 必须是生成器兼容值：'up' 或 'down'
  mode: 'assessment',       // 兼容现有生成逻辑
  num_questions: INITIAL_QUESTION_COUNT,
  difficulty_distribution: { easy: 0.4, medium: 0.4, hard: 0.2 },
  // difficulty_distribution 与实际题目分配：生成5题时严格按 2(easy)-2(medium)-1(hard)
  question_plan: questionPlan,
  target_kps: targetKps,
  status: 'pending',
  priority: 1,
  retry_count: 0,
  created_at: now,
  updated_at: now,
  // expires_at：当前时间 + QUEUE_EXPIRES_MINUTES(30分钟)
  expires_at: new Date(Date.now() + QUEUE_EXPIRES_MINUTES * 60 * 1000),
  timeline: { queued_at: now }
}
```

#### questionPlan / targetKps 要求

不能传空数组。队列创建前必须基于当前年级/科目构建同年级知识点计划。

新增本地 helper：

```js
async function buildExtendedQuestionPlan({
  grade,
  subject,
  semester = 'down',
  count = INITIAL_QUESTION_COUNT
})
```

规则：

1. helper 放在 `cloudfunctions/extendedAssessment/index.js` 内，不跨云函数目录 require `startAssessment` 代码。
2. 数据文件使用 `cloudfunctions/extendedAssessment/data/` 中随云函数打包的数据副本，文件名规则与现有生成器一致：`{subject}-grade{grade}-{semester}.json`。
3. 内部 `semester` 只允许 `up/down`；如果未来收到中文学期，必须先映射：`'上' -> 'up'`、`'下' -> 'down'`；本轮请求未携带 semester 时默认 `down`，不得使用 `all`。
4. 只加载同年级、同科目的知识点文件；找不到文件或文件中无可用知识点时，队列创建失败并返回 `QUEUE_CREATE_FAILED`，不得 fallback 到其他年级或生成器内嵌默认知识点。
5. 数据副本实施清单：
   - 新增目录 `cloudfunctions/extendedAssessment/data/`，该目录必须随 `extendedAssessment` 云函数部署打包。
   - **具体文件清单**（需从 `startAssessment/data/` 复制）：
     ```bash
     # 1-9年级上下学期知识点文件
     math-grade{1-9}-{up|down}.json      # 数学全科
     chinese-grade{1-9}-{up|down}.json    # 语文全科
     english-grade{1-6}-{up|down}.json    # 英语1-6年级
     physics-grade{8-9}-{up|down}.json    # 物理8-9年级
     chemistry-grade9-{up|down}.json      # 化学9年级
     biology-grade{7-9}-{up|down}.json    # 生物7-9年级
     history-grade{7-9}-{up|down}.json    # 历史7-9年级
     geography-grade{7-9}-{up|down}.json  # 地理7-9年级
     politics-grade{7-9}-{up|down}.json    # 政治7-9年级
     # 特殊兼容文件
     physics-grade9.json                  # 9年级物理兼容副本
     ```
   - 生成清单命令：
     ```bash
     cd /Users/seanxx/score-boost-mini/cloudfunctions
     mkdir -p extendedAssessment/data
     # 复制所有常规文件
     for grade in {1..9}; do for sem in up down; do
       [ -f startAssessment/data/math-grade${grade}-${sem}.json ] && \
         cp startAssessment/data/math-grade${grade}-${sem}.json extendedAssessment/data/
     done; done
     # ...（对其他科目重复类似逻辑）
     # 复制特殊兼容文件
     cp startAssessment/data/physics-grade9.json extendedAssessment/data/
     ```
   - 对现有特殊文件 `physics-grade9.json`，helper 必须兼容读取；推荐复制为 `physics-grade9-down.json`，并在没有 `physics-grade9-up.json` 时允许 9 年级物理 `up` 映射到同一文件，或直接对 `physics-grade9.json` 做显式 fallback。该兼容只允许同年级同科目，不是跨年级兜底。
   - 对缺失数据文件的组合（例如当前数据集中不存在的 9 年级生物/地理上下学期文件），不得创建队列；返回明确错误并提示稍后再试或当前组合暂不支持生成。
   - 实施计划必须包含文件存在、JSON 可解析、`chapters` 非空的验证命令。
6. 从章节/知识点结构中提取 plan item：`chapter_id/chapter_name` 来自章节字段，`kp_id/kp_name` 来自知识点字段；缺失 `kp_id` 时用同年级同科目稳定派生 ID，缺失 `kp_name` 时跳过该知识点。
7. `question_plan` 至少包含 `count` 个 plan item；可用知识点不足时允许重复同年级知识点补足，但不得跨年级。
8. difficulty 序列按 `{ easy: 0.4, medium: 0.4, hard: 0.2 }` 生成 5 题时使用：`easy, easy, medium, medium, hard`。
9. `target_kps` 从 `question_plan` 去重派生，至少包含一个同年级知识点。

每个 plan item：

```js
{
  kp_id,
  kp_name,
  chapter_id,
  chapter_name,
  grade: String(grade),
  semester: 'up' | 'down',
  difficulty: 'easy' | 'medium' | 'hard'
}
```

#### 生成器支持矩阵

**支持矩阵存储位置**：`questionGenerator` 硬编码在 `generateQuestionsForTask` 或 `loadKnowledgeTree` 中，通过年级和科目判断是否支持生成。

**支持矩阵检查方式**：
- 方式1（推荐）：在 `extendedAssessment` 中维护与 `questionGenerator` 一致的支持矩阵，创建队列前先校验
- 方式2：同步修正 `questionGenerator` 校验矩阵并补测试，确保支持矩阵一致

**当前支持矩阵参考**（需与 `questionGenerator` 实现确认）：
```js
// questionGenerator 支持的年级/科目组合
const SUPPORTED_COMBINATIONS = {
  math: [1,2,3,4,5,6,7,8,9],
  chinese: [1,2,3,4,5,6,7,8,9],
  english: [1,2,3,4,5,6],
  physics: [8,9],
  chemistry: [9],
  biology: [7,8,9],
  history: [7,8,9],
  geography: [7,8,9],
  politics: [7,8,9]
};
```

**校验逻辑**：
```js
async function validateGeneratorSupport(grade, subject) {
  const supportedGrades = SUPPORTED_COMBINATIONS[subject];
  if (!supportedGrades || !supportedGrades.includes(parseInt(grade))) {
    return {
      valid: false,
      error: `当前组合（${subject} ${grade}年级）暂不支持题目生成`
    };
  }
  return { valid: true };
}
```

创建 `extended_assessment` 队列前必须与 `questionGenerator` 的年级/科目支持矩阵一致。若当前 `questionGenerator` 不支持某组合（例如实现时仍不支持 9 年级生物/地理），二选一：

1. 同步修正 `questionGenerator` 校验矩阵并补测试；或
2. 队列创建前返回明确错误，不创建无法处理的队列。

不得创建会被生成器立即判为 failed 的队列。

### 5.8 防重复队列

创建新队列前，查询当前用户同一深度测评生成任务：

```js
{
  student_id: userOpenid,
  source: 'extendedAssessment',
  type: 'extended_assessment',
  grade: String(grade),
  subject, // canonical English subject
  status: db.command.in(['pending', 'processing'])
}
```

规则：

- **stuck processing 判断**：读取队列的 `updated_at` 字段，如果 `当前时间 - updated_at > QUEUE_STUCK_THRESHOLD_MS(5分钟)` 且 status 仍为 `processing`，视为 stuck，不复用
- **stale pending 判断**：读取队列的 `created_at` 字段，如果 `当前时间 - created_at > QUEUE_STALE_THRESHOLD_MS(2分钟)` 且 status 仍为 `pending`，视为 stale，不复用，并可标记 failed
- 命中有效 pending/processing 时直接返回旧 `queue_id`
- 本轮不实现强事务锁；测试覆盖重复调用至少复用已有 active queue

### 5.9 `questionGenerator` 对 `extended_assessment` 的最小兼容

当前 `type:'extended_assessment'` 会走默认 workflow 并创建普通 `assessments`，这会污染普通测评数据。本轮必须加最小分支：

```js
if (task.type === 'extended_assessment') {
  return [
    new InitStateStep(),
    new GenerateStep(generateAi),
    new SaveQuestionsStep(),
    new CompleteStep({ dependencies: [] })
  ];
}
```

要求：

- 在现有 `getSteps(options, task)` 扩展点内实现；`GenerateStep` 必须传入现有 `generateAi`。
- `CompleteStep` 必须使用 `{ dependencies: [] }`，否则默认依赖 `CreateAssessment` 会导致 workflow 失败。
- 跳过 `CreateAssessmentStep`。
- `SaveQuestionsStep` 保存题目时必须能被后续 `extendedAssessment` 查回：深度测评队列写入 `grade:String(task.grade)` 和 canonical `subject`；如实现发现 `SaveQuestionsStep` 会保留数字 grade，则在该 step 内做最小修正为 `String(task.grade)`。
- `CompleteStep` 对 `task.type === 'extended_assessment'` 必须走专用完成分支，并且该分支必须位于任何读取/更新 `assessments` 的逻辑之前，或用 `task.type !== 'extended_assessment' && assessmentId` 显式保护现有 assessment 更新逻辑：
  - 不更新、不创建 `assessments`；
  - 不写 `generated_assessment_id`；
  - 将 `question_queue.status` 标为 `completed`；
  - 写回 `question_ids`、`timeline.completed_at`、`updated_at`。
- `processTask()` 对 `task.type === 'extended_assessment'` 必须使用无 assessment 成功返回语义，例如：

```js
return {
  success: true,
  question_ids,
  questions_count: question_ids.length
};
```

- completed 不代表深度测评 session 已创建；前端必须重新调用 `startExtendedAssessment`。
- `checkQueueStatus` 不需要依赖 `assessment_id` 判断 extended 队列是否 completed。

#### extended 生成失败 fallback 约束

现有生成器在 AI 生成失败或返回不足时可能走题池 fallback，题池仍不足时再生成默认题。对 `task.type === 'extended_assessment'` 必须收紧该路径：

1. extended queue 不得调用会生成内置默认题的 `generateDefaultQuestions`，避免低年级任务保存高年级默认题。
2. AI 失败或返回不足时，只允许从 `ai_question_pool` 查询同年级 `grade:String(task.grade)`、canonical subject 的已有题补足；如实现复用 subject alias，也必须保持同年级同科目边界。
3. 同年级同科目题池仍不足时，`GenerateStep` 应失败并让 queue 标记为 `failed`，前端按 failed/cancelled 分支展示错误。
4. extended queue 的完成条件是：生成/保存后按同一边界（同年级、同科目、canonical subject 或允许的 alias、`grade:String(task.grade)`）可用于 `startExtendedAssessment` 的题池总可用题数达到 `task.num_questions`，而不是”本次新保存题数达到 `task.num_questions`”。**精确定义**：保存完成后，立即查询题池可用题数（新保存题 + 已有同边界可用题），去重后如果总数 ≥ `task.num_questions` 则 completed，否则 failed。
5. `SaveQuestionsStep` 只保存 AI 新生成题，不重复保存已有题池 fallback 题；已有题池题只作为可用题池计数的一部分。
6. 如果 AI 新题 + 已有同边界可用题去重后的总数 `< task.num_questions`，queue 必须标记 `failed`，不得标记 `completed`。
7. completed 写回的 `question_ids` 应表示最终可用于重新 start 的去重题 ID 集合（新保存题 + 已有可用题），不应只写本次新保存题。
8. **temp_task_id 清理逻辑（明确责任）**：
   - 保存题时使用 `temp_task_id: task._id` 标记本次保存的题
   - `SaveQuestionsStep` 失败时立即清理本次标记的临时题
   - `CompleteStep` 判定 failed 时，二次清理 `temp_task_id: task._id` 对应的题（防止 SaveQuestionsStep 部分成功但未清理）
   - 清理查询：`db.collection('ai_question_pool').where({ temp_task_id: task._id }).remove()`
   - 清理时机：失败判定后立即执行，在标记 queue failed 之前或之后均可，但必须完成清理后再返回
9. 测试必须覆盖 extended queue 在 AI 失败且题池为空时，不保存默认高年级题、不创建普通 assessment、queue failed；也要覆盖”已有 4 题 + 新生成 1 题”时 queue completed，以及”最终可用题数仍不足”时 queue failed。

## 6. 前端设计

文件：`pages/assessment-depth/assessment-depth.js`、`pages/assessment-depth/assessment-depth.wxml`、`pages/assessment-depth/assessment-depth.wxss`

### 6.1 状态模型

新增 `queued`，不删除现有状态：

| 状态 | 含义 |
|---|---|
| `loading` | 正在启动深度测评 |
| `queued` | 题目生成中，正在轮询 |
| `ready` | 第一阶段题目可答 |
| `submitting` | 提交中 |
| `phase1_completed` | 第一阶段完成，展示是否扩展 |
| `completing` | 正在完成测评 |
| `completed` | 已展示最终结果 |
| `error` | 启动或生成失败 |

`data` 增加：

```js
queueId: '',
queuePollTimer: null,
queuePollAttempts: 0,
queueMessage: '',
queueRetryTimer: null,
hasRetriedAfterQueue: false,
errorMessage: ''
```

### 6.2 startExtendedAssessment 响应处理

必须先处理 queued，再处理 ready：

```js
const data = result.result;

if (data.success && data.status === 'queued') {
  this.setData({
    status: 'queued',
    queueId: data.queue_id,
    queueMessage: data.message || '题目正在生成中，请稍候...'
  });
  this.startQueuePolling(data.queue_id);
  return;
}

if (data.success && data.session_id && Array.isArray(data.questions) && data.questions.length > 0) {
  // 原 ready 逻辑
  return;
}

this.showError(data.error?.message || '启动测评失败');
```

如果 `startExtendedAssessment({ after_queue_id })` 返回 `INSUFFICIENT_QUESTIONS_AFTER_GENERATION`，必须写入页面 `errorMessage` 并在 error 分支展示，而不只依赖 toast：

```text
题目生成后仍不足，请稍后再试
```

### 6.3 轮询 `checkQueueStatus`

现有 `checkQueueStatus` 响应为嵌套结构。前端必须读取：

```js
const payload = result.result;
const queueData = payload && payload.data;
const status = queueData && queueData.status;
```

策略：

- `startQueuePolling(queueId)` 第一行必须调用 `stopQueuePolling()`，避免重复 timer。
- `stopQueuePolling()` 必须同时清理 `queuePollTimer` 和 `queueRetryTimer`，并把二者置为 `null`。
- 间隔：2 秒。
- **最大次数：45 次（约 90 秒）**，前端常量命名：
  ```js
  const QUEUE_POLL_MAX_ATTEMPTS = 45;  // 最大轮询次数
  const QUEUE_POLL_INTERVAL_MS = 2000;  // 轮询间隔
  ```
- `pending/processing`：继续轮询。
- `completed`：停止轮询；如果 `hasRetriedAfterQueue` 为 false，先设置 true，再把 500ms 延迟重启 timeout 保存到 `queueRetryTimer`，到期后调用 `startExtendedAssessment({ after_queue_id: queueId })`；如果已经 retry 过，进入 error，避免循环。
- `failed/cancelled`：停止轮询，进入 error。
- timeout：停止轮询，进入 error，显示”题目生成时间较长，请稍后重试”。
- malformed response：停止轮询，进入 error。
- `onUnload`、`onRetry`、进入 `error`、进入 `ready` 时都必须停止轮询并清理 pending retry timeout，避免卸载后旧 timeout 继续调用云函数。

### 6.4 重试行为

`onRetry`：

1. 调用 `stopQueuePolling()`。
2. 清空 `queueId/queueMessage/queuePollAttempts`。
3. 重置 `hasRetriedAfterQueue:false`。
4. 清空旧 answers/questions/sessionId，避免旧 session 残留。
5. 设置 `status:'loading'`。
6. 调用 `startExtendedAssessment()`。

### 6.5 WXML/WXSS

新增 queued 分支，不删除现有 `loading/error/ready/phase1_completed/completed` 分支。

展示文案：

```text
正在为你生成深度测评题目...
预计需要 10-30 秒，请稍候
```

样式可复用现有 loading spinner，新增必要 class：

- `.queued-state`
- `.queued-title`
- `.queued-message`
- `.queued-retry-btn`

## 7. 接口契约

### 7.1 `extendedAssessment.startExtendedAssessment`

Ready 响应：

```js
{
  success: true,
  session_id,
  questions,
  phase: 'first',
  target_se: 0.3,
  estimated_time
}
```

Queued 响应：

```js
{
  success: true,
  status: 'queued',
  queue_id,
  message
}
```

Error 响应：

```js
{
  success: false,
  error: {
    code,
    message
  }
}
```

### 7.2 `checkQueueStatus`

小程序云函数调用结果读取路径：

```js
result.result.success
result.result.data.status
result.result.data.queue_id
result.result.data.message // optional
result.result.data.error   // failed 队列时可能存在
```

Extended queue completed 不要求 `assessment_id` 存在。前端只依赖 `data.status === 'completed'`。

错误响应补充：

- 云函数调用失败或参数错误时，错误可能位于 `result.result.error`。
- 队列状态为 `failed` 时，错误详情可能位于 `result.result.data.error`。
- `data.message` 不是 required 字段，前端不得依赖它判断完成。

## 8. 数据流

### 8.1 有题路径

```text
result 页
  → assessment-depth
  → extendedAssessment.startExtendedAssessment
  → fetchQuestionsWithFallback 累积补足 ≥ 5 题
  → 创建 extended_sessions
  → 返回 questions
  → 前端 ready
```

### 8.2 无题生成路径

```text
result 页
  → assessment-depth
  → extendedAssessment.startExtendedAssessment
  → fetchQuestionsWithFallback 不足 5 题
  → createExtendedAssessmentQueue 写入 question_queue
  → 返回 status=queued + queue_id
  → 前端轮询 checkQueueStatus
  → questionGenerator 处理 type=extended_assessment
  → GenerateStep + SaveQuestionsStep + CompleteStep
  → queue completed
  → 前端调用 startExtendedAssessment(after_queue_id=queue_id)
  → fetchQuestionsWithFallback 再查题池
  → 若 ≥ 5：创建 extended_sessions，返回 questions
  → 若仍 < 5：返回 INSUFFICIENT_QUESTIONS_AFTER_GENERATION，不再排队
```

## 9. 测试策略

### 9.1 后端单元测试

文件：`__tests__/extended-assessment.test.js`

新增/更新场景：

1. `verified:true` ≥ 5 道时直接 ready，且不查后续 fallback。
2. `verified:true` 不足 5，但 `verified:false` 可补足时，累积返回 5 道，不创建队列。
3. `verified:true/false` 不足，但缺失 `verified` 可补足时，返回 5 道。
4. `subject=math` 且题池 `subject=数学` 时可补足。
5. alias 与原 subject 返回同一题时按 `_id` 去重。
6. `excludeIds` 在所有 fallback 分支生效。
7. 所有 fallback 都不足 5 且无 `after_queue_id` 时返回 `status:'queued'` 并创建 `question_queue`。
8. 所有 fallback 都不足 5 且有合法 completed `after_queue_id` 时返回 `INSUFFICIENT_QUESTIONS_AFTER_GENERATION`，不创建新队列。
9. `after_queue_id` 指向 pending/processing 队列时不得返回 `INSUFFICIENT_QUESTIONS_AFTER_GENERATION`；应返回 queued 或 `QUEUE_NOT_COMPLETED`。
10. `after_queue_id` 指向 failed/cancelled 或非当前用户/年级/科目/source/type 的队列时返回明确错误，不抑制正常排队。
11. 已存在 pending/processing 深度测评队列时复用 queue，不重复创建。
12. stuck processing / stale pending 不复用。
13. 队列创建失败返回 `QUEUE_CREATE_FAILED`。
14. `getNextQuestion` 使用 fallback，排除已用题，不调整 IRT 选题逻辑。
15. 旧成功测试中 mock 题数从 1 道更新为 5 道；旧“题池为空返回 INSUFFICIENT_QUESTIONS”更新为 queued 或 after_queue 错误断言。
16. `buildExtendedQuestionPlan` 只使用同年级、同科目、`up/down` 学期数据；知识点不足时重复同年级知识点，不跨年级。
17. 无可用知识点数据时返回 `QUEUE_CREATE_FAILED`，不创建会被生成器 fallback 到默认高年级知识点的队列。
18. 创建队列前处理 `questionGenerator` 支持矩阵不一致场景，例如 9 年级生物/地理：要么同步修正校验矩阵并补测试，要么返回明确错误且不入队。
17. session 内服务端题目必须保留 `correct_answer` 和 IRT/KP 字段；客户端响应才脱敏，fallback ready 后提交 5 题可完成判分。
18. `getNextQuestion` 选出第二阶段题目后，先将完整题目追加到 `extended_sessions.phase2.questions`，客户端响应才脱敏；随后提交该题可正常判分。
19. 重复/并发调用 `getNextQuestion` 且当前 phase2 题未答时，只返回同一道未答题，不追加新题，不污染 `phase2.questions`。
20. 提交当前未答 phase2 题后，再次调用 `getNextQuestion` 才允许选新题。
21. `submitAnswers` 必须按 `question_id` 从服务端 `questionMap` 读取 `correct_answer/difficulty/discrimination/guessing`，不得按 answers 数组下标取题目属性。
22. `submitAnswers` 对未知题、缺失 `correct_answer`、重复提交同一 phase2 题返回明确错误或幂等结果，不重复追加 `phase2.answers/responses`。
23. 第二道及以后 phase2 题提交时，IRT 参数来自对应 `question_id` 的题目对象。

### 9.2 `questionGenerator` 测试

新增/更新：

1. `type:'extended_assessment'` 跳过 `CreateAssessmentStep`。
2. `CompleteStep` 对 extended queue 写回 `question_ids` 并标记 completed，且不更新/创建 `assessments`。
3. `processTask` 对 extended queue 不读取或要求 `assessment_id`，成功返回 `question_ids/questions_count`。
4. `SaveQuestionsStep` 保存 extended 题时 `grade` 为字符串，`subject` 为 canonical English。
5. 不创建普通 `assessments`。
6. extended queue 在 AI 失败且同年级同科目题池也不足时，不调用 `generateDefaultQuestions`，不保存默认高年级题，queue 标记 failed。
7. extended queue 生成后最终可用题池数 `< task.num_questions` 时，queue 标记 failed，不得 completed。
8. 已有 4 道同边界题 + AI 新生成并保存 1 道时，最终可用题数达到 5，queue completed，`question_ids` 写入最终可用去重题 ID 集合。
9. extended queue failed 前若已保存部分 `temp_task_id` 题，必须清理临时题，避免题池残留。

### 9.3 前端单元测试

文件可放在 `pages/assessment-depth/__tests__/`，如现有 harness 不完整则补最小页面对象测试。

场景：

1. `startExtendedAssessment` 收到 top-level `status:'queued'` 后设置 `status='queued'` 和 `queueId`，不进入 ready。
2. ready 需要 `session_id` 和非空 `questions`。
3. 轮询读取 `result.result.data.status`。
4. completed 后只重新调用一次 `startExtendedAssessment({ after_queue_id })`。
5. failed/cancelled/timeout/malformed response 进入 error。
6. retry 前清理旧 `queuePollTimer` 和 `queueRetryTimer`。
7. onUnload 清理 `queuePollTimer` 和 `queueRetryTimer`，且 completed 后 pending 的延迟重启不得再调用 `startExtendedAssessment`。
8. completed 后用户立即 retry，旧 `after_queue_id` 延迟重启不得发生。
9. `INSUFFICIENT_QUESTIONS_AFTER_GENERATION` 写入 `errorMessage` 并在页面 error 分支展示。
10. WXML 必须渲染 `phase1_completed` 状态下的扩展推荐卡或单独分支，避免 JS 设置 `status:'phase1_completed'` 后用户看不到“继续测评”入口。
11. Phase 2 新题必须和首批题一样生成 `parsedOptions`；建议抽 `parseQuestionOptions(q)` helper，`startExtendedAssessment` 和 `getNextQuestion/onContinueAssessment` 都复用。

**`parseQuestionOptions` helper 定义**：
```js
/**
 * 统一解析题目选项格式
 * @param {Object} question - 题目对象
 * @param {Array} question.options - 选项数组，可能是 string[] 或 {key, value}[]
 * @returns {Array} 统一格式的选项数组 [{key: 'A', value: '选项内容'}]
 */
function parseQuestionOptions(question) {
  const options = question.options || [];
  // 如果已经是标准格式，直接返回
  if (options.length > 0 && typeof options[0] === 'object' && 'key' in options[0]) {
    return options;
  }
  // 如果是字符串数组，转换为标准格式
  if (options.length > 0 && typeof options[0] === 'string') {
    const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
    return options.map((opt, idx) => ({
      key: keys[idx] || String.fromCharCode(65 + idx),
      value: opt
    }));
  }
  // 空选项或无效格式
  return [];
}
```

### 9.4 回归测试命令

```bash
cd /Users/seanxx/score-boost-mini && npm test -- __tests__/extended-assessment.test.js --runInBand
cd /Users/seanxx/score-boost-mini && npm test -- pages/assessment-depth --runInBand
cd /Users/seanxx/score-boost-mini && npm test -- utils/__tests__/cloudApi-queue.test.js --runInBand
cd /Users/seanxx/score-boost-mini && npm test -- pages/result/__tests__/result.test.js --runInBand
```

如修改 `questionGenerator`，追加：

```bash
cd /Users/seanxx/score-boost-mini && npm test -- cloudfunctions/questionGenerator --runInBand
cd /Users/seanxx/score-boost-mini && npm test -- cloudfunctions/checkQueueStatus --runInBand
```

### 9.5 数据副本验证

```bash
find /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/data -maxdepth 1 -type f -name '*-grade*-*.json' | sort
find /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/data -maxdepth 1 -type f \( -name 'math-grade2-down.json' -o -name 'physics-grade9*.json' \) | sort
node -e "const fs=require('fs'); const p='/Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/data/math-grade2-down.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); if(!j.chapters || !j.chapters.length) throw new Error('empty knowledge tree'); console.log('ok')"
```

### 9.6 语法验证

```bash
node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js
node -c /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js
node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js
node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js
node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js
node -c /Users/seanxx/score-boost-mini/cloudfunctions/checkQueueStatus/index.js
```

### 9.7 云端只读验证

部署后只读验证：

```bash
tcb db nosql execute --json --command '[{"TableName":"ai_question_pool","CommandType":"COMMAND","Command":"{\"count\":\"ai_question_pool\",\"query\":{\"grade\":\"2\",\"subject\":\"math\"}}"}]'
```

端到端验收：

1. 二年级数学存在题时，深度测评不再返回“当前题库中暂无可用题目”。
2. 构造一个题池不足 5 的组合时，`startExtendedAssessment` 返回 queued。
3. `question_queue` 中存在 `type:'extended_assessment'`、`source:'extendedAssessment'`、`grade` 为字符串、`subject` 为英文。
4. `checkQueueStatus` 从 pending/processing 到 completed。
5. completed 后重新 start 返回 `session_id` 和 5 道题，或返回 `INSUFFICIENT_QUESTIONS_AFTER_GENERATION` 并停止排队。
6. extended queue completed 时 `question_queue.question_ids` 存在，且没有创建/更新普通 `assessments`。
7. extended queue AI 失败且同年级同科目题池不足时，queue failed，不保存默认高年级题。
8. fallback ready 后提交 5 题可正常判分，证明 session 服务端题目保留 `correct_answer`。
9. `getNextQuestion` 返回客户端不含 `correct_answer`，但 DB 中 `phase2.questions` 含完整题目；随后提交该题可正常判分。
10. 未答 phase2 题存在时，重复调用 `getNextQuestion` 返回同一题，不追加新题；提交该题后才允许下一题。
11. extended queue 生成/保存不足 `task.num_questions` 时为 failed，不得 completed。

## 10. 依赖与爆炸半径

| 改动点 | 上游依赖 | 下游影响 | 必须确认的字段契约 |
|---|---|---|---|
| `extendedAssessment` fallback | `ai_question_pool` 数据形态 | `startExtendedAssessment`、`getNextQuestion` | `grade:String(grade)`；subject canonical + aliases；`verified:true/false/exists(false)` |
| `extendedAssessment` queue | `question_queue`、`questionGenerator`、`extendedAssessment/data` 知识点副本 | 前端 queued；后台生成 | `type:'extended_assessment'`；`source:'extendedAssessment'`；`grade` 字符串；`subject` 英文；`semester:'up'|'down'`；非空同年级 `question_plan/target_kps` |
| `questionGenerator` extended 分支 | `question_queue` task type、`CompleteStep`、`processTask`、生成失败 fallback、最终可用题数校验 | 只保存题，不创建 assessment | 跳过 `CreateAssessmentStep`；`GenerateStep(generateAi)`；`CompleteStep({dependencies:[]})`；completed 写最终可用 `question_ids`；不更新 `assessments`；不要求 `assessment_id`；AI 失败不得生成默认高年级题；最终可用题数不足则 failed |
| `checkQueueStatus` | `question_queue` 文档 | 前端轮询 | 状态位于 `result.result.data.status` |
| session 存储与脱敏 | `extended_sessions`、答题提交判分、phase2 outstanding question 状态、submitAnswers 判分映射 | `submitPhase1Answers`、`getNextQuestion`、`submitAnswers`、客户端题目展示 | session 服务端题目保留 `correct_answer`/IRT/KP；仅客户端响应脱敏；未答 phase2 题存在时 `getNextQuestion` 幂等返回同一题；`submitAnswers` 按 `question_id` 读取服务端题目属性 |
| `assessment-depth` queued 状态 | `extendedAssessment`、`checkQueueStatus` | WXML/WXSS、页面生命周期 | queued 不覆盖现有 completed/phase 状态；`queuePollTimer/queueRetryTimer` 幂等清理；错误写入 `errorMessage` |
| 测试 | mock DB 和 Page harness | 旧断言更新 | 空池从 error 改 queued；少于 5 题改 queued；after queue 仍不足改明确错误 |

依赖扫描建议：

```bash
cd /Users/seanxx/score-boost-mini && rg -n "startExtendedAssessment|getNextQuestion|submitPhase1Answers|submitAnswers|completeAssessment|extendedAssessment" . --glob '!node_modules/**' --glob '!*.log' --glob '!docs/**'
cd /Users/seanxx/score-boost-mini && rg -n "phase2\\.questions|phase2\\.answers|getNextQuestion|submitAnswers|PHASE2_QUESTIONS_NOT_READY|sanitizeQuestionForClient|sanitizeQuestionForStorage" cloudfunctions/extendedAssessment __tests__ pages/assessment-depth --glob '!node_modules/**' --glob '!*.log'
cd /Users/seanxx/score-boost-mini && rg -n "assessment-depth|goToExtendedAssessment|继续测评|提升精度" pages miniprogram --glob '!node_modules/**' --glob '!*.log'
cd /Users/seanxx/score-boost-mini && rg -n "checkQueueStatus|pollQueueStatus|QueueApi|assessment_id|generated_assessment_id|question_ids" cloudfunctions pages miniprogram utils --glob '!node_modules/**' --glob '!*.log'
cd /Users/seanxx/score-boost-mini && rg -n "CreateAssessmentStep|CompleteStep|SaveQuestionsStep|getSteps|processTask|parent_assessment|child_assessment|extended_assessment|STEP_OUTPUT_KEYS\\.ASSESSMENT_ID|generated_assessment_id" cloudfunctions/questionGenerator --glob '!node_modules/**' --glob '!*.log'
cd /Users/seanxx/score-boost-mini && rg -n "generateQuestionsForTask|fetchFallbackQuestions|generateDefaultQuestions|AI generation failed|supplementing from pool|Pool empty|DEFAULT questions" cloudfunctions/questionGenerator --glob '!node_modules/**' --glob '!*.log'
cd /Users/seanxx/score-boost-mini && rg -n "question_plan|target_kps|loadKnowledgeTree|loadHuikaoTree|semester|difficulty_distribution|num_questions" cloudfunctions/startAssessment cloudfunctions/questionGenerator cloudfunctions/extendedAssessment --glob '!node_modules/**' --glob '!*.log'
cd /Users/seanxx/score-boost-mini && rg -n "ai_question_pool|verified|correct_answer|kp_id|knowledge_point_id|grade: String|grade:String|subject" cloudfunctions/extendedAssessment cloudfunctions/questionGenerator cloudfunctions/checkQueueStatus --glob '!node_modules/**' --glob '!*.log'
cd /Users/seanxx/score-boost-mini && rg -n "question_queue|status: 'pending'|status: 'processing'|status: 'completed'|retry_count|expires_at|timeline" cloudfunctions pages miniprogram utils --glob '!node_modules/**' --glob '!*.log'
```

## 11. 部署与回滚

### 11.1 需要部署/上传

- 云函数：`extendedAssessment`（必须包含随函数打包的 `extendedAssessment/data` 知识点副本；如采用不同目录，必须同步修改 `buildExtendedQuestionPlan` 路径与验证命令）
- 云函数：`questionGenerator`（如新增 `extended_assessment` workflow 分支）
- 前端页面：`pages/assessment-depth/*`
- 如未修改 `checkQueueStatus` 协议，则无需部署 `checkQueueStatus`

### 11.2 回滚策略

- 回滚 `extendedAssessment` 到上一版本会恢复旧行为：题池无 `verified:true` 时仍报无题。
- 回滚 `questionGenerator` 时，`extended_assessment` 队列会回到默认 workflow，可能创建普通 assessment；回滚前必须先检查并处理 active extended queues（等待完成，或显式标记 `cancelled/failed`），再回滚生成器或暂停前端入口。
- 回滚前端时，queued 响应会被旧页面误当 ready；因此如回滚前端，必须同时回滚 `extendedAssessment` 的 queued 返回逻辑。

## 12. 目标遵从性审查报告

### 核心目标回顾

| 目标 | 定义 |
|---|---|
| G1 | 有可用题时深度测评可启动 |
| G2 | 题池不足时进入生成队列等待 |
| G3 | 不扩大错题风险 |
| G4 | 不破坏普通测评 |

### 功能-目标映射

| 功能 | 服务目标 | 方案层面决策 |
|---|---|---|
| `fetchQuestionsWithFallback` 累积补足 | G1/G3 | ✅ 保留，目标必需 |
| subject alias 仅用于题池查询 | G1/G4 | ✅ 保留，且不扩大 API 协议 |
| `grade:String(grade)` 契约 | G1/G3 | ✅ 保留，防止生成后查不到 |
| 不跨年级兜底 | G3 | ✅ 保留，质量边界必需 |
| 队列创建与复用 | G2 | ✅ 保留，A+C 一次实现必需 |
| `after_queue_id` 终止策略 | G2/G4 | ✅ 保留，防止无限排队 |
| 前端 queued 状态和轮询 | G2 | ✅ 保留，闭环必需 |
| `extended_assessment` generator 分支 | G2/G4 | ✅ 保留，避免普通 assessment 副作用 |
| 全量标记 `verified:true` | 无/G3 冲突 | ❌ 删除，风险过高 |
| 全量题库审核后台 | 非本轮目标 | ❌ 删除，后续治理 |

### 与其他审查的冲突处理

| 其他审查建议 | 与目标冲突? | 最终决策 |
|---|---|---|
| 为最小变更只做 A，不做 C | 是，用户明确 A+C 一次实现 | ❌ 不采纳 |
| 直接批量修数据 | 是，违反 G3 | ❌ 不采纳 |
| 允许跨年级兜底提高命中率 | 是，违反 G3 | ❌ 不采纳 |
| 让 `questionGenerator` 直接创建 `extended_sessions` | 否，但改动更大 | 不采用；生成器只负责入池，前端重新 start |
| 接受普通 assessment 副作用 | 否，但污染数据 | 不采用；新增 extended 分支跳过 `CreateAssessmentStep` |

### 结论

- 方案层面：通过。
- 冲突处理：已完成。

## 13. 自检

- Placeholder scan：未发现未决标记。
- 内部一致性：fallback 累积补足、队列一次重试、前端 queued 轮询、`queueRetryTimer` 清理、session 服务端保留答案、生成器 extended 分支形成闭环。
- 范围检查：单一实现范围，聚焦深度测评启动和队列闭环；不做题库治理。
- 歧义检查：队列完成后策略明确为 `after_queue_id` 重新 start，仍不足则明确错误，不再排队。
- 依赖边界：涉及 `extendedAssessment`、`assessment-depth`、`questionGenerator`、`question_queue`、`checkQueueStatus`、`extended_sessions` 服务端判分数据、`extendedAssessment/data` 数据副本；不删除现有模块，不重构普通测评。
