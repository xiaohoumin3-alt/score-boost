# 集成验证与问题清单（第二次验证）

> 生成日期: 2026-06-08
> 上次验证: 2026-06-07
> 方法: 基于源代码的静态分析 + 业务-数据交叉验证 + 前次问题逐项复验

---

## 1. 验证方法

| 维度 | 方法 | 覆盖范围 |
|------|------|---------|
| 前次问题复验 | 逐项检查代码变更 | 15个已知问题 |
| 业务流程完整性 | 逐云函数追踪调用链 | 96个云函数目录 |
| 数据模型一致性 | 跨函数字段映射对比 | 23个集合 |
| 新增功能审查 | 新增云函数/集合分析 | 家长测评、专属考试、材料上传等 |
| 安全审查 | API密钥/凭据扫描 | 全部云函数 |

---

## 2. 前次问题复验结果

### 2.1 修复状态总览

| # | 问题 | 前次等级 | 当前状态 | 变更摘要 |
|---|------|---------|---------|---------|
| P0-01 | 题目数据模型不一致 | 🔴 P0 | 🟡 **部分修复** | 已创建 `question-normalizer.js` + `schema-version.js`，但3处仍用内联转换 |
| P0-02 | 两套API层并存 | 🔴 P0 | ✅ **已修复** | `api.js` + `cloudApi.js` 均已删除，前端改为直接 `callFunction` |
| P0-03 | scheduledTaskGenerator安全隐患 | 🔴 P0 | 🟡 **部分修复** | 密钥→环境变量、全年级知识点、写 `ai_question_pool`，但输出格式未归一化 |
| P1-01 | 关键代码重复 | 🟠 P1 | 🟡 **仍存在（设计约束）** | 15-16份拷贝；微信云函数部署机制要求每函数自包含 |
| P1-02 | 5条独立题目生成路径 | 🟠 P1 | 🟡 **仍存在** | 路径仍在，但 `shared/question-normalizer.js` 已被主要路径采用 |
| P1-03 | Practice v1/v2并存 | 🟠 P1 | 🟡 **部分修复** | v1 标记 @deprecated 并重定向到 v2，但目录仍存在 |
| P1-04 | Assessment双重存储 | 🟠 P1 | 🔴 **严重恶化** | 两条路径存储格式不同，`getAssessment` 只读内嵌，不读 `question_ids` |
| P2-01 | student_id = openid 混用 | 🟡 P2 | 🟡 **仍存在** | 无变化 |
| P2-02 | 集合命名不一致 | 🟡 P2 | 🟡 **部分修复** | `question_generation_queue` 已废弃，`questions` 仅调试用 |
| P2-03 | 题目去重策略不完善 | 🟡 P2 | 🟡 **部分修复** | 新增 `shared/dedup.js` 逐条检查，但仍无写入时去重 |
| P2-04 | 知识点数据双存储 | 🟡 P2 | 🟡 **部分修复** | 新增 `syncKnowledgePoints` 云函数，但需手动触发 |
| P2-05 | 队列清理后不重试 | 🟡 P2 | ✅ **已修复** | 移除 `TARGET_QUEUE_ID`，`cleanupStuckTasks` 现在重置为 pending + 重试计数 |
| P3-01 | LLM Provider分散管理 | 🟢 P3 | 🟡 **部分修复** | 新增 `shared/llm-client.js` 统一薄包装层，但 `scheduledTaskGenerator` 仍有独立的 LLM 调用 |
| P3-02 | 错误处理不统一 | 🟢 P3 | 🟡 **部分修复** | 新增 `shared/response-helper.js`，但尚无云函数引用它 |
| P3-03 | 无数据版本和迁移管理 | 🟢 P3 | 🟡 **部分修复** | 新增 `schema-version.js` (CURRENT_SCHEMA_VERSION=1)，但无自动迁移运行器 |

---

## 3. 当前仍然存在的问题

### 🔴 P0：严重 — 影响核心业务正确性

---

#### P0-01 [恶化]: Assessment双重存储导致队列测评无题目

