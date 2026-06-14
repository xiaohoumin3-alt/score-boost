# 两阶段自适应测评系统设计文档

> **项目**: 提分神器小程序  
> **设计日期**: 2025-06-14  
> **状态**: 待用户审查  
> **版本**: v1.0

---

## 一、问题陈述

### 1.1 核心问题

当前测评系统使用5-6题进行能力评估，存在以下问题：

1. **统计可靠性不足**：Fisher信息量约5-6，标准误差（SE）约0.4，分数误差±8分
2. **用户体验断层**：技术指标（区分度、置信区间）与用户感知脱节
3. **复测波动感知**：用户观察到分数波动，但系统未提供误差透明化

### 1.2 设计目标

| 目标 | 描述 | 成功标准 |
|------|------|----------|
| **G1** | 提升测评统计可靠性 | 标准误差从0.4降至0.3以内 |
| **G2** | 透明化精度，增强用户信任 | 用户可实时看到当前精度和目标精度 |
| **G3** | 保持快速体验 | 5题快速筛查继续存在，不强制延长 |
| **G4** | 兼容现有流程 | 现有用户和测评流程不受影响 |
| **G5** | 控制LLM成本 | 通过题目复用降低API调用成本 |

---

## 二、解决方案：两阶段自适应测评

### 2.1 架构选型：混合架构

采用**混合架构**，分离快速测评和深度测评，共享题目优化模块：

```
┌─────────────────────────────────────────────────────────────────┐
│                        小程序前端                                │
├─────────────────────────────────────────────────────────────────┤
│  快速测评入口 (现有)              深度测评入口 (新增)             │
│  pages/assessment/                 pages/assessment-depth/        │
└────────────────┬──────────────────────────────┬─────────────────┘
                 │                              │
                 ▼                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                       云函数层                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                  │
│  startAssessment (保持不变)        extendedAssessment (新建)     │
│  ├─ 5-6题快速测评                   ├─ 第一阶段：5题初始测评      │
│  ├─ 现有验收测试通过                ├─ 第二阶段：动态扩展         │
│  └─ 返回assessment_id              ├─ 置信区间实时计算           │
│                                     ├─ Fisher信息量监控           │
│                                     └─ 系统建议逻辑              │
│                                                                  │
│                 questionOptimizer (共享模块，新建)                │
│                 ├─ 题目预生成策略                                 │
│                 ├─ 跨测评题目复用                                  │
│                 └─ LLM成本优化                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 方案对比

| 方案 | 优势 | 劣势 | 选择 |
|------|------|------|------|
| A. 渐进式增强 | 改动最小，风险可控 | 架构不清晰，技术债 | ❌ |
| **B. 独立CAT引擎** | 架构清晰，扩展性强 | 开发成本高，维护双套逻辑 | ❌ |
| **C. 混合架构** | 新旧分离，资源共享，平衡成本和质量 | 需新建部分组件 | ✅ |

---

## 三、核心组件设计

### 3.1 extendedAssessment 云函数（新建）

**职责**: 管理深度测评的完整生命周期

```javascript
class ExtendedAssessmentEngine {
  // 第一阶段：初始测评（5题）
  async startInitialAssessment(params) {
    // 1. 创建会话记录（status: 'initial'）
    // 2. 从questionOptimizer获取5题
    // 3. 返回题目 + 会话ID
  }

  // 第二阶段：动态扩展判断
  async shouldExtend(sessionId) {
    // 1. 计算当前Fisher信息量
    // 2. 计算当前标准误差SE
    // 3. 判断是否达到目标精度
    // 4. 返回建议
  }

  // 获取下一题（动态扩展）
  async getNextQuestion(sessionId) {
    // 1. 基于当前θ估计，选择最大信息量题目
    // 2. 从questionOptimizer获取题目
    // 3. 更新会话状态
  }

  // 完成测评
  async completeAssessment(sessionId) {
    // 1. 最终能力估计
    // 2. 计算置信区间
    // 3. 生成报告
  }
}
```

### 3.2 questionOptimizer 共享模块（新建）

**职责**: 智能题目管理和LLM成本优化

```javascript
class QuestionOptimizer {
  // 获取题目（优先复用）
  async getQuestions(criteria) {
    // 1. 检查缓存中是否有合适的题目
    // 2. 如有，返回复用（降低LLM调用）
    // 3. 如无，触发生成
  }

  // 预生成策略
  async pregenerateStrategy() {
    // 基于历史数据，预测热门知识点
    // 提前生成题目，降低实时生成压力
  }

  // 题目质量验证
  async validateQuestion(question) {
    // 验证区分度、难度等指标
  }
}
```

### 3.3 前端组件（新建）

**目录结构**:
```
pages/assessment-depth/
├── index.js                    # 页面逻辑
├── index.wxml                  # 答题界面
├── index.wxss                  # 样式
└── components/
    ├── accuracy-meter.wxss      # 精度仪表盘
    ├── question-transition.js   # 题目切换动画
    └── confidence-interval.js   # 置信区间展示
