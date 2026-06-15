# AI 出题修复落盘方案

## 0. 三原则审视

1. **2/8**：本次先做能解决 80% 线上风险的 20% 核心工作：冻结 `question_queue` 字段契约、修会考/练习/亲子三条入队链路、修 worker 使用任务上下文、修完成态写回、修主 prompt 的学段/学科约束。暂不做题库治理后台、完整学习推荐系统、LLM provider 切换、大规模 workflow 重写。
2. **第一性原理**：根本问题不是“某一句 prompt 写得不够漂亮”，而是入口、队列、worker、prompt、保存、完成态之间的字段契约断裂。AI 生成器必须明确知道：谁在做题、几年级、什么科目、什么模式、哪些知识点、什么难度语义、是否有学生画像。
3. **收益递减**：本方案做到 P0 链路闭环、回归测试、云端验收即可停止。更完整的题库质量运营、历史脏数据清洗、全量 shared 文件去重，作为后续任务，不混入本次修复。

---

## 1. 背景与症状矩阵

| 编号 | 症状 / 用户表现 | 根因 | 影响入口 | 涉及代码 | 优先级 |
|---|---|---|---|---|---|
| B1 | 会考模式题库不足进入 AI 队列后，退化为普通年级出题 | `startAssessment` 生成了会考 plan，但入队时没有携带 `question_plan/target_kps`；worker 重新按普通 `grade/semester` 加载知识树 | 会考 `mode=huikao` | `cloudfunctions/startAssessment/index.js:184`、`cloudfunctions/startAssessment/index.js:426`、`cloudfunctions/questionGenerator/index.js:459` | P0 |
| B2 | 练习模式不是按学生画像和目标知识点生成，只是普通测评题 | 前端/调用方可能传 `student_profile`、`knowledge_point_id/kp_name`，但 `startAssessment` 创建队列时没透传；主 worker prompt 不使用画像 | 练习 `mode=practice` | `cloudfunctions/startAssessment/index.js:426`、`cloudfunctions/questionGenerator/index.js:486` | P0 |
| B3 | 亲子互动 5 题难度分布错乱，可能生成数量异常 | `parentAssessment` 把 `difficulty_distribution` 写成题数 `{easy:3, medium:2}`；worker 把它当比例乘 `num_questions` | `parent_assessment`、`child_assessment` | `cloudfunctions/parentAssessment/index.js:176`、`cloudfunctions/parentAssessment/index.js:276`、`cloudfunctions/questionGenerator/workflow/utils/generateQuestions.js:727` | P0 |
| B4 | 孩子题队列可能完成但拿不到题，最后超时回退 | `child_assessment` 走轻量 workflow，但 `CompleteStep` 只给 `parent_assessment` 写 `question_ids`；孩子题轮询依赖 `question_ids` | `child_assessment` | `cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js:134`、`cloudfunctions/parentAssessment/index.js:206` | P0 |
| B5 | 小学题仍可能被 hard/默认题污染出初中内容；非数学科目 prompt 带数学符号要求 | `getDifficultyGuidance(difficulty, grade)` 不使用 `grade`，不接收 `subject`；主 prompt 无条件写数学符号规则；fallback 默认高年级题 | 全部 AI 队列 | `cloudfunctions/questionGenerator/shared/difficulty-guidance.js:6`、`cloudfunctions/questionGenerator/index.js:499`、`cloudfunctions/questionGenerator/workflow/utils/generateQuestions.js:81` | P1 |
| B6 | legacy / 直接 `generateAiQuestion` 路径丢 `subject/grade`，容易默认数学或无学段 | 入口解构了 `subject/grade`，但调用 `generateQuestion` / batch 时没传；`generateSingleQuestion` 也漏传 `grade` | legacy 降级、`generateQuestions`、旧工具路径 | `cloudfunctions/generateAiQuestion/index.js:744`、`cloudfunctions/generateAiQuestion/index.js:764`、`cloudfunctions/generateAiQuestion/index.js:834`、`cloudfunctions/questionGenerator/index.js:645` | P1 |

---

## 2. 当前数据流图

### 2.1 默认测评 / 练习 / 会考主路径

