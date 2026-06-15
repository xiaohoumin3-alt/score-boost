# 深度测评题池兜底与生成队列闭环实施计划

**项目路径**: `/Users/seanxx/score-boost-mini`
**设计文档**: `docs/superpowers/specs/2026-06-15-extended-assessment-pool-fallback-queue-design.md`
**创建日期**: 2026-06-15
**状态**: 待执行

---

## 核心目标回顾

| 目标 | 定义 | 验收标准 |
|------|------|----------|
| G1 深度测评可启动 | 当前年级/科目存在可用题时，不因 `verified:true` 为 0 直接失败 | 2年级数学有题时不再返回"暂无可用题目" |
| G2 题池不足可等待生成 | 当前题池不足 5 道初始题时，创建生成队列并让前端进入等待/轮询 | 题池不足时返回 `status:'queued'` + `queue_id` |
| G3 保持题目质量边界 | 不跨年级兜底，不批量把题目标为 `verified:true` | 所有题池查询限定同年级 |
| G4 不破坏现有普通测评 | 复用现有 `question_queue` / `checkQueueStatus` 能力，但避免污染普通测评数据 | `type:'extended_assessment'` 队列不创建普通 `assessments` |

---

## Phase 1: 数据副本准备与验证

**目标**: 创建 `extendedAssessment/data/` 目录并复制知识点数据副本，确保数据完整可用。

### 1.1 创建数据目录

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 1.1.1 | 创建 `extendedAssessment/data/` 目录 | `test -d /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/data && echo "EXISTS"` |
| 1.1.2 | 验证 `startAssessment/data/` 存在且可读 | `test -d /Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/data && echo "EXISTS"` |

### 1.2 复制知识点数据文件

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 1.2.1 | 创建复制脚本 `scripts/copy-knowledge-data.js` | `test -f /Users/seanxx/score-boost-mini/scripts/copy-knowledge-data.js` |
| 1.2.2 | 执行复制脚本 | `node scripts/copy-knowledge-data.js && echo "COPY_SUCCESS"` |
| 1.2.3 | 验证文件数量 ≥ 100 个 | `find /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/data -maxdepth 1 -type f -name '*.json' | wc -l \| grep -E '^([1-9][0-9]{2,}|[1-9][0-9]{2,})'` |
| 1.2.4 | 验证关键文件存在 | `test -f /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/data/math-grade2-down.json && test -f /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/data/physics-grade9.json` |

### 1.3 数据完整性验证

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 1.3.1 | 验证所有 JSON 文件格式正确 | `node scripts/validate-knowledge-data.js 2>&1 \| grep -c "VALID_FILES" \| grep -v "0"` |
| 1.3.2 | 验证关键文件包含 `chapters` 非空 | `node -e "const fs=require('fs'); const p='cloudfunctions/extendedAssessment/data/math-grade2-down.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); if(!j.chapters || !j.chapters.length) throw new Error('EMPTY'); console.log('OK')" 2>&1` |
| 1.3.3 | 验证 `physics-grade9.json` 兼容性 | `test -f /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/data/physics-grade9.json && node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('cloudfunctions/extendedAssessment/data/physics-grade9.json','utf8')); if(!j.chapters) throw new Error('NO_CHAPTERS'); console.log('OK')" 2>&1` |

### 1.4 创建 `buildExtendedQuestionPlan` helper

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 1.4.1 | 在 `extendedAssessment/index.js` 内创建 `buildExtendedQuestionPlan` 函数 | `grep -n "buildExtendedQuestionPlan" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "function buildExtendedQuestionPlan" \| grep -v "0"` |
| 1.4.2 | 验证函数支持 `up/down` semester | `grep -A 20 "function buildExtendedQuestionPlan" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "semester.*up.*down" \| grep -v "0"` |
| 1.4.3 | 验证函数只读取同年级数据 | `grep -A 30 "function buildExtendedQuestionPlan" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "grade.*String(grade)" \| grep -v "0"` |
| 1.4.4 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |

---

## Phase 2: 后端核心 helpers 实现

**目标**: 实现 `fetchQuestionsWithFallback`、`createExtendedAssessmentQueue` 等核心 helpers。

### 2.1 实现 `fetchQuestionsWithFallback` helper

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.1.1 | 在 `extendedAssessment/index.js` 内创建 `fetchQuestionsWithFallback` 函数签名 | `grep -n "fetchQuestionsWithFallback" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "async function fetchQuestionsWithFallback" \| grep -v "0"` |
| 2.1.2 | 实现 6 级 fallback 查询逻辑 (verified:true alias, verified:false alias, exists(false) alias) | `grep -A 100 "async function fetchQuestionsWithFallback" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "verified.*true.*false.*exists" \| grep -v "0"` |
| 2.1.3 | 实现 `getSubjectAliases` helper | `grep -n "getSubjectAliases" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "function getSubjectAliases" \| grep -v "0"` |
| 2.1.4 | 实现 `excludeIds` 全局过滤和去重 | `grep -A 50 "async function fetchQuestionsWithFallback" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "excludeIds\|Set\|_id.*question_id" \| grep -v "0"` |
| 2.1.5 | 实现 `queryFailedAll` 错误处理 | `grep -A 80 "async function fetchQuestionsWithFallback" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "queryFailedAll\|errors" \| grep -v "0"` |
| 2.1.6 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |

### 2.2 替换 `fetchQuestionsFromPool` 调用

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.2.1 | 在 `startExtendedAssessment` 中将 `fetchQuestionsFromPool` 替换为 `fetchQuestionsWithFallback` | `grep -A 5 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "fetchQuestionsWithFallback" \| grep -v "0"` |
| 2.2.2 | 移除旧 `fetchQuestionsFromPool` 函数或标记废弃 | `grep -n "fetchQuestionsFromPool" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "deprecated\|// OLD" \| grep -v "0"` 或 `grep -c "function fetchQuestionsFromPool" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep "0"` |
| 2.2.3 | 验证 `grade` 规范化为字符串 | `grep -B 5 -A 10 "fetchQuestionsWithFallback.*grade" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "String(grade)" \| grep -v "0"` |

### 2.3 实现 `createExtendedAssessmentQueue` helper

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.3.1 | 创建 `createExtendedAssessmentQueue` 函数签名 | `grep -n "createExtendedAssessmentQueue" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "async function createExtendedAssessmentQueue" \| grep -v "0"` |
| 2.3.2 | 实现队列写入字段（type, source, grade:String, subject, semester, question_plan, target_kps） | `grep -A 50 "async function createExtendedAssessmentQueue" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "type.*extended_assessment\|source.*extendedAssessment\|String(grade)\|question_plan\|target_kps" \| grep -v "0"` |
| 2.3.3 | 调用 `buildExtendedQuestionPlan` 生成同年级知识点 | `grep -A 40 "async function createExtendedAssessmentQueue" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "buildExtendedQuestionPlan" \| grep -v "0"` |
| 2.3.4 | 实现 `expires_at` 和 `timeline.queued_at` | `grep -A 40 "async function createExtendedAssessmentQueue" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "expires_at\|timeline\|queued_at" \| grep -v "0"` |
| 2.3.5 | 实现 `difficulty_distribution` 5题精确分配（2 easy, 2 medium, 1 hard） | `grep -A 50 "async function createExtendedAssessmentQueue" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "difficulty_distribution\|easy.*2\|medium.*2\|hard.*1" \| grep -v "0"` |
| 2.3.6 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |

### 2.3.H1 验收标准: difficulty_distribution 精确分配

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.3.H1.1 | 验证 `question_plan` 包含精确难度分配 | `grep -A 20 "difficulty_distribution" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "easy.*easy.*medium.*medium.*hard\|count.*2.*2.*1" \| grep -v "0"` |
| 2.3.H1.2 | 验证生成时按难度分配选题 | `grep -A 30 "difficulty_distribution" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "按难度选题\|filter.*difficulty\|difficulty_count" \| grep -v "0"` |

### 2.4 实现 `validateGeneratorSupport` 校验

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.4.1 | 创建 `SUPPORTED_COMBINATIONS` 常量 | `grep -n "SUPPORTED_COMBINATIONS" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "const SUPPORTED_COMBINATIONS" \| grep -v "0"` |
| 2.4.2 | 创建 `validateGeneratorSupport` 函数 | `grep -n "validateGeneratorSupport" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "function validateGeneratorSupport" \| grep -v "0"` |
| 2.4.3 | 在 `createExtendedAssessmentQueue` 前调用校验 | `grep -B 5 "createExtendedAssessmentQueue" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "validateGeneratorSupport" \| grep -v "0"` |
| 2.4.4 | 验证不支持组合时返回明确错误 | `grep -A 10 "function validateGeneratorSupport" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "暂不支持\|not supported" \| grep -v "0"` |
| 2.4.5 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |

### 2.5 实现防重复队列逻辑

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.5.1 | 在 `startExtendedAssessment` 中查询现有 active 队列 | `grep -A 30 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "question_queue.*where.*student_id.*source.*extendedAssessment" \| grep -v "0"` |
| 2.5.2 | 实现 stuck processing 判断（5分钟阈值） | `grep -A 50 "student_id.*source.*extendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "QUEUE_STUCK_THRESHOLD\|updated_at.*processing" \| grep -v "0"` |
| 2.5.3 | 实现 stale pending 判断（2分钟阈值） | `grep -A 60 "student_id.*source.*extendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "QUEUE_STALE_THRESHOLD\|created_at.*pending" \| grep -v "0"` |
| 2.5.4 | 命中有效队列时复用 queue_id | `grep -A 70 "student_id.*source.*extendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "queue_id.*status.*queued" \| grep -v "0"` |
| 2.5.5 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |

### 2.6 修改 `startExtendedAssessment` 队列创建逻辑

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.6.1 | 添加 `after_queue_id` 参数支持 | `grep -A 10 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "after_queue_id" \| grep -v "0"` |
| 2.6.2 | 实现题数 < 5 且无 `after_queue_id` 时创建队列 | `grep -A 100 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "questions.length.*INITIAL_QUESTION_COUNT.*createExtendedAssessmentQueue" \| grep -v "0"` |
| 2.6.3 | 实现题数 ≥ 5 时创建 session 并返回 ready | `grep -A 100 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "questions.length.*>=.*INITIAL_QUESTION_COUNT.*extended_sessions.*success.*true" \| grep -v "0"` |
| 2.6.4 | **H4修复**: 实现 `after_queue_id` 六要素校验（用户、年级、科目、source、type、status） | `grep -A 120 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "after_queue_id.*where.*student_id.*grade.*subject.*source.*type.*status.*completed" \| grep -v "0"` |
| 2.6.5 | **H4修复**: 校验队列属主与当前用户一致 | `grep -A 130 "after_queue_id.*where" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "student_id.*OPENID.*eq\|_openid.*queue\.student_id" \| grep -v "0"` |
| 2.6.6 | **H4修复**: 校验队列年级、科目、source、type 与请求一致 | `grep -A 140 "after_queue_id.*where" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "grade.*eq.*grade\|subject.*eq.*subject\|source.*eq.*extendedAssessment\|type.*eq.*extended_assessment" \| grep -v "0"` |
| 2.6.7 | **H4修复**: 校验队列状态为 completed | `grep -A 150 "after_queue_id.*where" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "status.*eq.*completed\|status.*===.*'completed'" \| grep -v "0"` |
| 2.6.8 | 实现 `INSUFFICIENT_QUESTIONS_AFTER_GENERATION` 返回 | `grep -A 120 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "INSUFFICIENT_QUESTIONS_AFTER_GENERATION\|题目生成后仍不足" \| grep -v "0"` |
| 2.6.9 | 实现 queued 响应返回 | `grep -A 120 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "status.*queued.*queue_id.*message" \| grep -v "0"` |
| 2.6.10 | 实现 `QUEUE_CREATE_FAILED` 错误返回 | `grep -A 130 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "QUEUE_CREATE_FAILED" \| grep -v "0"` |
| 2.6.11 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |

### 2.6.H4 验收标准: after_queue_id 六要素校验

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.6.H4.1 | 验证队列属主校验 | `grep -A 20 "after_queue_id.*student_id" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "OPENID.*eq\|_openid" \| grep -v "0"` |
| 2.6.H4.2 | 验证年级科目校验 | `grep -A 30 "after_queue_id.*grade" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "grade.*eq\|subject.*eq" \| grep -v "0"` |
| 2.6.H4.3 | 验证 source 和 type 校验 | `grep -A 40 "after_queue_id.*source" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "source.*extendedAssessment\|type.*extended_assessment" \| grep -v "0"` |
| 2.6.H4.4 | 验证 status 必须为 completed | `grep -A 50 "after_queue_id.*status" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "status.*completed\|status.*neq.*completed.*error" \| grep -v "0"` |

### 2.7 实现 `sanitizeQuestionForClient` 脱敏函数

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.7.1 | 创建 `sanitizeQuestionForClient` 函数 | `grep -n "sanitizeQuestionForClient" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "function sanitizeQuestionForClient" \| grep -v "0"` |
| 2.7.2 | 实现移除 `correct_answer` 字段 | `grep -A 20 "function sanitizeQuestionForClient" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "delete.*correct_answer\|correct_answer.*undefined" \| grep -v "0"` |
| 2.7.3 | 实现移除 IRT 参数字段 | `grep -A 20 "function sanitizeQuestionForClient" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "difficulty\|discrimination\|guessing\|irt_a\|irt_b\|irt_c" \| grep -v "0"` |
| 2.7.4 | 在 `startExtendedAssessment` 返回前调用脱敏 | `grep -A 150 "async function startExtendedAssessment" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "sanitizeQuestionForClient.*clientQuestions" \| grep -v "0"` |
| 2.7.5 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |

### 2.8 修改 `getNextQuestion` 幂等与 fallback

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.8.1 | 实现入口未答題检查 | `grep -A 30 "async function getNextQuestion" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "phase2\.questions.*some\|answeredPhase2QuestionIds\| outstanding" \| grep -v "0"` |
| 2.8.2 | 未答題存在时直接返回（幂等） | `grep -A 50 "async function getNextQuestion" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "outstanding.*return.*sanitizeQuestionForClient" \| grep -v "0"` |
| 2.8.3 | 用 `fetchQuestionsWithFallback` 替换旧题池查询 | `grep -A 80 "async function getNextQuestion" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "fetchQuestionsWithFallback" \| grep -v "0"` |
| 2.8.4 | 实现候选为空时返回 `INSUFFICIENT_QUESTIONS` | `grep -A 100 "async function getNextQuestion" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "INSUFFICIENT_QUESTIONS.*题库中无更多可用题目" \| grep -v "0"` |
| 2.8.5 | IRT 选题前二次检查未答題 | `grep -A 100 "async function getNextQuestion" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "二次.*检查\|二次读取\|double.*check" \| grep -v "0"` |
| 2.8.6 | 选出新题后先写入 `phase2.questions` 再返回 | `grep -A 120 "async function getNextQuestion" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "phase2\.questions.*push\|extended_sessions.*update.*phase2\.questions" \| grep -v "0"` |
| 2.8.7 | 写入前检查重复 `question_id` | `grep -A 120 "async function getNextQuestion" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "some.*q.*question_id\|duplicate.*check" \| grep -v "0"` |
| 2.8.8 | 返回前调用脱敏 | `grep -A 140 "async function getNextQuestion" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "sanitizeQuestionForClient.*nextQuestion" \| grep -v "0"` |
| 2.8.9 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |

### 2.9 修改 `submitAnswers` 判分契约

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.9.1 | 验证 `questionMap` 从 `session.phase2.questions` 构建 | `grep -A 50 "async function submitAnswers" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "phase2\.questions.*buildQuestionMap\|questionMap.*phase2" \| grep -v "0"` |
| 2.9.2 | 验证按 `question_id` 查找题目 | `grep -A 60 "async function submitAnswers" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "String.*question_id\|questionMap\[.*question_id" \| grep -v "0"` |
| 2.9.3 | 验证从服务端题目读取 `correct_answer` | `grep -A 70 "async function submitAnswers" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "trustedQuestion\.correct_answer\|q\.correct_answer" \| grep -v "0"` |
| 2.9.4 | 验证 IRT 参数从服务端题目读取 | `grep -A 70 "async function submitAnswers" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "difficulty.*discrimination.*guessing" \| grep -v "0"` |
| 2.9.5 | 实现未知 `question_id` 返回明确错误 | `grep -A 80 "async function submitAnswers" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "QUESTION_NOT_IN_SESSION\|未知.*question_id" \| grep -v "0"` |
| 2.9.6 | 实现缺失 `correct_answer` 返回明确错误 | `grep -A 80 "async function submitAnswers" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "QUESTION_ANSWER_MISSING\|correct_answer.*缺失" \| grep -v "0"` |
| 2.9.7 | 实现重复提交幂等处理 | `grep -A 90 "async function submitAnswers" /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js \| grep -c "DUPLICATE_ANSWER\|重复.*提交\|already.*answered" \| grep -v "0"` |
| 2.9.8 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |

---

## Phase 3: questionGenerator extended 分支

**目标**: 让 `questionGenerator` 支持 `type:'extended_assessment'` 队列，避免创建普通 assessments。

### 3.H9 向后兼容性保障（P0）

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.H9.1 | **H9修复**: 验证普通队列（无 type 字段）保持原行为 | `grep -A 10 "getSteps" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "!.*type\|type.*undefined\|default.*behavior" \| grep -v "0"` |
| 3.H9.2 | **H9修复**: 验证非 extended 类型走原 CreateAssessmentStep 流程 | `grep -A 20 "type.*!==.*extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "CreateAssessmentStep\|原流程\|default.*steps" \| grep -v "0"` |
| 3.H9.3 | **H9修复**: 验证 CompleteStep 非 extended 类型保持原行为 | `grep -A 30 "type.*!==.*extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "assessments\|原.*逻辑\|default.*behavior" \| grep -v "0"` |
| 3.H9.4 | **H9修复**: 验证 processTask 非 extended 类型返回 assessment_id | `grep -A 40 "type.*!==.*extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "assessment_id\|原.*返回\|default.*return" \| grep -v "0"` |
| 3.H9.5 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js 2>&1` |

### 3.H9 验收标准: 向后兼容性

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.H9.6 | **H9验收**: 验证无 type 队列走原流程 | `grep -B 5 -A 15 "CreateAssessmentStep" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "else.*CreateAssessmentStep\|default.*CreateAssessmentStep" \| grep -v "0"` |
| 3.H9.7 | **H9验收**: 验证普通测评测试仍通过 | `cd /Users/seanxx/score-boost-mini && npm test -- __tests__/assessment.test.js --runInBand 2>&1 \| grep -c "PASS" \| grep -v "0"` |

### 3.1 修改 `getSteps` 函数

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.1.1 | 定位 `questionGenerator/index.js` 中 `getSteps` 函数 | `grep -n "function getSteps" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "function getSteps" \| grep -v "0"` |
| 3.1.2 | 添加 `type === 'extended_assessment'` 分支判断 | `grep -A 30 "function getSteps" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "extended_assessment" \| grep -v "0"` |
| 3.1.3 | extended 分支跳过 `CreateAssessmentStep` | `grep -A 40 "function getSteps" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "extended_assessment.*!CreateAssessmentStep\|// Skip CreateAssessment" \| grep -v "0"` |
| 3.1.4 | extended 分支使用 `CompleteStep({ dependencies: [] })` | `grep -A 50 "function getSteps" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "CompleteStep.*dependencies.*\[\]" \| grep -v "0"` |
| 3.1.5 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js 2>&1` |

