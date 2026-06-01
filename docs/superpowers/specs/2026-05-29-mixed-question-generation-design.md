# 混合出题模式设计文档

**日期**: 2026-05-29
**目标**: 解决 API 频率限制，实现 AI+题库混合出题

## 问题背景

当前 `generateAiQuestion` 云函数纯靠 AI 生成题目，受 MiniMax API 频率限制（429 错误）影响，无法稳定批量出题。

## 解决方案

**混合模式**：一组 N 道题中，AI 生成 2 题（并发），剩余 N-2 题从题库获取。

## 核心目标

| 目标 | 定义 |
|------|------|
| 减少 AI 调用 | 从 N 次降到 2 次，降低 429 风险 |
| 提高效率 | 题库题目直接返回，响应快 |
| 容错机制 | 题库不足时用实际数量，不报错 |
| 去重保证 | 排除用户已做题目 |

## 接口设计

### 新增参数

```javascript
// generateAiQuestion 云函数参数
{
  kp_id: string,
  kp_name: string,
  difficulty: string,
  count: number,           // NEW: 总题数（范围: 2-20，默认 undefined = 纯 AI 模式）
  skip_image: boolean,
  subject?: string,
  user_id?: string         // NEW: 用户ID（用于去重，混合模式必需）
}
```

### 参数约束

| 参数 | 约束 | 说明 |
|------|------|------|
| `count` | 2 ≤ count ≤ 20 | 最小2题（AI并发），最大20题（题库压力控制） |
| `user_id` | 混合模式必需 | 用于查询和排除用户做题历史 |
| `count` 默认值 | undefined | 不传时保持纯 AI 模式 |

### 向后兼容

- 不传 `count`：保持现有纯 AI 模式（生成 1 题）
- 传 `count`：启用混合模式（需同时传 `user_id`）

## 数据流程

```
┌─────────────────────────────────────────────────────┐
│  混合模式流程 (count = N)                            │
├─────────────────────────────────────────────────────┤
│                                                      │
│  0. 前置检查                                        │
│     ├─ 验证 count ≥ 2                              │
│     └─ 验证 user_id 存在（混合模式必需）             │
│                                                      │
│  1. 并发 AI 生成 2 题（容错）                       │
│     ├─ 使用 Promise.allSettled（单个失败不影响另一） │
│     ├─ Task1: generateQuestion(kp, difficulty)       │
│     └─ Task2: generateQuestion(kp, difficulty)       │
│     │                                                │
│     └─ AI 题目自动保存到 ai_question_pool           │
│                                                      │
│  2. AI 题目记录用户历史（原子性）                   │
│     └─ 批量写入 user_question_history（防止并发窗口）│
│                                                      │
│  3. 查询题库 (N-AI成功数 题，传入 user_id)          │
│     ├─ 调用 fetchQuestionsFromPool(count, userId)   │
│     ├─ 自动排除用户历史                              │
│     └─ 自动记录用户历史                              │
│                                                      │
│  4. 合并题目（容错）                                 │
│     ├─ AI 成功题 + 题库题                           │
│     └─ 总数 = min(AI成功数 + 题库数, N)             │
│                                                      │
│  5. 随机打乱                                         │
│     └─ Fisher-Yates shuffle（仅混合模式）           │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## 容错处理

### 场景与处理

| 场景 | AI 成功数 | 题库需求数 | 最终返回 | 说明 |
|------|----------|-----------|---------|------|
| 正常 | 2 | N-2 | N | 理想情况 |
| AI 失败 1 题 | 1 | N-1 | min(1+题库数, N) | 题库补充 |
| AI 全部失败 | 0 | N | min(题库数, N) | 纯题库 |
| 题库不足 | 2 | N-2 但实际返回 M | 2+M | 不报错，用实际数量 |
| 全部失败 | 0 | 0 | 0 | 返回空数组，错误日志 |

### 计算逻辑

```javascript
// AI 并发生成（容错）
const aiResults = await Promise.allSettled([
  generateQuestion(kp, difficulty, options),
  generateQuestion(kp, difficulty, options)
]);

// 提取成功的题目
const aiQuestions = aiResults
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);

const aiSuccessCount = aiQuestions.length;
const poolNeeded = Math.max(0, N - aiSuccessCount);

// 查询题库（传入 user_id 用于去重）
const poolQuestions = await fetchQuestionsFromPool(
  db, kpId, difficulty, verified, userId, [], poolNeeded
);

// 合并（可能不足 N）
const allQuestions = [...aiQuestions, ...poolQuestions];

// 随机打乱（仅混合模式）
if (count) {
  shuffleArray(allQuestions);
}

return {
  success: true,
  data: {
    total: allQuestions.length,  // 实际数量，可能 < N
    questions: allQuestions
  }
};
```

## 数据库依赖

### 已有表（复用）

| 表名 | 用途 |
|------|------|
| `ai_question_pool` | 题库，AI 生成的题目保存于此 |
| `user_question_history` | 用户做题历史，用于去重 |

### 现有函数（复用）

- `fetchQuestionsFromPool()` - 从题库获取题目，自动去重并记录历史
- `generateQuestion()` - AI 单题生成
- `generateQuestionBatch()` - AI 批量生成（参考）

## 实现要点

### 1. 并发控制（容错）

使用 `Promise.allSettled()` 替代 `Promise.all()`，确保单个 AI 调用失败不影响另一个：

```javascript
// 并发生成 2 题（容错）
const aiResults = await Promise.allSettled([
  generateQuestion(kp, difficulty, options),
  generateQuestion(kp, difficulty, options)
]);

// 提取成功的题目
const aiQuestions = aiResults
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);