```text
小程序 / utils/cloudApi.startAssessment / startPractice
  |
  v
cloudfunctions/startAssessment/index.js
  - mode: quick / retest / huikao / practice / pre_test
  - 会考：loadHuikaoTree + generateHuikaoPlan
  - 普通：loadKnowledgeTree + generateQuestionPlan
  - 先查 ai_question_pool
  |
  | 题库足够
  v
直接创建 assessments，返回 ready

  |
  | 题库不足
  v
cloudfunctions/startAssessment/queue_manager.js:createQueueTask
  - 当前只写 student_id/subject/grade/semester/mode/num_questions/difficulty_distribution
  - 当前未写 question_plan/target_kps/student_profile
  |
  v
question_queue
  |
  v
cloudfunctions/questionGenerator/index.js:processTask
  |
  v
GenerateStep -> generateQuestionsForTask
  |
  v
questionGenerator/index.js:generateAi
  - 直接 fetch DeepSeek /chat/completions
  - 当前从 task.grade/subject/semester 重新加载知识树
  - 当前不使用 startAssessment 的 plan 快照
  |
  v
SaveQuestionsStep -> ai_question_pool
  |
  v
CreateAssessmentStep -> assessments
  |
  v
CompleteStep -> question_queue.generated_assessment_id
```

### 2.2 亲子互动家长题

```text
pages/parent-assessment -> parentAssessment(action=start)
  |
  v
cloudfunctions/parentAssessment/index.js:startParentAssessment
  - 创建 parent_assessments 记录
  - 创建 question_queue type='parent_assessment'
  - 当前 difficulty_distribution={easy:3, medium:2}
  |
  v
questionGenerator getSteps(type=parent_assessment)
  - InitStateStep
  - GenerateStep
  - SaveQuestionsStep
  - CompleteStep，不走 CreateAssessmentStep
  |
  v
CompleteStep 当前写 question_ids
  |
  v
checkQueueStatus 读取 question_ids 并更新 parent_assessments.parent_questions
```

### 2.3 亲子互动孩子题

```text
parentAssessment(action=submitParentAnswers)
  |
  v
generateChildQuestionsViaQueue
  - 创建 question_queue type='child_assessment'
  - 当前 difficulty_distribution={easy:ceil(count*0.6), medium:floor(count*0.4)}
  |
  v
questionGenerator getSteps(type=child_assessment)
  - InitStateStep
  - GenerateStep
  - SaveQuestionsStep
  - CompleteStep，不走 CreateAssessmentStep
  |
  v
CompleteStep 当前没有给 child_assessment 写 question_ids
  |
  v
generateChildQuestionsViaQueue 轮询 task.status==='completed' && task.question_ids
  |
  v
大概率等不到 question_ids，超时后回退题库，再不足走 legacy generateAiQuestion batch
```

### 2.4 legacy / 直接生成路径

```text
generateQuestions / parentAssessment legacy / questionGenerator.generateSingleQuestion
  |
  v
cloud.callFunction({ name: 'generateAiQuestion' })
  |
  v
generateAiQuestion/index.js
  - buildSystemPrompt
  - buildGenericPrompt 或 buildPersonalizedPrompt
  - createLLMClient().complete
  |
  v
ai_question_pool
```

这条路径不是主队列路径，但 fallback 和旧工具仍会触发，必须修 `subject/grade` 丢失。

---

## 3. QueueTaskContract

### 3.1 设计目标

`question_queue` 是出题系统的任务契约。所有入口必须写同一套字段，worker 必须只依赖这套字段，不允许用静默默认掩盖上游缺字段。

### 3.2 字段表