```

---

## 四、用户流程设计

### 4.1 深度测评完整流程

```
用户选择"深度测评"
    ↓
extendedAssessment.startInitialAssessment()
    ↓
创建 extended_sessions 记录（status: 'initial'）
    ↓
从 questionOptimizer 获取 5 道题目
    ↓
用户答题 5 道 → 提交答案
    ↓
计算第一阶段结果（θ1, SE1）
    ↓
extendedAssessment.shouldExtend(sessionId)
    ↓
判断：SE1 > 目标SE？
    ├─ 是 → 显示建议："当前精度85%，继续答题可达95%"
    │         用户选择：继续 / 结束
    └─ 否 → 直接完成
    ↓
[用户选择继续]
    ↓
循环：getNextQuestion() → 答题 → 重新计算SE → 判断是否继续
    ↓
直到 SE ≤ 目标SE 或 用户选择停止 或 达到最大题数(30)
    ↓
extendedAssessment.completeAssessment()
    ↓
返回：最终分数 + 置信区间 + 详细报告
```

### 4.2 精度透明化展示

```xml
<!-- 精度仪表盘组件 -->
<view class="accuracy-meter">
  <view class="meter-label">当前精度</view>
  <view class="meter-value">{{currentAccuracy}}%</view>
  
  <!-- 进度条 -->
  <view class="meter-bar">
    <view class="meter-fill" style="width: {{currentAccuracy}}%"></view>
  </view>
  
  <view class="meter-target">目标: {{targetAccuracy}}%</view>
  
  <!-- 说明文字 -->
  <view class="meter-hint">
    继续答题 {{questionsNeeded}} 道可达目标精度
  </view>
</view>
```

### 4.3 阶段过渡交互

```
第一阶段完成 → 展示精度仪表盘 → 展示建议卡片 → 用户选择

建议卡片设计：
┌─────────────────────────────────┐
│  📊 测评分析                     │
│                                 │
│  当前精度：85%                   │
│  目标精度：95%                   │
│                                 │
│  继续答题 5 道，可提升至目标精度  │
│  预计时间：3 分钟                │
│                                 │
│  [继续测评]    [查看结果]         │
└─────────────────────────────────┘
```

---

## 五、数据模型设计

### 5.1 新增集合：extended_sessions

```javascript
{
  _id: "session_xxx",
  user_openid: "xxx",
  
  // 状态管理
  status: "initial | extending | completed | abandoned",
  phase: "first | second",
  current_question_index: 5,
  
  // 题目相关
  initial_questions: ["q1", "q2", ...],  // 第一阶段5题
  extended_questions: ["q6", "q7", ...], // 扩展题目
  
  // 答题记录
  responses: [
    { question_id: "q1", is_correct: true, difficulty: -1, timestamp: xxx },
    { question_id: "q2", is_correct: false, difficulty: 0, timestamp: xxx }
  ],
  
  // 能力估计
  theta_estimate: 0.5,           // 当前能力估计
  std_error: 0.3,               // 当前标准误差
  fisher_information: 12.5,      // 当前Fisher信息量
  confidence_interval: { lower: 77, upper: 93 },
  
  // 系统建议
  system_recommendation: {
    should_extend: true,
    current_accuracy: 0.85,
    target_accuracy: 0.95,
    estimated_questions_needed: 5
  },
  
  // 最终结果
  final_score: 85,
  final_theta: 0.5,
  final_se: 0.25,
  
  // 元数据
  created_at: xxx,
  updated_at: xxx,
  completed_at: xxx
}
```

### 5.2 扩展现有集合：ai_question_pool

```javascript
// 新增字段
{
  // ... 现有字段
  
  // 复用管理
  reuse_count: 0,              // 被复用次数
  last_used_at: xxx,          // 最后使用时间
  
  // 质量指标
  discrimination: 0.35,        // 点二列相关系数
  difficulty_calibrated: true, // 是否已校准难度
  
  // 成本优化
  generation_source: "pregenerate | on-demand | cached",
  
  // 统计
  usage_stats: {
    total_attempts: 150,
    correct_rate: 0.68,
    response_time_avg: 45
  }
}
```

---

## 六、核心算法

### 6.1 Fisher信息量计算

```javascript
/**
 * 计算当前响应的Fisher信息量
 * I(θ) = Σ[a²(P-c)² / (P×Q)]
 */
function calculateFisherInformation(responses, theta) {
  let totalInfo = 0;
  
  responses.forEach(r => {
    const P = threePLModel(theta, r.difficulty, 1, 0.25);
    const Q = 1 - P;
    const I = Math.pow(1 * (P - 0.25), 2) / (P * Q);
    totalInfo += I;
  });
  
  return totalInfo;
}

/**
 * 判断是否应该继续
 * 目标：SE ≤ 0.3 (约±5分误差)
 */
function shouldContinue(currentInfo, targetSE = 0.3) {
  const currentSE = 1 / Math.sqrt(currentInfo);
  return currentSE > targetSE;
}
```

### 6.2 题目选择策略

```javascript
/**
 * 选择下一题：最大Fisher信息量
 */
