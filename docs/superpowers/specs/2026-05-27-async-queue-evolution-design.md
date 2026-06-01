# 异步队列系统中长期优化演进设计文档

**日期**: 2026-05-27
**状态**: 设计审查中（v1.3 - 修复SWARM REVIEW v3问题）
**版本**: 1.3
**更新记录**:
- v1.3: 修复 SWARM REVIEW v3 问题
  - 修复 SaveQuestionsStep 返回值键名不匹配（使用 STEP_OUTPUT_KEYS.QUESTION_IDS）
  - 补充 CreateAssessmentStep 示例
  - 验收标准量化（补充具体测试场景）
- v1.2: 修复 SWARM REVIEW v2 问题
  - 统一 TaskContext.state 类型定义（Map与Object一致性）
  - 明确状态存储键名约定（STEP_OUTPUT_KEYS vs step.name）
  - 补充步骤依赖验证实现说明
  - 统一 shouldAbort 业务语义注释
  - 补充 Mock 工具完整实现
- v1.1: 修复 SWARM REVIEW 问题
  - 标注 NotifyStep 为 Phase 4（未实现）
  - 定义步骤间数据传递约定（STEP_OUTPUT_KEYS）
  - 补充辅助函数迁移策略
  - 明确回滚业务语义和 shouldAbort 使用场景
  - 修复并发取消测试可靠性（基于 taskId 而非计数器）
- v1.0: 初始版本

---

## 1. 概述

### 1.1 背景

当前 `questionGenerator` 云函数的 `processTask` 函数有约116行代码，包含8个处理步骤，职责过多。同时缺少并发场景测试和完善的监控告警机制。

### 1.2 目标

| 维度 | 目标 | 优先级 |
|------|------|--------|
| 可维护性 | 将 `processTask` 拆分为可插拔的工作流引擎 | P1 |
| 可靠性 | 补充多任务并发处理的测试覆盖 | P1 |
| 可观测性 | 建立基于云开发原生的监控告警体系 | P1 |

### 1.3 实施策略

采用**渐进式演进**，分3个阶段独立交付，每阶段有明确的验收标准。

---

## 2. Phase 1: 工作流引擎

### 2.1 设计目标

- 将 `processTask` 从116行单函数拆分为可插拔步骤系统
- 支持步骤级别的回滚机制
- 保持向后兼容，外部接口不变

### 2.2 核心设计

#### 2.2.1 接口定义

```javascript
/**
 * 步骤输出键名约定（用于 ctx.state 传递）
 */
const STEP_OUTPUT_KEYS = {
  QUESTIONS: 'questions',        // GenerateStep 输出
  QUESTION_IDS: 'questionIds',   // SaveQuestionsStep 输出
  ASSESSMENT_ID: 'assessmentId'  // CreateAssessmentStep 输出
};

/**
 * 工作流步骤接口
 */
interface WorkflowStep {
  name: string;
  execute(ctx: TaskContext): Promise<StepResult>;
  rollback?(ctx: TaskContext): Promise<void>;
  /**
   * 是否需要取消检测
   * true: 步骤执行前后检测任务是否被取消
   * false: 不检测（如状态更新步骤）
   */
  checkCancelled?: boolean;
}

/**
 * 步骤执行结果
 */
interface StepResult {
  success: boolean;
  data?: any;
  error?: Error;
  /**
   * 是否触发回滚（shouldAbort）：
   *
   * | 场景 | shouldAbort | 原因 |
   * |------|-------------|------|
   * | 数据保存失败 | true | 回滚已完成的可回滚步骤 |
   * | AI生成失败 | true | 回滚状态更新（如processing状态） |
   * | 用户主动取消 | false | 数据由清理流程处理 |
   * | 数据验证失败 | false | 未产生副作用 |
   * | 任务超时 | false | 由清理流程处理 |
   *
   * 保守原则：不确定时使用 true
   */
  shouldAbort?: boolean;
}

/**
 * 任务上下文
 */
interface TaskContext {
  task: QueueTask;
  db: Database;
  /**
   * 步骤间数据传递
   *
   * 存储约定：
   * - 状态键使用 STEP_OUTPUT_KEYS 中定义的常量（如 'questions', 'questionIds'）
   * - 步骤名称（step.name）仅用于日志记录，不作为状态键
   * - 使用 Map 类型存储，支持 getRequired() 安全访问
   *
   * 读取约定：
   * - 必须使用 getRequired(key) 读取，自动检查存在性
   * - 禁止直接使用 state.get(key)
   *
   * 写入约定：
   * - 步骤执行成功后，引擎自动将 result.data 存入对应键
   * - 键名由步骤返回的 result.data 对象的键决定
   */
  state: Map<string, any>;
  metadata: {
    startTime: number;
    stepHistory: string[];
    currentStep: number;
  };

  /**
   * 安全获取状态数据
   * @throws {Error} 当键不存在时抛出明确错误
   */
  getRequired(key: string): any;
}
```