| 字段 | 类型 | 必填 | 写入方 | 读取方 | 说明 |
|---|---|---:|---|---|---|
| `_id` | string | 否 | 创建方 / DB | 所有 | 任务 ID |
| `type` | string | 否 | `parentAssessment` 等 | `questionGenerator.getSteps`、`CompleteStep` | `parent_assessment`、`child_assessment`。默认测评可为空，但建议写 `assessment` |
| `mode` | string | 是 | `startAssessment` | worker、prompt | `quick`、`retest`、`huikao`、`practice`、`pre_test` |
| `subject` | string | 是 | 所有入口 | worker、prompt、保存 | 不允许静默默认为 `math/biology` |
| `grade` | string | 是 | 所有入口 | worker、prompt、保存 | 会考可写发起年级，同时写 `grade_range` |
| `grade_range` | string[] | 会考必填 | `startAssessment` | worker、prompt | 如 `['7','8']` |
| `semester` | string | 普通必填 | `startAssessment` | 知识树加载 | `up/down/上/下`。会考可为 `all` |
| `num_questions` | number | 是 | 所有入口 | `generateQuestionsForTask` | 目标题数 |
| `difficulty_distribution` | object | 是 | 所有入口 | `normalizeDifficultyDistribution` | **比例语义**，如 `{easy:0.6, medium:0.4, hard:0}` |
| `difficulty_counts` | object | 否 | 兼容旧任务 | 归一化函数 | 如果需要题数语义，必须用此字段名，不再混用 distribution |
| `question_plan` | array | 推荐必填 | `startAssessment` | worker、prompt | startAssessment 生成的计划快照。会考和练习必须写 |
| `target_kps` | array | 推荐必填 | 所有入口 | worker、prompt | prompt 使用的知识点摘要，来源于 `question_plan` |
| `knowledge_point_id` | string | 练习必填 | 练习入口 | worker、prompt | 练习目标知识点 |
| `kp_name` | string | 练习必填 | 练习入口 | worker、prompt | 练习目标知识点名 |
| `student_profile` | object | 练习可选 | 练习入口 | prompt | 不打印完整内容到日志 |
| `weak_points` | array | 练习可选 | 练习入口 | prompt | 学生弱点摘要 |
| `assessment_id` | string | 亲子必填 | `parentAssessment` | `CompleteStep`、`checkQueueStatus` | 关联 parent assessment |
| `openid` | string | 亲子必填 | `parentAssessment` | 回写 | 用户标识 |
| `student_id` | string | 是 | 所有入口 | 队列查重 / assessment | 学生标识 |
| `question_ids` | string[] | 完成态 | `CompleteStep` | 亲子/孩子题读取 | parent/child 轻量 workflow 必须写 |
| `generated_assessment_id` | string | 默认完成态 | `CompleteStep` | `checkQueueStatus` | 默认测评/练习完成后写 |
| `source_task_id` | string | 保存题时必填 | `SaveQuestionsStep` | 诊断 | 题目追踪来源 |

### 3.3 禁止静默默认规则

P0 主链路中禁止：

```js
subject || 'math'
subject || 'biology'
grade || '8'
semester || '下'
```

允许的兼容策略：

1. 对历史旧任务可以进入 `normalizeQueueTask(task)`，记录 `compat_warning`。
2. 新建任务缺 `subject/grade/num_questions` 必须 fail-fast。
3. `semester` 只允许普通模式默认，且要在日志里写 `semester_defaulted=true`。

---

## 4. P0 实施顺序

### P0-1：冻结 QueueTaskContract 与难度语义

**目标**：统一字段和难度语义，避免后续继续各写各的。

**修改点**：

- 新增轻量工具：`cloudfunctions/questionGenerator/workflow/utils/queueTaskContract.js`
- 或放入现有 `generateQuestions.js` 附近，保持小改。

**函数建议**：

```js
function normalizeDifficultyDistribution(task) {
  const dist = task.difficulty_distribution || {};
  const counts = task.difficulty_counts;

  if (counts) {
    return normalizeCountsToDistribution(counts, task.num_questions);
  }

  const sum = (dist.easy || 0) + (dist.medium || 0) + (dist.hard || 0);
  if (sum > 1.5) {
    // 兼容旧任务：把旧的 distribution counts 当题数归一化
    return normalizeCountsToDistribution(dist, task.num_questions, { compat: true });
  }

  return {
    easy: typeof dist.easy === 'number' ? dist.easy : 0.5,
    medium: typeof dist.medium === 'number' ? dist.medium : 0.3,
    hard: typeof dist.hard === 'number' ? dist.hard : 0.2
  };
}
```

**验收**：

| 验收项 | 命令 / 检查 | 预期 |
|---|---|---|
| 亲子旧分布兼容 | 单测 `normalizeDifficultyDistribution({num_questions:5,difficulty_distribution:{easy:3,medium:2}})` | easy 3 题，medium 2 题，hard 0 题 |
| 比例分布正常 | 单测 `{easy:0.6,medium:0.4,hard:0}` | 5 题为 3/2/0 |
| 缺字段 fail-fast | 单测新任务缺 `subject` | 返回明确错误，不默认数学 |

---

### P0-2：会考入队继承会考计划

**问题**：`startAssessment` 在 `mode=huikao` 时生成 `generateHuikaoPlan`，但入队只写 `mode/subject/grade/semester/num_questions/difficulty_distribution`。worker 重新按普通知识树处理。

**修改文件**：

- `cloudfunctions/startAssessment/index.js:184`
- `cloudfunctions/startAssessment/index.js:426`
- `cloudfunctions/questionGenerator/index.js:459`

**方案**：

`startAssessment` 创建队列时写入计划快照：