**状态**: 前次 P1-04 → 本次升级为 P0

**验证依据**：

两条 assessment 创建路径的存储格式完全不同：

| 特征 | startAssessment（同步路径） | questionGenerator（异步队列路径） |
|------|---------------------------|-------------------------------|
| 存储方式 | `questions: [完整题目对象]` | `question_ids: [pool中的_id]` |
| 文件位置 | `startAssessment/index.js:455` | `CreateAssessmentStep.js:70` |
| 题目字段 | 完整内嵌 | 仅引用ID |

**致命问题**：`getAssessment/index.js:44` 只读取 `session.questions`：
```javascript
let questions = session.questions || [];
```

没有回退到 `question_ids` 的逻辑。结果：
- **队列路径创建的 assessment 通过 `getAssessment` 获取时返回 0 道题目**
- **`submitAnswer` 也依赖 `session.questions` 做答案匹配**，同样失效

**影响范围**：所有通过异步队列生成的测评（即题池不足时的测评）完全无法使用

**修复建议**：
```javascript
// getAssessment 中添加 question_ids 回退
let questions = session.questions || [];
if (questions.length === 0 && session.question_ids?.length > 0) {
  const poolQuestions = await db.collection('ai_question_pool')
    .where({ _id: db.command.in(session.question_ids) })
    .get();
  questions = poolQuestions.data || [];
}
```

---

#### P0-02 [持续]: scheduledTaskGenerator 输出格式未归一化

**验证依据**：

`scheduledTaskGenerator/index.js:174-176` 写入 `ai_question_pool` 时：
- `options` 仍为 `{key, value}[]` 格式（非 normalizer 规范的 `string[]`）
- `correct_answer` 转换为 `String.fromCharCode(65 + parseInt(...))` 的内联逻辑
- 未 import 或调用 `normalizeQuestion()`

```javascript
// scheduledTaskGenerator/index.js:174
options: parsed.options.map((opt, idx) => {
  if (typeof opt === 'string') {
    const match = opt.match(/^([A-D])\.\s*(.+)$/);
    return match ? { key: match[1], value: match[2] } : { key: String.fromCharCode(65 + idx), value: opt };
  }
  return opt;
}),
```

但 `startAssessment/index.js:494` 的内联转换期望 `string[]`：
```javascript
value: typeof opt === 'string' ? opt.replace(...) : (opt.value || opt)
```

**影响范围**：题池中混入不一致格式的题目，下游消费者需要额外兼容处理

**修复建议**：`scheduledTaskGenerator` 在写入前调用 `normalizeQuestion()`

---

#### P0-03 [持续]: 内联归一化逻辑未统一到 normalizer

**验证依据**：

`practice_v2/index.js:108-109` 和 `startAssessment/index.js:494-496` 仍有独立的内联转换：

| 位置 | 内联转换内容 |
|------|------------|
| `practice_v2/index.js:108` | `correct_answer` 数字→字母、`options` 字符串处理 |
| `startAssessment/index.js:494` | `options.map()` 转换、`correct_answer` 数字→字母 |
| `shared/question-normalizer.js` | 统一的 `normalizeQuestion()` |

这3处转换逻辑各不相同，且都与 `normalizeQuestion()` 不同步。

**影响范围**：任何修改 normalizer 逻辑时，内联版本不会同步更新

**修复建议**：将所有内联转换替换为 `normalizeQuestion()` 调用

---

### 🟠 P1：高优先级

---

#### P1-01 [持续]: 代码重复（微信云函数部署约束）

**当前状态**：

| 模块 | 份数 | 所有副本MD5一致? |
|------|------|:---:|
| `llm-core/` | 16 | ✅ |
| `knowledge_tree.js` | 16 | ✅ |
| `question-normalizer.js` | 16 | ✅ |
| `dedup.js` | 16 | ✅ |
| `schema-version.js` | 16 | ✅ |
| `question-generator.js` | 16 | ✅ |
| `llm_client.js`（旧版） | 2 | ❌ 不一致 |

