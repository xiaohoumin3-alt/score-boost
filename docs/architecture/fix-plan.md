# 详细修复方案（第二次修订版）

> 生成日期: 2026-06-08
> 上次方案: 2026-06-07
> 对应文档: [integration-verification.md](./integration-verification.md)

---

## 总览

本文档针对第二次集成验证中识别的 **19 个问题**（3×P0 / 4×P1 / 5×P2 / 3×P3 + 4新发现），给出精确到文件/行号的修复方案和验收标准。

**优先级说明**：

```
P0 = 阻塞核心功能（测评/答题失败）
P1 = 影响数据质量或可维护性
P2 = 技术债务
P3 = 改善建议
```

**修复路线图**：

```
Phase 1: 紧急修复 (Day 1-2)
  P0-01  Assessment双重存储 → getAssessment/submitAnswer 兼容 question_ids
  P0-02  scheduledTaskGenerator → 调用 normalizeQuestion()
  P0-03  内联归一化 → 全部替换为 normalizeQuestion()
  P0-04  API密钥明文 → 从 cloudbaserc.json 迁移到环境变量

Phase 2: 代码整合 (Day 3-5)
  P1-01  部署脚本 → 自动同步 shared/ 到各云函数
  P1-02  5条生成路径 → 全部走 normalizer
  P1-03  generateDailyTask → 冷启动按年级/科目选择
  P1-04  llm_client.js → 统一到 shared/llm-client.js，修复 MINIMAX 引用
  P1-05  response-helper → 引入关键云函数

Phase 3: 清理 (Day 6-8)
  P2-01  student_id → 统一命名
  P2-02  syncKnowledgePoints → 添加定时触发器
  P2-03  SaveQuestionsStep → 写入前调用 checkDuplicate()
  P2-04  practice v1 → 删除目录
  P2-05  废弃云函数 → 移至 _admin/ 或删除
  P3-01~03  LLM统一/错误处理/schema消费者
```

---

## Phase 1: 紧急修复

---

### P0-01: getAssessment 和 submitAnswer 兼容 question_ids 引用格式

**问题**：`questionGenerator` 队列路径创建的 assessment 使用 `question_ids[]` 引用，但 `getAssessment` 和 `submitAnswer` 只读 `session.questions[]` 内嵌格式，导致队列测评返回0道题目。

**修复文件与行号**：

**1. `cloudfunctions/getAssessment/index.js`（~44行）**

当前代码：
```javascript
let questions = session.questions || [];
```

修改为：
```javascript
// 优先读取内嵌题目
let questions = session.questions || [];

// 回退：从 question_ids 引用加载
if (questions.length === 0 && session.question_ids && session.question_ids.length > 0) {
  console.log('[getAssessment] No embedded questions, loading from question_ids:', session.question_ids.length);
  const poolQuery = await db.collection('ai_question_pool')
    .where({ _id: db.command.in(session.question_ids) })
    .get();
  questions = (poolQuery.data || []).map(q => formatQuestionForApi(q));
}
```

**2. `cloudfunctions/submitAnswer/index.js`（~57行）**

当前代码：
```javascript
const questions = session.questions || [];
```

修改为：
```javascript
let questions = session.questions || [];

// 回退：从 question_ids 引用加载
if (questions.length === 0 && session.question_ids && session.question_ids.length > 0) {
  const poolQuery = await db.collection('ai_question_pool')
    .where({ _id: db.command.in(session.question_ids) })
    .get();
  questions = poolQuery.data || [];
}
```

**验收标准**：

| # | 测试场景 | 预期结果 |
|---|---------|---------|
| AC-1 | 通过 `questionGenerator` 队列创建的 assessment，调用 `getAssessment` | 返回完整的 `questions` 数组（非空） |
| AC-2 | 同上 assessment，调用 `submitAnswer` 提交答案 | 正确判分，`totalCorrect` 和 `scorePercent` 准确 |
| AC-3 | 通过 `startAssessment` 同步路径创建的 assessment（内嵌题目） | 行为不变，仍正常工作 |
| AC-4 | `question_ids` 中部分题目已被删除 | 只返回存在的题目，不报错 |

**验证方法**：
```bash
# 1. 通过队列创建测评，获取 assessment_id
# 2. 调用 getAssessment(assessment_id)，确认 questions.length > 0
# 3. 调用 submitAnswer(assessment_id, answers)，确认 scorePercent > 0
```