```js
const questionPlanSnapshot = plan.map(item => ({
  kp_id: item.kp?.kp_id,
  kp_name: item.kp?.kp_name,
  chapter_id: item.kp?.chapter_id,
  chapter_name: item.kp?.chapter_name,
  grade: item.kp?.grade || grade,
  semester: item.kp?.semester || semester,
  difficulty: item.difficulty
}));

await createQueueTask(db, {
  student_id: studentId,
  subject,
  grade,
  grade_range: mode === 'huikao' ? tree.grade_range : undefined,
  semester: mode === 'huikao' ? 'all' : semester,
  mode,
  num_questions: finalNumQuestions,
  difficulty_distribution: difficultyDistribution,
  question_plan: questionPlanSnapshot,
  target_kps: questionPlanSnapshot.map(p => ({
    kp_id: p.kp_id,
    kp_name: p.kp_name,
    chapter_name: p.chapter_name,
    grade: p.grade,
    semester: p.semester
  }))
});
```

**worker 使用规则**：

1. 如果 `task.question_plan` 非空，优先使用计划中的知识点。
2. 如果 `task.mode === 'huikao'` 且无 `question_plan`，fallback 到 `loadHuikaoTree(subject)`，并记录兼容警告。
3. 禁止 `mode=huikao` 只用 `loadKnowledgeTree(subject, grade, semester)`。

**验收**：

| 验收项 | 命令 / 检查 | 预期 |
|---|---|---|
| 队列字段 | 创建 `mode=huikao` 队列后查 `question_queue` | `mode=huikao`、`grade_range`、`semester=all`、`question_plan.length>0` |
| prompt 快照 | spy `generateAi` prompt | 包含“会考范围 / 七八年级 / target_kps” |
| 结果保存 | 查 `ai_question_pool` | 生成题带 `subject/grade/difficulty/kp_name/source_task_id` |

---

### P0-3：练习模式透传画像和目标知识点

**问题**：练习入口传了画像和目标知识点，但队列任务没带下去，worker prompt 变成泛化测评题。

**修改文件**：

- `utils/cloudApi.js` 或实际练习入口调用处
- `cloudfunctions/startAssessment/index.js:426`
- `cloudfunctions/questionGenerator/index.js:486`

**方案**：

`startAssessment` 解构练习字段：

```js
const {
  knowledge_point_id,
  kp_id,
  kp_name,
  student_profile,
  weak_points,
  practice_context
} = params;
```

创建队列时透传：

```js
const practicePayload = mode === 'practice' ? {
  knowledge_point_id: knowledge_point_id || kp_id,
  kp_name,
  student_profile,
  weak_points,
  practice_context
} : {};

await createQueueTask(db, {
  student_id: studentId,
  subject,
  grade,
  semester,
  mode,
  num_questions: finalNumQuestions,
  difficulty_distribution: difficultyDistribution,
  question_plan: questionPlanSnapshot,
  target_kps: buildTargetKps(questionPlanSnapshot, { knowledge_point_id, kp_name }),
  ...practicePayload
});
```

prompt 规则：

- `mode=practice` 时，`targetKps` 优先来自 `task.knowledge_point_id/kp_name` 和 `task.question_plan`。
- `student_profile` 只做摘要，不直接整对象塞 prompt。
- 日志只写：`student_profile_present=true`、`weak_points_count=N`。

**学生画像摘要示例**：

```text
学生画像摘要：
- 当前练习知识点：乘法口诀
- 易错类型：计算粗心 2 次，概念混淆 1 次
- 当前建议难度：medium
要求：围绕目标知识点生成，不要扩展到其他章节。
```

**验收**：

| 验收项 | 命令 / 检查 | 预期 |
|---|---|---|
| 入队字段 | 练习题库不足后查 queue | 有 `mode=practice`、`knowledge_point_id/kp_name`、`student_profile` |
| prompt 快照 | 单测生成 prompt | 包含目标知识点和画像摘要 |
| 隐私 | 搜日志 | 没有完整 `student_profile` JSON |

---

### P0-4：亲子难度分布统一

**问题**：亲子写题数，worker 当比例。

**修改文件**：

- `cloudfunctions/parentAssessment/index.js:176`
- `cloudfunctions/parentAssessment/index.js:276`
- `cloudfunctions/questionGenerator/workflow/utils/generateQuestions.js:727`

**推荐改法**：新任务统一比例。

家长题：

```js
num_questions: 5,
difficulty_distribution: {
  easy: 0.6,
  medium: 0.4,
  hard: 0
}
```

孩子题：

```js
num_questions: count,
difficulty_distribution: {
  easy: 0.6,
  medium: 0.4,
  hard: 0
}
```

worker 保留旧任务兼容：如果 `sum > 1.5`，当 counts 归一化。