#### 2.2.1.1 步骤间数据传递约定

**规则1：键名使用约定**
- 步骤返回的 `result.data` 对象的键必须使用 `STEP_OUTPUT_KEYS` 常量
- 禁止使用魔法字符串

**规则2：存在性检查**
```javascript
// ❌ 错误：直接使用可能为 undefined
const questions = ctx.state.get('questions');

// ✅ 正确：使用 getRequired 检查
const questions = ctx.getRequired(STEP_OUTPUT_KEYS.QUESTIONS);
```

**规则3：步骤返回值格式**
```javascript
// 步骤执行成功后，返回值必须包含约定键
return {
  success: true,
  data: {
    [STEP_OUTPUT_KEYS.QUESTIONS]: questions  // 使用约定键名
  }
};

// 引擎层自动将 data 中的内容存入 ctx.state
// ctx.state.set('questions', questions)
// ctx.state.set('questionIds', questionIds)
// ctx.state.set('assessmentId', assessmentId)
```

**规则4：步骤依赖声明**
```javascript
class SaveQuestionsStep {
  name = 'SaveQuestions';

  // 声明依赖的前置步骤（用于引擎层验证）
  dependencies = ['GenerateStep'];

  async execute(ctx: TaskContext): Promise<StepResult> {
    // 依赖检查在引擎层完成（见 2.2.3 依赖验证）
    const questions = ctx.getRequired(STEP_OUTPUT_KEYS.QUESTIONS);
    // ...
  }
}
```
```

#### 2.2.2 工作流引擎

```javascript
/**
 * 任务工作流引擎
 */
class TaskWorkflow {
  private steps: WorkflowStep[];

  constructor(steps: WorkflowStep[]) {
    this.steps = steps;
  }

  /**
   * 执行工作流
   */
  async execute(task: QueueTask, db: Database): Promise<WorkflowResult> {
    const ctx = this.createContext(task, db);
    const completedSteps: WorkflowStep[] = [];

    try {
      for (let i = 0; i < this.steps.length; i++) {
        const step = this.steps[i];
        ctx.metadata.currentStep = i;

        // 步骤依赖验证
        this.validateDependencies(step, ctx);

        // 取消检测（步骤执行前）
        if (step.checkCancelled) {
          const cancelled = await this.checkTaskCancelled(db, task._id);
          if (cancelled) {
            // 取消不需要回滚，直接返回
            return {
              success: false,
              cancelled: true,
              reason: 'Task cancelled by user'
            };
          }
        }

        const result = await step.execute(ctx);

        if (!result.success) {
          // 根据失败类型决定是否回滚
          if (result.shouldAbort) {
            // 数据保存失败等需要回滚
            await this.rollback(ctx, completedSteps);
          }
          // shouldAbort=false 时（如取消操作），不回滚
          return { success: false, error: result.error, stoppedAt: i };
        }

        // 取消检测（步骤执行后）
        if (step.checkCancelled) {
          const cancelled = await this.checkTaskCancelled(db, task._id);
          if (cancelled) {
            return {
              success: false,
              cancelled: true,
              reason: 'Task cancelled by user'
            };
          }
        }

        // 保存步骤输出到上下文（使用约定键名）
        if (result.data !== undefined) {
          for (const [key, value] of Object.entries(result.data)) {
            ctx.state.set(key, value);
          }
        }

        ctx.metadata.stepHistory.push(step.name);
        completedSteps.push(step);
      }

      return { success: true, data: ctx.state };
    } catch (error) {
      // 异常回滚
      await this.rollback(ctx, completedSteps);
      return { success: false, error };
    }
  }