---

### P0-02: scheduledTaskGenerator 使用 normalizeQuestion()

**问题**：`scheduledTaskGenerator/index.js` 直接写入原始格式（options 为 `{key,value}[]`），未调用 normalizer。

**修复文件与行号**：

**`cloudfunctions/scheduledTaskGenerator/index.js`（~160-197行）**

当前代码（简略）：
```javascript
await db.collection('ai_question_pool').add({
  data: {
    question: parsed.question || parsed.content || '',
    content: parsed.question || parsed.content || '',
    options: parsed.options.map((opt, idx) => {
      if (typeof opt === 'string') { ... }
      return opt;
    }),
    correct_answer: typeof parsed.correct_answer === 'number'
      ? String(parsed.correct_answer) : ...,
    // ...
  }
});
```

修改为：
```javascript
// 在文件顶部添加 import
const { normalizeQuestion } = require('./shared/question-normalizer');

// 替换写入逻辑
const normalized = normalizeQuestion({
  question: parsed.question || parsed.content || '',
  options: parsed.options,
  correct_answer: parsed.correct_answer,
  kp_id: kp.id,
  kp_name: kp.name,
  difficulty: difficulty,
  subject: kp.subject,
  grade: kp.grade,
  explanation: parsed.explanation || '',
  source: 'scheduled-task',
  verified: false,
});

await db.collection('ai_question_pool').add({ data: normalized });
```

**验收标准**：

| # | 测试场景 | 预期结果 |
|---|---------|---------|
| AC-1 | scheduledTaskGenerator 写入的题目 `options` 字段 | `string[]` 格式，非 `{key,value}[]` |
| AC-2 | 写入的题目 `correct_answer` 字段 | `"A"`-`"D"` 字符串 |
| AC-3 | 写入的题目 `schema_version` 字段 | 值为 `1` |
| AC-4 | 写入的题目 `question` 字段存在 | 非空字符串 |

**验证方法**：
```javascript
// 在云开发控制台查询
db.collection('ai_question_pool')
  .where({ source: 'scheduled-task' })
  .orderBy('created_at', 'desc')
  .limit(5)
  .get()
// 检查每条记录的 options 是否为 string[]
```

---

### P0-03: 统一内联归一化为 normalizeQuestion()

**问题**：`practice_v2/index.js` 和 `startAssessment/index.js` 有独立的内联选项/答案转换逻辑。

**修复文件与行号**：

**1. `cloudfunctions/practice_v2/index.js`（~100-115行）**

当前代码：
```javascript
result.options = (parsed.options || []).map((opt, idx) => ({
  key: String.fromCharCode(65 + idx),
  value: opt.replace(/^[A-D]\.\s*/, '')
}));
result.correct_answer = typeof parsed.correct_answer === 'number'
  ? String.fromCharCode(65 + parsed.correct_answer)
  : String(parsed.correct_answer);
```

修改为：
```javascript
// 文件顶部已有 import
const { normalizeQuestion } = require('./shared/question-normalizer');

// 替换为
const normalized = normalizeQuestion({
  question: parsed.question || parsed.content,
  options: parsed.options,
  correct_answer: parsed.correct_answer,
  kp_id: kpId,
  kp_name: kpName,
  difficulty,
  explanation: parsed.explanation || '',
  subject: subject || '',
  grade: grade || '',
  question_type: questionType || 'choice',
  source: 'ai'
});
Object.assign(result, normalized);
```

**2. `cloudfunctions/startAssessment/index.js`（~490-500行）**

当前代码：
```javascript
options: (parsed.options || []).map((opt, idx) => ({
  key: String.fromCharCode(65 + idx),
  value: typeof opt === 'string' ? opt.replace(/^[A-D]\.\s*/, '') : (opt.value || opt)
})),
correct_answer: typeof parsed.correct_answer === 'number'
  ? String.fromCharCode(65 + parsed.correct_answer)
  : String(parsed.correct_answer),
```

修改为：
```javascript
// 文件顶部已有 formatQuestionForApi import，添加 normalizeQuestion
const { formatQuestionForApi, normalizeQuestion } = require('./shared/question-normalizer');

// 替换写入逻辑
const normalized = normalizeQuestion({
  question: parsed.question || parsed.content,
  options: parsed.options,
  correct_answer: parsed.correct_answer,
  kp_id: kpId,
  kp_name: kpName,
  difficulty,
  explanation: parsed.explanation || '',
  subject: subject || '',
  grade: grade || '',
  source: 'ai'
});
```