**验收**：

| 验收项 | 输入 | 预期 |
|---|---|---|
| 家长 5 题 | `{easy:0.6,medium:0.4,hard:0}` | 3 简单、2 中等、0 困难 |
| 旧任务兼容 | `{easy:3,medium:2}` | 3 简单、2 中等、0 困难，并记录 compat warning |
| 孩子 N 题 | N=5/10/11 | 不出现负数 hard，不出现二次放大 |

---

### P0-5：child_assessment 完成态写回

**问题**：child 轻量 workflow 不创建普通 assessment，但 `CompleteStep` 只给 `parent_assessment` 写 `question_ids`。

**修改文件**：

- `cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js:134`
- `cloudfunctions/parentAssessment/index.js:206`

**改法**：

```js
if (task.type === 'parent_assessment' || task.type === 'child_assessment') {
  updateFields.question_ids = questionIds;
  if (task.assessment_id) {
    updateFields.assessment_id = task.assessment_id;
  }
} else {
  updateFields.generated_assessment_id = assessmentId;
}
```

如果 child 任务有 `assessment_id`，可以同步写回 `parent_assessments.child_questions`，或明确由 `generateChildQuestionsViaQueue` 读取后再写。推荐先保持最小改动：**queue 写 `question_ids`，原有调用方读取后继续现有写回逻辑**。

**验收**：

| 验收项 | 命令 / 检查 | 预期 |
|---|---|---|
| child 完成态 | 模拟 `child_assessment` workflow | `question_queue.question_ids.length === num_questions` |
| child 轮询 | `generateChildQuestionsViaQueue` | 不超时，能返回题目 |
| parent 不回归 | `parent_assessment` workflow | 仍写 `question_ids` |

---

### P0-6：worker 使用目标上下文生成 prompt

**问题**：`generateAi()` 当前从知识树提取 `finalKpList`，再取前 N 个 `targetKps`。它不尊重 `task.question_plan/target_kps/student_profile`。

**修改文件**：

- `cloudfunctions/questionGenerator/index.js:458`
- `cloudfunctions/questionGenerator/index.js:478`
- `cloudfunctions/questionGenerator/index.js:486`

**目标选择顺序**：

```text
1. task.target_kps
2. task.question_plan 按当前 difficulty 过滤后的 kp_name
3. mode=practice 的 task.kp_name / task.knowledge_point_id
4. mode=huikao fallback：loadHuikaoTree(subject)
5. 普通 fallback：loadKnowledgeTree(subject, grade, semester)
6. 最后 fallback：getDefaultKpList(subject, grade)，但必须带 gradeBand 限制
```

**prompt 片段建议**：

```text
出题模式：${modeText}
年级范围：${gradeScopeText}
科目：${subjectText}
目标知识点：${targetKpsText}
${practiceContextText}
${huikaoContextText}
```

**验收**：

| 模式 | prompt 必须包含 | prompt 不应包含 |
|---|---|---|
| huikao | 会考范围、七八年级、计划知识点 | 单一年级普通测评描述 |
| practice | 目标知识点、画像摘要 | 泛化知识树前 N 个知识点 |
| parent | 亲子测评、家长题 | child 专属描述 |
| child | 亲子测评、孩子题、与家长题同知识点/同范围 | 普通 assessment 创建描述 |

---

### P0-7：学段/学科难度指导

**问题**：`getDifficultyGuidance(difficulty, grade)` 不使用 `grade`，也不接收 `subject`。

**修改文件**：

- `cloudfunctions/questionGenerator/shared/difficulty-guidance.js`
- `cloudfunctions/generateAiQuestion/shared/difficulty-guidance.js`
- `cloudfunctions/shared/difficulty-guidance.js`
- `cloudfunctions/questionGenerator/index.js:484`
- `cloudfunctions/generateAiQuestion/index.js:317`
- `cloudfunctions/generateAiQuestion/prompt-templates.js:162`

**推荐接口**：

```js
function getDifficultyGuidance({ difficulty, grade, subject, mode }) {
  const gradeBand = getGradeBand(grade);
  const base = getBandGuidance(gradeBand, difficulty);
  const subjectRules = getSubjectRules(subject, gradeBand);
  const modeRules = getModeRules(mode);
  return [base, subjectRules, modeRules].filter(Boolean).join('\n\n');
}
```

**学段规则**：

