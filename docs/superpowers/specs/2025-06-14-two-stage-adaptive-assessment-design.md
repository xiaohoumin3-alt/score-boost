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

**三参数Logistic模型（3-Parameter Logistic）**：

```javascript
/**
 * 3PL模型：计算答对概率
 * P(θ) = c + (1-c) / (1 + exp(-Da(θ-b)))
 *
 * 参数说明：
 * - θ：学生能力值（通常在[-3, 3]区间）
 * - a：区分度（题目区分学生能力的能力，通常>0）
 * - b：难度（题目难度值，通常在[-3, 3]区间）
 * - c：猜测参数（随机答对概率，通常=0.25）
 * - D：缩放因子（=1.702，使Logistic接近正态累积分布）
 */
function threePLModel(theta, difficulty, discrimination = 1.0, guessing = 0.25) {
  const D = 1.702;
  const a = discrimination;
  const b = difficulty;
  const c = guessing;

  const z = D * a * (theta - b);
  const P = c + (1 - c) / (1 + Math.exp(-z));

  return P;
}
```

**初始值设定**：
- **θ初始值**：0（中等能力）
- **θ估计方法**：最大似然估计（MLE）
- **边界处理**：θ限制在[-4, 4]区间，防止数值溢出

### 6.2 Fisher信息量计算

```javascript
/**
 * 计算当前响应的Fisher信息量
 * I(θ) = Σ[a²D²(P-c)²(1-P)/P] / [D²a²(1-c)²]
 *
 * 简化形式（a=1, c=0.25）：
 * I(θ) = Σ[(P-0.25)² / (P×Q)]
 *
 * 其中 Q = 1 - P
 */
function calculateFisherInformation(responses, theta) {
  let totalInfo = 0;

  responses.forEach(r => {
    const P = threePLModel(theta, r.difficulty);
    const Q = 1 - P;

    // 边界保护：防止P=0或P=1时分母为0
    const safeP = Math.max(0.001, Math.min(0.999, P));

    const a = 1.0;
    const c = 0.25;
    const I = Math.pow(a * (safeP - c), 2) / (safeP * (1 - safeP));
    totalInfo += I;
  });

  return totalInfo;
}

/**
 * 计算标准误差
 * SE = 1/√I(θ)
 */
function calculateStandardError(fisherInfo) {
  if (fisherInfo <= 0) return 1.0; // 保守估计
  return 1 / Math.sqrt(fisherInfo);
}

/**
 * 判断是否应该继续
 * 目标：SE ≤ 0.3 (约±5分误差)
 */
function shouldContinue(currentInfo, targetSE = 0.3) {
  const currentSE = calculateStandardError(currentInfo);
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

  // 边界保护
  const safeP = Math.max(0.001, Math.min(0.999, P));
  return Math.pow(1 * (safeP - 0.25), 2) / (safeP * (1 - safeP));
}
```

### 6.3 能力到分数转换

```javascript
/**
 * 将能力值θ转换为百分制分数
 * 使用线性映射：θ在[-3, 3]映射到[0, 100]
 */
function thetaToScore(theta) {
  // 限制θ在[-3, 3]区间
  const clampedTheta = Math.max(-3, Math.min(3, theta));

  // 线性映射：-3 → 0分，0 → 50分，3 → 100分
  const score = 50 + (clampedTheta / 3) * 50;

  return Math.round(score);
}

/**
 * 百分制分数到能力值（逆转换）
 */
function scoreToTheta(score) {
  // 限制分数在[0, 100]区间
  const clampedScore = Math.max(0, Math.min(100, score));

  // 线性映射：0分 → -3，50分 → 0，100分 → 3
  const theta = ((clampedScore - 50) / 50) * 3;

  return theta;
}
```

### 6.4 精度指标转换

```javascript
/**
 * 将标准误差转换为用户友好的精度百分比
 * accuracy = 1 - SE / maxSE
 *
 * 其中 maxSE = 1.0（最大误差）
 */
function seToAccuracy(se) {
  const maxSE = 1.0;
  const accuracy = 1 - se / maxSE;
  return Math.max(0, Math.min(1, accuracy)); // 限制在[0, 1]
}

/**
 * 估算达到目标精度需要的题目数
 * 基于经验公式：每增加1题约增加0.2 Fisher信息量
 */
function estimateQuestionsNeeded(currentSE, targetSE = 0.3) {
  const currentInfo = 1 / (currentSE * currentSE);
  const targetInfo = 1 / (targetSE * targetSE);
  const infoGap = targetInfo - currentInfo;

  // 每题平均提供0.2信息量（保守估计）
  const questionsNeeded = Math.ceil(infoGap / 0.2);

  return Math.max(1, questionsNeeded);
}

/**
 * 前端显示逻辑
 */
// 在精度仪表盘中
currentAccuracy = Math.round(seToAccuracy(currentSE) * 100) + "%";
targetAccuracy = Math.round(seToAccuracy(targetSE) * 100) + "%";
questionsNeeded = estimateQuestionsNeeded(currentSE, targetSE);
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

**降级策略**：

1. **题目生成失败**：优先使用预生成题库 → 复用历史题目
2. **Fisher计算异常**：使用题目数量作为精度估计（N题 → 精度=√N/10）
3. **会话状态丢失**：基于答题记录重建会话 → 提示重新开始

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
