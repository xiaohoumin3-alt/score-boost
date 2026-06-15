# 两阶段自适应测评系统设计文档

> **项目**: 提分神器小程序  
> **设计日期**: 2025-06-14  
> **状态**: 待用户审查  
> **版本**: v1.1

---

## 一、问题陈述

### 1.1 核心问题

当前测评系统使用5-20题进行能力评估（快速筛查模式5-6题，默认20题），存在以下问题：

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
│  startAssessment (保持不变)        extendedAssessment.startExtendedAssessment (新建)     │
│  ┌──────────────────────┐           ┌──────────────────────────────┐ │
│  │ 现有快速测评 (5-6题)  │           │ 深度测评 (新增)                 │ │
│  │ - 返回assessment_id   │           │ - 第一阶段复用5题逻辑            │ │
│  │ - 状态独立管理        │           │ - 状态在extended_sessions管理   │ │
│  └──────────────────────┘           │ - 第二阶段动态扩展               │ │
│                                     └──────────────────────────────┘ │
│                                                                  │
│                 questionOptimizer (共享模块，新建)                │
│                 ├─ 题目预生成策略                                 │
│                 ├─ 跨测评题目复用                                  │
│                 └─ LLM成本优化                                    │
└────────────────────────────────────────────────────────────────────┘
```

**架构关系说明**：
- `startAssessment` = 现有快速测评（保持不变），使用 `assessments` 集合
- `extendedAssessment.startExtendedAssessment` = 新增深度测评，使用 `extended_sessions` 集合
- 深度测评第一阶段复用startAssessment的5题逻辑，但状态管理完全独立

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
    ├── accuracy-meter.wxml           # 精度仪表盘结构
    ├── accuracy-meter.wxss           # 精度仪表盘样式
    ├── question-transition.js        # 题目切换动画
    └── confidence-interval.js        # 置信区间展示
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

### 4.3 结果同步

深度测评完成后，需要同时更新两个集合以保持数据一致性：

```
extendedAssessment.completeAssessment()
    ↓
更新 extended_sessions 记录
    ├─ status: 'completed'
    ├─ final_score, final_theta, final_se
    └─ completed_at: 当前时间
    ↓
同步写入 assessments 集合（用于历史记录统一查询）
    ├─ user_openid
    ├─ grade, subject
    ├─ assessment_type: 'extended'
    ├─ score: final_score
    ├─ confidence_interval
    ├─ session_id (关联 extended_sessions)
    └─ created_at
```

**设计要点**：
- `assessments` 集合作为统一的历史记录查询入口
- 通过 `assessment_type` 区分快速测评('quick')和深度测评('extended')
- `session_id` 字段关联到 `extended_sessions` 用于深度测评详情查询

### 4.4 阶段过渡交互

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

### 6.1 IRT 3PL模型

**三参数Logistic模型（3-Parameter Logistic，3PL）**：

#### 模型公式

```
P(θ) = c + (1-c) / (1 + exp(-Da(θ-b)))
```

#### 参数说明

| 参数 | 名称 | 取值范围 | 说明 |
|------|------|----------|------|
| θ (theta) | 能力值 | [-4, 4] | 学生能力估计值，0为中等能力 |
| a | 区分度 | (0, 2.5] | 题目区分学生能力的能力，值越大区分度越高 |
| b | 难度 | [-3, 3] | 题目难度值，与θ同一量尺 |
| c | 猜测参数 | [0, 0.5] | 随机答对概率，四选一典型值为0.25 |
| D | 缩放因子 | 1.702 | 使Logistic接近正态累积分布的常数 |

#### 初始值设定

- **θ初始值**：0（中等能力，对应50分）
- **θ估计方法**：最大似然估计（Maximum Likelihood Estimation, MLE）
- **边界处理**：θ限制在[-4, 4]区间，防止数值溢出
- **收敛条件**：似然函数变化 < 0.001 或 达到最大迭代次数（50次）

#### JavaScript 完整实现

```javascript
/**
 * IRT 3PL模型：计算答对概率
 *
 * @param {number} theta - 学生能力值 [-4, 4]
 * @param {number} difficulty - 题目难度 b [-3, 3]
 * @param {number} discrimination - 题目区分度 a，默认1.0
 * @param {number} guessing - 猜测参数 c，默认0.25
 * @returns {number} 答对概率 P(θ) ∈ [0, 1]
 */
function threePLModel(theta, difficulty, discrimination = 1.0, guessing = 0.25) {
  const D = 1.702;
  const a = discrimination;
  const b = difficulty;
  const c = guessing;

  // 边界保护：防止数值溢出
  const safeTheta = Math.max(-4, Math.min(4, theta));
  const z = D * a * (safeTheta - b);

  // Logistic函数
  const P = c + (1 - c) / (1 + Math.exp(-z));

  return P;
}

/**
 * 最大似然估计（MLE）：估计能力值θ
 *
 * @param {Array} responses - 答题记录 [{difficulty, is_correct}, ...]
 * @param {number} initialTheta - 初始θ值，默认0
 * @param {number} maxIter - 最大迭代次数，默认50
 * @param {number} tolerance - 收敛阈值，默认0.001
 * @returns {number} 估计的能力值θ
 */
function estimateTheta(responses, initialTheta = 0, maxIter = 50, tolerance = 0.001) {
  let theta = initialTheta;

  for (let iter = 0; iter < maxIter; iter++) {
    // Newton-Raphson迭代：θ_new = θ_old + L'(θ) / L''(θ)
    let numerator = 0;  // L'(θ) 一阶导数
    let denominator = 0; // -L''(θ) 负二阶导数

    responses.forEach(r => {
      const P = threePLModel(theta, r.difficulty);
      const Q = 1 - P;
      const x = r.is_correct ? 1 : 0;

      // 一阶导数：D*a*(x-P)/(P-c)/Q
      const D = 1.702;
      const a = 1.0;
      const c = 0.25;
      const derivative = D * a * (x - P) / ((P - c) * Q);

      numerator += derivative;

      // 二阶导数：D²*a²*P*(1-P)/[(P-c)²*Q²]
      const secondDerivative = Math.pow(D * a, 2) * P * Q / Math.pow((P - c) * Q, 2);
      denominator += secondDerivative;
    });

    // 边界保护
    if (Math.abs(denominator) < 0.0001) break;

    const delta = numerator / denominator;

    // 更新θ
    theta += delta;

    // 边界限制
    theta = Math.max(-4, Math.min(4, theta));

    // 收敛判断
    if (Math.abs(delta) < tolerance) {
      break;
    }
  }

  return theta;
}

