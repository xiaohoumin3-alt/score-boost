# Extended Sessions Data Model

## 集合名称
`extended_sessions`

## 用途
存储深度测评会话数据，支持两阶段自适应测评：
- 第一阶段：5题快速测评（复用startAssessment逻辑）
- 第二阶段：动态扩展测评（基于Fisher信息量）

## 数据结构

```typescript
interface ExtendedSession {
  // 主键
  _id: string;

  // 用户信息
  user_openid: string;

  // 测评基本信息
  session_id: string;              // 会话唯一标识
  grade: number;                    // 年级 (1-9)
  subject: string;                  // 科目 (math/chinese/english等)
  assessment_type: "extended";      // 固定为扩展类型

  // 第一阶段数据（5题快速测评）
  phase1: {
    assessment_id?: string;         // 关联的快速测评ID（可选）
    questions: Question[];          // 5题题目列表
    answers: UserAnswer[];         // 5题答题记录
    completed_at?: number;          // 完成时间戳
  };

  // 第二阶段数据（动态扩展）
  phase2: {
    enabled: boolean;               // 是否启用扩展
    questions: Question[];          // 扩展题目列表
    answers: UserAnswer[];          // 扩展答题记录
    started_at?: number;            // 扩展开始时间
  };

  // IRT能力估计
  ability_estimate: {
    theta: number;                  // 能力估计值 θ ∈ [-4, 4]
    se: number;                     // 标准误差
    fisher_info: number;            // Fisher信息量
    confidence_interval?: {         // 95%置信区间
      lower: number;
      upper: number;
    };
  };

  // 分数转换
  score: {
    raw: number;                    // 原始分数 [0, 100]
    percentile: number;            // 百分位 [0, 100]
    interpretation: string;         // 等级解释
  };

  // 会话状态
  status: "initialized" | "phase1_completed" | "extending" | "completed" | "expired";

  // 时间戳
  created_at: number;               // 创建时间
  updated_at: number;               // 最后更新时间
  completed_at?: number;           // 完成时间

  // 扩展建议
  extension_recommendation?: {
    should_extend: boolean;         // 是否建议继续
    reason: string;                 // 建议说明
    estimated_questions: number;    // 预计还需题数
    estimated_time: number;         // 预计还需时间（秒）
  };

  // 详细报告（完成后生成）
  detailed_report?: {
    total_questions: number;         // 总题数
    correct_count: number;           // 正确题数
    extended_questions: number;     // 扩展题数
    fisher_information: number;     // 最终Fisher信息量
    response_time_avg: number;      // 平均答题时间
    difficulty_distribution: {      // 难度分布
      easy: number;                 // θ < -1
      medium: number;               // -1 ≤ θ ≤ 1
      hard: number;                 // θ > 1
    };
    improvement_suggestion?: string;// 学习建议
  };

  // 题目复用记录
  question_reuse?: {
    reused_count: number;           // 复用题目数
    generated_count: number;        // 新生成题目数
    saved_questions: string[];      // 已保存题目ID列表（供复用）
  };
}

interface Question {
  question_id: string;
  content: string;
  options: string[];
  correct_answer: "A" | "B" | "C" | "D";
  difficulty: number;              // 题目难度（IRT b参数）
  discrimination?: number;         // 区分度（IRT a参数）
  guessing?: number;                // 猜测参数（IRT c参数）
  kp_id: string;                   // 知识点ID
  kp_name: string;                 // 知识点名称
}

interface UserAnswer {
  question_id: string;
  user_answer: "A" | "B" | "C" | "D";
  is_correct: boolean;
  response_time?: number;          // 答题用时（秒）
  answered_at: number;             // 答题时间戳
}
```

## 索引设计

在云开发控制台或CloudBase管理端配置以下索引。不要在小程序端运行时创建索引。

| 索引名 | 字段 | 用途 |
|--------|------|------|
| `idx_user_status_created` | `user_openid` 升序、`status` 升序、`created_at` 降序 | 用户历史和会话状态查询 |
| `idx_session_id` | `session_id` 唯一索引 | 会话详情查询 |
| `idx_status_created` | `status` 升序、`created_at` 升序 | 过期会话清理 |

如果使用CloudBase CLI或部署脚本管理索引，请按上述字段保持一致。

## 状态流转

```
initialized → phase1_completed → extending → completed
                                          ↓
                                       expired (24h超时)
```

## 数据一致性规则

1. **phase1与assessments的关系**：
   - phase1.assessment_id可选地关联到assessments集合
   - 但数据完全独立存储，避免依赖

2. **完成后的同步**：
   - completed状态时，同步写入assessments集合
   - assessment_type: 'extended'用于区分

3. **题目复用策略**：
   - question_reuse.saved_questions存储可复用题目ID
   - 优先从ai_question_pool复用，减少LLM调用

## 与现有集合的关系

| 集合 | 关系 | 用途 |
|------|------|------|
| assessments | 独立但同步 | 完成后同步历史记录 |
| ai_question_pool | 读取 | 题目来源 |
| question_queue | 写入 | 需要时触发题目生成 |

## 创建集合步骤

1. 打开微信云开发控制台，选择环境 `cloud1-7gg9y9tjb2b867b6`。
2. 在数据库中创建集合 `extended_sessions`。
3. 按“索引设计”表配置3个索引。
4. 配置集合权限：仅云函数可读写，前端不直接访问。

## 验证查询

在云函数环境中执行以下查询验证集合可用：

```javascript
const result = await db.collection('extended_sessions').where({
  user_openid: 'test_user',
  status: 'completed'
}).orderBy('created_at', 'desc').get();

console.log('查询验证通过', result.data);
```
