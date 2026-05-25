# AI难度评估系统设计

**日期**: 2026-05-21
**状态**: 已批准
**版本**: 1.0

---

## 1. 问题定义

### 1.1 核心问题
题库中 hard 题目数量少且标记不准确（人工硬编码），导致复测难度升级效果差。

### 1.2 根本原因
- 题目难度由人工标记，不可避免的主观偏差
- hard 题目仅 11 道（总题库 50+ 题）
- 4 个知识点完全没有 hard 题目
- 部分 hard 标签不准确（实际很简单）

---

## 2. 设计目标

### 2.1 核心目标
用 AI 动态评估题目的实际难度等级，替代人工标记，实现准确、一致的难度判定。

### 2.2 验收标准
| 指标 | 验证方法 | 目标 |
|------|----------|------|
| 难度一致性 | 相同类型题目评估结果一致 | 100% |
| 评估覆盖率 | 有难度标记的题目占比 | 100% |
| 评估失败恢复 | 失败后下次服务正常时补评 | 100% |
| hard题目充足 | 每知识点至少3道hard | 全部覆盖 |

---

## 3. 评估策略

### 3.1 评估时机
**后评价（生成后评估）**
- 成本低：只在需要时评估
- 可复用：评估结果存入题库
- 可批量：历史题库可一次性评估修正

### 3.2 触发点
**首次使用时评估+存入题库**
- 一次性成本，每道题只评估一次
- 后续直接使用评估结果

### 3.3 失败处理
- 评估失败 → 题目标记 `difficulty_ai: null`
- 服务恢复后补评，不 fallback

---

## 4. 评估专家 Agent

### 4.1 评估提示词

```markdown
# 题目难度评估专家

## 你的角色
你是一位资深初中数学教研专家，专门评估题目的绝对难度等级。
你的评估应该客观、稳定，不受学生群体差异影响。

## 评估维度（必须全部考量）

### 维度1：认知复杂度
- 需要几步推导/计算？
- 是否需要多步骤逻辑链？
- 是否有隐含条件需要发掘？

### 维度2：概念深度
- 涉及几个知识点？
- 是否需要知识点融会贯通？
- 是否有概念理解的门槛？

### 维度3：题型创新度
- 是否是常见题型变式？
- 是否需要解题技巧而非套公式？
- 是否有陷阱/干扰信息？

### 维度4：计算精度要求
- 计算步骤多吗？
- 是否涉及复杂的数（如大数、分数、根号）？
- 中间结果是否有精度要求？

## 评估标准

### EASY 题目特征
- 直接套用公式/定理
- 计算步骤 ≤ 2步
- 单一知识点
- 无隐含条件
- 常见题型

### MEDIUM 题目特征
- 需要简单变式或组合
- 计算步骤 3-4步
- 2个知识点组合
- 有简单隐含条件
- 需要一定技巧

### HARD 题目特征
- 需要深度分析或综合应用
- 计算步骤 ≥ 5步
- ≥3个知识点综合
- 有隐蔽隐含条件
- 需要创新思路或多种技巧
- 易错点/陷阱多

## 输出格式

评估完成后，严格按照以下JSON格式输出，不要添加任何解释：

```json
{
  "difficulty": "easy|medium|hard",
  "score": 0-100,
  "reasoning": "简要说明为什么是这个难度",
  "dimensions": {
    "cognitive_complexity": "low|medium|high",
    "concept_depth": "shallow|moderate|deep",
    "innovation": "standard|variant|innovative",
    "calculation": "simple|moderate|complex"
  }
}
```

## 评估原则

1. **宁严勿宽**：边界情况倾向于低一级
2. **证据说话**：每项判断必须有题目内容支撑
3. **稳定一致**：同样类型的题目应该得到同样的评估
4. **不看学生**：只评估题目本身，不考虑学生群体差异
```

---

## 5. 存储结构

### 5.1 题目结构

```javascript
{
  content: '直角三角形两直角边为3和4，斜边长为？',
  options: ['A. 5', 'B. 6', 'C. 7', 'D. 12'],
  correct_answer: 'A',
  difficulty: 'easy',           // AI评估结果，直接覆盖原字段
  difficulty_score: 25,        // 分数（0-100）
  difficulty_ai: {             // 详细评估结果
    level: 'easy',
    score: 25,
    evaluated_at: '2026-05-21T10:00:00Z',
    evaluator_version: 'v1',
    dimensions: {
      cognitive_complexity: 'low',
      concept_depth: 'shallow',
      innovation: 'standard',
      calculation: 'simple'
    },
    reasoning: '直接套用勾股定理，单一知识点，计算简单'
  }
}
```

### 5.2 评估缺失标记

```javascript
{
  content: '...',
  options: [...],
  correct_answer: 'A',
  difficulty: null,           // 待评估
  difficulty_ai: null,        // 明确标记为未评估
  pending_evaluation: true    // 待补评标记
}
```

---

## 6. 补评机制

### 6.1 三种触发方式

| 触发方式 | 说明 | 优先级 |
|----------|------|--------|
| 出题时触发 | generateQuestions() 调用时检查并补评 | 高 |
| 定时任务 | 低峰期批量处理积压题目 | 中 |
| 手工触发 | 运维/管理员手动批量评估 | 低 |

### 6.2 出题时触发逻辑

