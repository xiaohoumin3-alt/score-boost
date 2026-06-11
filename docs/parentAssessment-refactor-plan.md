/**
 * 亲子测评重构方案
 *
 * 问题：parentAssessment 单独实现了一套题目生成逻辑，导致：
 * 1. LLM 配置读取不一致（未使用 llm_config 集合）
 * 2. 题库查询缺少 difficulty 过滤，导致年级错配
 * 3. 无法复用 questionGenerator 的重试、回退机制
 *
 * 解决方案：复用现有的 questionGenerator 队列系统
 */

## 方案 A：使用队列系统（推荐）

### 修改 parentAssessment 流程

**当前流程**：
```
parentAssessment
  → 直接调用 generateAiQuestion 云函数
  → 返回题目
```

**改为**：
```
parentAssessment
  → 创建队列任务到 question_queue
  → 小程序轮询 checkQueueStatus
  → questionGenerator 处理队列
  → 返回题目
```

### 代码改动

**1. startParentAssessment 改为创建队列任务**

```javascript
async function startParentAssessment(event) {
  const { grade, subject = 'math', openid } = event;

  // 创建队列任务（复用现有逻辑）
  const taskId = `parent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.collection('question_queue').add({
    data: {
      _id: taskId,
      type: 'parent_assessment',  // 新类型
      grade: String(grade),
      subject: subject,
      openid: openid,
      num_questions: 5,
      difficulty_distribution: { easy: 3, medium: 2 },
      status: 'pending',
      created_at: new Date().toISOString()
    }
  });

  return {
    success: true,
    data: { task_id: taskId, message: '队列任务已创建，请轮询获取结果' }
  };
}
```

**2. 小程序端轮询逻辑**

```javascript
// 小程序端
async function startParentAssessment() {
  const { task_id } = await wx.cloud.callFunction({
    name: 'parentAssessment',
    data: { action: 'start', grade: '1', subject: 'math' }
  });

  // 轮询队列状态
  const poll = setInterval(async () => {
    const { result } = await wx.cloud.callFunction({
      name: 'checkQueueStatus',
      data: { task_id }
    });

    if (result.data.status === 'completed') {
      clearInterval(poll);
      // 显示题目
      showQuestions(result.data.questions);
    }
  }, 2000);
}
```

**3. questionGenerator 支持新类型**

在 `questionGenerator/index.js` 中添加：

```javascript
if (task.type === 'parent_assessment') {
  // 亲子测评：只生成题目，不创建 assessment 记录
  steps = [
    new GenerateStep(generateAi),
    new SaveQuestionsStep(),  // 保存到 ai_question_pool
    new CompleteStep()        // 更新队列状态
  ];
}
```

---

## 方案 B：修复现有逻辑（临时方案）

如果暂时不想改流程，至少要修复 LLM 配置和题库查询：

### 1. 修复题库查询

```javascript
async function fetchQuestionsFromPool(db, grade, subject, count) {
  // 添加 difficulty 过滤（避免高年级题目）
  const difficulties = ['easy', 'medium'];  // 优先低难度

  let allQuestions = [];
  for (const difficulty of difficulties) {
    if (allQuestions.length >= count) break;

    const result = await db.collection('ai_question_pool')
      .where({
        grade: String(grade),
        subject: subject,
        difficulty: difficulty  // 添加难度过滤
      })
      .limit(count - allQuestions.length)
      .get();

    allQuestions = [...allQuestions, ...(result.data || [])];
  }

  return allQuestions.slice(0, count);
}
```

### 2. 使用数据库配置

```javascript
async function generateQuestionsWithAI(db, grade, subject, count) {
  // 加载配置（从数据库）
  const config = await loadConfig(db);

  // 创建 LLM 客户端
  const llm = createLLMClient(config);

  // ... 生成逻辑
}
```

---

## 推荐行动

1. **短期**：实施方案 B（修复现有逻辑）
2. **长期**：实施方案 A（使用队列系统）

这样可以确保：
- ✅ LLM 配置统一管理
- ✅ 题库查询正确过滤
- ✅ 复用现有的重试、回退机制
- ✅ 代码一致性更好