### 3.2 修改 `CompleteStep` 对 extended 的处理

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.2.1 | 定位 `CompleteStep.js` 文件 | `test -f /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js` |
| 3.2.2 | 在 `CompleteStep` 中添加 `task.type === 'extended_assessment'` 判断 | `grep -n "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "extended_assessment" \| grep -v "0"` |
| 3.2.3 | extended 分支不更新/创建 `assessments` | `grep -A 30 "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "!.*assessments\|skip.*assessment" \| grep -v "0"` |
| 3.2.4 | extended 分支查询题池可用题数（新保存题 + 已有同边界可用题） | `grep -A 40 "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "查询题池.*可用题\|count.*pool\|最终可用题数\|去重.*总数" \| grep -v "0"` |
| 3.2.5 | extended 分支写回 `question_ids` 为最终可用去重集合（新保存题 + 已有可用题） | `grep -A 50 "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "新保存题.*已有可用题\|去重题.*ID\|Set.*question_ids\|Array.from.*Set" \| grep -v "0"` |
| 3.2.6 | extended 分支去重题数 ≥ `task.num_questions` 才标记 completed | `grep -A 50 "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "去重.*length.*>=.*num_questions\|final_count.*>=.*5" \| grep -v "0"` |
| 3.2.7 | extended 分支写回 `question_ids` 和 `timeline.completed_at` | `grep -A 40 "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "question_ids\|timeline\|completed_at" \| grep -v "0"` |
| 3.2.8 | extended 分支标记 `question_queue.status = 'completed'` | `grep -A 40 "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "status.*completed" \| grep -v "0"` |
| 3.2.9 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js 2>&1` |

### 3.2.H2-H3 验收标准: 最终可用题数校验与 question_ids 去重

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.2.H2.1 | 验证查询题池可用题数逻辑 | `grep -A 30 "查询题池.*可用题\|count.*pool" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "grade.*subject\|verified.*true.*false" \| grep -v "0"` |
| 3.2.H2.2 | 验证去重题数校验条件 | `grep -A 40 "去重.*length\|final_count" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c ">=.*task\.num_questions\|>=.*5\|<.*num_questions.*failed" \| grep -v "0"` |
| 3.2.H3.1 | 验证 question_ids 为去重集合 | `grep -A 50 "question_ids.*new.*saved\|Set.*question_ids" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "\[...newSavedIds,...existingIds\]\|Array\.from.*new Set\|\[...Set\]" \| grep -v "0"` |

### 3.2.H5 验收标准: 队列状态机明确定义

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.2.H5.1 | **H5修复**: 在 questionGenerator 主流程中定义状态转换条件 | `grep -n "pending.*processing.*completed.*failed\|状态转换\|status.*transition" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "pending.*processing\|processing.*completed\|processing.*failed" \| grep -v "0"` |
| 3.2.H5.2 | **H5修复**: pending → processing 在 GenerateStep 开始时触发 | `grep -A 10 "GenerateStep.*execute" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/GenerateStep.js \| grep -c "status.*processing\|update.*status.*processing" \| grep -v "0"` |
| 3.2.H5.3 | **H5修复**: processing → completed 在 CompleteStep 成功时触发 | `grep -A 20 "CompleteStep.*execute" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "status.*completed\|update.*status.*completed" \| grep -v "0"` |
| 3.2.H5.4 | **H5修复**: processing → failed 在任意 Step 失败时触发 | `grep -A 30 "catch.*error" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "status.*failed\|update.*status.*failed" \| grep -v "0"` |
| 3.2.H5.5 | **H5修复**: failed 状态写回 error 信息到队列 | `grep -A 40 "status.*failed" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "error.*message\|result\.error" \| grep -v "0"` |

### 3.3 修改 `SaveQuestionsStep` grade 字符串处理

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.3.1 | 定位 `SaveQuestionsStep.js` 文件 | `test -f /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js` |
| 3.3.2 | 在保存题目时确保 `grade` 为字符串 | `grep -n "grade.*String\|String(.*grade" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js \| grep -c "String.*grade\|grade.*String" \| grep -v "0"` 或新增后 `grep -c "1"` |
| 3.3.3 | 对 `extended_assessment` 类型特殊处理 | `grep -n "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js \| grep -c "extended_assessment" \| grep -v "0"` |
| 3.3.4 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js 2>&1` |

### 3.4 修改 `processTask` 返回值

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.4.1 | 定位 `processTask` 函数 | `grep -n "async function processTask" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "async function processTask" \| grep -v "0"` |
| 3.4.2 | 添加 `task.type === 'extended_assessment'` 成功返回分支 | `grep -A 100 "async function processTask" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "extended_assessment.*question_ids\|success.*true.*question_ids" \| grep -v "0"` |
| 3.4.3 | 确保 extended 不依赖 `assessment_id` | `grep -A 120 "async function processTask" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js \| grep -c "extended_assessment.*!assessment_id\|assessment_id.*undefined" \| grep -v "0"` |
| 3.4.4 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js 2>&1` |

### 3.5 修改 extended 生成失败 fallback

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.5.1 | 定位 `GenerateStep.js` 或 AI 生成失败处理 | `find /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator -name "*GenerateStep*" -o -name "*Generate*" \| xargs grep -l "generateDefaultQuestions" 2>/dev/null` |
| 3.5.2 | 在 AI 失败处理中添加 `type === 'extended_assessment'` 判断 | `grep -n "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/GenerateStep.js 2>/dev/null \| grep -c "extended_assessment" \| grep -v "0"` |
| 3.5.3 | extended 分支禁止调用 `generateDefaultQuestions` | `grep -A 20 "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/GenerateStep.js 2>/dev/null \| grep -c "!generateDefaultQuestions\|skip.*default\|禁止.*默认" \| grep -v "0"` |
| 3.5.4 | extended 分支同年级题池仍不足时返回失败 | `grep -A 30 "extended_assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/GenerateStep.js 2>/dev/null \| grep -c "题池不足\|pool.*empty\|同年级.*不足" \| grep -v "0"` |
| 3.5.5 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/GenerateStep.js 2>&1` 2>/dev/null |

### 3.6 实现 temp_task_id 清理逻辑

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.6.1 | 在 `SaveQuestionsStep` 添加 `temp_task_id` 标记 | `grep -n "temp_task_id" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js \| grep -c "temp_task_id.*task\._id" \| grep -v "0"` |
| 3.6.2 | 在 `SaveQuestionsStep` 失败时清理临时题 | `grep -A 50 "temp_task_id" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js \| grep -c "catch.*remove.*temp_task_id\|失败.*清理" \| grep -v "0"` |
| 3.6.3 | 在 `CompleteStep` 失败时二次清理 | `grep -n "temp_task_id" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js \| grep -c "temp_task_id.*remove\|清理.*temp" \| grep -v "0"` |
| 3.6.4 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js 2>&1 && node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js 2>&1` |

---

## Phase 4: 前端 queued 状态与轮询

**目标**: 让 `assessment-depth` 页面支持 queued 状态，轮询队列状态并重新启动。