```javascript
async function generateQuestions(plan, numQuestions) {
  const questions = [];

  for (const item of plan) {
    // 从题库获取或生成题目
    let question = await getQuestion(item);

    // 评估难度（如缺失）
    if (!question.difficulty_ai) {
      const evaluation = await evaluateIfNeeded(question);
      if (evaluation) {
        // 更新题目难度
        question = updateQuestionDifficulty(question, evaluation);
        // 异步更新题库存储（不阻塞流程）
        backgroundUpdateQuestion(question);
      }
    }

    questions.push(question);
  }

  return questions;
}
```

### 6.3 定时任务

```javascript
// 每日低峰期（凌晨3点）执行
async function scheduledEvaluation() {
  const pending = await getPendingEvaluations({ limit: 100 });

  for (const question of pending) {
    try {
      const evaluation = await evaluator.evaluate(question);
      await updateQuestion(question.id, evaluation);
      console.log(`[evaluator] 补评成功: ${question.id}`);
    } catch (error) {
      console.error(`[evaluator] 补评失败: ${question.id}`, error.message);
      // 继续处理下一题，不中断
    }
  }
}
```

### 6.4 手工批量触发

```javascript
// 管理员接口
async function triggerBulkEvaluation(kpId = null, difficulty = null) {
  const query = { pending_evaluation: true };
  if (kpId) query.kp_id = kpId;
  if (difficulty) query.difficulty = difficulty;

  const pending = await db.collection('question_bank').where(query).get();
  console.log(`[evaluator] 待评估题目: ${pending.data.length} 道`);

  // 批量处理
  let success = 0, failed = 0;
  for (const q of pending.data) {
    const result = await evaluateWithRetry(q);
    if (result) {
      await updateQuestion(q._id, result);
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed, total: pending.data.length };
}
```

---

## 7. 架构设计

### 7.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      评估触发层                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │ 出题时   │  │ 定时任务  │  │ 手工批量  │                │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                │
└───────┼────────────┼────────────┼─────────────────────────┘
        │            │            │
        ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│                     评估引擎层                              │
│  ┌─────────────────────────────────────────────────┐      │
│  │         difficulty_evaluator Agent               │      │
│  │  - 评估提示词（已设计）                           │      │
│  │  - 调用LLM返回难度等级                           │      │
│  │  - 支持超时和重试                                │      │
│  └─────────────────────────────────────────────────┘      │
└──────────────────────────┬────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     题库存储层                              │
│  ┌─────────────────────────────────────────────────┐      │
│  │  question_bank 集合                              │      │
│  │  - difficulty: AI评估结果                        │      │
│  │  - difficulty_ai: 详细评估信息                  │      │
│  │  - pending_evaluation: 待补评标记               │      │
│  └─────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 组件职责

| 组件 | 职责 | 依赖 |
|------|------|------|
| evaluator.js | 评估引擎，封装LLM调用和提示词 | llm_client.js |
| question_bank.js | 题库管理，集成评估触发 | evaluator.js |
| scheduled_tasks.js | 定时任务管理 | evaluator.js |

---

## 8. 文件清单

### 新增文件
1. `cloudfunctions/startAssessment/evaluator.js` - 难度评估引擎

### 修改文件
1. `cloudfunctions/startAssessment/question_bank.js` - 集成评估触发
2. `cloudfunctions/startAssessment/index.js` - 启动时批量评估（可选）

---

## 9. 实施计划

### Phase 1: 核心模块
- [ ] 实现 evaluator.js
  - 评估入口函数 `evaluate(question)`
  - 评估入口函数 `evaluateIfNeeded(question)`
  - 超时处理（5秒）
  - 错误处理（返回null）
- [ ] 集成到 question_bank.js
  - 在 `generateQuestions` 中调用 `evaluateIfNeeded`
  - 评估结果写入题库
- [ ] 部署并验证评估结果

### Phase 2: 补评机制
- [ ] 实现定时任务 `scheduledEvaluation`
  - 微信云开发定时触发器
  - 每日凌晨3点执行
  - 批量处理100道待评估题目
- [ ] 实现手工批量触发 `triggerBulkEvaluation`
  - 云函数 admin 接口
  - 支持按知识点筛选
- [ ] 启动时批量评估（可选）
  - 在 index.js 启动时检查待评估题目

### Phase 3: 验证优化
- [ ] 批量评估历史题库
- [ ] 验证评估一致性（抽检评估结果）
- [ ] 优化提示词（根据实际评估结果调整）

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 评估API超时 | 流程阻塞 | 设置5秒超时，失败不阻塞出题 |
| 评估标准不一致 | 难度失真 | 提示词设计完整，评估原则明确 |
| 题库更新冲突 | 数据不一致 | 使用事务或乐观锁 |
| 评估积压 | 用户等待 | 异步处理，出题时顺带补评 |

---

## 附录

### A. 评估示例

**EASY题目评估：**
```json
{
  "content": "√16的值是？",
  "difficulty": "easy",
  "score": 15,
  "dimensions": {
    "cognitive_complexity": "low",
    "concept_depth": "shallow",
    "innovation": "standard",
    "calculation": "simple"
  },
  "reasoning": "直接开平方，单一知识点，无隐含条件"
}
```

**HARD题目评估：**
```json
{
  "content": "一只蚂蚁从长方体一个顶点沿表面爬到相对顶点，长方体长宽高分别为3,4,5，最短路径为？",
  "difficulty": "hard",
  "score": 85,
  "dimensions": {
    "cognitive_complexity": "high",
    "concept_depth": "deep",
    "innovation": "innovative",
    "calculation": "complex"
  },
  "reasoning": "需要空间想象、分类讨论、勾股定理应用，计算复杂"
}
```
