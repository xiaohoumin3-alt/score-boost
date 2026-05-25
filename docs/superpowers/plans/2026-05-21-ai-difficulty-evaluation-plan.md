# AI难度评估系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用AI动态评估题目的实际难度等级，替代人工标记，实现准确、一致的难度判定。

**Architecture:** 独立的难度评估引擎（evaluator.js），集成到现有题库模块，支持三种补评触发方式。

**Tech Stack:** 微信云开发、Node.js、MiniMax API

---

## Phase 1: 核心模块

### Task 1: 创建 evaluator.js

**Files:**
- Create: `cloudfunctions/startAssessment/evaluator.js`

- [ ] **Step 1: 创建 evaluator.js 文件结构**

```javascript
/**
 * 题目难度评估引擎
 * 用AI动态评估题目的实际难度等级
 */

const { LlmClient } = require('../shared/llm-client');

const EVALUATOR_VERSION = 'v1';
const EVALUATION_TIMEOUT = 5000; // 5秒超时

// 评估提示词（从设计文档4.1节）
const EVALUATION_PROMPT = `...`; // 完整提示词见设计文档

/**
 * 评估单道题目难度
 * @param {Object} question - 题目对象
 * @returns {Promise<Object|null>} 评估结果，失败返回null
 */
async function evaluate(question) {
  // TODO: 实现
}

module.exports = {
  evaluate,
  evaluateIfNeeded,
  EVALUATOR_VERSION
};
```

- [ ] **Step 2: 实现 evaluate 函数**

```javascript
async function evaluate(question) {
  const llm = new LlmClient();
  const prompt = buildPrompt(question);

  try {
    const result = await llm.callWithTimeout(prompt, EVALUATION_TIMEOUT);

    // 解析JSON响应
    const evaluation = JSON.parse(result.content);

    return {
      level: evaluation.difficulty,
      score: evaluation.score,
      reasoning: evaluation.reasoning,
      dimensions: evaluation.dimensions,
      evaluated_at: new Date().toISOString(),
      evaluator_version: EVALUATOR_VERSION
    };
  } catch (error) {
    console.error('[evaluator] 评估失败:', error.message);
    return null;
  }
}
```

**Verification Gate:**
```bash
# 检查文件存在且包含关键函数
grep -n "async function evaluate" cloudfunctions/startAssessment/evaluator.js
# 期望: 找到 evaluate 函数定义
```

- [ ] **Step 3: 实现 buildPrompt 函数**

```javascript
function buildPrompt(question) {
  return `${EVALUATION_PROMPT}

=== 待评估题目 ===
题目内容: ${question.content}
选项:
${question.options.map((o, i) => `${String.fromCharCode(65+i)}. ${o}`).join('\n')}
正确答案: ${question.correct_answer}

请严格按照JSON格式输出评估结果。`;
}
```

**Verification Gate:**
```bash
grep -n "function buildPrompt" cloudfunctions/startAssessment/evaluator.js
# 期望: 找到 buildPrompt 函数定义
```

- [ ] **Step 4: 实现 evaluateIfNeeded 函数**

```javascript
async function evaluateIfNeeded(question) {
  // 已有评估结果，直接返回
  if (question.difficulty_ai) {
    return question.difficulty_ai;
  }

  // 调用评估
  return await evaluate(question);
}
```

**Verification Gate:**
```bash
grep -n "function evaluateIfNeeded" cloudfunctions/startAssessment/evaluator.js
# 期望: 找到 evaluateIfNeeded 函数定义
```

---

### Task 2: 集成到 question_bank.js

**Files:**
- Modify: `cloudfunctions/startAssessment/question_bank.js:1-20` (添加import)
- Modify: `cloudfunctions/startAssessment/question_bank.js:160-220` (修改generateQuestions)

- [ ] **Step 1: 添加 evaluator 导入**

在 question_bank.js 开头添加：
```javascript
const { evaluate, evaluateIfNeeded } = require('./evaluator');
```

**Verification Gate:**
```bash
grep -n "evaluator" cloudfunctions/startAssessment/question_bank.js
# 期望: 找到 evaluator 导入
```