### 4.1 添加前端常量与 data 字段

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.1.1 | 在 `assessment-depth.js` 添加 `QUEUE_POLL_MAX_ATTEMPTS` 和 `QUEUE_POLL_INTERVAL_MS` | `grep -n "QUEUE_POLL_MAX_ATTEMPTS\|QUEUE_POLL_INTERVAL_MS" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "const.*45\|const.*2000" \| grep -v "0"` |
| 4.1.2 | 在 `data` 中添加 `queueId/queuePollTimer/queuePollAttempts/queueMessage/queueRetryTimer/hasRetriedAfterQueue/errorMessage` | `grep -A 30 "data:" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "queueId\|queuePollTimer\|queuePollAttempts\|queueMessage\|queueRetryTimer\|hasRetriedAfterQueue\|errorMessage" \| grep -v "0"` |
| 4.1.3 | 在 status 常量中添加 `queued` | `grep -n "'queued'\|\"queued\"" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "queued" \| grep -v "0"` |
| 4.1.4 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js 2>&1` |

### 4.2 修改 `startExtendedAssessment` 响应处理

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.2.1 | 添加 `after_queue_id` 参数传递（首次为空） | `grep -A 10 "startExtendedAssessment.*function" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "after_queue_id\|params.*after" \| grep -v "0"` |
| 4.2.2 | 实现先处理 `status === 'queued'` 分支 | `grep -A 30 "startExtendedAssessment.*result" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "data\.status.*queued\|status.*===.*'queued'" \| grep -v "0"` |
| 4.2.3 | queued 时设置 `status:'queued'` 和 `queueId` | `grep -A 40 "status.*===.*'queued'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "setData.*status.*queued\|setData.*queueId" \| grep -v "0"` |
| 4.2.4 | queued 时调用 `startQueuePolling` | `grep -A 50 "status.*===.*'queued'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "startQueuePolling" \| grep -v "0"` |
| 4.2.5 | ready 需要 `session_id` 和非空 `questions` | `grep -A 60 "data\.success" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "session_id.*questions.*length.*>" \| grep -v "0"` |
| 4.2.6 | 实现 `INSUFFICIENT_QUESTIONS_AFTER_GENERATION` 错误展示 | `grep -A 70 "data\.success" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "INSUFFICIENT_QUESTIONS_AFTER_GENERATION\|errorMessage\|showError" \| grep -v "0"` |
| 4.2.7 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js 2>&1` |

### 4.3 实现 `startQueuePolling` 轮询函数

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.3.1 | 创建 `startQueuePolling(queueId)` 函数 | `grep -n "startQueuePolling" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "function startQueuePolling" \| grep -v "0"` |
| 4.3.2 | 入口调用 `stopQueuePolling()` 避免重复 timer | `grep -A 5 "function startQueuePolling" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "stopQueuePolling" \| grep -v "0"` |
| 4.3.3 | 实现间隔 2 秒的轮询 | `grep -A 20 "function startQueuePolling" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "setInterval.*2000\|QUEUE_POLL_INTERVAL" \| grep -v "0"` |
| 4.3.4 | 实现最大次数 45 次 | `grep -A 30 "function startQueuePolling" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "QUEUE_POLL_MAX_ATTEMPTS\|queuePollAttempts.*>=.*45" \| grep -v "0"` |
| 4.3.5 | 调用 `checkQueueStatus` API | `grep -A 40 "function startQueuePolling" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "checkQueueStatus\|callFunction.*checkQueueStatus" \| grep -v "0"` |
| 4.3.6 | 读取 `result.result.data.status` | `grep -A 50 "checkQueueStatus" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "result\.result\.data\.status\|payload\.data\.status" \| grep -v "0"` |
| 4.3.7 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js 2>&1` |

### 4.4 实现队列状态处理逻辑

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.4.1 | `pending/processing` 继续轮询 | `grep -A 70 "checkQueueStatus" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "pending.*processing\|continue.*polling" \| grep -v "0"` |
| 4.4.2 | **H7修复**: `completed` 时检查 `question_ids` 是否为空数组 | `grep -A 80 "checkQueueStatus" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "completed.*question_ids\|question_ids.*length.*0\|question_ids.*empty" \| grep -v "0"` |
| 4.4.3 | **H7修复**: `completed` 但 `question_ids` 为空时进入 error 状态 | `grep -A 90 "completed.*question_ids" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "length.*===.*0.*error\|isEmpty.*showError" \| grep -v "0"` |
| 4.4.4 | `completed` 且有 `question_ids` 时停止轮询并检查 `hasRetriedAfterQueue` | `grep -A 80 "checkQueueStatus" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "completed.*stopQueuePolling\|status.*===.*'completed'" \| grep -v "0"` |
| 4.4.5 | 首次 completed 时设置 `hasRetriedAfterQueue:true` 并延迟 500ms 重启 | `grep -A 90 "status.*===.*'completed'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "hasRetriedAfterQueue.*true\|queueRetryTimer.*setTimeout.*500" \| grep -v "0"` |
| 4.4.6 | 延迟重启时调用 `startExtendedAssessment({ after_queue_id })` | `grep -A 100 "hasRetriedAfterQueue" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "after_queue_id.*queueId\|startExtendedAssessment.*after_queue_id" \| grep -v "0"` |
| 4.4.7 | **H6修复**: `failed/cancelled` 停止轮询进入 error | `grep -A 110 "checkQueueStatus" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "failed\|cancelled\|stopQueuePolling.*error" \| grep -v "0"` |
| 4.4.8 | **H6修复**: `failed` 时显示错误消息（从队列 error 字段读取） | `grep -A 120 "status.*===.*'failed'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "errorMessage.*queue\.error\|error.*message" \| grep -v "0"` |
| 4.4.9 | **H6修复**: `failed` 时允许用户重试 | `grep -A 130 "status.*===.*'failed'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "showRetry.*canRetry\|errorMessage.*重试" \| grep -v "0"` |
| 4.4.10 | **H8修复**: timeout 停止轮询进入 error 并允许重试 | `grep -A 120 "checkQueueStatus" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "timeout\|QUEUE_POLL_MAX_ATTEMPTS.*error" \| grep -v "0"` |
| 4.4.11 | **H8修复**: timeout 时显示超时错误消息 | `grep -A 130 "queuePollAttempts.*>=.*QUEUE_POLL_MAX" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "超时\|timeout.*error\|生成超时" \| grep -v "0"` |
| 4.4.12 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js 2>&1` |

### 4.4.H6-H8 验收标准: 异常状态 fallback 路径

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.4.H6.1 | **H6验收**: 验证 failed 状态处理 | `grep -A 20 "status.*===.*'failed'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "stopQueuePolling\|showError\|errorMessage" \| grep -v "0"` |
| 4.4.H7.1 | **H7验收**: 验证 completed 但无 question_ids 处理 | `grep -A 30 "completed.*question_ids" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "length.*===.*0\|!.*length\|isEmpty" \| grep -v "0"` |
| 4.4.H8.1 | **H8验收**: 验证超时 fallback 路径 | `grep -A 40 "QUEUE_POLL_MAX_ATTEMPTS" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "超时.*error\|timeout.*retry" \| grep -v "0"` |

### 4.5 实现 `stopQueuePolling` 清理函数

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.5.1 | 创建 `stopQueuePolling()` 函数 | `grep -n "stopQueuePolling" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "function stopQueuePolling" \| grep -v "0"` |
| 4.5.2 | 同时清理 `queuePollTimer` 和 `queueRetryTimer` | `grep -A 15 "function stopQueuePolling" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "clearInterval.*queuePollTimer\|clearTimeout.*queueRetryTimer\|timer.*null" \| grep -v "0"` |
| 4.5.3 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js 2>&1` |

### 4.6 修改页面生命周期与重试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.6.1 | 在 `onUnload` 中调用 `stopQueuePolling` | `grep -A 10 "onUnload" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "stopQueuePolling" \| grep -v "0"` |
| 4.6.2 | 在进入 `error` 状态时调用 `stopQueuePolling` | `grep -B 5 -A 10 "status.*error\|showError" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "stopQueuePolling" \| grep -v "0"` |
| 4.6.3 | 在进入 `ready` 状态时调用 `stopQueuePolling` | `grep -B 5 -A 10 "status.*ready" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "stopQueuePolling" \| grep -v "0"` |
| 4.6.4 | 实现 `onRetry` 清理逻辑 | `grep -n "onRetry" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "function onRetry\|onRetry:" \| grep -v "0"` |
| 4.6.5 | `onRetry` 清空 `queueId/queueMessage/queuePollAttempts` | `grep -A 20 "function onRetry" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "queueId.*null\|queueMessage.*''\|queuePollAttempts.*0" \| grep -v "0"` |
| 4.6.6 | `onRetry` 重置 `hasRetriedAfterQueue:false` | `grep -A 30 "function onRetry" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "hasRetriedAfterQueue.*false" \| grep -v "0"` |
| 4.6.7 | `onRetry` 清空旧 answers/questions/sessionId | `grep -A 40 "function onRetry" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "answers.*\[\]\|questions.*\[\]\|sessionId.*''" \| grep -v "0"` |
| 4.6.8 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js 2>&1` |