| 学段 | 范围 | 规则 |
|---|---|---|
| primary | 1-6 | 生活化、短句、少抽象术语、一题一个核心点、计算量小、hard 也是本年级内提高 |
| junior | 7-9 | 可概念辨析、2-3 步推理、章节内综合、常见错误干扰项、hard 可有边界/逆向 |
| unknown | 缺失 | fail-fast 或保守使用 primary 低风险规则，不允许默认 8 年级 |

**学科规则**：

| 科目 | 规则 |
|---|---|
| math | 仅数学题写 Unicode 数学符号规则；按年级禁止超纲概念 |
| chinese | 题干材料短，避免成人化文学常识；小学侧重字词句，初中可阅读理解/文言基础 |
| english | 按年级控制词汇量和句长；小学不出现高阶从句；初中可语法辨析 |
| physics | 仅 8-9 年级；强调生活现象、单位、概念边界 |
| chemistry | 仅 9 年级；避免高中化学概念 |
| biology/geography/history/politics | 按初中会考/教材知识点，避免高中深度 |

**验收**：

| 用例 | 禁止出现 | 必须体现 |
|---|---|---|
| 二年级数学 hard | 二次根式、勾股定理、平方根、绝对值、一元二次 | 100 以内加减、乘法口诀、生活应用 |
| 语文 medium | √、π、a/b、LaTeX | 字词句/阅读表达规则 |
| 会考生物 hard | 高中遗传深度 | 七八年级会考范围 |

---

### P0-8：legacy `generateAiQuestion` 修复

**问题**：`generateAiQuestion` 入口解构 `subject/grade`，但没传进 `generateQuestion` / batch；多个调用方也漏传 `grade`。

**修改文件**：

- `cloudfunctions/generateAiQuestion/index.js:764`
- `cloudfunctions/generateAiQuestion/index.js:775`
- `cloudfunctions/generateAiQuestion/index.js:834`
- `cloudfunctions/questionGenerator/index.js:645`
- `cloudfunctions/parentAssessment/index.js:130`

**改法**：

batch tasks 保留 subject/grade：

```js
const tasks = questions.map((q, idx) => ({
  kp: {
    kp_id: q.kp_id || q.kp_name || `batch_${idx}`,
    kp_name: q.kp_name || '未知知识点',
    chapter: q.chapter || ''
  },
  difficulty: q.difficulty || difficulty,
  question_type: q.question_type || 'choice',
  subject: q.subject || subject,
  grade: q.grade || grade
}));

const results = await generateQuestionBatch(tasks, {
  skip_image: batchSkipImage,
  subject,
  grade
});
```

普通模式：

```js
const question = await generateQuestion(kp, difficulty, {
  question_type: questionType,
  knowledge_context: kc.knowledge_context,
  exclude_questions: existingQuestions,
  skip_image: skipImage,
  subject,
  grade
});
```

`questionGenerator.generateSingleQuestion`：

```js
data: {
  kp_name: kpName,
  difficulty,
  chapter: task.chapter || '',
  subject: task.subject,
  grade: task.grade,
  skip_image: true
}
```

`parentAssessment.generateQuestionsWithAI`：

```js
data: {
  questions: questions.map(q => ({ ...q, subject, grade: String(grade) })),
  subject,
  grade: String(grade),
  skip_image: true,
  batch_mode: true
}
```

**验收**：

| 验收项 | 预期 |
|---|---|
| 普通 generateAiQuestion | prompt 包含 subject 和 grade |
| batch_mode | 每个 task 有 subject/grade |
| parent legacy | 不默认数学，不丢年级 |
| 保存结果 | `ai_question_pool.subject/grade` 不为空 |

---

## 5. 回归测试矩阵

### 5.1 单元测试

| 测试文件建议 | 覆盖点 | 断言 |
|---|---|---|
| `cloudfunctions/questionGenerator/__tests__/difficulty-distribution.test.js` | 分布归一化 | counts / ratio / missing / invalid 均得到正确题数 |
| `cloudfunctions/questionGenerator/__tests__/queue-task-contract.test.js` | QueueTaskContract | 新任务缺 subject/grade fail-fast；旧任务兼容 warning |
| `cloudfunctions/questionGenerator/__tests__/prompt-context.test.js` | prompt 上下文 | huikao/practice/parent/child prompt 包含对应上下文 |
| `cloudfunctions/questionGenerator/__tests__/difficulty-guidance.test.js` | 学段/学科难度 | 小学数学不含初中关键词；语文不含数学符号要求 |
| `cloudfunctions/questionGenerator/__tests__/complete-step.test.js` | 完成态 | parent/child 写 `question_ids`，default 写 `generated_assessment_id` |
| `cloudfunctions/generateAiQuestion/__tests__/subject-grade.test.js` | legacy 参数 | 普通/batch 都传 subject/grade 到 prompt 和保存记录 |