**变更**：新增了 `question-normalizer.js`、`dedup.js`、`schema-version.js`、`question-generator.js` 到每个云函数的 `shared/` 子目录。采用部署脚本将 `shared/` 复制到每个函数目录。

**剩余风险**：
- 2个旧版 `llm_client.js` (`practice_v2/` 和 `startAssessment/`) 内容不同，应统一到 `shared/llm-client.js`
- 添加新共享模块时必须同步所有16个目录

**修复建议**：在 `deploy-cloud-functions.js` 中自动化同步，并删除旧版 `llm_client.js`

---

#### P1-02 [持续]: 多条题目生成路径

仍存在5条写入 `ai_question_pool` 的路径：

| 路径 | 入口 | 是否使用 normalizer |
|------|------|:---:|
| 1. startAssessment 内联AI | `startAssessment/index.js` | ❌ 内联转换 |
| 2. questionGenerator 队列 | `questionGenerator/SaveQuestionsStep.js` | ✅ |
| 3. generateAiQuestion 单题 | `generateAiQuestion/index.js` | ✅ |
| 4. scheduledTaskGenerator 定时 | `scheduledTaskGenerator/index.js` | ❌ 内联转换 |
| 5. practice_v2 练习 | `practice_v2/index.js` | ❌ 内联转换 |

**修复建议**：路径1/4/5 改用 `normalizeQuestion()`

---

#### P1-03 [新]: generateDailyTask 冷启动硬编码"二次根式"

**验证依据**：

`cloudfunctions/generateDailyTask/index.js:16-28`：
```javascript
function getColdStartTask() {
  return {
    title: '二次根式基础·5分钟',
    kp_name: '二次根式',
    kp_id: 'kp_003',
    difficulty: 'easy',
  };
}
```

冷启动（新用户或无薄弱点）时，不论用户年级和科目，都返回8年级数学"二次根式"。

**影响范围**：1年级用户收到8年级题目

**修复建议**：根据用户 `grade` 和 `subject` 生成合适的冷启动任务

---

#### P1-04 [新]: shared/response-helper.js 已创建但无调用方

**验证依据**：

`cloudfunctions/shared/response-helper.js` 提供了 `success(data)` 和 `error(message, code)`，但搜索全项目无任何云函数 import 它。

**影响范围**：P3-02 错误处理统一目标未达成

**修复建议**：逐步在各云函数中引入 `response-helper`

---

### 🟡 P2：中优先级

---

#### P2-01 [持续]: student_id = openid 混用

无变化。所有云函数使用 `openid` 作为 `student_id`。

---

#### P2-02 [持续]: knowledge_points 同步需手动触发

`syncKnowledgePoints` 云函数存在但需手动调用。知识点文件（116个JSON）是权威数据源，但数据库集合不会自动同步。

**修复建议**：添加定时触发器或CI钩子

---

#### P2-03 [持续]: 题目去重无写入时保护

- `shared/dedup.js` 提供 `checkDuplicate()` 做逐题检查
- `deduplicatePool` 和 `cleanupDuplicates` 做事后批量清理
- 但 `SaveQuestionsStep.js` 等写入路径不调用 `checkDuplicate()`
- `ai_question_pool` 无唯一索引

**修复建议**：在写入前调用 `checkDuplicate()` 或建立数据库唯一约束

---

#### P2-04 [持续]: Practice v1 目录残留

`cloudfunctions/practice/` 虽标记 @deprecated 并重定向到 v2，但目录完整保留（9个文件），增加维护混淆。

**修复建议**：完全删除 `practice/` 目录

---

#### P2-05 [新]: 废弃/调试云函数积压（25个）