**验收标准**：

| # | 测试场景 | 预期结果 |
|---|---------|---------|
| AC-1 | 在 `practice_v2` 和 `startAssessment` 中搜索内联转换代码 | 无 `String.fromCharCode(65` 出现 |
| AC-2 | AI 生成的题目写入 `ai_question_pool` | options 为 `string[]`，correct_answer 为 `"A"`-`"D"` |
| AC-3 | 修改 normalizer 的转换逻辑后，所有路径同步生效 | 不存在独立转换逻辑 |

**验证方法**：
```bash
# 搜索残留的内联转换
rg "String.fromCharCode\(65" cloudfunctions/ --include="index.js" | grep -v node_modules | grep -v miniprogram_npm
# 应仅存在于 normalizer 和旧版 llm_client.js 中
```

---

### P0-04: API 密钥从 cloudbaserc.json 迁移到环境变量

**问题**：`cloudbaserc.json` 中 `LLM_API_KEY` 以明文硬编码 8 次。

**修复文件与行号**：

**`cloudbaserc.json`（全文）**

将所有函数的 `envVariables.LLM_API_KEY` 从明文改为占位符或移除（CloudBase 控制台配置）：

```json
"envVariables": {
  "LLM_API_KEY": "",
  "LLM_BASE_URL": "https://api.deepseek.com",
  "LLM_MODEL": "deepseek-chat",
  "LLM_TIMEOUT_MS": "45000",
  "LLM_MAX_RETRIES": "2",
  "LLM_RETRY_DELAY_MS": "1000"
}
```

然后在 CloudBase 控制台 → 环境设置 → 环境变量中统一配置 `LLM_API_KEY`。

**同时修复 `startAssessment/llm_client.js` 的 MINIMAX 引用**：

**`cloudfunctions/startAssessment/llm_client.js`（~13-14行）**

当前代码：
```javascript
this.apiKey = apiKey || process.env.MINIMAX_API_KEY;
this.model = process.env.MINIMAX_MODEL || 'mimo-v2-flash';
```

修改为：
```javascript
this.apiKey = apiKey || process.env.LLM_API_KEY;
this.model = process.env.LLM_MODEL || 'deepseek-chat';
```

**验收标准**：

| # | 测试场景 | 预期结果 |
|---|---------|---------|
| AC-1 | `cloudbaserc.json` 中无明文 API 密钥 | `rg "sk-" cloudbaserc.json` 无结果 |
| AC-2 | `startAssessment/llm_client.js` 无 MINIMAX 引用 | `rg "MINIMAX" cloudfunctions/startAssessment/llm_client.js` 无结果 |
| AC-3 | CloudBase 控制台配置 `LLM_API_KEY` 后，各云函数可正常调用 LLM | AI 题目生成正常工作 |
| AC-4 | 全项目搜索无明文密钥 | `rg "sk-[a-f0-9]{10,}" --include="*.json"` 无结果 |

**验证方法**：
```bash
# 搜索明文密钥
rg "sk-[a-f0-9]{10,}" --include="*.json" --include="*.js" . | grep -v node_modules
# 搜索 MINIMAX 引用
rg "MINIMAX" cloudfunctions/ --include="*.js" | grep -v node_modules
```

---

## Phase 2: 代码整合

---

### P1-01: 部署脚本自动同步 shared/ 模块

**问题**：16个云函数各有独立的 `shared/` 副本，手动同步容易遗漏。

**修复文件**：`deploy-cloud-functions.js`

**修改内容**：在部署前，将 `cloudfunctions/shared/` 下的所有模块自动复制到目标云函数目录的 `shared/` 子目录。

```javascript
// deploy-cloud-functions.js 中添加
const SHARED_DIR = path.join(__dirname, 'cloudfunctions', 'shared');
const SHARED_FILES = fs.readdirSync(SHARED_DIR).filter(f => 
  f.endsWith('.js') || fs.statSync(path.join(SHARED_DIR, f)).isDirectory()
);

function syncSharedToFunction(functionDir) {
  const targetShared = path.join(functionDir, 'shared');
  if (!fs.existsSync(targetShared)) fs.mkdirSync(targetShared, { recursive: true });
  
  for (const item of SHARED_FILES) {
    const src = path.join(SHARED_DIR, item);
    const dest = path.join(targetShared, item);
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}
```