### 4.7 修改 WXML 渲染 queued 状态

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.7.1 | 在 `assessment-depth.wxml` 中添加 `queued` 状态分支 | `grep -n "queued" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxml \| grep -c "wx:if.*queued\|status.*==.*'queued'" \| grep -v "0"` |
| 4.7.2 | 显示 queued 文案："正在为你生成深度测评题目..." | `grep -A 5 "status.*==.*'queued'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxml \| grep -c "正在生成\|题目生成中" \| grep -v "0"` |
| 4.7.3 | 显示预计时间文案："预计需要 10-30 秒" | `grep -A 10 "status.*==.*'queued'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxml \| grep -c "10-30.*秒\|预计需要" \| grep -v "0"` |
| 4.7.4 | 显示 `queueMessage` 动态消息 | `grep -A 15 "status.*==.*'queued'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxml \| grep -c "{{queueMessage}}" \| grep -v "0"` |
| 4.7.5 | 使用现有 loading spinner 或 queued 专用 class | `grep -A 20 "status.*==.*'queued'" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxml \| grep -c "loading\|queued-state" \| grep -v "0"` |
| 4.7.6 | WXML 语法检查 | `node -e "const fs=require('fs'); const wxml=fs.readFileSync('/Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxml','utf8'); console.log('WXML_LEN:',wxml.length)" 2>&1` |

### 4.8 修改 WXSS 样式

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.8.1 | 在 `assessment-depth.wxss` 中添加 queued 状态样式 | `grep -n "queued" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxss \| grep -c "\.queued" \| grep -v "0"` |
| 4.8.2 | 添加 `.queued-state` 样式 | `test -f /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxss && grep -c "\.queued-state" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxss \| grep -v "0"` |
| 4.8.3 | 添加 `.queued-title` 样式 | `grep -c "\.queued-title" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxss \| grep -v "0"` |
| 4.8.4 | 添加 `.queued-message` 样式 | `grep -c "\.queued-message" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxss \| grep -v "0"` |
| 4.8.5 | WXSS 语法检查 | `test -f /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxss && echo "WXSS_EXISTS"` |

### 4.9 实现 `parseQuestionOptions` helper

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.9.1 | 在 `assessment-depth.js` 中创建 `parseQuestionOptions` 函数 | `grep -n "parseQuestionOptions" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "function parseQuestionOptions" \| grep -v "0"` |
| 4.9.2 | 实现字符串数组到 `{key, value}[]` 转换 | `grep -A 30 "function parseQuestionOptions" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "key.*A.*B.*C.*D\|map.*opt" \| grep -v "0"` |
| 4.9.3 | 在 `startExtendedAssessment` 返回时调用解析 options | `grep -A 150 "startExtendedAssessment.*result" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "parseQuestionOptions\|parsedOptions" \| grep -v "0"` |
| 4.9.4 | 在 `getNextQuestion` 返回时调用解析 options | `grep -A 50 "getNextQuestion" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js \| grep -c "parseQuestionOptions\|parsedOptions" \| grep -v "0"` |
| 4.9.5 | 语法检查 | `node -c /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js 2>&1` |

---

## Phase 5: 测试与验证

**目标**: 编写并运行单元测试，确保功能正确且不破坏现有功能。

### 5.1 后端单元测试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 5.1.1 | 创建/更新 `__tests__/extended-assessment.test.js` | `test -f /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js && echo "TEST_FILE_EXISTS"` |
| 5.1.2 | 添加 `verified:true` ≥ 5 道直接 ready 测试 | `grep -n "verified.*true.*>=.*5\|ready.*verified" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.3 | 添加 `verified:true` 不足但 `verified:false` 补足测试 | `grep -n "verified.*false.*fallback" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.4 | 添加 subject alias 补足测试 | `grep -n "alias.*数学\|subject.*alias" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.5 | 添加 `excludeIds` 生效测试 | `grep -n "excludeIds" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.6 | 添加题池不足返回 queued 测试 | `grep -n "queued\|question_queue" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.7 | 添加 `after_queue_id` 防止无限排队测试 | `grep -n "after_queue_id\|INSUFFICIENT_QUESTIONS_AFTER_GENERATION" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.8 | 添加防重复队列测试 | `grep -n "duplicate.*queue\|reuse.*queue" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.9 | 添加 `getNextQuestion` 幂等测试 | `grep -n "幂等\|outstanding\|duplicate.*question" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.10 | 添加 `submitAnswers` 按 question_id 判分测试 | `grep -n "question_id.*correct_answer\|questionMap" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.11 | 添加 fallback ready 后提交可判分测试 | `grep -n "fallback.*submit.*score\|correct_answer.*reserved" /Users/seanxx/score-boost-mini/__tests__/extended-assessment.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.1.12 | 运行测试 | `cd /Users/seanxx/score-boost-mini && npm test -- __tests__/extended-assessment.test.js --runInBand 2>&1 \| tail -20` |
| 5.1.13 | 验证测试通过 | `cd /Users/seanxx/score-boost-mini && npm test -- __tests__/extended-assessment.test.js --runInBand 2>&1 \| grep -c "PASS\|Tests passed" \| grep -v "0"` |

### 5.2 questionGenerator 测试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 5.2.1 | 创建/更新 `cloudfunctions/questionGenerator/__tests__/extended.test.js` | `test -f /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/__tests__/extended.test.js && echo "TEST_FILE_EXISTS"` |
| 5.2.2 | 添加 `type:'extended_assessment'` 跳过 `CreateAssessmentStep` 测试 | `grep -n "extended_assessment.*CreateAssessmentStep\|skip.*assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/__tests__/extended.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.2.3 | 添加 `CompleteStep` 不创建 assessments 测试 | `grep -n "CompleteStep.*assessment.*null\|extended.*assessment" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/__tests__/extended.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.2.4 | 添加 `processTask` 返回 question_ids 测试 | `grep -n "processTask.*question_ids\|success.*question_ids" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/__tests__/extended.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.2.5 | 添加 extended 队列失败不保存默认题测试 | `grep -n "default.*question\|generateDefaultQuestions.*extended" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/__tests__/extended.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.2.6 | 添加 temp_task_id 清理测试 | `grep -n "temp_task_id.*clean\|remove.*temp" /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/__tests__/extended.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.2.7 | 运行测试 | `cd /Users/seanxx/score-boost-mini && npm test -- cloudfunctions/questionGenerator --runInBand 2>&1 \| tail -20` |
| 5.2.8 | 验证测试通过 | `cd /Users/seanxx/score-boost-mini && npm test -- cloudfunctions/questionGenerator --runInBand 2>&1 \| grep -c "PASS\|Tests passed" \| grep -v "0"` |

### 5.3 前端单元测试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 5.3.1 | 创建/更新 `pages/assessment-depth/__tests__/assessment-depth.test.js` | `test -f /Users/seanxx/score-boost-mini/pages/assessment-depth/__tests__/assessment-depth.test.js && echo "TEST_FILE_EXISTS"` |
| 5.3.2 | 添加 queued 状态设置测试 | `grep -n "status.*queued\|queueId" /Users/seanxx/score-boost-mini/pages/assessment-depth/__tests__/assessment-depth.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.3.3 | 添加轮询读取 `result.result.data.status` 测试 | `grep -n "result\.result\.data\.status\|checkQueueStatus.*mock" /Users/seanxx/score-boost-mini/pages/assessment-depth/__tests__/assessment-depth.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.3.4 | 添加 completed 后重试测试 | `grep -n "completed.*retry\|after_queue_id" /Users/seanxx/score-boost-mini/pages/assessment-depth/__tests__/assessment-depth.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.3.5 | 添加 timer 清理测试 | `grep -n "stopQueuePolling\|clearInterval.*queuePollTimer" /Users/seanxx/score-boost-mini/pages/assessment-depth/__tests__/assessment-depth.test.js \| grep -c "it.*test\|describe.*test" \| grep -v "0"` |
| 5.3.6 | 运行测试 | `cd /Users/seanxx/score-boost-mini && npm test -- pages/assessment-depth --runInBand 2>&1 \| tail -20` |
| 5.3.7 | 验证测试通过 | `cd /Users/seanxx/score-boost-mini && npm test -- pages/assessment-depth --runInBand 2>&1 \| grep -c "PASS\|Tests passed" \| grep -v "0"` |