- [ ] **Step 2: 修改 generateQuestions 函数，添加评估触发**

在 `generateQuestions` 函数中，获取题目后添加评估逻辑：
```javascript
// 从题库获取或生成题目
let q;
// ... 原有逻辑 ...

// 【新增】评估难度（如缺失）
if (!q.difficulty_ai) {
  const evaluation = await evaluateIfNeeded(q);
  if (evaluation) {
    q.difficulty_ai = evaluation;
    q.difficulty = evaluation.level;
    q.difficulty_score = evaluation.score;
    // 异步更新题库存储（不阻塞流程）
    backgroundUpdateQuestion(q);
  }
}
```

**Verification Gate:**
```bash
grep -n "evaluateIfNeeded" cloudfunctions/startAssessment/question_bank.js
# 期望: 找到 evaluateIfNeeded 调用
```

- [ ] **Step 3: 实现 backgroundUpdateQuestion 函数**

```javascript
async function backgroundUpdateQuestion(question) {
  // 异步更新题库中的题目难度标记
  // 不阻塞主流程
  setImmediate(async () => {
    try {
      const db = require('wx-server-sdk');
      db.init({});
      await db.collection('question_bank').where({ _id: question._id }).update({
        data: {
          difficulty: question.difficulty,
          difficulty_score: question.difficulty_score,
          difficulty_ai: question.difficulty_ai
        }
      });
    } catch (error) {
      console.error('[question_bank] 更新题目难度失败:', error.message);
    }
  });
}
```

**Verification Gate:**
```bash
grep -n "backgroundUpdateQuestion" cloudfunctions/startAssessment/question_bank.js
# 期望: 找到 backgroundUpdateQuestion 函数定义
```

- [ ] **Step 4: 部署并测试**

```bash
# 部署 startAssessment 云函数
cd cloudfunctions/startAssessment && tsc || echo "无TypeScript错误"

# 验证云函数部署成功
echo "部署完成，请在微信开发者工具中测试"
```

**Verification Gate:**
```bash
# 手动测试：在测评页面触发一次测评
# 检查日志中是否有 [evaluator] 评估相关日志
```

---

## Phase 2: 补评机制

### Task 3: 创建批量评估云函数

**Files:**
- Create: `cloudfunctions/batchEvaluate/index.js`

- [ ] **Step 1: 创建 batchEvaluate 云函数目录和入口文件**

```javascript
/**
 * 批量难度评估云函数
 * 支持手工触发批量评估
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { evaluate, EVALUATOR_VERSION } = require('../startAssessment/evaluator');

exports.main = async (event, context) => {
  const params = event.data || event;
  const kpId = params.kpId;       // 可选：按知识点筛选
  const limit = params.limit || 100; // 每批处理数量

  const db = cloud.database();

  // 构建查询条件
  const query = {};
  if (kpId) {
    query.kp_id = kpId;
  }

  // 查询待评估题目
  const pending = await db.collection('question_bank')
    .where({ difficulty_ai: _.exists(false) }) // difficulty_ai 不存在或为null
    .limit(limit)
    .get();

  console.log(`[batchEvaluate] 待评估题目: ${pending.data.length} 道`);

  // 批量处理
  let success = 0, failed = 0;
  for (const q of pending.data) {
    try {
      const evaluation = await evaluate(q);
      if (evaluation) {
        await db.collection('question_bank').where({ _id: q._id }).update({
          data: {
            difficulty: evaluation.level,
            difficulty_score: evaluation.score,
            difficulty_ai: evaluation
          }
        });
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`[batchEvaluate] 评估失败: ${q._id}`, error.message);
      failed++;
    }
  }

  return { success, failed, total: pending.data.length };
};
```

**Verification Gate:**
```bash
ls -la cloudfunctions/batchEvaluate/
# 期望: 存在 index.js
```

---

### Task 4: 配置定时任务

- [ ] **Step 1: 在 batchEvaluate 云函数配置定时触发**

在 `cloudfunctions/batchEvaluate/config.json` 中添加：
```json
{
  "permissions": {
    "openapi": []
  },
  "triggers": [
    {
      "name": "daily_evaluation",
      "type": "timer",
      "config": "0 3 * * *"
    }
  ]
}
```