**验收标准**：

| # | 测试场景 | 预期结果 |
|---|---------|---------|
| AC-1 | 运行部署脚本后，所有云函数的 `shared/` 文件与 `cloudfunctions/shared/` 一致 | `md5` 对比全部相同 |
| AC-2 | 新增共享模块后，运行部署脚本自动分发到所有函数 | 无需手动拷贝 |
| AC-3 | 删除 `shared/llm_client.js`（旧版） | 不影响任何云函数运行 |

---

### P1-02: 5条生成路径全部走 normalizer（已由 P0-02/P0-03 覆盖）

合并到 P0-02 和 P0-03 中执行。完成后验证：

**验收标准**：

| # | 检查项 | 方法 |
|---|--------|------|
| AC-1 | 5条路径的写入结果格式一致 | 查询 `ai_question_pool` 各 `source` 的记录，options 均为 `string[]` |
| AC-2 | 无内联转换代码残留 | `rg "String.fromCharCode\(65" cloudfunctions/ --include="index.js"` |

---

### P1-03: generateDailyTask 冷启动按年级/科目选择

**问题**：冷启动默认任务硬编码为8年级"二次根式"，低年级用户收到超纲内容。

**修复文件与行号**：

**`cloudfunctions/generateDailyTask/index.js`（~14-28行）**

当前代码：
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

修改为：
```javascript
function getColdStartTask(grade, subject) {
  // 根据年级选择合适的冷启动知识点
  const coldStartMap = {
    '1': { kp_name: '10以内加减法', kp_id: 'math_g1_kp01', title: '10以内加减法' },
    '2': { kp_name: '乘法口诀', kp_id: 'math_g2_kp01', title: '乘法口诀' },
    '3': { kp_name: '多位数乘法', kp_id: 'math_g3_kp01', title: '多位数乘法' },
    '4': { kp_name: '角的度量', kp_id: 'math_g4_kp01', title: '角的度量' },
    '5': { kp_name: '小数乘除法', kp_id: 'math_g5_kp01', title: '小数乘除法' },
    '6': { kp_name: '分数乘除法', kp_id: 'math_g6_kp01', title: '分数乘除法' },
    '7': { kp_name: '有理数运算', kp_id: 'math_g7_kp01', title: '有理数运算' },
    '8': { kp_name: '二次根式基础', kp_id: 'kp_003', title: '二次根式基础' },
    '9': { kp_name: '一元二次方程', kp_id: 'math_g9_kp01', title: '一元二次方程' },
  };
  const kp = coldStartMap[grade] || coldStartMap['8'];
  return {
    success: true,
    data: {
      title: `${kp.title}·5分钟`,
      reason: '让我们开始今天的练习，巩固基础',
      estimated_time: 5,
      question_count: 3,
      kp_id: kp.kp_id,
      kp_name: kp.kp_name,
      difficulty: 'easy',
      generated_at: new Date().toISOString()
    }
  };
}
```

**验收标准**：

| # | 测试场景 | 预期结果 |
|---|---------|---------|
| AC-1 | 2年级新用户调用 `generateDailyTask` | 返回"乘法口诀"，非"二次根式" |
| AC-2 | 1年级新用户 | 返回"10以内加减法" |
| AC-3 | 无年级信息时 | 回退到默认（8年级） |
| AC-4 | `getColdStartTask` 不包含 `二次根式` 作为唯一选项 | 按年级动态选择 |

**验证方法**：
```bash
rg "二次根式" cloudfunctions/generateDailyTask/index.js
# 仅应在 grade='8' 的映射中出现
```

---

### P1-04: 统一 llm_client.js 并修复 MINIMAX 引用

**问题**：`startAssessment/llm_client.js` 引用 `MINIMAX_API_KEY`（未配置），应使用 `LLM_API_KEY`。`practice_v2/llm_client.js` 是另一份独立副本。

**修复文件与行号**：

**1. `cloudfunctions/startAssessment/llm_client.js`（~13-14行）**

```javascript
// 修改前
this.apiKey = apiKey || process.env.MINIMAX_API_KEY;
this.model = process.env.MINIMAX_MODEL || 'mimo-v2-flash';

// 修改后
this.apiKey = apiKey || process.env.LLM_API_KEY;
this.model = process.env.LLM_MODEL || 'deepseek-chat';
```