### 5.4 回归测试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 5.4.1 | 运行普通测评测试 | `cd /Users/seanxx/score-boost-mini && npm test -- __tests__/extended-assessment.test.js --runInBand 2>&1 \| grep -c "PASS" \| grep -v "0"` |
| 5.4.2 | 运行队列 API 测试 | `cd /Users/seanxx/score-boost-mini && npm test -- utils/__tests__/cloudApi-queue.test.js --runInBand 2>&1 \| grep -c "PASS" \| grep -v "0"` |
| 5.4.3 | 运行结果页测试 | `cd /Users/seanxx/score-boost-mini && npm test -- pages/result/__tests__/result.test.js --runInBand 2>&1 \| grep -c "PASS" \| grep -v "0"` |
| 5.4.4 | 运行 checkQueueStatus 测试 | `cd /Users/seanxx/score-boost-mini && npm test -- cloudfunctions/checkQueueStatus --runInBand 2>&1 \| grep -c "PASS" \| grep -v "0"` |

### 5.5 语法验证

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 5.5.1 | extendedAssessment 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/index.js 2>&1` |
| 5.5.2 | questionGenerator 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js 2>&1` |
| 5.5.3 | SaveQuestionsStep 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js 2>&1` |
| 5.5.4 | CompleteStep 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js 2>&1` |
| 5.5.5 | assessment-depth 语法检查 | `node -c /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.js 2>&1` |
| 5.5.6 | checkQueueStatus 语法检查 | `node -c /Users/seanxx/score-boost-mini/cloudfunctions/checkQueueStatus/index.js 2>&1` |

---

## Phase 6: 部署与回归验证

**目标**: 部署到云端并验证端到端功能。

### 6.1 本地构建验证

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 6.1.1 | 验证所有云函数目录存在 | `test -d /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment && test -d /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator && test -d /Users/seanxx/score-boost-mini/cloudfunctions/checkQueueStatus && echo "ALL_EXISTS"` |
| 6.1.2 | 验证数据副本文件完整 | `find /Users/seanxx/score-boost-mini/cloudfunctions/extendedAssessment/data -maxdepth 1 -type f -name '*.json' \| wc -l \| grep -E '^([1-9][0-9]{2,}|[1-9][0-9]{2,})'` |
| 6.1.3 | 运行全量测试 | `cd /Users/seanxx/score-boost-mini && npm test 2>&1 \| grep -c "PASS\|Tests passed" \| grep -v "0"` |

### 6.2 部署 extendedAssessment 云函数

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 6.2.1 | 部署 extendedAssessment 云函数 | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-7gg9y9tjb2b867b6 --paths cloudfunctions/extendedAssessment 2>&1 \| grep -c "部署成功\|upload.*success" \| grep -v "0"` |
| 6.2.2 | 验证 extendedAssessment 函数详情 | `tcb fn detail extendedAssessment --env cloud1-7gg9y9tjb2b867b6 2>&1 \| grep -c "状态.*Active\|State.*Running" \| grep -v "0"` |
| 6.2.3 | 验证 data 目录已打包（通过函数代码大小判断） | `tcb fn detail extendedAssessment --env cloud1-7gg9y9tjb2b867b6 2>&1 \| grep -E "CodeSize|代码大小" \| grep -E "([5-9][0-9]{4,}|[1-9][0-9]{5,})"` |

### 6.3 部署 questionGenerator 云函数

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 6.3.1 | 部署 questionGenerator 云函数 | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-7gg9y9tjb2b867b6 --paths cloudfunctions/questionGenerator 2>&1 \| grep -c "部署成功\|upload.*success" \| grep -v "0"` |
| 6.3.2 | 验证 questionGenerator 函数详情 | `tcb fn detail questionGenerator --env cloud1-7gg9y9tjb2b867b6 2>&1 \| grep -c "状态.*Active\|State.*Running" \| grep -v "0"` |
| 6.3.3 | 验证定时触发器存在 | `tcb fn detail questionGenerator --env cloud1-7gg9y9tjb2b867b6 2>&1 \| grep -c "触发器\|Trigger" \| grep -v "0"` |

### 6.4 前端上传

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 6.4.1 | 上传前端代码（通过微信开发者工具） | `echo "手动通过微信开发者工具上传前端代码" && echo "验证: pages/assessment-depth/assessment-depth.wxml 中包含 queued 分支" && grep -c "queued" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxml \| grep -v "0"` |
| 6.4.2 | 验证 WXML 包含 queued 分支 | `grep -n "queued" /Users/seanxx/score-boost-mini/pages/assessment-depth/assessment-depth.wxml \| grep -c "wx:if.*queued\|status.*==.*'queued'" \| grep -v "0"` |