  /**
   * 验证步骤依赖
   *
   * 引擎在执行步骤前，检查：
   * 1. 步骤声明的 dependencies 是否都已在 stepHistory 中完成
   * 2. 依赖步骤的数据是否存在于 ctx.state 中
   *
   * 如果依赖不满足，抛出明确错误，不执行步骤
   */
  private validateDependencies(step: WorkflowStep, ctx: TaskContext): void {
    if (!step.dependencies || step.dependencies.length === 0) {
      return; // 无依赖，直接执行
    }

    for (const depName of step.dependencies) {
      if (!ctx.metadata.stepHistory.includes(depName)) {
        throw new Error(
          `Step "${step.name}" requires "${depName}" to be completed first. ` +
          `Completed steps: [${ctx.metadata.stepHistory.join(', ')}]`
        );
      }

      // 检查依赖步骤的数据是否存在
      const dataKey = this.getDataKeyForStep(depName);
      if (!ctx.state.has(dataKey)) {
        throw new Error(
          `Step "${step.name}" dependency "${depName}" has no data in state. ` +
          `Available keys: [${Array.from(ctx.state.keys()).join(', ')}]`
        );
      }
    }
  }

  /**
   * 获取步骤对应的数据键名
   */
  private getDataKeyForStep(stepName: string): string {
    const mapping = {
      'Generate': STEP_OUTPUT_KEYS.QUESTIONS,
      'SaveQuestions': STEP_OUTPUT_KEYS.QUESTION_IDS,
      'CreateAssessment': STEP_OUTPUT_KEYS.ASSESSMENT_ID
    };
    return mapping[stepName] || stepName;
  }

  /**
   * 回滚已完成的可回滚步骤
   *
   * 回滚业务语义：
   * 1. 仅回滚实现了 rollback 方法的步骤
   * 2. 回滚是尽力而为，回滚失败不影响后续回滚
   * 3. 回滚不保证原子性（云开发不支持多表事务）
   *
   * 触发场景：
   * - 数据保存失败（如题目保存成功但 assessment 创建失败）
   * - 步骤执行异常抛出
   *
   * 不触发场景：
   * - 用户主动取消（shouldAbort=false）
   * - 任务超时（由清理流程处理）
   */
  private async rollback(
    ctx: TaskContext,
    completedSteps: WorkflowStep[]
  ): Promise<void> {
    // 倒序回滚（后进先出）
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const step = completedSteps[i];
      if (step.rollback) {
        try {
          await step.rollback(ctx);
        } catch (e) {
          console.error(`[rollback] Failed for ${step.name}:`, e);
          // 回滚失败继续回滚其他步骤
        }
      }
    }
  }

  private createContext(task: QueueTask, db: Database): TaskContext {
    const state = new Map();

    return {
      task,
      db,
      state,
      metadata: {
        startTime: Date.now(),
        stepHistory: [],
        currentStep: -1
      },
      getRequired(key: string) {
        if (!state.has(key)) {
          throw new Error(`Required state key "${key}" not found. Available keys: ${Array.from(state.keys()).join(', ')}`);
        }
        return state.get(key);
      }
    };
  }

  private async checkTaskCancelled(db, taskId): Promise<boolean> {
    // 复用现有 checkTaskCancelled 函数
  }
}
```

### 2.3 步骤拆分

| 步骤 | 类名 | 职责 | 可回滚 | checkCancelled | 状态 |
|------|------|------|--------|----------------|------|
| Step 1 | InitStateStep | 更新队列状态为 processing | ✗ | false | ✅ 已实现 |
| Step 2 | GenerateStep | 调用AI生成题目 | ✗ | true | ✅ 已实现 |
| Step 3 | SaveQuestionsStep | 保存到 ai_question_pool | ✓ | true | ✅ 已实现 |
| Step 4 | CreateAssessmentStep | 创建 assessment 记录 | ✓ | false | ✅ 已实现 |
| Step 5 | CompleteStep | 更新队列为 completed | ✗ | false | ✅ 已实现 |
| Step 6 | NotifyStep | 发送微信订阅消息 | ✗ | false | ⏸️ Phase 4（TODO） |

**注**：NotifyStep 在当前代码中标记为 `// TODO: Phase 4 实现`，本设计将其作为预留步骤。

