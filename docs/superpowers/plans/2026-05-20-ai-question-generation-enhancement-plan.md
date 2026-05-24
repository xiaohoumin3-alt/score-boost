# AI题目生成系统增强 - 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现"润物细无声"的AI题目生成，随着使用量增长自动扩展题库

**Architecture:** 在现有generateAiQuestion云函数基础上增强prompt质量、添加RAG检索、支持多题型；在practice云函数中集成AI补足逻辑，实现题库不足时自动触发生成。

**Tech Stack:** Node.js, 微信云开发, MiniMax API, MongoDB

---

## 文件结构

```
cloudfunctions/
├── generateAiQuestion/
│   ├── index.js          # 主函数（修改）
│   ├── config.json       # 权限配置
│   └── package.json      # 依赖
├── practice/
│   ├── index.js          # 主函数（修改）
│   ├── question_bank.js   # 预置题库
│   └── knowledge_tree.js  # 知识树
└── shared/               # 新增共享模块
    ├── rag-service.js    # RAG检索服务
    └── question-types.js  # 题型定义
```

---

## Task 1: 优化Prompt（选项均衡约束）

**Files:**
- Modify: `cloudfunctions/generateAiQuestion/index.js:135-163`

**Context:** 当前prompt过于简单，选项长度可能不均衡。需要添加DeepTutor风格的选项均衡约束。

- [ ] **Step 1: 查看当前_buildPrompt方法**

```javascript
// 当前 _buildPrompt 方法在 index.js:135-163
_buildPrompt(params) {
  const { kp_name, difficulty, chapter } = params;
  // ... 当前prompt过于简单
}
```

- [ ] **Step 2: 用增强的prompt替换_buildPrompt**

```javascript
_buildPrompt(params) {
  const { kp_name, difficulty, chapter, question_type = 'choice', knowledge_context = '', exclude_questions = [] } = params;

  const difficultyText = {
    easy: '简单',
    medium: '中等',
    hard: '困难'
  }[difficulty] || '中等';

  const questionTypeText = {
    choice: '选择题',
    written: '简答题',
    coding: '编程题'
  }[question_type] || '选择题';

  let prompt = `请为以下知识点生成一道${difficultyText}难度的${questionTypeText}：

知识点：${kp_name}
章节：${chapter || '通用'}`;

  // RAG知识上下文注入
  if (knowledge_context) {
    prompt += `\n\n知识上下文：\n${knowledge_context}`;
  }

  // 防重复：已生成的相似题目
  if (exclude_questions && exclude_questions.length > 0) {
    prompt += `\n\n已生成的相似题目（请避免生成相同或高度相似的）：\n`;
    exclude_questions.forEach((q, i) => {
      prompt += `${i + 1}. ${q}\n`;
    });
  }

  // 题型特定要求
  if (question_type === 'choice') {
    prompt += `\n\n要求：
1. 必须提供恰好 4 个选项且仅 1 个正确答案
2. **选项长度均衡**：所有选项长度应大致相同，不要让正确选项明显比干扰项更长或更详细
3. 所有选项应具有合理的迷惑性，风格和长度相近，避免考生通过选项长度猜出答案
4. 提供详细解析`;
  } else if (question_type === 'written') {
    prompt += `\n\n要求：
1. 不要提供选项
2. 作答方式应为简答、解释或分析
3. 给出清晰解释`;
  } else if (question_type === 'coding') {
    prompt += `\n\n要求：
1. 不要提供选项
2. 作答方式应为编写代码、伪代码或算法步骤
3. 给出清晰解释`;
  }

  // JSON格式要求
  prompt += `\n\n**严格返回纯JSON格式，不要任何其他文字**`;

  if (question_type === 'choice') {
    prompt += `\n\nJSON格式：
{
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "correct_answer": 0,
  "explanation": "解析内容"
}`;
  } else if (question_type === 'written') {
    prompt += `\n\nJSON格式：
{
  "question": "题目内容",
  "sample_answer": "参考答案",
  "explanation": "解析内容"
}`;
  } else if (question_type === 'coding') {
    prompt += `\n\nJSON格式：
{
  "question": "题目内容",
  "expected_code": "期望代码或算法步骤",
  "explanation": "解析内容"
}`;
  }

  return prompt;
}
```

- [ ] **Step 3: 部署测试**

Run: `tcb fn deploy generateAiQuestion --env-id cloud1-7gg9y9tjb2b867b6 --force 2>&1`
Expected: `✔ [generateAiQuestion] 云函数部署成功！`

- [ ] **Step 4: 调用测试验证**