/**
 * 批量计算：给定θ和题目列表，计算各题答对概率
 *
 * @param {number} theta - 能力值
 * @param {Array} questions - 题目列表 [{difficulty, discrimination, guessing}, ...]
 * @returns {Array} 各题答对概率
 */
function batchCalculateProbabilities(theta, questions) {
  return questions.map(q => ({
    question_id: q.question_id,
    probability: threePLModel(theta, q.difficulty, q.discrimination, q.guessing)
  }));
}
```

### 6.2 Fisher信息量计算

#### 信息量公式

Fisher信息量衡量测试对能力估计的精确度：

```
I(θ) = Σ [a²D²(P-c)²(1-P)] / [P(1-P)]
```

简化形式（当 a=1, c=0.25）：

```
I(θ) = Σ [(P-0.25)² / (P×Q)]
```

其中 Q = 1 - P

#### 标准误差计算

标准误差（Standard Error, SE）反映能力估计的不确定性：

```
SE = 1/√I(θ)
```

**解读**：
- SE越小 → 估计越精确
- SE = 0.3 → 约68%置信区间为 [θ-0.3, θ+0.3]
- 对应分数误差约 ±5分

#### 边界保护

当 P 接近 0 或 1 时，分母趋近0导致数值不稳定：
- 设置安全边界：P ∈ [0.001, 0.999]
- 当 P < 0.001 时，强制设为 0.001
- 当 P > 0.999 时，强制设为 0.999

#### JavaScript 完整实现

```javascript
/**
 * 计算Fisher信息量
 *
 * @param {Array} responses - 答题记录 [{difficulty, is_correct}, ...]
 * @param {number} theta - 当前能力估计值
 * @returns {number} Fisher信息量 I(θ)
 */
function calculateFisherInformation(responses, theta) {
  let totalInfo = 0;

  const D = 1.702;
  const a_default = 1.0;
  const c_default = 0.25;

  responses.forEach(r => {
    const a = r.discrimination || a_default;
    const c = r.guessing || c_default;
    const b = r.difficulty;

    // 计算答对概率
    const P = threePLModel(theta, b, a, c);
    const Q = 1 - P;

    // 边界保护：防止P=0或P=1时分母为0
    const safeP = Math.max(0.001, Math.min(0.999, P));
    const safeQ = 1 - safeP;

    // Fisher信息量公式
    const I = Math.pow(D * a * (safeP - c), 2) / (safeP * safeQ);

    totalInfo += I;
  });

  return totalInfo;
}

/**
 * 计算标准误差
 *
 * @param {number} fisherInfo - Fisher信息量
 * @returns {number} 标准误差 SE
 */
function calculateStandardError(fisherInfo) {
  if (fisherInfo <= 0) {
    // 保守估计：当信息量为0或负时，返回最大误差
    return 1.0;
  }
  const SE = 1 / Math.sqrt(fisherInfo);
  return SE;
}

/**
 * 计算置信区间
 *
 * @param {number} theta - 能力估计值
 * @param {number} se - 标准误差
 * @param {number} confidence - 置信水平，默认0.95
 * @returns {Object} {lower, upper, margin_of_error}
 */
function calculateConfidenceInterval(theta, se, confidence = 0.95) {
  // 标准正态分布的临界值
  // 95%置信区间 → z = 1.96
  const zScores = {
    0.90: 1.645,
    0.95: 1.96,
    0.99: 2.576
  };
  const z = zScores[confidence] || 1.96;

  const marginOfError = z * se;

  return {
    lower: theta - marginOfError,
    upper: theta + marginOfError,
    margin_of_error: marginOfError,
    confidence: confidence
  };
}

/**
 * 判断是否应该继续答题
 *
 * @param {number} currentInfo - 当前Fisher信息量
 * @param {number} targetSE - 目标标准误差，默认0.3
 * @returns {boolean} 是否需要继续
 */
function shouldContinue(currentInfo, targetSE = 0.3) {
  const currentSE = calculateStandardError(currentInfo);
  return currentSE > targetSE;
}

/**
 * 完整流程示例：从答题记录到精度评估
 *
 * @param {Array} responses - 答题记录
 * @param {number} targetSE - 目标标准误差
 * @returns {Object} {theta, se, fisher_info, should_continue, confidence_interval}
 */
function assessAccuracy(responses, targetSE = 0.3) {
  // 1. 估计能力值
  const theta = estimateTheta(responses);

  // 2. 计算Fisher信息量
  const fisherInfo = calculateFisherInformation(responses, theta);

  // 3. 计算标准误差
  const se = calculateStandardError(fisherInfo);

  // 4. 判断是否继续
  const shouldContinueFlag = shouldContinue(fisherInfo, targetSE);

  // 5. 计算置信区间
  const confidenceInterval = calculateConfidenceInterval(theta, se);

  return {
    theta: theta,
    se: se,
    fisher_info: fisherInfo,
    should_continue: shouldContinueFlag,
    confidence_interval: confidenceInterval
  };
}
```

### 6.3 题目选择策略

#### 最大Fisher信息量原则

选择使信息量最大的题目，即：

```
q* = argmax I_i(θ)
```

其中 I_i(θ) 是第 i 题在能力θ处的信息量。

#### 单题信息量公式

```
I_i(θ) = [a²D²(P-c)²(1-P)] / [P(1-P)]
```

**性质**：
- 当 θ = b 时，信息量最大（题目难度与能力匹配）
- 区分度 a 越大，信息量越大
- 当 θ 远离 b 时，信息量下降

#### 选择算法

```
1. 基于当前θ估计，计算所有候选题的信息量
2. 选择信息量最大的题目
3. 如有多题信息量相近（±5%内），优先选择未答过的知识点
4. 确保题目难度分布合理（避免过度集中）
```

#### JavaScript 完整实现

```javascript
/**
 * 计算单题的Fisher信息量
 *
 * @param {number} theta - 当前能力估计值
 * @param {Object} question - 题目对象 {difficulty, discrimination, guessing}
 * @returns {number} 该题的信息量
 */