#### 2.3.1 示例：SaveQuestionsStep

```javascript
class SaveQuestionsStep {
  name = 'SaveQuestions';
  checkCancelled = true;  // 声明需要取消检测

  async execute(ctx: TaskContext): Promise<StepResult> {
    const { task, db } = ctx;

    // 使用约定键名获取前置步骤输出
    const questions = ctx.getRequired(STEP_OUTPUT_KEYS.QUESTIONS);

    if (!Array.isArray(questions) || questions.length === 0) {
      return {
        success: false,
        shouldAbort: false,  // 数据验证失败，不需要回滚
        error: new Error('No questions to save')
      };
    }

    const questionIds = [];
    try {
      for (const q of questions) {
        const result = await db.collection('ai_question_pool').add({
          data: {
            ...q,
            verified: false,
            temp_task_id: task._id,
            created_at: new Date().toISOString()
          }
        });
        questionIds.push(result._id);
      }
    } catch (error) {
      // 数据保存失败，需要回滚已保存的数据
      return {
        success: false,
        shouldAbort: true,  // 触发回滚
        error
      };
    }

    return { success: true, data: { [STEP_OUTPUT_KEYS.QUESTION_IDS]: questionIds } };
  }

  /**
   * 回滚：删除已保存的题目
   */
  async rollback(ctx: TaskContext): Promise<void> {
    const { task, db } = ctx;
    await db.collection('ai_question_pool')
      .where({ temp_task_id: task._id, verified: false })
      .remove();
  }
}

/**
 * 示例：CreateAssessmentStep
 */
class CreateAssessmentStep {
  name = 'CreateAssessment';

  async execute(ctx: TaskContext): Promise<StepResult> {
    const { task, db } = ctx;

    const questionIds = ctx.getRequired(STEP_OUTPUT_KEYS.QUESTION_IDS);

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return {
        success: false,
        shouldAbort: false,
        error: new Error('No question IDs to link')
      };
    }

    try {
      const result = await db.collection('assessment').add({
        data: {
          student_id: task.student_id,
          subject: task.subject,
          grade: task.grade,
          questions: questionIds,
          status: 'ready',
          created_at: new Date().toISOString()
        }
      });

      return {
        success: true,
        data: { [STEP_OUTPUT_KEYS.ASSESSMENT_ID]: result._id }
      };
    } catch (error) {
      return {
        success: false,
        shouldAbort: true,  // 触发回滚 SaveQuestionsStep 保存的题目
        error
      };
    }
  }

  async rollback(ctx: TaskContext): Promise<void> {
    const { task, db } = ctx;
    await db.collection('assessment')
      .where({ student_id: task.student_id, status: 'ready' })
      .remove();
  }
}
```

#### 2.3.2 回滚业务语义说明

**回滚触发条件**（shouldAbort=true）：
1. 数据保存失败（如题目保存成功但 assessment 创建失败）
2. 步骤执行抛出未捕获异常

**不回滚场景**（shouldAbort=false）：
1. 用户主动取消（TASK_CANCELLED）
2. 数据验证失败（前置步骤无有效输出）
3. 任务超时（由清理流程处理）