Run: `tcb fn invoke generateAiQuestion --env-id cloud1-7gg9y9tjb2b867b6 --params '{"kp_name":"因式分解","difficulty":"medium"}' 2>&1`
Expected: 返回选择题，4个选项长度均衡

---

## Task 2: 防重复机制

**Files:**
- Modify: `cloudfunctions/generateAiQuestion/index.js` (在exports.main中添加)

**Context:** 生成前查询ai_question_pool最近题目，传入LLM避免重复。

- [ ] **Step 1: 添加getExistingQuestions函数**

在 `parseLlmResponse` 函数前添加：

```javascript
/**
 * 获取知识点已有的题目（用于防重复）
 * @param {string} kp_id - 知识点ID
 * @param {number} limit - 最多返回条数
 * @returns {Promise<Array>} 已有题目列表
 */
async function getExistingQuestions(kp_id, limit = 10) {
  const database = getDb();
  if (!database) return [];

  try {
    const result = await database.collection('ai_question_pool')
      .where({ kp_id })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();

    return result.data.map(q => q.question || q.concentration || '');
  } catch (e) {
    console.log('[DEDUP] Failed to fetch existing questions:', e.message);
    return [];
  }
}
```

- [ ] **Step 2: 修改exports.main获取已有题目并传入**

找到 `console.log('[ENTRY] kp:', kp, 'difficulty:', difficulty);` 这一行，在其前添加：

```javascript
// 获取已有题目（用于防重复）
let existingQuestions = [];
if (kp.kp_id && kp.kp_id !== 'unknown') {
  existingQuestions = await getExistingQuestions(kp.kp_id, 10);
  console.log('[ENTRY] Existing questions for dedup:', existingQuestions.length);
}
```

- [ ] **Step 3: 修改generateQuestion调用，传入exclude_questions**

找到 `const question = await generateQuestion(kp, difficulty);` 替换为：

```javascript
const question = await generateQuestion(kp, difficulty, {
  exclude_questions: existingQuestions
});
```

- [ ] **Step 4: 修改generateQuestion函数签名支持exclude_questions**

修改 `async function generateQuestion(kp, difficulty, options = {})` 调用llm.generate时传入exclude_questions：

```javascript
const response = await llm.generate({
  kp_name: kp.kp_name,
  difficulty,
  chapter: kp.chapter,
  question_type: options.question_type || 'choice',
  knowledge_context: options.knowledge_context || '',
  exclude_questions: options.exclude_questions || []
});
```

- [ ] **Step 5: 部署测试**

Run: `tcb fn deploy generateAiQuestion --env-id cloud1-7gg9y9tjb2b867b6 --force 2>&1`
Expected: `✔ [generateAiQuestion] 云函数部署成功！`

- [ ] **Step 6: 验证防重复**

连续调用2次相同kp_id的题目，检查日志中 `Existing questions for dedup: X` 是否有值。

---

## Task 3: RAG知识检索

**Files:**
- Modify: `cloudfunctions/generateAiQuestion/index.js`
- Modify: `cloudfunctions/generateAiQuestion/config.json`

**Context:** 从knowledge_points集合获取knowledge_context，注入prompt。

- [ ] **Step 1: 添加getKnowledgeContext函数**

在 `getExistingQuestions` 函数后添加：

```javascript
/**
 * 获取知识点的上下文（用于RAG）
 * @param {string} kp_id - 知识点ID
 * @returns {Promise<Object>} { knowledge_context, related_concepts, typical_mistakes }
 */
async function getKnowledgeContext(kp_id) {
  const database = getDb();
  if (!database || !kp_id || kp_id === 'unknown') {
    return { knowledge_context: '', related_concepts: [], typical_mistakes: [] };
  }

  try {
    const result = await database.collection('knowledge_points')
      .where({ kp_id })
      .limit(1)
      .get();

    if (result.data && result.data.length > 0) {
      const kp = result.data[0];
      return {
        knowledge_context: kp.knowledge_context || '',
        related_concepts: kp.related_concepts || [],
        typical_mistakes: kp.typical_mistakes || []
      };
    }
  } catch (e) {
    console.log('[RAG] Failed to fetch kp context:', e.message);
  }

  return { knowledge_context: '', related_concepts: [], typical_mistakes: [] };
}
```

- [ ] **Step 2: 修改exports.main获取知识上下文**

找到 `// 获取已有题目（用于防重复）` 那一段，在其前添加：

```javascript
// 获取知识上下文（RAG）
const kc = await getKnowledgeContext(kp.kp_id);
console.log('[ENTRY] Knowledge context loaded, length:', kc.knowledge_context.length);
```