**2. 删除旧版 `llm_client.js`**（Phase 1 的 P1-01 完成后）

将 `startAssessment/llm_client.js` 和 `practice_v2/llm_client.js` 替换为对 `shared/llm-client.js` 的引用：
```javascript
// startAssessment/index.js 和 practice_v2/index.js
const { LlmClient, parseLlmResponse, validateQuestion } = require('./shared/llm-client');
```

注意：需要确保 `shared/llm-client.js` 导出了 `parseLlmResponse` 和 `validateQuestion`（目前仅导出 `LlmClient`）。

**验收标准**：

| # | 测试场景 | 预期结果 |
|---|---------|---------|
| AC-1 | `rg "MINIMAX" cloudfunctions/` | 无结果 |
| AC-2 | `startAssessment` AI 生成功能正常 | 调用 `new LlmClient(apiKey)` 使用 `LLM_API_KEY` |
| AC-3 | 旧版 `llm_client.js` 已删除或统一 | 仅 `shared/llm-client.js` 为权威版本 |

---

### P1-05: 引入 response-helper 到关键云函数

**问题**：`shared/response-helper.js` 已创建但无云函数使用。

**修复方案**：在以下关键云函数的入口处引入：

```javascript
const { success, error } = require('./shared/response-helper');

// 替换
return { success: true, data: ... }  →  return success(...)
return { success: false, error: msg }  →  return error(msg)
```

**目标云函数**（优先级排序）：
1. `getAssessment` — 前端直接调用
2. `submitAnswer` — 前端直接调用
3. `startAssessment` — 前端直接调用
4. `practice_v2` — 练习核心
5. `generateDailyTask` — 每日任务

**验收标准**：

| # | 测试场景 | 预期结果 |
|---|---------|---------|
| AC-1 | 上述5个函数 import response-helper | `rg "response-helper" cloudfunctions/*/index.js` 返回5条 |
| AC-2 | 错误响应格式统一 | 均包含 `{ success: false, error: string, code: string }` |

---

## Phase 3: 清理

---

### P2-01: 统一 student_id 命名

**问题**：部分云函数使用 `student_id`，部分使用 `openid`，实际值相同。

**修复方案**：统一为 `openid`（微信官方标准），`student_id` 作为别名保留。

在 `shared/` 中创建 `user-id.js`：
```javascript
function getUserId(context, event) {
  const openid = context.OPENID || event.openid;
  return openid;
}
module.exports = { getUserId };
```

**验收标准**：
- 所有新代码使用 `getUserId(context, event)`
- 搜索无新增 `student_id = openid` 模式

---

### P2-02: syncKnowledgePoints 添加定时触发器

**问题**：知识点文件同步到数据库需手动触发。

**修复方案**：
```bash
tcb fn trigger create syncKnowledgePoints \
  --cron "0 0 3 * * * *" \
  --trigger-name syncKpTimer
```

每天凌晨3点自动同步。

**验收标准**：
- `tcb fn detail syncKnowledgePoints` 显示触发器
- 知识点文件更新后，24小时内数据库自动同步

---

### P2-03: SaveQuestionsStep 写入前调用 checkDuplicate()

**问题**：题目写入 `ai_question_pool` 前无去重检查。

**修复文件**：`cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js`

```javascript
const { checkDuplicate } = require('../../../shared/dedup');

// 在 add() 前添加
const isDup = await checkDuplicate(db, normalizedQuestion);
if (isDup) {
  console.log('[SaveQuestions] Duplicate skipped:', normalizedQuestion.question.substring(0, 30));
  continue;
}
```

**验收标准**：
- 重复题目不会被写入
- 日志显示 skipped 记录

---

### P2-04: 删除 practice v1 目录

**修复**：
```bash
rm -rf cloudfunctions/practice/
```

**验收标准**：
- `cloudfunctions/practice/` 不存在
- 前端无 `name: 'practice'` 调用（已确认当前无）

---

### P2-05: 清理废弃/调试云函数

**分类处理**：