**回滚限制**：
- 云开发不支持多表事务，回滚是尽力而为
- 回滚失败不影响后续回滚操作
- 回滚不保证原子性

### 2.4 文件结构

```
cloudfunctions/questionGenerator/
├── index.js                          # 入口，保持向后兼容
├── workflow/
│   ├── TaskWorkflow.js               # 工作流引擎
│   ├── TaskContext.js                # 上下文定义
│   ├── constants.js                  # 步骤输出键名约定
│   └── steps/
│       ├── InitStateStep.js
│       ├── GenerateStep.js
│       ├── SaveQuestionsStep.js
│       ├── CreateAssessmentStep.js
│       └── CompleteStep.js
│       # NotifyStep.js - Phase 4 预留
├── utils/
│   ├── updateQueueStatus.js          # 从 index.js 迁移
│   ├── checkTaskCancelled.js         # 从 index.js 迁移
│   └── cleanupPartialQuestionsByTask.js  # 从 index.js 迁移
└── __tests__/
    └── ...
```

### 2.5 辅助函数迁移策略

**迁移范围**：
以下函数当前在 `index.js` 中定义并被测试导入，需要迁移到 `workflow/utils/`：

| 函数 | 当前位置 | 目标位置 | 导出保持 |
|------|----------|----------|----------|
| `updateQueueStatus` | index.js:48 | workflow/utils/ | ✅ |
| `checkTaskCancelled` | index.js:73 | workflow/utils/ | ✅ |
| `cleanupPartialQuestionsByTask` | index.js:109 | workflow/utils/ | ✅ |

**迁移策略**：
1. 在 `workflow/utils/` 创建对应文件
2. `index.js` 中从 workflow/utils 重新导出
3. 测试文件导入路径保持不变（通过 index.js 中转）

```javascript
// index.js - 保持向后兼容的导出
const {
  updateQueueStatus,
  checkTaskCancelled,
  cleanupPartialQuestionsByTask
} = require('./workflow/utils');

// 重新导出供测试使用
exports.updateQueueStatus = updateQueueStatus;
exports.checkTaskCancelled = checkTaskCancelled;
exports.cleanupPartialQuestionsByTask = cleanupPartialQuestionsByTask;
```

### 2.6 向后兼容

```javascript
// index.js 中保持原有导出
const { processTask: processTaskWorkflow } = require('./workflow/TaskWorkflow');

// 适配器：保持原有签名
async function processTask(db, task, options) {
  const workflow = new TaskWorkflow(getDefaultSteps(options));
  return await workflow.execute(task, db);
}

// 保持原有导出接口
exports.processTask = processTask;
exports.updateQueueStatus = require('./workflow/utils/updateQueueStatus');
exports.checkTaskCancelled = require('./workflow/utils/checkTaskCancelled');
exports.cleanupPartialQuestionsByTask = require('./workflow/utils/cleanupPartialQuestionsByTask');
// ... 其他导出
```

### 2.7 验收标准

- [ ] 所有现有测试通过（38/38）
- [ ] `processTask` 代码行数 < 50行
- [ ] 每个步骤类 < 80行
- [ ] 回滚机制测试覆盖以下场景：
  - [ ] SaveQuestionsStep 失败时回滚
  - [ ] CreateAssessmentStep 失败时回滚 SaveQuestionsStep
  - [ ] 用户取消时不触发回滚
  - [ ] 回滚失败不影响后续回滚
- [ ] 向后兼容：外部调用者无感知

**回滚测试场景量化**：

| 场景 | 预期结果 | 验证方式 |
|------|---------|----------|
| SaveQuestionsStep 失败 | 触发回滚，数据已清理 | 查询 ai_question_pool 无相关数据 |
| CreateAssessmentStep 失败 | 回滚 SaveQuestionsStep | 查询 ai_question_pool 无相关数据 |
| 用户主动取消 | 不触发回滚 | 数据由 cleanupPartialQuestionsByTask 处理 |
| 回滚过程中出错 | 继续回滚其他步骤 | 验证已完成步骤被回滚 |

---