function calculateItemInformation(theta, question) {
  const a = question.discrimination || 1.0;
  const c = question.guessing || 0.25;
  const b = question.difficulty;
  const D = 1.702;

  // 计算答对概率
  const P = threePLModel(theta, b, a, c);
  const Q = 1 - P;

  // 边界保护
  const safeP = Math.max(0.001, Math.min(0.999, P));
  const safeQ = 1 - safeP;

  // 信息量公式
  const I = Math.pow(D * a * (safeP - c), 2) / (safeP * safeQ);

  return I;
}

/**
 * 选择下一题：最大Fisher信息量
 *
 * @param {number} theta - 当前能力估计值
 * @param {Array} availableQuestions - 可用题目列表
 * @param {Array} answeredQuestionIds - 已答题目ID列表（可选）
 * @returns {Object|null} 最佳题目对象
 */
function selectNextQuestion(theta, availableQuestions, answeredQuestionIds = []) {
  if (!availableQuestions || availableQuestions.length === 0) {
    return null;
  }

  let maxInfo = -Infinity;
  let bestQuestions = [];
  const answeredSet = new Set(answeredQuestionIds);

  // 计算所有题的信息量
  availableQuestions.forEach(q => {
    const info = calculateItemInformation(theta, q);

    // 优先选择未答过的题目
    const isAnswered = answeredSet.has(q.question_id);
    const adjustedInfo = isAnswered ? info * 0.9 : info; // 轻微惩罚已答题目

    if (adjustedInfo > maxInfo) {
      maxInfo = adjustedInfo;
      bestQuestions = [q];
    } else if (Math.abs(adjustedInfo - maxInfo) < 0.05 * maxInfo) {
      // 信息量相近（±5%内）
      bestQuestions.push(q);
    }
  });

  // 从最佳题目中随机选择（增加多样性）
  const selected = bestQuestions[Math.floor(Math.random() * bestQuestions.length)];

  return selected;
}

/**
 * 批量选择：一次选择多题（用于初始测评）
 *
 * @param {number} theta - 能力估计值
 * @param {Array} questionPool - 题池
 * @param {number} count - 需要的题目数量
 * @param {Object} options - 配置选项
 * @returns {Array} 选中的题目列表
 */
function selectQuestionBatch(theta, questionPool, count, options = {}) {
  const {
    preferWideRange = true,        // 优先选择难度分布广的题目
    excludeAnswered = true,        // 排除已答题目
    answeredQuestionIds = []
  } = options;

  // 按信息量排序
  const sorted = [...questionPool].map(q => ({
    question: q,
    information: calculateItemInformation(theta, q)
  })).sort((a, b) => b.information - a.information);

  let selected = [];
  let usedDifficultyRange = [];

  for (let i = 0; i < sorted.length && selected.length < count; i++) {
    const item = sorted[i];
    const q = item.question;

    // 跳过已答题目
    if (excludeAnswered && answeredQuestionIds.includes(q.question_id)) {
      continue;
    }

    // 难度多样性控制
    if (preferWideRange) {
      const difficulty = q.difficulty;
      const isTooClose = usedDifficultyRange.some(
        d => Math.abs(d - difficulty) < 0.3
      );
      if (isTooClose && selected.length < count) {
        continue; // 跳过难度过于接近的题目
      }
    }

    selected.push(q);
    usedDifficultyRange.push(q.difficulty);
  }

  // 如果选不够，放宽限制
  if (selected.length < count) {
    const remaining = sorted.filter(item =>
      !selected.find(s => s.question_id === item.question.question_id)
    );
    const needed = count - selected.length;
    selected.push(...remaining.slice(0, needed).map(item => item.question));
  }

  return selected;
}

/**
 * 预估下一题的信息量（用于进度预测）
 *
 * @param {number} theta - 当前能力值
 * @param {number} targetSE - 目标标准误差
 * @param {number} currentInfo - 当前Fisher信息量
 * @returns {Object} {estimated_questions, estimated_info_gain}
 */
function estimateProgress(theta, targetSE, currentInfo) {
  const targetInfo = 1 / (targetSE * targetSE);
  const infoGap = targetInfo - currentInfo;

  // 估计单题平均信息增益（基于θ匹配的题目）
  // 当 θ = b 时，单题最大信息量约为 1.5-2.5
  const estimatedSingleQuestionInfo = 1.8;

  const estimatedQuestionsNeeded = Math.ceil(infoGap / estimatedSingleQuestionInfo);

  return {
    estimated_questions: Math.max(1, estimatedQuestionsNeeded),
    estimated_info_gain: estimatedSingleQuestionInfo,
    target_info: targetInfo,
    current_info: currentInfo,
    info_gap: infoGap
  };
}
```

### 6.4 能力到分数转换

#### 转换原理

IRT能力值θ（latent trait）需要转换为用户可理解的百分制分数。使用标准正态分布累积函数（CDF）进行映射：

```
分数 = Φ(θ) × 100
```

其中 Φ(θ) 是标准正态分布的累积分布函数。

#### 正态累积函数近似

使用误差函数（erf）的近似实现：

```
Φ(θ) = 0.5 × [1 + erf(θ / √2)]
```

#### JavaScript 完整实现

```javascript
/**
 * 误差函数近似（用于计算正态CDF）
 * 使用 Abramowitz and Stegun 公式 7.1.26
 *
 * @param {number} x - 输入值
 * @returns {number} erf(x)
 */