- [ ] **Step 3: 修改generateQuestion调用，传入knowledge_context**

替换 `const question = await generateQuestion(kp, difficulty, {...});` 为：

```javascript
const question = await generateQuestion(kp, difficulty, {
  question_type: event.data?.question_type || 'choice',
  knowledge_context: kc.knowledge_context,
  exclude_questions: existingQuestions
});
```

- [ ] **Step 4: 更新config.json添加knowledge_points读权限**

检查 `cloudfunctions/generateAiQuestion/config.json` 内容应为：

```json
{
  "permissions": {
    "cloudDb": {
      "COLLECTION": ["ai_question_pool", "knowledge_points"]
    }
  }
}
```

- [ ] **Step 5: 部署测试**

Run: `tcb fn deploy generateAiQuestion --env-id cloud1-7gg9y9tjb2b867b6 --force 2>&1`
Expected: `✔ [generateAiQuestion] 云函数部署成功！`

- [ ] **Step 6: 验证RAG检索**

调用测试，检查日志中是否出现 `[ENTRY] Knowledge context loaded, length: X`。

---

## Task 4: 扩展题型支持（written/coding）

**Files:**
- Modify: `cloudfunctions/generateAiQuestion/index.js`

**Context:** 支持choice/written/coding三种题型，validateQuestion和parseLlmResponse需要适配。

- [ ] **Step 1: 修改parseLlmResponse支持多种题型**

替换当前 `validateQuestion` 函数后的注释和逻辑，支持written/coding题型解析：

当前validateQuestion检查 `options` 字段。对于written/coding题型，options应为null或undefined。

修改 `validateQuestion` 函数：

```javascript
function validateQuestion(q, question_type = 'choice') {
  if (!q || typeof q !== 'object') {
    return false;
  }

  if (question_type === 'choice') {
    const required = ['question', 'options', 'correct_answer', 'explanation'];
    for (const field of required) {
      if (!(field in q)) {
        return false;
      }
    }
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      return false;
    }
    if (typeof q.correct_answer !== 'number' ||
        q.correct_answer < 0 ||
        q.correct_answer >= q.options.length) {
      return false;
    }
  } else if (question_type === 'written' || question_type === 'coding') {
    const required = ['question', 'explanation'];
    for (const field of required) {
      if (!(field in q)) {
        return false;
      }
    }
    // written需要sample_answer，coding需要expected_code
    if (question_type === 'written' && !q.sample_answer) {
      return false;
    }
    if (question_type === 'coding' && !q.expected_code) {
      return false;
    }
  }

  return true;
}
```

- [ ] **Step 2: 修改parseLlmResponse传入question_type**

当前 `parseLlmResponse` 不考虑question_type。由于parseLlmResponse只是提取JSON，它应该能处理所有题型。题目结构验证在validateQuestion中处理。

- [ ] **Step 3: 修改generateQuestion调用validateQuestion时传入question_type**

找到 `if (!validateQuestion(parsed))` 替换为：

```javascript
if (!validateQuestion(parsed, options.question_type || 'choice')) {
  throw new Error('Invalid question structure from LLM');
}
```

- [ ] **Step 4: 修改generateQuestion返回结果时添加sample_answer/expected_code**

找到返回语句：

```javascript
return {
  kp_id: kp.kp_id,
  difficulty,
  question_type: 'choice',
  ...parsed,
  verified: false,
  created_at: new Date().toISOString()
};
```

替换为：

```javascript
const result = {
  kp_id: kp.kp_id,
  difficulty,
  question_type: options.question_type || 'choice',
  question: parsed.question,
  explanation: parsed.explanation,
  verified: false,
  created_at: new Date().toISOString()
};

// choice题型
if (result.question_type === 'choice') {
  result.options = parsed.options;
  result.correct_answer = parsed.correct_answer;
}
// written题型
if (result.question_type === 'written') {
  result.sample_answer = parsed.sample_answer;
  result.correct_answer = parsed.sample_answer; // written题correct_answer存sample_answer
}
// coding题型
if (result.question_type === 'coding') {
  result.expected_code = parsed.expected_code;
  result.correct_answer = parsed.expected_code; // coding题correct_answer存expected_code
}

return result;
```

- [ ] **Step 5: 部署测试**

Run: `tcb fn deploy generateAiQuestion --env-id cloud1-7gg9y9tjb2b867b6 --force 2>&1`
Expected: `✔ [generateAiQuestion] 云函数部署成功！`

- [ ] **Step 6: 测试written题型**