## 3. Phase 2: 并发测试

### 3.1 设计目标

- 验证多任务并行处理时的数据隔离
- 确保并发场景下的状态一致性
- 补充测试覆盖率到 80%+

### 3.2 测试场景

#### 3.2.1 基础并发测试

```javascript
describe('Concurrent Task Processing', () => {
  test('应正确处理3个并发任务', async () => {
    const tasks = [
      { _id: 'task_1', student_id: 's1', /* ... */ },
      { _id: 'task_2', student_id: 's2', /* ... */ },
      { _id: 'task_3', student_id: 's3', /* ... */ }
    ];

    const results = await Promise.all(
      tasks.map(task => processTask(mockDb, task, { generateAi: mockGenerateAi }))
    );

    // 验证：各自创建独立的assessment
    expect(results).toHaveLength(3);
    results.forEach(r => expect(r.success).toBe(true));

    // 验证：无数据混淆
    const savedQuestions = await getAllQuestions();
    expect(savedQuestions.filter(q => q.temp_task_id === 'task_1')).toHaveLength(3);
    expect(savedQuestions.filter(q => q.temp_task_id === 'task_2')).toHaveLength(3);
    expect(savedQuestions.filter(q => q.temp_task_id === 'task_3')).toHaveLength(3);
  });
});
```

#### 3.2.2 并发失败隔离测试

```javascript
test('并发任务中一个失败不影响其他', async () => {
  const mockGenerateAi = jest.fn()
    .mockResolvedValueOnce([{ q: 1 }, { q: 2 }, { q: 3 }])
    .mockRejectedValueOnce(new Error('AI service down'))
    .mockResolvedValueOnce([{ q: 7 }, { q: 8 }, { q: 9 }]);

  const tasks = [
    { _id: 'task_1', student_id: 's1', /* ... */ },
    { _id: 'task_2', student_id: 's2', /* ... */ },
    { _id: 'task_3', student_id: 's3', /* ... */ }
  ];

  const results = await Promise.all(
    tasks.map(task => processTask(mockDb, task, { generateAi: mockGenerateAi }).catch(e => ({ success: false, error: e.message })))
  );

  // 验证：task_1 和 task_3 成功，task_2 失败
  expect(results[0].success).toBe(true);
  expect(results[1].success).toBe(false);
  expect(results[1].error).toBe('AI service down');
  expect(results[2].success).toBe(true);
});
```

#### 3.2.3 并发取消测试

```javascript
test('并发任务中一个取消不影响其他', async () => {
  // 使用基于任务的取消控制（而非全局计数器）
  const cancelledTasks = new Set(['task_2']);

  const mockDb = createMockDb({
    onCheckCancelled: (taskId) => {
      // 基于 taskId 决定是否取消，更可靠
      return cancelledTasks.has(taskId) ? taskId : null;
    }
  });

  const tasks = [
    { _id: 'task_1', student_id: 's1', /* ... */ },
    { _id: 'task_2', student_id: 's2', /* ... */ },
    { _id: 'task_3', student_id: 's3', /* ... */ }
  ];

  const results = await Promise.all(
    tasks.map(task => processTask(mockDb, task, { generateAi: mockGenerateAi }))
  );

  // 验证：task_2 被取消，其他继续
  expect(results[0].success).toBe(true);
  expect(results[1].cancelled).toBe(true);
  expect(results[2].success).toBe(true);
});
```

**取消触发机制改进**：
- 原设计使用全局计数器 `checkCount` 控制取消时机
- 问题：并发顺序不确定，测试不稳定
- 修复：使用基于 `taskId` 的取消控制，与并发顺序无关

### 3.3 Mock工具