function erf(x) {
  // 常数
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // 保存符号
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  // Abramowitz and Stegun 公式
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * 标准正态累积分布函数
 *
 * @param {number} x - 输入值
 * @returns {number} Φ(x) ∈ [0, 1]
 */
function normalCDF(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * 能力值θ转换为百分制分数
 * 使用正态分布累积函数：θ=0→50分, θ=1.96→97.5分
 *
 * @param {number} theta - 能力值 θ ∈ [-4, 4]
 * @param {number} minScore - 最低分，默认0
 * @param {number} maxScore - 最高分，默认100
 * @returns {number} 百分制分数 [minScore, maxScore]
 */
function thetaToScore(theta, minScore = 0, maxScore = 100) {
  // 边界限制
  const clampedTheta = Math.max(-4, Math.min(4, theta));

  // 使用正态CDF转换为[0,1]
  const probability = normalCDF(clampedTheta);

  // 映射到[minScore, maxScore]
  const score = minScore + probability * (maxScore - minScore);

  return Math.round(score);
}

/**
 * 百分制分数转换为能力值（逆转换）
 *
 * @param {number} score - 分数 [0, 100]
 * @param {number} minScore - 最低分，默认0
 * @param {number} maxScore - 最高分，默认100
 * @returns {number} 能力值 θ
 */
function scoreToTheta(score, minScore = 0, maxScore = 100) {
  // 归一化到[0,1]
  const normalized = (score - minScore) / (maxScore - minScore);

  // 正态分位数函数的近似（逆CDF）
  // 使用 Beasley-Springer-Moro 近似
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (normalized < pLow) {
    // 左尾部近似
    q = Math.sqrt(-2 * Math.log(normalized));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (normalized <= pHigh) {
    // 中间区域近似
    q = normalized - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    // 右尾部近似
    q = Math.sqrt(-2 * Math.log(1 - normalized));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * 批量转换示例
 *
 * @param {number} theta - 能力值
 * @returns {Object} 转换结果
 */
function convertThetaToScoreWithDetails(theta) {
  const score = thetaToScore(theta);
  const percentile = normalCDF(theta) * 100;

  return {
    theta: theta,
    score: score,
    percentile: percentile,
    interpretation: getInterpretation(percentile)
  };
}

/**
 * 获取分数解释
 *
 * @param {number} percentile - 百分位
 * @returns {string} 解释文本
 */
function getInterpretation(percentile) {
  if (percentile >= 95) return "优秀";
  if (percentile >= 85) return "良好";
  if (percentile >= 70) return "中等偏上";
  if (percentile >= 50) return "中等";
  if (percentile >= 30) return "中等偏下";
  if (percentile >= 15) return "待提高";
  return "需要加强";
}

// 示例使用
// thetaToScore(0) = 50 (中等能力)
// thetaToScore(1.96) ≈ 97.5 (约97.5百分位)
// thetaToScore(-1.96) ≈ 2.5 (约2.5百分位)
```

### 6.5 精度指标转换

#### SE到精度百分比转换

标准误差（SE）转换为用户友好的精度百分比：

```
accuracy = 1 - SE / maxSE
```

其中：
- `maxSE` = 1.0（最大可能标准误差）
- SE = 0 → accuracy = 100%（完全精确）
- SE = 0.3 → accuracy = 70%
- SE = 1.0 → accuracy = 0%（无精度）

#### 题目数量估算

估算达到目标精度需要的题目数：

```
N_needed = (1/targetSE² - 1/currentSE²) / info_per_question
```

假设每题平均提供 `info_per_question = 0.2` Fisher信息量。

#### 前端显示逻辑

```javascript
// 1. 计算当前精度
currentAccuracy = Math.round((1 - currentSE) * 100) + "%";

// 2. 计算目标精度
targetAccuracy = Math.round((1 - targetSE) * 100) + "%";

// 3. 估算所需题目数
questionsNeeded = estimateQuestionsNeeded(currentSE, targetSE);

// 4. 显示建议文本
建议文案 = `继续答题 ${questionsNeeded} 道，可提升至 ${targetAccuracy}`;
```

#### JavaScript 完整实现

```javascript
/**
 * 标准误差转换为精度百分比
 *
 * @param {number} se - 标准误差
 * @param {number} maxSE - 最大标准误差，默认1.0
 * @returns {number} 精度百分比 [0, 1]
 */
function seToAccuracy(se, maxSE = 1.0) {
  const accuracy = 1 - se / maxSE;
  return Math.max(0, Math.min(1, accuracy));
}

/**
 * 精度百分比转换为标准误差（逆转换）
 *
 * @param {number} accuracy - 精度百分比 [0, 1]
 * @param {number} maxSE - 最大标准误差，默认1.0
 * @returns {number} 标准误差
 */
function accuracyToSE(accuracy, maxSE = 1.0) {
  const se = (1 - accuracy) * maxSE;
  return Math.max(0, Math.min(maxSE, se));
}

/**
 * 估算达到目标精度需要的题目数
 *
 * @param {number} currentSE - 当前标准误差
 * @param {number} targetSE - 目标标准误差
 * @param {number} infoPerQuestion - 每题平均信息量，默认0.2
 * @returns {number} 所需题目数
 */
function estimateQuestionsNeeded(currentSE, targetSE, infoPerQuestion = 0.2) {
  if (currentSE <= targetSE) {
    return 0; // 已达到目标
  }

  // 计算所需Fisher信息量
  const currentInfo = 1 / (currentSE * currentSE);
  const targetInfo = 1 / (targetSE * targetSE);
  const infoGap = targetInfo - currentInfo;

  // 估算所需题目数
  const questionsNeeded = Math.ceil(infoGap / infoPerQuestion);

  return Math.max(1, questionsNeeded);
}

/**
 * 计算当前进度信息
 *
 * @param {number} currentSE - 当前标准误差
 * @param {number} targetSE - 目标标准误差
 * @param {number} currentQuestions - 当前已答题数
 * @returns {Object} 进度信息
 */
function calculateProgress(currentSE, targetSE, currentQuestions) {
  const currentAccuracy = seToAccuracy(currentSE);
  const targetAccuracy = seToAccuracy(targetSE);
  const questionsNeeded = estimateQuestionsNeeded(currentSE, targetSE);

  // 进度百分比（基于精度提升）
  const accuracyProgress = currentAccuracy / targetAccuracy;

  // 预计总题数
  const estimatedTotal = currentQuestions + questionsNeeded;

  // 预计完成时间（假设每题30秒）
  const estimatedTime = questionsNeeded * 30;

  return {
    current_accuracy: Math.round(currentAccuracy * 100) / 100,  // 0-1
    target_accuracy: Math.round(targetAccuracy * 100) / 100,    // 0-1
    current_accuracy_percent: Math.round(currentAccuracy * 100) + "%",
    target_accuracy_percent: Math.round(targetAccuracy * 100) + "%",
    questions_needed: questionsNeeded,
    current_questions: currentQuestions,
    estimated_total: estimatedTotal,
    progress_percentage: Math.min(100, Math.round(accuracyProgress * 100)),
    estimated_time_seconds: estimatedTime,
    estimated_time_minutes: Math.ceil(estimatedTime / 60)
  };
}

/**
 * 生成用户友好的精度建议文案
 *
 * @param {Object} progress - calculateProgress返回的进度信息
 * @returns {Object} 建议文案
 */
function generateRecommendation(progress) {
  const { current_accuracy_percent, target_accuracy_percent, questions_needed, estimated_time_minutes } = progress;

  let recommendation = "";
  let actionText = "";

  if (questions_needed === 0) {
    recommendation = `当前精度${current_accuracy_percent}，已达到目标精度！`;
    actionText = "查看结果";
  } else if (questions_needed <= 3) {
    recommendation = `当前精度${current_accuracy_percent}，只需再答${questions_needed}题即可达到${target_accuracy_percent}精度`;
    actionText = "继续完成";
  } else if (questions_needed <= 7) {
    recommendation = `当前精度${current_accuracy_percent}，建议继续答题提升至${target_accuracy_percent}`;
    actionText = "继续测评";
  } else {
    recommendation = `当前精度${current_accuracy_percent}，建议完成${questions_needed}题以达到目标精度`;
    actionText = "继续测评";
  }

  return {
    recommendation: recommendation,
    action_text: actionText,
    detailed_message: `预计还需 ${estimated_time_minutes} 分钟`,
    should_extend: questions_needed > 0
  };
}

/**
 * 完整的精度评估流程
 *
 * @param {Array} responses - 答题记录
 * @param {number} targetSE - 目标标准误差
 * @returns {Object} 完整评估结果
 */
function evaluateAccuracy(responses, targetSE = 0.3) {
  // 1. 估计能力值
  const theta = estimateTheta(responses);

  // 2. 计算Fisher信息量
  const fisherInfo = calculateFisherInformation(responses, theta);

  // 3. 计算当前标准误差
  const currentSE = calculateStandardError(fisherInfo);

  // 4. 计算进度信息
  const progress = calculateProgress(currentSE, targetSE, responses.length);

  // 5. 生成建议
  const recommendation = generateRecommendation(progress);

  // 6. 转换为分数
  const score = thetaToScore(theta);

  return {
    theta: theta,
    score: score,
    current_se: currentSE,
    target_se: targetSE,
    fisher_information: fisherInfo,
    progress: progress,
    recommendation: recommendation,
    confidence_interval: calculateConfidenceInterval(theta, currentSE)
  };
}

// ==================== 前端显示示例 ====================

/**
 * 前端精度仪表盘组件数据准备
 *
 * @param {Object} evaluation - evaluateAccuracy返回的结果
 * @returns {Object} 前端显示数据
 */
function prepareAccuracyMeterData(evaluation) {
  return {
    // 当前精度显示
    currentAccuracy: evaluation.progress.current_accuracy_percent,
    targetAccuracy: evaluation.progress.target_accuracy_percent,

    // 进度条
    progressPercent: evaluation.progress.progress_percentage,
    progressColor: getProgressColor(evaluation.progress.progress_percentage),

    // 建议卡片
    recommendationText: evaluation.recommendation.recommendation,
    actionText: evaluation.recommendation.action_text,
    detailedMessage: evaluation.recommendation.detailed_message,
    shouldExtend: evaluation.recommendation.should_extend,

    // 预计信息
    questionsNeeded: evaluation.progress.questions_needed,
    estimatedTime: evaluation.progress.estimated_time_minutes,
    estimatedTotal: evaluation.progress.estimated_total
  };
}

/**
 * 根据进度百分比获取颜色
 *
 * @param {number} percent - 进度百分比 [0, 100]
 * @returns {string} 颜色值（CSS）
 */
function getProgressColor(percent) {
  if (percent >= 80) return "#52c41a";  // 绿色
  if (percent >= 60) return "#1890ff";  // 蓝色
  if (percent >= 40) return "#faad14";  // 橙色
  return "#f5222d";                      // 红色
}
```

---

## 七、API设计

### 7.1 extendedAssessment 云函数接口

#### 1. 启动深度测评

**请求格式**：
```json
{
  "grade": "初一",
  "subject": "数学",
  "mode": "depth"
}
```

**响应格式**：
```json
{
  "success": true,
  "session_id": "extended_xxx",
  "questions": [
    {
      "question_id": "q_xxx",
      "content": "题目内容",
      "options": ["A", "B", "C", "D"],
      "difficulty": -0.5
    }
  ],
  "phase": "first",
  "target_se": 0.3,
  "estimated_time": 300
}
```

#### 2. 提交答案 + 获取建议

**请求格式**：
```json
{
  "session_id": "extended_xxx",
  "answers": [
    {"question_id": "q_xxx", "user_answer": "A"},
    {"question_id": "q_yyy", "user_answer": "C"}
  ]
}
```

**响应格式**：
```json
{
  "success": true,
  "current_score": 75,
  "current_se": 0.35,
  "current_accuracy": 0.85,
  "recommendation": {
    "should_extend": true,
    "reason": "当前精度85%，建议继续答题提升至95%",
    "estimated_questions": 5,
    "estimated_time": 180
  }
}
```

#### 3. 获取下一题（扩展阶段）

**请求格式**：
```json
{
  "session_id": "extended_xxx"
}
```

**响应格式**：
```json
{
  "success": true,
  "question": {
    "question_id": "q_zzz",
    "content": "题目内容",
    "options": ["A", "B", "C", "D"],
    "difficulty": 0.2
  },
  "current_se": 0.28,
  "progress": {
    "current_question": 8,
    "estimated_total": 12
  }
}
```

#### 4. 完成测评

**请求格式**：
```json
{
  "session_id": "extended_xxx"
}
```

**响应格式**：
```json
{
  "success": true,
  "final_score": 82,
  "final_theta": 0.55,
  "final_se": 0.25,
  "confidence_interval": {
    "lower": 77,
    "upper": 87,
    "confidence": 0.95
  },
  "detailed_report": {
    "total_questions": 12,
    "correct_count": 9,
    "extended_questions": 7,
    "fisher_information": 16.0
  }
}
```

### 7.2 错误处理

**所有API统一错误响应格式**：
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "用户友好的错误描述",
    "details": "技术细节（开发环境）"
  }
}
```

**错误码定义**：

| 错误码 | HTTP状态 | 说明 | 降级策略 |
|--------|---------|------|----------|
| INSUFFICIENT_QUESTIONS | 200 | 题库题目不足 | 返回可用的题目并警告 |
| LLM_GENERATION_FAILED | 200 | LLM生成失败 | 使用预生成题库 |
| SESSION_NOT_FOUND | 404 | 会话不存在 | 提示重新开始 |
| INVALID_ANSWER_FORMAT | 400 | 答案格式错误 | 拒绝并提示正确格式 |
| THETA_ESTIMATION_FAILED | 500 | 能力估计失败 | 返回保守估计值 |
| MAX_QUESTIONS_REACHED | 200 | 达到最大题数 | 强制完成测评 |
| NETWORK_TIMEOUT | 200 | 网络超时 | 返回当前精度建议完成 |
| INVALID_PARAMS | 400 | 请求参数无效 | 返回参数说明 |
| RATE_LIMIT_EXCEEDED | 429 | 请求频率超限 | 返回重试延迟 |
| DATABASE_ERROR | 500 | 数据库操作失败 | 返回友好提示+告警 |

**降级策略**：

1. **题目生成失败**：优先使用预生成题库 → 复用历史题目
2. **Fisher计算异常**：使用题目数量作为精度估计（N题 → 精度=√N/10）
3. **会话状态丢失**：基于答题记录重建会话 → 提示重新开始

#### 完整TypeScript接口定义

```typescript
// ========== 1. startExtendedAssessment ==========

interface StartExtendedAssessmentRequest {
  grade: "初一" | "初二" | "初三" | "高一" | "高二" | "高三";
  subject: "数学" | "语文" | "英语" | "物理" | "化学" | "生物" | "地理" | "历史" | "政治";
  mode?: "depth" | "quick";  // 默认 depth
}

interface StartExtendedAssessmentResponse {
  success: true;
  session_id: string;              // 格式: extended_<timestamp>_<openid_short>
  questions: Question[];
  phase: "first";                 // 固定为第一阶段
  target_se: number;              // 目标标准误差，默认 0.3
  estimated_time: number;         // 预计完成时间（秒），默认 300
}

interface Question {
  question_id: string;            // 格式: q_<timestamp>_<hash>
  content: string;                // 题目内容（纯文本或Markdown）
  options: string[];              // 选项数组
  difficulty: number;             // 难度参数 θ，范围 [-3, 3]
  knowledge_point_id?: string;    // 知识点ID（可选）
  type?: "choice" | "fill";       // 题型（默认choice）
}

// ========== 2. submitAnswers ==========

interface SubmitAnswersRequest {
  session_id: string;
  answers: UserAnswer[];
}

interface UserAnswer {
  question_id: string;
  user_answer: "A" | "B" | "C" | "D";
  response_time?: number;              // 答题用时（秒，可选）
}

interface SubmitAnswersResponse {
  success: true;
  current_score: number;              // 当前得分 [0, 100]
  current_theta: number;              // 当前能力估计 θ
  current_se: number;                  // 当前标准误差
  current_accuracy: number;           // 当前精度（百分比 0-1）
  recommendation: ExtensionRecommendation;
}

interface ExtensionRecommendation {
  should_extend: boolean;             // 是否建议继续答题
  reason: string;                     // 建议说明（用户友好文本）
  estimated_questions: number;        // 预计还需题目数
  estimated_time: number;             // 预计还需时间（秒）
  current_info: number;               // 当前Fisher信息量
  target_info: number;                // 目标Fisher信息量
}

// ========== 3. getNextQuestion ==========

interface GetNextQuestionRequest {
  session_id: string;
}

interface GetNextQuestionResponse {
  success: true;
  question: Question;                 // 下一题内容
  current_se: number;                 // 当前标准误差
  progress: ProgressInfo;
}

interface ProgressInfo {
  current_question: number;           // 当前题目序号（从1开始）
  estimated_total: number;            // 预计总题数
  phase: "extending";                 // 固定为扩展阶段
  accuracy_percentage: number;        // 当前精度百分比
}

// ========== 4. completeAssessment ==========

interface CompleteAssessmentRequest {
  session_id: string;
}

interface CompleteAssessmentResponse {
  success: true;
  final_score: number;                // 最终得分 [0, 100]
  final_theta: number;                // 最终能力估计 θ
  final_se: number;                   // 最终标准误差
  confidence_interval: ConfidenceInterval;
  detailed_report: DetailedReport;
}

interface ConfidenceInterval {
  lower: number;                      // 置信区间下限
  upper: number;                      // 置信区间上限
  confidence: number;                 // 置信水平，默认 0.95
  margin_of_error: number;             // 误差范围 (upper - lower) / 2
}

interface DetailedReport {
  total_questions: number;            // 总题数
  correct_count: number;              // 正确题数
  extended_questions: number;         // 扩展阶段题数（第一阶段外）
  fisher_information: number;         // 最终Fisher信息量
  response_time_avg: number;          // 平均答题时间（秒）
  difficulty_distribution: {          // 难度分布
    easy: number;     // θ < -1
    medium: number;   // -1 ≤ θ ≤ 1
    hard: number;     // θ > 1
  };
  improvement_suggestion?: string;    // 学习建议（可选）
}

// ========== 5. 统一错误响应 ==========

interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: string;
    timestamp: number;
    request_id?: string;
  };
}

type ErrorCode =
  | "INSUFFICIENT_QUESTIONS"
  | "LLM_GENERATION_FAILED"
  | "SESSION_NOT_FOUND"
  | "INVALID_ANSWER_FORMAT"
  | "THETA_ESTIMATION_FAILED"
  | "MAX_QUESTIONS_REACHED"
  | "NETWORK_TIMEOUT"
  | "INVALID_PARAMS"
  | "RATE_LIMIT_EXCEEDED"
  | "DATABASE_ERROR";
```

#### 错误处理详细示例

**示例1：题目不足**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_QUESTIONS",
    "message": "当前题库正在补充中，已为您返回可用题目",
    "details": "Available: 2/5, Difficulty range: [-0.5, 0.5]",
    "timestamp": 1718352000000
  }
}
```

**示例2：LLM生成失败**
```json
{
  "success": false,
  "error": {
    "code": "LLM_GENERATION_FAILED",
    "message": "题目生成遇到问题，正在从备用题库抽取",
    "details": "DeepSeek API timeout after 45s, Retry: 1/3",
    "timestamp": 1718352060000,
    "request_id": "req_abc123"
  }
}
```

**示例3：会话过期**
```json
{
  "success": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "测评已过期，请重新开始",
    "details": "Session extended_xxx not found or expired after 24h",
    "timestamp": 1718352120000
  }
}
```

#### 错误降级流程

```
错误发生 → 检查错误类型
  ├─ 可恢复错误（LLM超时、网络波动、题库不足）
  │   ↓ 执行重试（最多3次，指数退避：1s → 2s → 4s）
  │   成功 → 返回结果 | 失败 → 进入降级策略
  ├─ 业务逻辑错误（参数无效、会话不存在、答案格式错误）
  │   ↓ 立即返回错误提示（不重试）
  └─ 严重错误（数据库故障、系统崩溃）
      ↓ 返回友好提示 + 触发告警
```

#### 前端错误处理建议

```javascript
function handleApiError(error) {
  switch (error.code) {
    case 'INSUFFICIENT_QUESTIONS':
      wx.showToast({ title: '题库补充中，已返回可用题目', icon: 'none' });
      break;
    case 'LLM_GENERATION_FAILED':
      wx.showLoading({ title: '正在重试...' });
      break;
    case 'SESSION_NOT_FOUND':
      wx.showModal({
        title: '提示', content: '测评已过期，是否重新开始？',
        success: (res) => { if (res.confirm) restartAssessment(); }
      });
      break;
    case 'INVALID_ANSWER_FORMAT':
      wx.showToast({ title: '答案格式有误，请重新选择', icon: 'none' });
      break;
    case 'THETA_ESTIMATION_FAILED':
      wx.showModal({ title: '提示', content: '答题模式异常，建议重新测评', showCancel: false });
      break;
    case 'MAX_QUESTIONS_REACHED':
      wx.showModal({ title: '提示', content: '已达到最大题数，正在生成结果...', showCancel: false });
      break;
    default:
      wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none' });
  }
}
```

---

## 八、兼容性保证

### 8.1 现有用户流程

- `startAssessment` 云函数保持不变（现有快速测评）
- 现有验收测试无需修改
- `assessments` 集合保持现有格式
- 现有用户继续使用5题快速测评
- 新增 `extendedAssessment.startExtendedAssessment` 云函数（深度测评）

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
  describe('Fisher信息量计算', () => {
    test('应该正确计算Fisher信息量', () => {
      const responses = [
        { difficulty: -1, is_correct: true },
        { difficulty: 0, is_correct: true },
        { difficulty: 1, is_correct: false }
      ];

      const info = calculateFisherInformation(responses, 0);

      expect(info).toBeGreaterThan(0);
      expect(info).toBeLessThan(20);
    });

    test('应该处理边界情况（P接近0或1）', () => {
      const responses = [
        { difficulty: -3, is_correct: true },  // P≈1
        { difficulty: 3, is_correct: false }   // P≈0
      ];

      const info = calculateFisherInformation(responses, 0);

      expect(info).not.toBeNaN();
      expect(info).toBeFinite();
    });
  });

  describe('题目选择策略', () => {
    test('应该选择最大信息量题目', () => {
      const theta = 0.5;
      const questions = [
        { id: 'q1', difficulty: -2 },
        { id: 'q2', difficulty: 0.5 },  // 应该选这个（最接近theta）
        { id: 'q3', difficulty: 2 }
      ];

      const selected = selectNextQuestion(theta, questions);

      expect(selected.id).toBe('q2');
    });
  });

  describe('精度转换', () => {
    test('应该正确转换SE到精度百分比', () => {
      expect(seToAccuracy(0.3)).toBeCloseTo(0.7, 1);  // 70%
      expect(seToAccuracy(0.5)).toBeCloseTo(0.5, 1);  // 50%
      expect(seToAccuracy(0.1)).toBeCloseTo(0.9, 1);  // 90%
    });

    test('应该估算所需题目数', () => {
      const questions = estimateQuestionsNeeded(0.5, 0.3);

      expect(questions).toBeGreaterThan(0);
      expect(questions).toBeLessThan(20);
    });
  });

  describe('能力到分数转换', () => {
    test('应该正确转换theta到分数', () => {
      expect(thetaToScore(0)).toBe(50);    // 中等能力 → 50分
      expect(thetaToScore(-3)).toBe(0);    // 低能力 → 0分
      expect(thetaToScore(3)).toBe(100);   // 高能力 → 100分
    });
  });
});

// __tests__/question-optimizer.test.js
describe('QuestionOptimizer', () => {
  test('应该优先复用已有题目', async () => {
    const mockCriteria = { grade: '初一', subject: '数学', difficulty: 0 };
    const result = await questionOptimizer.getQuestions(mockCriteria);

    expect(result.questions).toBeDefined();
    expect(result.source).toBeOneOf(['cached', 'pregenerate', 'generated']);
  });

  test('应该正确执行预生成策略', async () => {
    const hotTopics = ['代数基础', '方程求解'];
    await questionOptimizer.pregenerateStrategy(hotTopics);

    // 验证预生成题目已缓存
    const cached = await questionOptimizer.getPreGeneratedQuestions('代数基础');
    expect(cached.length).toBeGreaterThan(0);
  });
});
```

### 9.2 集成测试

```javascript
// __tests__/integration/extended-flow.test.js
describe('深度测评完整流程', () => {
  test('从开始到完成的完整流程', async () => {
    // 1. 启动测评
    const startResult = await startExtendedAssessment({
      grade: '初一',
      subject: '数学'
    });

    expect(startResult.success).toBe(true);
    expect(startResult.questions).toHaveLength(5);
    expect(startResult.session_id).toBeDefined();

    // 2. 提交第一阶段答案
    const submitResult = await submitAnswers({
      session_id: startResult.session_id,
      answers: startResult.questions.map((q, i) => ({
        question_id: q.question_id,
        user_answer: ['A', 'B', 'C', 'D'][i % 4]
      }))
    });

    expect(submitResult.success).toBe(true);
    expect(submitResult.current_se).toBeGreaterThan(0);
    expect(submitResult.recommendation).toHaveProperty('should_extend');

    // 3. 如果需要扩展，获取下一题
    if (submitResult.recommendation.should_extend) {
      const nextResult = await getNextQuestion({
        session_id: startResult.session_id
      });

      expect(nextResult.success).toBe(true);
      expect(nextResult.question).toBeDefined();
    }

    // 4. 完成测评
    const completeResult = await completeAssessment({
      session_id: startResult.session_id
    });

    expect(completeResult.success).toBe(true);
    expect(completeResult.final_score).toBeGreaterThanOrEqual(0);
    expect(completeResult.final_score).toBeLessThanOrEqual(100);
    expect(completeResult.confidence_interval).toHaveProperty('lower');
    expect(completeResult.confidence_interval).toHaveProperty('upper');
  });

  test('用户选择不扩展应该直接完成', async () => {
    // 启动测评并提交答案
    const startResult = await startExtendedAssessment({ grade: '初一', subject: '数学' });
    const submitResult = await submitAnswers({
      session_id: startResult.session_id,
      answers: [{ question_id: 'q1', user_answer: 'A' }]
    });

    // 即使系统建议扩展，用户也可以直接完成
    const completeResult = await completeAssessment({
      session_id: startResult.session_id
    });

    expect(completeResult.success).toBe(true);
    expect(completeResult.detailed_report.total_questions).toBe(5);
  });

  test('达到最大题数应该强制完成', async () => {
    const session_id = 'max_questions_session';

    // 模拟达到30题
    for (let i = 0; i < 30; i++) {
      await getNextQuestion({ session_id });
    }

    // 第31题应该被拒绝
    const nextResult = await getNextQuestion({ session_id });

    expect(nextResult.error.code).toBe('MAX_QUESTIONS_REACHED');
  });

  test('精度仪表盘显示正确', async () => {
    const startResult = await startExtendedAssessment({ grade: '初一', subject: '数学' });
    const submitResult = await submitAnswers({
      session_id: startResult.session_id,
      answers: [{ question_id: 'q1', user_answer: 'A' }]
    });

    // 验证精度计算
    expect(submitResult.current_accuracy).toBeGreaterThan(0);
    expect(submitResult.current_accuracy).toBeLessThanOrEqual(1);

    // 验证精度与SE的转换
    const expectedAccuracy = 1 - submitResult.current_se;
    expect(submitResult.current_accuracy).toBeCloseTo(expectedAccuracy, 1);
  });
});
```

### 9.3 E2E测试

```javascript
// __tests__/e2e/extended-assessment.e2e.js
describe('深度测评E2E测试', () => {
  test('完整用户流程：从入口到结果', async ({ page }) => {
    // 1. 导航到深度测评页面
    await page.goto('/pages/assessment-depth/index');

    // 2. 点击开始测评
    await page.click('[data-testid="start-button"]');

    // 3. 等待第一题加载
    await page.waitForSelector('[data-testid="question-content"]');

    // 4. 选择答案并提交
    await page.click('[data-value="A"]');
    await page.click('[data-testid="submit-button"]');

    // 5. 重复5题后，查看精度仪表盘
    await page.waitForSelector('[data-testid="accuracy-meter"]');
    const accuracyText = await page.textContent('[data-testid="accuracy-value"]');
    expect(accuracyText).toMatch(/\d+%/);

    // 6. 查看系统建议
    await page.waitForSelector('[data-testid="recommendation-card"]');
    const recommendation = await page.textContent('[data-testid="recommendation-text"]');
    expect(recommendation).toContain('精度');

    // 7. 选择继续测评
    await page.click('[data-testid="continue-button"]');

    // 8. 完成扩展题目
    await page.waitForSelector('[data-testid="final-score"]');
    const finalScore = await page.textContent('[data-testid="final-score"]');
    expect(finalScore).toMatch(/\d+/);
  });

  test('用户选择快速完成应该正常结束', async ({ page }) => {
    await page.goto('/pages/assessment-depth/index');
    await page.click('[data-testid="start-button"]');

    // 完成5题
    for (let i = 0; i < 5; i++) {
      await page.click('[data-value="A"]');
      await page.click('[data-testid="submit-button"]');
    }

    // 在建议卡片选择"查看结果"
    await page.click('[data-testid="view-results-button"]');

    // 验证显示最终结果
    await page.waitForSelector('[data-testid="final-score"]');
    expect(await page.textContent('[data-testid="final-score"]')).toMatch(/\d+/);
  });
});
```

---

## 十、实施计划

### Sprint 1（2周）：基础架构
- 创建 `extendedAssessment` 云函数骨架
- 实现 `startExtendedAssessment` 入口函数
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