| 类型 | 数量 | 示例 |
|------|------|------|
| fix* | 4 | fixData, fixEmptySubjects, fixMissingFields, fixPoolSubjects |
| debug* | 2 | debugCheck, debugData |
| test* | 4 | testDedup, testFallback, testPractice, testSubmit |
| check-* | 1 | check-db-questions |
| clean* | 4 | cleanOldQuestions, cleanExpiredLocks, cleanGrade2Questions, cleanInactiveRelations |
| cleanup* | 2 | cleanupDuplicates, cleanupOneDuplicate |
| diagnose* | 4 | diagnoseAssessment, diagnoseGrade, diagnosePracticePool, diagnoseQuestion |
| deploy/空 | 2 | practice_deploy, test_deploy |
| 其他 | 2 | deduplicatePool, statsQuestions |

**修复建议**：清理到独立 `cloudfunctions/_admin/` 或 `tools/` 目录

---

### 🟢 P3：改善建议

---

#### P3-01 [持续]: LLM Provider 管理仍部分分散

`scheduledTaskGenerator` 有独立的 LLM 调用逻辑（不通过 `shared/llm-core`），虽已用环境变量但未走统一接口。

---

#### P3-02 [持续]: 错误处理不统一

`response-helper.js` 已创建但未被使用。各云函数仍直接返回 `{ success: false, error: msg }`。

---

#### P3-03 [持续]: schema_version 已附加但无消费者

`schema-version.js` 设 `CURRENT_SCHEMA_VERSION = 1`，`normalizeQuestion()` 附加到每条记录。但：
- 无代码读取或验证 `schema_version`
- 无版本升级路径
- 无迁移运行器

---

## 4. 新增发现：架构变更

### 4.1 新增业务功能（前次分析未覆盖）

| 功能 | 云函数 | 集合 | 说明 |
|------|--------|------|------|
| 家长测评 | `parentAssessment` | `parent_assessments` | 家长先做题→孩子做题→对比 |
| 专属考试(VIP) | `startExclusiveExam` | `user_exams`, `user_materials_vectors` | VIP用户上传资料后生成专属测评 |
| 材料上传 | `uploadMaterial` | `materials`, `user_materials` | 个人/教材材料上传+配额 |
| 管理员系统 | `adminLogin`, `adminProxy`, `adminReviewMaterial` | `admin` | 管理后台 |
| 每日任务 | `generateDailyTask`, `getTodayTasks` | - | AI原生Phase 2个性化任务 |
| 家族/伙伴 | `createFamily`, `joinFamily`, `leaveFamily`, `getFamily`, `bindPartner`, `unbindPartner`, `matchPartner`, `getPartner`, `notifyPartner` | - | 社交学习功能 |
| 成就系统 | `getAchievements` | - | 成就徽章 |
| 排行榜 | `getRankings` | - | 排名 |
| 签到 | `signIn`, `checkTodaySignIn`, `getCheckinHistory` | - | 每日签到 |
| 数据分析 | `analytics` | `analytics` | 事件追踪 |
| 专属测评 | `startExclusiveExam` | `user_exams` | VIP专属 |

### 4.2 前端架构变更

| 变更 | 说明 |
|------|------|
| `utils/api.js` | 已删除 |
| `utils/cloudApi.js` | 已删除 |
| `miniprogram/utils/queue-api.js` | 新增，队列轮询工具 |
| 页面数量 | 大幅精简到仅 `assessment/` 页面（+ assessment-queue 子页面） |
| API调用方式 | 全部改为直接 `wx.cloud.callFunction()` |

### 4.3 数据集合变更

| 集合 | 状态 | 说明 |
|------|------|------|
| `questions` | 🟡 近乎废弃 | 仅 `check-db-questions` 调试函数引用 |
| `question_generation_queue` | ✅ 已废弃 | 无任何云函数引用 |
| `materials` | 🆕 新增 | 上传材料存储 |
| `user_materials` | 🆕 新增 | 用户材料元数据 |
| `user_materials_vectors` | 🆕 新增 | RAG向量数据 |
| `user_exams` | 🆕 新增 | 专属考试记录 |
| `parent_assessments` | 🆕 新增 | 家长测评记录 |
| `admin` | 🆕 新增 | 管理员账号 |
| `analytics` | 🆕 新增 | 事件追踪 |
| `kp_request_log` | 🆕 新增 | 知识点请求日志 |
| `user_question_history` | 🆕 新增 | 用户答题历史 |
| `invite_records` | 🆕 新增 | 邀请记录 |