```javascript
/**
 * 创建支持并发控制的Mock DB
 */
function createMockDb(options = {}) {
  const { onCheckCancelled } = options;

  // 模拟集合数据存储
  const collections = {
    question_queue: [],
    ai_question_pool: [],
    assessment: []
  };

  // 模拟唯一ID生成器
  let idCounter = 1;
  const generateId = (prefix) => `${prefix}_${idCounter++}`;

  return {
    collection: jest.fn((name) => {
      return {
        // 查询方法
        where: (query) => ({
          field: query ? Object.keys(query)[0] : null,
          value: query ? query[Object.keys(query)[0]] : null,
          get: async () => {
            const coll = collections[name] || [];
            const field = Object.keys(query || {})[0];
            const value = query ? query[field] : null;

            if (!field || !value) {
              return [coll];
            }

            return [coll.filter(item => item[field] === value)];
          },
          remove: async () => {
            const field = Object.keys(query)[0];
            const value = query[field];
            const idx = collections[name].findIndex(i => i[field] === value);
            if (idx !== -1) {
              collections[name].splice(idx, 1);
            }
            return { deleted: idx !== -1 ? 1 : 0 };
          }
        }),
        // 添加方法
        add: async ({ data }) => {
          const id = generateId(name.split('_')[0] || 'item');
          const item = { _id: id, ...data };
          collections[name].push(item);
          return { _id: id };
        },
        // 更新方法
        update: async () => ({
          returned: 1
        })
      };
    }),

    // 取消检测钩子（支持基于 taskId 的控制）
    _checkCancelledHook: onCheckCancelled,

    // 清除所有集合数据（每个测试前调用）
    _reset: () => {
      Object.keys(collections).forEach(k => collections[k] = []);
      idCounter = 1;
    }
  };
}

/**
 * 创建支持取消检测的 mock checkTaskCancelled
 */
function createMockCheckTaskCancelled(cancelledTasks = new Set()) {
  return async function mockCheckTaskCancelled(db, taskId) {
    // 支持外部钩子
    if (db._checkCancelledHook) {
      return db._checkCancelledHook(taskId);
    }
    // 默认检查逻辑
    return cancelledTasks.has(taskId) ? taskId : null;
  };
}

/**
 * 创建并发测试专用的 mockGenerateAi
 *
 * @param {Array} responses - 按顺序返回的响应，可混合成功/失败
 * @returns {Function} mock函数
 */
function createMockGenerateAi(responses) {
  let callIndex = 0;
  return async function mockGenerateAi(params) {
    if (callIndex >= responses.length) {
      throw new Error('No more responses configured');
    }
    const response = responses[callIndex++];
    if (response instanceof Error) {
      throw response;
    }
    return response;
  };
}
```

### 3.4 验收标准

- [ ] 新增 `concurrency.test.js` 文件
- [ ] 至少3个并发场景测试
- [ ] 所有并发测试通过
- [ ] 测试覆盖率达到 80%+
- [ ] 无竞态条件导致的失败

---

## 4. Phase 3: 云开发监控

### 4.1 设计目标

- 建立结构化日志体系
- 配置云开发监控告警
- 提供问题排查能力

### 4.2 结构化日志

#### 4.2.1 日志格式

```javascript
/**
 * 结构化日志类
 */
class StructuredLogger {
  /**
   * 信息日志
   */
  info(event, data = {}) {
    console.log(JSON.stringify({
      level: 'INFO',
      event,
      timestamp: new Date().toISOString(),
      ...data
    }));
  }

  /**
   * 错误日志
   */
  error(event, error, data = {}) {
    console.error(JSON.stringify({
      level: 'ERROR',
      event,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...data
    }));
  }

  /**
   * 指标日志
   */
  metric(name, value, tags = {}) {
    console.log(JSON.stringify({
      level: 'METRIC',
      metric: name,
      value,
      tags,
      timestamp: new Date().toISOString()
    }));
  }
}
```

#### 4.2.2 使用示例

```javascript
// 替换现有 console.log
const logger = new StructuredLogger();

// 原代码：
// console.log(`[processTask] START task:${task._id} ...`);

// 新代码：
logger.info('processTask.start', {
  taskId: task._id,
  studentId: task.student_id,
  subject: task.subject,
  numQuestions: task.num_questions
});

// 错误日志
logger.error('processTask.failed', error, {
  taskId: task._id,
  duration: Date.now() - startTime
});

// 指标日志
logger.metric('task.duration', duration, {
  subject: task.subject,
  status: 'success'
});
```