Run: `tcb fn invoke generateAiQuestion --env-id cloud1-7gg9y9tjb2b867b6 --params '{"kp_name":"勾股定理","difficulty":"medium","question_type":"written"}' 2>&1`
Expected: 返回包含sample_answer的JSON，无options字段

---

## Task 5: 更新数据库Schema（添加字段）

**Files:**
- Modify: `cloudbaserc.json` (如果需要)
- No code change needed: 数据库schema通过应用层处理

**Context:** ai_question_pool需要支持written/coding题型的新字段。

- [ ] **Step 1: 确认数据库支持新字段**

由于微信云开发是无schema数据库，应用层自动支持新字段。当前代码已经在返回结果中包含sample_answer/expected_code字段，写入数据库时会自动创建。

验证：调用一次written题型生成，检查ai_question_pool中是否包含sample_answer字段。

Run: `tcb db nosql execute --env-id cloud1-7gg9y9tjb2b867b6 --command '[{"TableName":"ai_question_pool","CommandType":"QUERY","Command":"{\"find\":\"ai_question_pool\",\"filter\":{\"question_type\":\"written\"},\"limit\":1}"}]' 2>&1`
Expected: 返回包含sample_answer字段的记录

---

## Task 6: 集成练习流程（practice云函数）

**Files:**
- Modify: `cloudfunctions/practice/index.js`

**Context:** 修改practice云函数，当题库不足时自动触发generateAiQuestion。

- [ ] **Step 1: 添加queryAiQuestionPool函数**

在practice/index.js顶部，require语句后添加：

```javascript
/**
 * 从ai_question_pool查询已有题目
 * @param {Object} kp - 知识点信息 {kp_id, difficulty}
 * @param {number} limit - 最多返回条数
 * @returns {Promise<Array>} 题目列表
 */
async function queryAiQuestionPool(kp, limit = 5) {
  if (!cloud) return [];

  try {
    const db = cloud.database();
    const result = await db.collection('ai_question_pool')
      .where({
        kp_id: kp.kp_id,
        difficulty: kp.difficulty || 'medium'
      })
      .limit(limit)
      .get();

    return result.data.map(q => ({
      id: q._id || `q_${Date.now()}`,
      type: 'choice',
      content: q.question,
      options: q.options ? q.options.map((opt, i) => ({ key: String.fromCharCode(65 + i), value: opt })) : [],
      correct_answer: q.correct_answer,
      knowledge_point: q.kp_name,
      knowledge_point_id: q.kp_id,
      difficulty: q.difficulty,
      source: 'ai_pool'
    }));
  } catch (e) {
    console.log('[PRACTICE] Failed to query ai_question_pool:', e.message);
    return [];
  }
}
```

- [ ] **Step 2: 添加callGenerateAiQuestion函数**

在 `queryAiQuestionPool` 后添加：

```javascript
/**
 * 调用generateAiQuestion云函数生成题目
 * @param {Object} kp - 知识点信息 {kp_id, kp_name, chapter_name}
 * @param {string} difficulty - 难度
 * @param {string} question_type - 题型
 * @returns {Promise<Object|null>} 生成的题目或null
 */
async function callGenerateAiQuestion(kp, difficulty = 'medium', question_type = 'choice') {
  try {
    const result = await cloud.callFunction({
      name: 'generateAiQuestion',
      data: {
        kp_id: kp.kp_id,
        kp_name: kp.kp_name || '',
        chapter: kp.chapter_name || '',
        difficulty,
        question_type
      }
    });

    if (result.success && result.data) {
      const q = result.data;
      return {
        id: q.pool_id || `q_${Date.now()}`,
        type: 'choice',
        content: q.question,
        options: q.options ? q.options.map((opt, i) => ({ key: String.fromCharCode(65 + i), value: opt })) : [],
        correct_answer: q.correct_answer,
        knowledge_point: q.kp_name || kp.kp_name,
        knowledge_point_id: q.kp_id || kp.kp_id,
        difficulty: q.difficulty || difficulty,
        source: 'ai_generated'
      };
    }
  } catch (e) {
    console.log('[PRACTICE] Failed to call generateAiQuestion:', e.message);
  }
  return null;
}
```

- [ ] **Step 3: 修改exports.main添加AI补足逻辑**

找到 `// 生成题目` 注释附近（约第62行）：

当前代码：
```javascript
// 生成题目
const questions = generateQuestions(plan, numQuestions);
```

替换为：