| 操作 | 函数 | 说明 |
|------|------|------|
| 删除 | `test_deploy`, `practice_deploy` | 空壳函数 |
| 删除 | `testDedup`, `testFallback`, `testPractice`, `testSubmit` | 测试函数 |
| 移至 `_admin/` | `fixData`, `fixEmptySubjects`, `fixMissingFields`, `fixPoolSubjects` | 数据修复 |
| 移至 `_admin/` | `debugCheck`, `debugData` | 调试工具 |
| 移至 `_admin/` | `diagnoseAssessment`, `diagnoseGrade`, `diagnosePracticePool`, `diagnoseQuestion` | 诊断工具 |
| 移至 `_admin/` | `cleanOldQuestions`, `cleanExpiredLocks`, `cleanGrade2Questions`, `cleanInactiveRelations` | 清理工具 |
| 移至 `_admin/` | `cleanupDuplicates`, `cleanupOneDuplicate`, `deduplicatePool` | 去重工具 |
| 移至 `_admin/` | `check-db-questions`, `statsQuestions`, `questionPoolStats` | 统计工具 |
| 保留 | `practice_new` | 检查是否有引用，无则删除 |

```bash
mkdir -p cloudfunctions/_admin
# 移动
for f in fixData fixEmptySubjects fixMissingFields fixPoolSubjects debugCheck debugData \
  diagnoseAssessment diagnoseGrade diagnosePracticePool diagnoseQuestion \
  cleanOldQuestions cleanExpiredLocks cleanGrade2Questions cleanInactiveRelations \
  cleanupDuplicates cleanupOneDuplicate deduplicatePool check-db-questions statsQuestions \
  questionPoolStats; do
  mv "cloudfunctions/$f" "cloudfunctions/_admin/$f" 2>/dev/null
done
# 删除
rm -rf cloudfunctions/test_deploy cloudfunctions/practice_deploy \
  cloudfunctions/testDedup cloudfunctions/testFallback cloudfunctions/testPractice cloudfunctions/testSubmit
```

**验收标准**：
- `cloudfunctions/` 下无 `test*`、`debug*`、`fix*` 目录（除 `_admin/` 下）
- 生产云函数目录数量从 96 降至 ~70

---

### P3-01: 统一 LLM Provider

**修复**：`scheduledTaskGenerator` 的 LLM 调用改为通过 `shared/llm-core` 发起，移除独立的 HTTP 请求逻辑。

**验收标准**：`rg "https.request\|http.request" cloudfunctions/scheduledTaskGenerator/` 无结果

---

### P3-02: 错误处理统一

已在 P1-05 中覆盖。

---

### P3-03: schema_version 消费者

**修复**：在 `getAssessment` 中检查题目 `schema_version`，若不匹配当前版本则重新 normalize：

```javascript
const CURRENT_SCHEMA_VERSION = require('./shared/schema-version').CURRENT_SCHEMA_VERSION;
// 读取题目时
if (q.schema_version !== CURRENT_SCHEMA_VERSION) {
  q = normalizeQuestion(q);
}
```

**验收标准**：旧格式题目（无 `schema_version`）读取时自动归一化

---

## 依赖关系图

```
P0-04 (密钥迁移) ─── 独立，可先行
P0-01 (双重存储) ─── 独立，最优先
P0-02 (scheduledTask normalizer) ─── 独立
P0-03 (内联→normalizer) ─── 独立
    │
    ├─→ P1-01 (部署脚本) ─── 依赖 P0-03（确保 shared/ 内容正确）
    ├─→ P1-04 (llm_client统一) ─── 依赖 P0-04
    └─→ P1-05 (response-helper) ─── 依赖 P1-01

P1-03 (冷启动) ─── 独立

P2-01~05 ─── 依赖 P1-01
P3-01~03 ─── 依赖 P2-*
```

---

## 实施时间表

| Day | 上午 | 下午 |
|-----|------|------|
| **Day 1** | P0-01 getAssessment/submitAnswer 兼容 | P0-02 scheduledTask normalizer |
| **Day 2** | P0-03 内联转换→normalizer | P0-04 密钥迁移 |
| **Day 3** | P1-01 部署脚本 | P1-03 冷启动修复 |
| **Day 4** | P1-04 llm_client统一 | P1-05 response-helper |
| **Day 5** | P2-02 定时同步 + P2-03 写入去重 | P2-04 删除v1 + P2-05 清理 |
| **Day 6** | P3-01 LLM统一 | P3-03 schema消费者 |
| **Day 7** | 全量回归测试 | 文档更新 |

**总计：7个工作日**
