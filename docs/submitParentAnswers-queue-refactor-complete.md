# submitParentAnswers 队列系统改造完成

## 概述

将 `submitParentAnswers` 中的孩子题目生成从直接 AI 调用改为使用队列系统，实现 LLM 配置统一和架构一致性。

## 改造内容

### 1. 新增队列生成函数

**文件**: `cloudfunctions/parentAssessment/index.js`

新增 `generateChildQuestionsViaQueue` 函数：

```javascript
async function generateChildQuestionsViaQueue(db, grade, subject, count, timeoutMs = 15000)
```

**功能**:
- 创建 `child_assessment` 类型队列任务
- 内部轮询等待队列完成（1秒间隔）
- 15秒超时机制
- 失败时返回 `null`，调用者回退到题库

### 2. 修改 submitParentAnswers

**改造前**:
```javascript
let childQuestions = await generateQuestionsWithAI(db, assessment.grade, assessment.subject, 5);
```

**改造后**:
```javascript
// 优先：队列系统生成
let childQuestions = await generateChildQuestionsViaQueue(db, assessment.grade, assessment.subject, 5);

// 回退1：题库获取
if (!childQuestions || childQuestions.length === 0) {
  childQuestions = await fetchQuestionsFromPool(db, assessment.grade, assessment.subject, 5);
}

// 回退2：旧版AI生成
if (childQuestions.length < 5) {
  const aiQuestions = await generateQuestionsWithAI(db, assessment.grade, assessment.subject, 5 - childQuestions.length);
  childQuestions = [...childQuestions, ...aiQuestions];
}
```

### 3. questionGenerator 支持 child_assessment

**文件**: `cloudfunctions/questionGenerator/index.js`

```javascript
// 亲子测评类型：不需要创建 assessment 记录，题目直接返回
if (type === 'parent_assessment' || type === 'child_assessment') {
  return [
    new InitStateStep(),
    new GenerateStep(generateAi),
    new SaveQuestionsStep(),
    new CompleteStep({ dependencies: [] })
  ];
}
```

## 架构对比

### 改造前
```
submitParentAnswers
  ↓ 直接调用 generateAiQuestion
  ↓ 环境变量 LLM 配置（无效）
  ↓ 返回孩子题目
```

### 改造后
```
submitParentAnswers
  ↓ 创建 child_assessment 队列任务
  ↓ 内部轮询队列（15秒超时）
  ↓ questionGenerator 处理队列
  │  ├─ llm_config 集合读取配置（有效）
  │  ├─ 调用 generateAiQuestion 生成题目
  │  └─ 保存到 ai_question_pool
  ↓ 获取题目详情
  ↓ 回退机制（题库 → 旧版AI）
  ↓ 返回孩子题目
```

## 优势

1. **LLM配置统一**: 使用 `llm_config` 集合，不再依赖环境变量
2. **架构一致性**: 与 `parent_assessment` 启动流程统一使用队列系统
3. **可靠性**: 重试机制、降级机制自动生效
4. **用户体验不变**: 前端无感知，后端内部轮询

## 降级策略

| 层级 | 方式 | 触发条件 |
|------|------|----------|
| L1 | 队列系统 | 默认使用 |
| L2 | 题库获取 | 队列超时或失败 |
| L3 | 旧版AI | 题库不足 |

## 队列任务格式

**child_assessment 类型**:
```javascript
{
  _id: 'child_1234567890_abc123',
  type: 'child_assessment',
  grade: '2',
  subject: 'math',
  num_questions: 5,
  difficulty_distribution: {
    easy: 3,
    medium: 2
  },
  status: 'pending',
  created_at: '2025-06-11T...',
  updated_at: '2025-06-11T...'
}
```

## 验证步骤

1. 部署云函数：
   ```bash
   tcb fn deploy parentAssessment --dir cloudfunctions/parentAssessment
   tcb fn deploy questionGenerator --dir cloudfunctions/questionGenerator
   ```

2. 测试流程：
   - 启动家长测评（获取家长题目）
   - 提交家长答案
   - 验证孩子题目生成（15秒内完成）

3. 检查日志：
   ```bash
   # questionGenerator 日志
   [getSteps] Using child_assessment workflow (no CreateAssessmentStep)
   [processTask] START task:child_xxx type:child_assessment

   # parentAssessment 日志
   [generateChildQuestionsViaQueue] Queue task created, waiting for completion...
   [generateChildQuestionsViaQueue] Task completed, fetching 5 questions...
   ```

## 文件清单

**修改的文件**:
- `cloudfunctions/parentAssessment/index.js`
  - 新增 `generateChildQuestionsViaQueue` 函数
  - 修改 `submitParentAnswers` 函数
- `cloudfunctions/questionGenerator/index.js`
  - 修改 `getSteps` 函数支持 `child_assessment`

## 相关文档

- [parentAssessment队列重构](parentAssessment-queue-refactor-complete.md)
- [题库年级过滤修复](grade-filter-fix-report.md)
- [parentAssessment重构完成](parentAssessment-refactor-complete.md)