```javascript
// 生成题目
let questions = generateQuestions(plan, numQuestions);

// AI补足：当题目数量不足时，调用generateAiQuestion
const MIN_QUESTIONS_PER_KP = 3;
const { enableAiFill = true } = params;

if (enableAiFill && cloud) {
  for (const item of plan) {
    const kpQuestions = questions.filter(q => q.knowledge_point_id === item.kp.kp_id);
    if (kpQuestions.length < MIN_QUESTIONS_PER_KP) {
      // 从ai_question_pool补充
      const fromPool = await queryAiQuestionPool(item.kp, MIN_QUESTIONS_PER_KP - kpQuestions.length);
      questions.push(...fromPool);

      // 如果还不够，调用generateAiQuestion实时生成
      if (kpQuestions.length + fromPool.length < MIN_QUESTIONS_PER_KP) {
        const needed = MIN_QUESTIONS_PER_KP - kpQuestions.length - fromPool.length;
        for (let i = 0; i < needed; i++) {
          const aiQuestion = await callGenerateAiQuestion(item.kp, item.difficulty);
          if (aiQuestion) {
            questions.push(aiQuestion);
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: 部署测试**

Run: `tcb fn deploy practice --env-id cloud1-7gg9y9tjb2b867b6 --force 2>&1`
Expected: `✔ [practice] 云函数部署成功！`

- [ ] **Step 5: 端到端测试**

调用practice云函数，验证AI补足逻辑：

Run: `tcb fn invoke practice --env-id cloud1-7gg9y9tjb2b867b6 --params '{"kp_id":"kp1_1","kp_name":"二次根式","num_questions":5}' 2>&1`
Expected: 返回题目列表，检查是否有source为'ai_pool'或'ai_generated'的题目

---

## Task 7: 端到端测试与验证

**Files:**
- 测试所有修改的云函数

**Context:** 验证所有四个功能是否正常工作。

- [ ] **Step 1: 测试选项均衡（功能A）**

生成10道选择题，检查选项长度是否均衡。

- [ ] **Step 2: 测试防重复（功能A）**

连续生成5道相同知识点的题目，检查是否有重复。

- [ ] **Step 3: 测试RAG检索（功能B）**

为某个knowledge_point添加knowledge_context字段，然后生成题目，检查是否使用了上下文。

- [ ] **Step 4: 测试多题型（功能C）**

分别生成choice/written/coding三种题型，验证返回格式正确。

- [ ] **Step 5: 测试集成流程（功能D）**

调用practice云函数，验证题库不足时自动触发AI生成。

---

## 验证命令汇总

```bash
# 部署generateAiQuestion
tcb fn deploy generateAiQuestion --env-id cloud1-7gg9y9tjb2b867b6 --force

# 部署practice
tcb fn deploy practice --env-id cloud1-7gg9y9tjb2b867b6 --force

# 测试choice题型
tcb fn invoke generateAiQuestion --env-id cloud1-7gg9y9tjb2b867b6 --params '{"kp_name":"因式分解","difficulty":"medium","question_type":"choice"}'

# 测试written题型
tcb fn invoke generateAiQuestion --env-id cloud1-7gg9y9tjb2b867b6 --params '{"kp_name":"勾股定理","difficulty":"medium","question_type":"written"}'

# 测试practice集成
tcb fn invoke practice --env-id cloud1-7gg9y9tjb2b867b6 --params '{"kp_id":"kp1_1","kp_name":"二次根式","num_questions":5}'
```

---

## 实现顺序

| Task | 功能 | 依赖 |
|------|------|------|
| Task 1 | Prompt优化 | 无 |
| Task 2 | 防重复机制 | Task 1 |
| Task 3 | RAG检索 | Task 2 |
| Task 4 | 多题型支持 | Task 1 |
| Task 5 | 数据库Schema | 无（自动支持） |
| Task 6 | 集成练习流程 | Task 1-5 |
| Task 7 | 端到端测试 | Task 1-6 |

---

## 遗漏检查（设计 vs 计划）

| 设计要求 | 计划覆盖 | 状态 |
|---------|---------|------|
| A. 选项均衡约束 | Task 1 | ✅ |
| A. 防重复机制 | Task 2 | ✅ |
| A. Prompt优化 | Task 1 | ✅ |
| B. RAG知识检索 | Task 3 | ✅ |
| B. 上下文注入 | Task 3 | ✅ |
| C. choice题型 | Task 1-4 | ✅ |
| C. written题型 | Task 4 | ✅ |
| C. coding题型 | Task 4 | ✅ |
| D. AI补足逻辑 | Task 6 | ✅ |
| D. 配置开关 | Task 6 (enableAiFill) | ✅ |

**结论**：计划完全覆盖设计，无遗漏。