**Verification Gate:**
```bash
grep -n "triggers" cloudfunctions/batchEvaluate/config.json
# 期望: 找到定时触发配置
```

---

## Phase 2.5: 启动时批量评估（可选）

### Task 2.5: 在 startAssessment 入口添加启动检查

**Files:**
- Modify: `cloudfunctions/startAssessment/index.js`

- [ ] **Step 1: 在 index.js 启动时检查待评估题目**

在 `exports.main` 函数开头添加：
```javascript
// 启动时检查并触发待评估题目补评
async function checkPendingEvaluations() {
  const db = cloud.database();
  const pending = await db.collection('question_bank')
    .where({ difficulty_ai: null })
    .limit(50)
    .get();

  if (pending.data.length > 0) {
    console.log(`[startAssessment] 启动时发现 ${pending.data.length} 道待评估题目`);
    // 异步触发评估，不阻塞启动
    for (const q of pending.data) {
      setImmediate(async () => {
        const { evaluate } = require('./evaluator');
        const evaluation = await evaluate(q);
        if (evaluation) {
          await db.collection('question_bank').where({ _id: q._id }).update({
            data: {
              difficulty: evaluation.level,
              difficulty_score: evaluation.score,
              difficulty_ai: evaluation
            }
          });
        }
      });
    }
  }
}

// 在主函数中调用（非阻塞）
checkPendingEvaluations().catch(e => console.warn('[startAssessment] 补评检查失败:', e.message));
```

**Verification Gate:**
```bash
grep -n "checkPendingEvaluations" cloudfunctions/startAssessment/index.js
# 期望: 找到函数定义和调用
```

---

## Phase 3: 验证优化

### Task 5: 批量评估历史题库

- [ ] **Step 1: 执行批量评估**

在微信开发者工具中：
1. 打开云开发控制台
2. 调用 batchEvaluate 云函数
3. 检查日志确认评估成功

**Verification Gate:**
```bash
# 抽样检查题库中的 difficulty_ai 字段
# 期望: 已有题目的 difficulty_ai 不为 null
```

### Task 6: 验证评估一致性

- [ ] **Step 1: 编写验证脚本**

```javascript
// 验证脚本：检查相同类型题目的评估结果是否一致
const questions = await db.collection('question_bank').get();
const byType = {};

questions.forEach(q => {
  // 按题目类型分组
  const type = extractQuestionType(q.content);
  if (!byType[type]) byType[type] = [];
  byType[type].push(q.difficulty_ai);
});

// 检查每组的一致性
for (const [type, evaluations] of Object.entries(byType)) {
  if (evaluations.length > 1) {
    const difficulties = evaluations.map(e => e?.level);
    const unique = [...new Set(difficulties)];
    console.log(`${type}: ${unique.length} 种难度 (${difficulties.join(', ')})`);
  }
}
```

**Verification Gate:**
```bash
# 人工验证：相同类型题目的评估结果应该一致
```

---

## 验收标准检查

| 验收指标 | 检查方法 | 状态 |
|----------|----------|------|
| 评估覆盖率 | 抽样检查题库，difficulty_ai 非空 | ⏳ 待验证 |
| 评估失败恢复 | 模拟API失败，验证返回null | ⏳ 待验证 |
| hard题目充足 | 统计各知识点hard题目数量 | ⏳ 待验证 |

---

## 风险与验证

| 风险 | 缓解措施 | 验证命令 |
|------|----------|----------|
| 评估API超时 | 设置5秒超时，失败返回null | 模拟超时测试 |
| 评估标准不一致 | 提示词完整，边界严格 | 抽检相同类型题目 |
| 题库更新冲突 | 异步更新，不阻塞主流程 | 检查日志无错误 |

---

## 实施顺序

1. Task 1: 创建 evaluator.js
2. Task 2: 集成到 question_bank.js
3. Task 3: 创建批量评估云函数
4. Task 4: 配置定时任务
5. Task 5: 批量评估历史题库
6. Task 6: 验证评估一致性