### 5.2 集成测试

| 场景 | 步骤 | 预期 |
|---|---|---|
| 会考题池不足入队 | mock pool 空，调用 `startAssessment({mode:'huikao'})` | queue 有 `question_plan/target_kps/grade_range` |
| 练习题池不足入队 | 调 `startAssessment({mode:'practice', student_profile, kp_name})` | queue 有画像和目标知识点 |
| parent_assessment | 调 `parentAssessment.start` | difficulty 是比例，完成后有 `question_ids` |
| child_assessment | 调 `submitParentAnswers` 触发 child queue | child queue 完成后有 `question_ids`，不超时 |
| fallback | 模拟 LLM 失败 | fallback 按 grade/subject 取题，不默认 8 年级数学 |

### 5.3 prompt 快照 / eval

建立最小 prompt 快照，不需要真调 LLM：

| 输入 | 快照断言 |
|---|---|
| 二年级数学 hard | 包含“二年级”“数学”“100以内/乘法口诀”，不含“二次根式/勾股定理/平方根/绝对值” |
| 七八年级会考生物 | 包含“会考”“七八年级范围”“生物” |
| 练习模式乘法口诀 + 画像 | 包含“当前练习知识点：乘法口诀”“学生画像摘要” |
| 亲子家长题 | 包含“亲子测评：家长题” |
| 亲子孩子题 | 包含“亲子测评：孩子题” |
| 语文 medium | 不含数学符号格式规则 |

### 5.4 建议运行命令

```bash
npm test -- cloudfunctions/questionGenerator/__tests__/difficulty-distribution.test.js
npm test -- cloudfunctions/questionGenerator/__tests__/queue-task-contract.test.js
npm test -- cloudfunctions/questionGenerator/__tests__/prompt-context.test.js
npm test -- cloudfunctions/questionGenerator/__tests__/complete-step.test.js
npm test -- cloudfunctions/generateAiQuestion/__tests__/subject-grade.test.js
```

如果项目 Jest 配置不支持按路径运行，改用：

```bash
npm test -- --runInBand
```

---

## 6. 云端验收方案

### 6.1 部署顺序

按兼容风险从低到高部署：

1. `questionGenerator`：先部署 worker 的兼容归一化、prompt 上下文读取、child question_ids 写回。
2. `startAssessment`：再部署会考/练习入队字段继承。
3. `parentAssessment`：再部署亲子 difficulty_distribution 比例化和 legacy subject/grade。
4. `generateAiQuestion`：最后部署 legacy prompt subject/grade 修复。
5. `checkQueueStatus`：如需要补充 child/parent 状态读取，再部署。

命令：

```bash
tcb fn deploy questionGenerator --dir cloudfunctions/questionGenerator
tcb fn deploy startAssessment --dir cloudfunctions/startAssessment
tcb fn deploy parentAssessment --dir cloudfunctions/parentAssessment
tcb fn deploy generateAiQuestion --dir cloudfunctions/generateAiQuestion
tcb fn deploy checkQueueStatus --dir cloudfunctions/checkQueueStatus
```

### 6.2 部署后样本验收

| 样本 | 输入 | 检查 |
|---|---|---|
| 小学低年级数学 | grade=2, subject=math, mode=quick/practice | 不出现初中关键词；queue/pool grade=2 |
| 会考 | subject=biology 或 geography, mode=huikao | queue 有 `question_plan/grade_range`；prompt 覆盖七八年级 |
| 练习 | mode=practice + `student_profile` + `kp_name` | queue 有画像摘要字段；日志 `student_profile_present=true` |
| parent_assessment | grade=2, subject=math | 5 题分布 3/2/0；queue 有 question_ids |
| child_assessment | 提交家长答案后触发 | child queue completed 且有 question_ids；接口返回孩子题 |
| legacy | 直接调用 `generateAiQuestion` | subject/grade 进入 prompt，保存结果有 subject/grade |

### 6.3 诊断日志要求

允许记录：

```text
task._id
task.type
task.mode
subject
grade
grade_range
semester
difficulty normalized result
target_kps count
question_plan count
student_profile_present
weak_points_count
question_ids count
generated_assessment_id
compat_warning
```

禁止记录：

```text
完整 student_profile JSON
完整错题内容
学生姓名/手机号等敏感信息
LLM API key
完整 Authorization header
```

---

## 7. 回滚方案

### 7.1 代码回滚