---

## 5. 修订后的问题优先级矩阵

```
        影响度高                  影响度中                影响度低
    ┌─────────────────────┐ ┌─────────────────────┐ ┌──────────────────┐
紧急│ P0-01 Assessment     │ │ P1-03 冷启动硬编码   │ │ P3-01 LLM管理     │
    │       双重存储(恶化)  │ │ P1-04 response-helper│ │ P3-02 错误处理     │
    │ P0-02 scheduledTask  │ │                      │ │ P3-03 schema版本   │
    │       未归一化        │ │                      │ │                   │
    │ P0-03 内联转换未统一  │ │                      │ │                   │
    ├─────────────────────┤ ├─────────────────────┤ └──────────────────┘
一般│ P1-01 代码重复       │ │ P2-01 student_id     │
    │ P1-02 多生成路径     │ │ P2-02 知识点同步     │
    │ P1-03 冷启动硬编码   │ │ P2-03 去重策略       │
    │                      │ │ P2-04 v1残留        │
    │                      │ │ P2-05 调试函数积压   │
    └─────────────────────┘ └─────────────────────┘
```

---

## 6. 修订后的修复路线图

### Phase 1：紧急修复（1-2天）

| # | 问题 | 修复内容 | 验收标准 |
|---|------|---------|---------|
| 1 | P0-01 | `getAssessment` 添加 `question_ids` → `ai_question_pool` 回退查询；`submitAnswer` 同步修复 | 队列测评可正常加载题目和判分 |
| 2 | P0-02 | `scheduledTaskGenerator` 写入前调用 `normalizeQuestion()` | 题池所有记录格式一致 |
| 3 | P0-03 | `practice_v2`、`startAssessment` AI生成后调用 `normalizeQuestion()` | 不存在内联转换逻辑 |

### Phase 2：代码整合（3-5天）

| # | 问题 | 修复内容 |
|---|------|---------|
| 4 | P1-01 | 部署脚本自动化 `shared/` 同步；删除旧版 `llm_client.js` |
| 5 | P1-02 | 统一5条路径均走 `normalizeQuestion()` |
| 6 | P1-03 | `generateDailyTask` 冷启动按用户年级/科目选择知识点 |
| 7 | P1-04 | 各云函数引入 `response-helper.js` |

### Phase 3：清理（2-3天）

| # | 问题 | 修复内容 |
|---|------|---------|
| 8 | P2-02 | `syncKnowledgePoints` 添加定时触发器 |
| 9 | P2-03 | `SaveQuestionsStep` 写入前调用 `checkDuplicate()` |
| 10 | P2-04 | 删除 `practice/` v1目录 |
| 11 | P2-05 | 清理25个废弃云函数到 `_admin/` 或删除 |
| 12 | P2-01 | 统一 `student_id` 命名 |

---

## 7. 修复状态统计

| 状态 | 前次 | 本次 | 变化 |
|------|------|------|------|
| ✅ 已修复 | 0 | 2 | P0-02(API层), P2-05(队列重试) |
| 🟡 部分修复 | 0 | 8 | P0-01, P0-03, P1-01, P1-02, P2-02~04, P3-01~03 |
| 🔴 仍存在/恶化 | 15 | 5+4(new) | P0-01(恶化), P1-03~04(新) |
| 总问题数 | 15 | 19 | +4 新发现 |

### 本次新增问题

| # | 等级 | 描述 |
|---|------|------|
| P0-01 | 🔴 恶化 | Assessment双重存储导致队列测评无题目 |
| P1-03 | 🟠 新 | generateDailyTask冷启动硬编码8年级知识点 |
| P1-04 | 🟠 新 | response-helper.js 已创建但无调用方 |
| P2-05 | 🟡 新 | 25个废弃/调试云函数积压 |