// 记录失败的题目
const aiFailures = aiResults
  .filter(r => r.status === 'rejected')
  .length;

if (aiFailures > 0) {
  console.warn(`[MixedMode] ${aiFailures}/2 AI questions failed, using pool questions`);
}
```

### 2. AI 题目记录用户历史（原子性）

AI 生成题目后，需要**原子性**地批量调用 `user_question_history.add()`，防止并发窗口期：

```javascript
// AI 生成完成后，批量记录用户历史（防止并发窗口）
if (aiQuestions.length > 0 && userId) {
  const historyRecords = aiQuestions.map(q => ({
    user_id: userId,
    question_id: q._id || q.pool_id,
    used_at: new Date().toISOString()
  }));

  // 批量插入（云数据库支持批量操作）
  try {
    await Promise.all(historyRecords.map(record =>
      db.collection('user_question_history').add({ data: record })
    ));
  } catch (e) {
    console.warn('[MixedMode] Failed to record user history:', e.message);
  }
}
```

### 3. 题库查询（传入 user_id）

调用 `fetchQuestionsFromPool()` 时必须传入 `userId`，以便自动排除用户已做题目：

```javascript
// 查询题库（传入 user_id 用于去重）
const poolQuestions = await fetchQuestionsFromPool(
  db,                    // 数据库实例
  kpId,                  // 知识点 ID
  difficulty,            // 难度
  verified,              // 是否验证过的题目
  userId,                // 用户 ID（必需，用于去重）
  [],                    // 额外排除的题目 ID
  poolNeeded             // 需要的题目数量
);
```

### 4. 随机打乱

Fisher-Yates 洗牌算法（仅混合模式执行）：

```javascript
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
```

## 输出格式

```javascript
{
  success: true,
  data: {
    total: 5,           // 实际返回题数（可能 < 请求的 count）
    requested: 10,       // 请求的题数
    questions: [
      { question, options, correct_answer, explanation, pool_id, source: 'ai' },
      { question, options, correct_answer, explanation, pool_id, source: 'pool' },
      ...
    ],
    stats: {             // 可选：统计信息
      ai_generated: 1,   // AI 生成的题数
      pool_fetched: 4    // 题库获取的题数
    }
  }
}
```

**注意**：`total` 可能小于 `requested`，调用方需要处理这种情况。

## 测试要点

### 功能测试

1. **混合模式正常流程**：count=10，返回 10 题（2 AI + 8 题库）
2. **题库不足**：count=100，题库只有 50 题，返回 52 题（2 AI + 50 题库）
3. **AI 单个失败**：模拟 1 个 AI 调用失败，返回 1 AI + 9 题库（共 10 题）
4. **AI 全部失败**：模拟 2 个 AI 调用失败，返回 10 题库题
5. **题库全部不足**：题库为空，AI 失败，返回 0 题（不报错）
6. **去重验证**：同一用户连续请求，检查题目不重复
7. **向后兼容**：不传 count，保持原有纯 AI 行为

### 边界测试

1. **count 最小值**：count=2，返回 2 题
2. **count 最大值**：count=20，返回 ≤20 题
3. **count 超界**：count=1 或 count=21，返回错误或调整到边界
4. **缺少 user_id**：传 count 但不传 user_id，返回错误

### 性能测试

1. **并发响应时间**：混合模式 vs 纯 AI 模式
2. **题库查询性能**：大量用户历史记录下的查询时间

### 集成测试

1. **用户历史记录原子性**：并发请求同一用户，验证无重复题目
2. **AI 失败日志**：验证 AI 失败时正确记录日志

## 实施架构

### 改造范围

| 模块 | 改动类型 | 说明 |
|------|---------|------|
| `generateAiQuestion/index.js` | 修改 | 增加 count 参数处理，实现混合模式逻辑 |
| `generateAiQuestion/llm-core/` | 不变 | AI 调用层保持不变 |
| `practice_v2/question_pool.js` | 复用 | `fetchQuestionsFromPool()` 已实现去重 |

### 核心改造文件

**`generateAiQuestion/index.js`** 主要改动点：

1. **主函数参数扩展**：
   ```javascript
   exports.main = async (event) => {
     const { count, user_id, ...rest } = event;
     // ...
   }
   ```

2. **混合模式分支**：
   ```javascript
   if (count && count >= 2) {
     return await generateMixedQuestions(count, user_id, kp, difficulty);
   } else {
     return await generateSingleQuestion(kp, difficulty);
   }
   ```

3. **新增函数 `generateMixedQuestions()`**：
   - 处理混合模式完整流程
   - 调用 `generateQuestion()` × 2（并发）
   - 调用 `fetchQuestionsFromPool()`
   - 合并、去重、打乱

### 不受影响模块

- `questionGenerator/` - 独立云函数，无交叉依赖
- `startAssessment/` - 独立云函数，无交叉依赖
- `submitAnswer/` - 独立云函数，无交叉依赖

## 审查修订记录

### V1.1 - 基于 Swarm 审查修订

| 修订项 | 修订前 | 修订后 | 原因 |
|-------|--------|--------|------|
| 并发容错 | `Promise.all` | `Promise.allSettled` | 单个失败不应中断整体 |
| 参数边界 | count 无约束 | 2 ≤ count ≤ 20 | 防止边界情况 |
| user_id | 未明确参数 | 混合模式必需参数 | 去重逻辑需要 |
| 历史记录 | 循环单条插入 | 批量插入 | 防止并发窗口期 |
| 输出格式 | 仅 total | 增加 requested + stats | 透明展示实际 vs 请求 |
| 测试覆盖 | 5 项 | 增加边界和集成测试 | 提高覆盖率 |