优先按云函数单独回滚，不一次性全回：

```bash
# 例：只回滚 questionGenerator 到上一版部署包或上一提交
tcb fn deploy questionGenerator --dir cloudfunctions/questionGenerator
```

如果没有版本化部署包，使用代码仓库回退后重新部署对应云函数。

### 7.2 数据兼容回滚

新增字段是向后兼容字段：

- `question_plan`
- `target_kps`
- `grade_range`
- `difficulty_counts`
- `source_task_id`

旧代码忽略这些字段，不影响读取。

高风险字段是 `difficulty_distribution` 语义变化。为降低回滚风险：

1. worker 保留 `sum > 1.5` 的旧 counts 兼容至少一个发布周期。
2. 部署前清理或标记超过 2 小时的 pending/processing 旧任务。
3. 日志记录 `difficulty_compat_mode=true`，便于观察是否还有旧任务。

### 7.3 回滚判断

出现以下任一情况，回滚对应云函数：

- `questionGenerator` error rate 明显上升。
- 大量 queue 进入 `failed`。
- `CompleteStep` 不再写 `generated_assessment_id` 导致普通测评不可用。
- prompt 快照通过但线上生成大量空题/格式错误。

---

## 8. NOT in scope

本次不做：

1. 历史题库脏数据全量清洗。
2. 题库审核后台。
3. 完整学习推荐系统重构。
4. LLM provider 切换。
5. 大规模 workflow 引擎重写。
6. 前端 UI 改版。
7. 全量 shared 复制文件去重。
8. 完整 RAG 架构升级。

除非 P0 验收被这些阻塞，否则不纳入本次实现。

---

## 9. 实施任务清单

| 顺序 | 任务 | 修改文件 | 验收 |
|---:|---|---|---|
| 1 | 新增难度分布归一化和 QueueTaskContract 校验 | `questionGenerator/workflow/utils/*` | 单测覆盖 ratio/counts/缺字段 |
| 2 | `startAssessment` 入队写 `question_plan/target_kps` | `cloudfunctions/startAssessment/index.js` | 会考 queue 有计划快照 |
| 3 | `startAssessment` 练习入队透传画像和目标知识点 | `cloudfunctions/startAssessment/index.js` | practice queue 有 `student_profile/kp_name` |
| 4 | `parentAssessment` 改 difficulty_distribution 为比例 | `cloudfunctions/parentAssessment/index.js` | 5 题分布 3/2/0 |
| 5 | `CompleteStep` 支持 child 写 `question_ids` | `cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js` | child queue completed 后有 question_ids |
| 6 | `generateAi` 优先使用 task 上下文构建 targetKps/prompt | `cloudfunctions/questionGenerator/index.js` | prompt 快照覆盖 huikao/practice/parent/child |
| 7 | 重写 `getDifficultyGuidance` 为学段/学科版本 | `questionGenerator/shared/difficulty-guidance.js` 等 | 小学/语文/会考断言通过 |
| 8 | 修 `generateAiQuestion` subject/grade 透传 | `cloudfunctions/generateAiQuestion/index.js` | legacy 单测通过 |
| 9 | 修 `generateSingleQuestion` 和 parent legacy 调用 | `questionGenerator/index.js`、`parentAssessment/index.js` | grep/单测证明都传 grade |
| 10 | 增加日志和线上验收脚本 | 对应云函数 | 云端样本可追踪字段流 |

---

## 10. 最小完成定义

本方案实施完成的最低标准：

1. 会考队列任务保留会考计划，worker 不再退化成普通年级知识树。
2. 练习队列任务保留目标知识点和画像摘要，prompt 能看到练习上下文。
3. 亲子 5 题难度分布稳定为 3 简单、2 中等、0 困难。
4. `child_assessment` 完成后 `question_queue.question_ids` 存在。
5. 小学数学 prompt 和生成结果不出现初中关键词。
6. 非数学科目 prompt 不再无条件注入数学符号规则。
7. legacy `generateAiQuestion` 普通和 batch 都不丢 `subject/grade`。
8. 本地相关 Jest 通过，云端至少 5 类样本验收通过。

---

## 11. 后续建议

P0 修完后，再单独排三个后续任务：

1. **题库数据治理**：清理历史低年级混入高年级题、补 `grade/subject/kp_id` 缺失字段。
2. **prompt 模板收敛**：减少 `cloudfunctions/*/shared/question-generator.js` 复制文件，把出题 prompt 收敛到单一模块。
3. **题目质量 eval**：建立 20-50 个固定样本，对每次 prompt 改动做自动评估。