function selectNextQuestion(theta, availableQuestions) {
  let maxInfo = 0;
  let bestQuestion = null;
  
  availableQuestions.forEach(q => {
    const info = calculateItemInformation(theta, q.difficulty);
    if (info > maxInfo) {
      maxInfo = info;
      bestQuestion = q;
    }
  });
  
  return bestQuestion;
}

/**
 * 计算单题的信息量
 */
function calculateItemInformation(theta, difficulty) {
  const P = threePLModel(theta, difficulty, 1, 0.25);
  const Q = 1 - P;
  return Math.pow(1 * (P - 0.25), 2) / (P * Q);
}
```

---

## 七、API设计

### 7.1 extendedAssessment 云函数接口

```javascript
// 1. 启动深度测评
exports.startAssessment = async (event) => {
  /*
   * 输入: { grade, subject, mode }
   * 输出: { 
   *   session_id, 
   *   questions: [...], 
   *   phase: 'first',
   *   target_se: 0.3 
   * }
   */
}

// 2. 提交答案 + 获取建议
exports.submitAnswers = async (event) => {
  /*
   * 输入: { session_id, answers: [...] }
   * 输出: { 
   *   current_score, 
   *   current_se,
   *   recommendation: {
   *     should_extend: true,
   *     reason: "当前精度85%，建议继续",
   *     estimated_questions: 5
   *   }
   * }
   */
}

// 3. 获取下一题（扩展阶段）
exports.getNextQuestion = async (event) => {
  /*
   * 输入: { session_id }
   * 输出: { 
   *   question: {...}, 
   *   current_se: 0.28,
   *   progress: { current: 8, target: 10 }
   * }
   */
}

// 4. 完成测评
exports.completeAssessment = async (event) => {
  /*
   * 输入: { session_id }
   * 输出: { 
   *   final_score: 85,
   *   confidence_interval: { lower: 80, upper: 90 },
   *   detailed_report: {...}
   * }
   */
}
```

---

## 八、兼容性保证

### 8.1 现有用户流程

- `startAssessment` 保持不变
- 现有验收测试无需修改
- `assessments` 集合保持现有格式
- 现有用户继续使用5题快速测评

### 8.2 渐进迁移策略

```
Phase 1: 新增深度测评入口（灰度测试）
Phase 2: 首页添加"深度测评"入口
Phase 3: 根据数据决定是否将深度测评设为默认
Phase 4: 保留快速测评作为"快速筛查"选项
```

---

## 九、测试策略

### 9.1 单元测试

```javascript
// __tests__/extended-assessment.test.js
describe('ExtendedAssessment', () => {
  test('第一阶段应该返回5题', () => {});
  test('应该正确计算Fisher信息量', () => {});
  test('应该正确判断是否需要扩展', () => {});
  test('应该选择最大信息量题目', () => {});
  test('应该正确计算置信区间', () => {});
});

// __tests__/question-optimizer.test.js
describe('QuestionOptimizer', () => {
  test('应该优先复用已有题目', () => {});
  test('应该正确执行预生成策略', () => {});
});
```

### 9.2 集成测试

```javascript
// __tests__/integration/extended-flow.test.js
describe('深度测评完整流程', () => {
  test('从开始到完成的完整流程', () => {});
  test('用户选择不扩展应该直接完成', () => {});
  test('达到最大题数应该强制完成', () => {});
  test('精度仪表盘显示正确', () => {});
});
```

---

## 十、实施计划

### Sprint 1（2周）：基础架构
- 创建 `extendedAssessment` 云函数骨架
- 创建 `extended_sessions` 数据库
- 实现第一阶段（5题初始测评）

### Sprint 2（2周）：核心逻辑
- 实现Fisher信息量计算
- 实现动态扩展逻辑
- 实现 `questionOptimizer` 共享模块

### Sprint 3（2周）：前端体验
- 前端精度仪表盘
- 前端建议卡片
- 完整流程联调

### Sprint 4（1周）：上线准备
- 验收测试
- 性能优化
- 上线准备

---

## 十一、成功标准

| 目标 | 成功标准 | 验证方法 |
|------|---------|----------|
| G1: 统计可靠性 | SE ≤ 0.3 | 单元测试 + 真实数据验证 |
| G2: 透明化精度 | 前端显示精度仪表盘 | UI测试 |
| G3: 快速体验 | 5题快速测评保留 | 兼容性测试 |
| G4: 兼容现有 | 现有验收测试通过 | 回归测试 |
| G5: 成本控制 | 题目复用率 > 50% | 监控数据 |

---

## 十二、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM成本超预算 | 高 | 题目复用 + 预生成策略 |
| 用户体验复杂化 | 中 | A/B测试验证设计 |
| 技术实现复杂度 | 中 | 渐进式实施，分阶段验证 |
| 现有用户投诉 | 低 | 保持现有流程，新功能可选 |

---

**文档版本**: v1.0  
**最后更新**: 2025-06-14  
**下一步**: 用户审查 → 实施计划