### 4.3 关键指标

| 指标名 | 含义 | 类型 | 告警阈值 |
|--------|------|------|----------|
| `task.duration` | 单任务处理耗时 | histogram | p95 > 60s |
| `task.failure_rate` | 任务失败率 | gauge | > 5% |
| `queue.depth` | 待处理队列深度 | gauge | > 10 |
| `generation.qps` | AI生成QPS | gauge | < 0.1 (持续5分钟) |
| `ai.error_rate` | AI生成错误率 | gauge | > 10% |

### 4.4 云开发配置

#### 4.4.1 日志采集

在云开发控制台：
1. 进入「日志」→「日志采集配置」
2. 新建采集规则：
   - 日志类型：JSON
   - 时间字段：timestamp
   - 索引字段：level, event, taskId, error

#### 4.4.2 监控告警

创建告警策略：
1. 告警名称：`questionGenerator_task_duration_high`
2. 查询条件：`event:processTask.end AND duration:{60000,*}`
3. 触发条件：5分钟内出现3次
4. 通知方式：微信/邮件

#### 4.4.3 定时触发

保持现有配置：
- 触发频率：每分钟
- 超时时间：60秒

### 4.5 验收标准

- [ ] 所有 console.log 替换为结构化日志
- [ ] 云开发控制台可查询JSON格式日志
- [ ] 关键指标可查询和可视化
- [ ] 告警规则配置完成
- [ ] 提供「监控配置指南」文档

---

## 5. 依赖关系

```
Phase 1 (工作流引擎)
    ├── 内部依赖：辅助函数迁移（utils/）
    ↓
Phase 2 (并发测试) ← 依赖工作流引擎的稳定性
    ↓
Phase 3 (监控告警) ← 依赖结构化日志基础
```

**推荐实施顺序**：Phase 1 → Phase 2 → Phase 3

**关键依赖**：
- Phase 1 的辅助函数迁移必须在步骤拆分前完成
- 测试文件导入路径通过 index.js 中转，无需修改

---

## 6. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 重构引入新bug | 高 | 完整的测试覆盖 + 分阶段发布 |
| 并发测试难以模拟 | 中 | 使用基于 taskId 的取消控制，与并发顺序无关 |
| 云开发监控能力限制 | 低 | 基于现有能力，不过度设计 |
| 回滚机制与现有 cleanupPartialQuestionsByTask 重复 | 低 | 回滚是步骤级别的精细控制，cleanup 是任务级别的粗粒度清理 |

### 6.1 回滚机制讨论

**SWARM REVIEW 质疑**：当前代码已有 `cleanupPartialQuestionsByTask`，回滚机制是否重复？

**分析**：
- `cleanupPartialQuestionsByTask`：任务级别清理，在 catch 块中调用，清理所有关联数据
- 步骤回滚：步骤级别精细控制，在步骤失败时立即回滚已完成的可回滚步骤

**保留理由**：
1. 回滚提供更细粒度的控制（如仅回滚数据保存，不回滚状态更新）
2. 回滚是自动的，由引擎在步骤失败时触发
3. cleanup 作为兜底机制，在异常情况下清理所有数据

**2/8原则考量**：
- 核心20%：步骤拆分 + 基础测试 + 结构化日志
- 回滚机制属于增强功能，如果过度复杂可简化
- 当前设计保持简单回滚（仅两步可回滚），符合2/8原则

---

## 7. 成功标准

- [ ] Phase 1: `processTask` 代码行数减少 50%+
- [ ] Phase 2: 测试覆盖率达到 80%+
- [ ] Phase 3: 关键问题可在5分钟内定位
- [ ] 所有现有功能保持正常

---

## 8. 非目标

以下内容**不在本次优化范围**：
- 性能优化（当前性能满足需求）
- 微服务拆分（单云函数足够）
- 新功能开发（仅重构和增强）