### 6.5 端到端验收测试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 6.5.1 | 云端只读验证题池数据 | `tcb db nosql execute --json --command '[{"TableName":"ai_question_pool","CommandType":"COMMAND","Command":"{\"count\":\"ai_question_pool\",\"query\":{\"grade\":\"2\",\"subject\":\"math\"}}"}]' 2>&1 \| grep -c "payload\|data" \| grep -v "0"` |
| 6.5.2 | **E2E-1**: 二年级数学有题时深度测评可启动 | `echo "手动测试: 二年级数学 → 深度测评 → 不再返回'暂无可用题目'"` |
| 6.5.3 | **E2E-2**: 题池不足时返回 queued | `echo "手动测试: 构造题池不足组合 → startExtendedAssessment 返回 status:'queued' + queue_id"` |
| 6.5.4 | **E2E-3**: 队列写入正确字段 | `echo "手动验证: question_queue 中存在 type:'extended_assessment' 且 grade 为字符串、subject 为英文"` |
| 6.5.5 | **E2E-4**: 队列从 pending 到 completed | `echo "手动测试: 轮询 checkQueueStatus → pending → processing → completed"` |
| 6.5.6 | **E2E-5**: completed 后重新 start 返回 ready | `echo "手动测试: completed 后调用 startExtendedAssessment(after_queue_id) → 返回 session_id + 5道题"` |
| 6.5.7 | **E2E-6**: 队列完成后不创建普通 assessments | `echo "手动验证: extended queue completed 时没有创建/更新普通 assessments 集合"` |
| 6.5.8 | **E2E-7**: fallback ready 后提交可判分 | `echo "手动测试: fallback ready 后提交 5 题 → 正常判分 → 服务端 session 保留 correct_answer"` |
| 6.5.9 | **E2E-8**: `getNextQuestion` 不泄露答案 | `echo "手动测试: getNextQuestion 返回题目 → 客户端不含 correct_answer → DB 中 phase2.questions 含完整题目"` |
| 6.5.10 | **E2E-9**: phase2 幂等性 | `echo "手动测试: 未答 phase2 题存在时重复调用 getNextQuestion → 返回同一题 → 不追加新题"` |

---

## 附录 A: 关键验收标准汇总

### G1 深度测评可启动
- ✅ 二年级数学存在题时，`startExtendedAssessment` 不再返回 `INSUFFICIENT_QUESTIONS`
- ✅ `fetchQuestionsWithFallback` 查询 `verified:true/false/exists(false)` 和 subject alias
- ✅ 所有查询限定同年级 `grade:String(grade)`

### G2 题池不足可等待生成
- ✅ 题池不足 5 道时返回 `status:'queued'` + `queue_id` + `message`
- ✅ 创建 `question_queue` 记录，`type:'extended_assessment'`，`source:'extendedAssessment'`
- ✅ 前端轮询 `checkQueueStatus`，间隔 2 秒，最大 45 次
- ✅ completed 后调用 `startExtendedAssessment({ after_queue_id })` 重试

### G3 保持题目质量边界
- ✅ 不跨年级兜底，所有题池查询限定同年级
- ✅ 不批量修改 `verified` 字段
- ✅ `buildExtendedQuestionPlan` 只使用同年级知识点
- ✅ extended queue 不调用 `generateDefaultQuestions`

### G4 不破坏现有普通测评
- ✅ `type:'extended_assessment'` 跳过 `CreateAssessmentStep`
- ✅ `CompleteStep` 对 extended 不更新/创建 `assessments`
- ✅ `processTask` 对 extended 不依赖 `assessment_id`
- ✅ 普通测评 `startAssessment` 行为不变

---

## 附录 B: 风险与回滚

### 风险点
1. **数据副本不完整**: `extendedAssessment/data/` 文件缺失或损坏 → 队列创建失败
2. **subject alias 不匹配**: 题池 `subject` 字段值与 alias 集合不一致 → 查询遗漏
3. **队列 stuck/不可清理**: pending/processing 队列无限期占用 → 用户无法重新排队
4. **前端 timer 泄漏**: `queuePollTimer` 或 `queueRetryTimer` 未清理 → 卸载后继续调用云函数
5. **session 题目脱敏**: 客户端题目泄露 `correct_answer` → 作弊风险
6. **questionGenerator fallback**: extended 队列保存高年级默认题 → 数据污染

### 回滚策略
- 回滚 `extendedAssessment`: 恢复题池无 `verified:true` 时报无题
- 回滚 `questionGenerator`: `extended_assessment` 队列会创建普通 assessment
- 回滚前端: queued 响应会被旧页面误当 ready
- **建议**: 回滚前先处理 active extended queues（等待完成或标记 cancelled/failed）

---

## 附录 C: 依赖分析

### 上游依赖
- `ai_question_pool` 数据形态（verified、subject、grade）
- `startAssessment/data/` 知识点文件
- `questionGenerator` 现有工作流
- `checkQueueStatus` 响应结构

### 下游影响
- `startExtendedAssessment` 响应新增 `status:'queued'`
- `getNextQuestion` 使用 fallback 查询
- `submitAnswers` 按 `question_id` 判分
- 前端 `assessment-depth` 新增 queued 状态

### 必须确认的字段契约
- `question_queue.type: 'extended_assessment'`
- `question_queue.source: 'extendedAssessment'`
- `question_queue.grade: String(grade)`
- `question_queue.subject: canonical English`
- `question_queue.semester: 'up' | 'down'`
- `question_queue.question_plan: 非空同年级数组`
- `question_queue.target_kps: 非空同年级数组`
- `extended_sessions.phase*.questions: 保留 correct_answer`
- 客户端响应题目: 移除 correct_answer

---

**实施计划版本**: v1.1
**最后更新**: 2026-06-15
**状态**: 已修复Swarm审查9个HIGH问题，待执行

---

## 修复记录 v1.1 (2026-06-15)

### 修复的9个HIGH问题

| ID | 问题 | 修复位置 | 修复内容 |
|----|------|----------|----------|
| H1 | difficulty_distribution 5题精确分配验收缺失 | Phase 2.3 | 新增 2.3.5 精确难度分配，新增 2.3.H1 验收标准 |
| H2 | 最终可用题数校验验收缺失 | Phase 3.2 | 新增 3.2.4 查询题池可用题数，新增 3.2.6 去重题数校验 |
| H3 | question_ids 写回去重集合验收缺失 | Phase 3.2 | 新增 3.2.5 去重集合写回逻辑，新增 3.2.H3 验收标准 |
| H4 | after_queue_id 校验逻辑不完整 | Phase 2.6 | 拆分为 2.6.4-2.6.7 六要素校验，新增 2.6.H4 验收标准 |
| H5 | 队列状态机未明确定义 | Phase 3.2 | 新增 3.2.H5 状态转换条件（pending→processing→completed/failed） |
| H6 | failed 状态 fallback 路径缺失 | Phase 4.4 | 新增 4.4.7-4.4.9 failed 处理，新增 4.4.H6 验收标准 |
| H7 | completed 但无 question_ids 异常处理缺失 | Phase 4.4 | 新增 4.4.2-4.4.3 空数组检查，新增 4.4.H7 验收标准 |
| H8 | 轮询超时 fallback 路径不清晰 | Phase 4.4 | 新增 4.4.10-4.4.11 超时处理，新增 4.4.H8 验收标准 |
| H9 | questionGenerator 向后兼容性风险 | Phase 3 | 新增 3.H9 向后兼容性保障，新增 3.H9 验收标准 |

### 修复验收标准

| 验收项 | v1.0 状态 | v1.1 状态 |
|--------|-----------|-----------|
| 目标遵从性 | ⚠️ 3处遗漏 | ✅ 0处遗漏 |
| 逻辑一致性 | ⚠️ 6个HIGH | ✅ 0个HIGH |
| 细节完整性 | ✅ 通过 | ✅ 保持 |
| 实施准确性 | ✅ 通过 | ✅ 保持 |
| 最小变更原则 | ⚠️ 存在简化空间 | ✅ 保持 |
| 依赖影响 | ⚠️ 2个HIGH | ✅ 已缓解 |
