# 提分神器 AI原生架构设计

> 设计日期: 2026-05-25
> 核心原则: 前端极简，后端极智

## 一、设计目标

### 1.1 核心问题

当前提分神器的AI使用仅限于题目生成（5% AI能力），与DeepTutor等AI原生产品差距巨大。

**主要问题：**
- 无记忆：每次练习都是全新的，AI不记得学生之前的错因
- 静态路径：学习路径预设，不根据实际掌握度调整
- 被动触发：学生主动练习，AI不会主动提醒/推送
- 浅层AI：仅用于生成题目文本，没有推理能力

### 1.2 设计目标

**界面目标：**
- 极简易用，像ChatGPT一样只有一个输入框/一个卡片
- 用户不需要思考"今天学什么"
- 打开即练，三步完成

**AI目标：**
- 持久记忆学生所有学习历史
- 深度分析错因，而非简单记录对错
- 动态规划学习路径
- 主动推送个性化任务

### 1.3 核心原则

**前端极简，后端极智**

```
用户看到的          AI在后台做的
─────────────────────────────────────
"今日任务"卡    ←   AI分析了300+条练习记录
                 ←   识别出3个薄弱知识点
                 ←   生成了针对性题目
                 ←   预估了学习时间
                 ←   排序了优先级
```

---

## 二、界面设计

### 2.1 首页（大改版）

**当前问题：** 信息过载，用户不知道该做什么

**设计原则：** 一个核心行动点

```
┌─────────────────────────────────────┐
│     你离85分还差12分                 │  ← 状态条
├─────────────────────────────────────┤
│                                     │
│   🎯 今日任务                        │
│   二次根式·5分钟                     │
│                                     │
│   因为你昨天在√(a²)=|a|上错了2次     │  ← AI理由
│                                     │
│   [开始练习]                         │  ← 核心行动
│                                     │
├─────────────────────────────────────┤
│   我想自己选知识点 >                  │  ← 次要入口
└─────────────────────────────────────┘
```

**界面元素：**
1. **状态条**：离目标多远
2. **AI任务卡**：今天做什么、为什么、多久
3. **其他入口**：折叠，避免干扰

### 2.2 练习页（极简模式）

```
┌─────────────────────────────────────┐
│        第 3 / 5 题                   │
├─────────────────────────────────────┤
│                                     │
│   已知实数a满足-3<a<2，              │
│   化简|a+3|+|a-2|的结果是？          │
│                                     │
├─────────────────────────────────────┤
│   [ A ] 5     [ C ] 2               │
│   [ B ] 4     [ D ] 1               │
├─────────────────────────────────────┤
│   [提交]      [AI提示 ▼]             │  ← 新增
└─────────────────────────────────────┘
```

**新增"AI提示"功能：**
- 点击展开AI提示（不是答案）
- 基于学生常见错误模式
- 逐步引导思考

**AI提示示例：**
```
💡 AI提示：
第1步：先确定a+3和a-2的符号
第2步：去掉绝对值符号
需要更详细提示？
```

### 2.3 结果页（AI分析版）

```
┌─────────────────────────────────────┐
│         正确率 80% ✓                 │
├─────────────────────────────────────┤
│  🔍 AI发现：                         │
│  • 第3题错了，因为你忘了绝对值的性质  │
│  • 这是你的第3次同类错误             │
│  • 错误模式：当a<0时，直接去掉绝对值 │
├─────────────────────────────────────┤
│  💡 AI建议：                         │
│  今天再练3道这类题，10分钟           │
├─────────────────────────────────────┤
│  [接受建议]    [我自己决定]          │
└─────────────────────────────────────┘
```

### 2.4 进度页（AI驱动）

```
┌─────────────────────────────────────┐
│  📊 你的学习进度                     │
├─────────────────────────────────────┤
│  AI为你规划的最优路径：              │
│                                     │
│  ① 二次根式 [进行中] 3/5天           │
│     ├─ 绝对值概念 ✓                 │
│     ├─ 化简计算 [当前]               │
│     └─ 实际应用 ...                 │
│                                     │
│  ② 一次函数 [待开始] 预计2天         │
│  ③ 勾股定理 [待开始] 预计2天         │
│                                     │
│  🎯 预计7天后达到85分                │
└─────────────────────────────────────┘
```

---

## 三、AI能力设计

### 3.1 深度错因分析

**当前：** 记录"错了"
**AI原生：** 分析"为什么错"

#### 输入
```javascript
{
  question: "已知实数a满足-3<a<2，化简|a+3|+|a-2|",
  userAnswer: "5",
  correctAnswer: "4",
  studentHistory: [...],  // 最近10次练习记录
  timeSpent: 45  // 秒
}
```

#### AI分析过程
```javascript
async function analyzeMistake(input) {
  const prompt = `
    学生答题历史：${input.studentHistory}
    当前题目：${input.question}
    学生答案：${input.userAnswer}
    正确答案：${input.correctAnswer}
    答题时长：${input.timeSpent}秒

    请分析：
    1. 错误类型：概念模糊 / 计算错误 / 审题不清 / 其他
    2. 根本原因：具体到知识点
    3. 是否重复错误：查找历史记录
    4. 错误模式：描述学生的思维误区
    5. 补救建议：具体练习方案
  `;

  return ai.analyze(prompt);
}
```

#### AI输出
```json
{
  "error_type": "概念模糊",
  "root_cause": "学生不理解|a|的分数讨论：当a<0时，|a|=-a",
  "is_repeated": true,
  "similar_mistakes": [
    {"date": "2024-05-20", "question": "化简|x-3|，已知x<3"},
    {"date": "2024-05-22", "question": "化简|a|，已知a<0"}
  ],
  "error_pattern": "学生直接去掉绝对值符号，不考虑正负",
  "remedy": {
    "action": "练习5道关于绝对值分数讨论的题目",
    "difficulty": "easy",
    "estimated_time": "10分钟",
    "focus": "重点练习a<0的情况"
  },
  "explanation": "当a<0时，|a|=-a。例如：|a+3|，当-3<a<2时，a+3>0，所以|a+3|=a+3；但a-2<0，所以|a-2|=-(a-2)=2-a"
}
```

### 3.2 个性化题目生成（AI原生核心）⭐

**当前：** 通用题目生成（知识点+难度 → 题目）
**AI原生：** 学习导师式生成（学生画像 + 知识点 → 针对性题目）

#### 关键区别

| 方面 | 当前模式 | AI原生模式 |
|------|----------|------------|
| 输入 | 知识点+难度 | 知识点+难度+**学生画像** |
| Prompt | 通用模板 | **个性化Prompt** |
| 干扰项 | 通用设计 | **基于学生错误模式** |
| 生成时机 | 预生成题库 | **实时生成** |
| 角色定位 | 题目生成器 | **学习导师** |

#### 学生画像（输入）

#### 学生画像
```javascript
{
  weakPoints: ["二次根式绝对值", "一次函数斜率"],
  mastered: ["勾股定理基础", "平行四边形性质"],
  learningStyle: "视觉型",  // 偏好几何图形
  recentMistakes: ["绝对值讨论", "负号处理"],
  preferredDifficulty: "medium",
  avgTimePerQuestion: 90  // 秒
}
```

#### AI原生Prompt模板

```javascript
async function generatePersonalizedQuestion(targetKP, studentProfile) {
  const prompt = `你是一位专业的数学学习导师，正在为学生生成个性化练习题。

## 学生画像
- 薄弱知识点：${studentProfile.weakPoints.join(', ')}
- 学习风格：${studentProfile.learningStyle}
- 常见错误模式：${studentProfile.errorPatterns.join('; ')}
- 最近错题：${studentProfile.recentMistakes.slice(0, 3).map(m => m.question).join('\n')}
- 已掌握：${studentProfile.mastered.join(', ')}
- 平均答题时间：${studentProfile.avgTimePerQuestion}秒/题

## 生成要求
1. **针对性设计**：题目必须针对学生的薄弱点
2. **干扰项设计**：选项必须基于学生的常见错误模式
3. **难度匹配**：考虑学生的答题速度
4. **风格适配**：${studentProfile.learningStyle === 'visual' ? '题目应包含几何图形或数轴描述' : '题目以代数表达为主'}

## 目标知识点
知识点：${targetKP.kp_name}
难度：${targetKP.difficulty}

请生成一道题目...`;

  return ai.generate(prompt);
}
```

#### 个性化干扰项设计

**关键：干扰项不是随机的，而是基于学生的真实错误模式**

```javascript
// 基于学生错误模式设计干扰项
function buildDistractorAnalysis(errorPatterns) {
  const distractorAnalysis = {};

  for (const pattern of errorPatterns) {
    if (pattern.includes('绝对值')) {
      distractorAnalysis.B = `常见错误：直接去掉绝对值符号，不考虑正负`;
    }
    if (pattern.includes('负号')) {
      distractorAnalysis.C = `常见错误：忘记处理负号`;
    }
    if (pattern.includes('符号')) {
      distractorAnalysis.D = `常见错误：符号判断错误`;
    }
  }

  return distractorAnalysis;
}
```

#### AI输出（含个性化分析）

#### AI输出（含个性化分析）
```json
{
  "question": "如图，数轴上表示实数a的点在-2和1之间，则|a+2|+|a-1|的值是？",
  "question_type": "visual",
  "options": ["3", "2", "1", "0"],
  "correct_answer": 0,
  "distractor_analysis": {
    "A": "正确答案",
    "B": "基于你的错误模式：直接去掉绝对值符号，不考虑a的正负",
    "C": "基于你的错误模式：符号判断错误",
    "D": "常见错误：计算错误"
  },
  "personalization": {
    "target_weak_point": "绝对值分类讨论",
    "addresses_error_pattern": "直接去掉绝对值符号",
    "learning_style_match": "视觉型（配数轴图）",
    "difficulty_adjustment": "中等（略高于你的当前水平）"
  },
  "explanation": "根据数轴，-2<a<1，所以a+2>0，|a+2|=a+2；a-1<0，|a-1|=-(a-1)=1-a。原式=(a+2)+(1-a)=3",
  "difficulty": "medium",
  "estimated_time": 120,
  "tags": ["绝对值", "数轴", "分类讨论"]
}
```

#### 实时生成 vs 题库模式

**AI原生必须是实时生成：**

```javascript
// 练习流程
async function personalizedPracticeFlow(student_id, kp_id) {
  const profile = await getStudentProfile(student_id);

  // 第一题：基于学生画像生成
  const q1 = await generatePersonalizedQuestion(kp_id, {
    student_profile: profile,
    target_weak_point: profile.weakPoints[0]
  });

  // 学生答题...

  // 第二题：根据第一题表现动态调整
  const q2 = await generateNextQuestion(kp_id, {
    student_profile: profile,
    previous_result: {
      is_correct: false,
      error_type: '概念模糊',
      time_spent: 45
    },
    adjustment: '降低难度，针对同一薄弱点的不同角度'
  });

  // 第三题：如果第二题答对，提升难度
  const q3 = await generateNextQuestion(kp_id, {
    student_profile: profile,
    previous_result: {
      is_correct: true,
      time_spent: 30
    },
    adjustment: '提升难度，进入下一知识点'
  });
}
```

### 3.3 学习路径规划

**当前：** 静态知识点树
**AI原生：** 动态路径

#### 规划输入
```javascript
{
  currentScore: 73,
  targetScore: 85,
  timeAvailable: "30分钟/天",
  daysUntilExam: 30,
  memory: {
    mastered: ["勾股定理"],
    weakPoints: ["二次根式", "一次函数"],
    learningTrend: "上升",
    consecutiveDays: 7
  }
}
```

#### AI规划过程
```javascript
async function planLearningPath(input) {
  const prompt = `
    学生当前状态：
    - 当前分数：${input.currentScore}
    - 目标分数：${input.targetScore}
    - 时间投入：${input.timeAvailable}
    - 考试倒计时：${input.daysUntilExam}天
    - 已掌握：${input.memory.mastered}
    - 薄弱点：${input.memory.weakPoints}
    - 学习趋势：${input.memory.learningTrend}
    - 连续学习：${input.memory.consecutiveDays}天

    请规划学习路径：
    1. 优先级排序（哪些知识点最紧迫）
    2. 学习顺序（考虑前置依赖）
    3. 每个知识点的预期天数和时间
    4. 里程碑设置
    5. 预测达成日期
  `;

  return ai.plan(prompt);
}
```

#### AI输出
```json
{
  "path": [
    {
      "step": 1,
      "kp_id": "kp_003",
      "kp_name": "二次根式",
      "priority": "高",
      "reason": "这是最大瓶颈，影响后续3个知识点",
      "estimated_days": 3,
      "daily_time": "10分钟",
      "sub_steps": [
        {"name": "绝对值概念", "status": "completed"},
        {"name": "化简计算", "status": "current"},
        {"name": "实数运算", "status": "pending"}
      ]
    },
    {
      "step": 2,
      "kp_id": "kp_005",
      "kp_name": "一次函数",
      "priority": "中",
      "reason": "基础尚可，但需要巩固斜率概念",
      "estimated_days": 2,
      "daily_time": "8分钟",
      "sub_steps": [
        {"name": "函数概念", "status": "pending"},
        {"name": "图像与性质", "status": "pending"}
      ]
    },
    {
      "step": 3,
      "kp_id": "kp_007",
      "kp_name": "综合练习",
      "priority": "低",
      "reason": "巩固已学内容",
      "estimated_days": 2,
      "daily_time": "15分钟"
    }
  ],
  "milestone": {
    "date": "2024-06-01",
    "expected_score": 85,
    "confidence": "高"
  },
  "daily_schedule": {
    "weekday": "10分钟/天",
    "weekend": "15分钟/天"
  }
}
```

### 3.4 持久记忆系统

**当前：** 简单的数据库记录
**AI原生：** 持久Memory + AI维护

#### Memory文件结构
```
memory/
├── SUMMARY.md           # 学习进度摘要（AI维护）
├── PROFILE.md           # 学生画像（AI维护）
├── mistakes.jsonl       # 错题记录（增量）
└── interactions.jsonl   # AI交互历史（增量）
```

#### SUMMARY.md（AI生成）
```markdown
# 学习记忆

## 最近进展
- 2024-05-25: 二次根式正确率75%↑（昨日60%）
- 2024-05-24: 掌握了勾股定理的基础应用
- 2024-05-23: 完成一次函数图像练习

## 当前状态
- **当前分数**: 73/100
- **目标分数**: 85
- **差距**: 12分
- **预计达成**: 7天后（2024-06-01）

## 薄弱知识点（按优先级）
1. **二次根式** - 绝对值概念（错误3次）
   - 模式：直接去掉绝对值，不考虑符号
   - 状态：练习中
2. **一次函数** - 斜率计算（错误2次）
   - 模式：混淆k和b的含义
   - 状态：待开始

## 已掌握知识点
- ✓ 勾股定理（基础应用）
- ✓ 平行四边形（性质识别）

## 学习趋势
- 连续学习7天 🔥
- 周一到周五活跃，周末不活跃
- 平均每次练习8分钟
- 正确率趋势：上升 ↗

## AI一句话总结
"你在代数方面进步明显，但几何概念中的绝对值需要加强。保持每天10分钟练习，7天后可达85分。"

## 下次复习提醒
- 二次根式：明天（2024-05-26）
- 一次函数：3天后（2024-05-28）
```

#### PROFILE.md（AI生成）
```markdown
# 学生画像

## 基本信息
- 年级：八年级
- 目标分数：85
- 注册日期：2024-05-01

## 学习特征
- **学习风格**: 视觉型（偏好几何图形）
- **答题速度**: 中等（平均90秒/题）
- **最佳时段**: 晚上8-10点
- **活跃频率**: 每周5次

## 强项
- 概念理解快
- 几何直觉好
- 图形识别能力强

## 弱项
- 符号处理（负号、绝对值）
- 多步骤计算
- 分类讨论思想

## 偏好设置
- 喜欢难度：中等
- 每次题量：5题
- 是否需要解析：是

## 错误模式统计
| 模式 | 次数 | 知识点 |
|------|------|--------|
| 直接去掉绝对值 | 3 | 二次根式 |
| 混淆k和b | 2 | 一次函数 |
| 计算错误 | 2 | 多个知识点 |
```

#### AI维护Memory
```javascript
async function updateMemory(practiceResult, currentMemory) {
  const prompt = `
    当前记忆：
    ${JSON.stringify(currentMemory)}

    今日练习：
    ${JSON.stringify(practiceResult)}

    请更新记忆：
    1. 更新SUMMARY.md的最近进展
    2. 调整薄弱知识点排序
    3. 识别新的趋势
    4. 更新AI一句话总结
    5. 规划下次复习时间
  `;

  const updates = await ai.update(prompt);

  // 合并更新
  return mergeMemory(currentMemory, updates);
}
```

### 3.5 主动推送系统

**当前：** 无推送
**AI原生：** 智能推送

#### 推送触发场景
```javascript
const pushTriggers = [
  {
    type: "daily_reminder",
    condition: "每天晚上8点",
    content: "AI为你准备的今日任务已就绪",
    action: "点击开始练习"
  },
  {
    type: "review_reminder",
    condition: "next_review_at <= now",
    content: "现在是复习最佳时机，10分钟巩固",
    action: "点击复习"
  },
  {
    type: "streak_alert",
    condition: "连续学习6天，今天未完成",
    content: "保持7天连续，再坚持一天！",
    action: "点击继续"
  },
  {
    type: "weak_point_alert",
    condition: "同一错误3次",
    content: "发现你在绝对值上有困难，今日专项突破",
    action: "点击练习"
  },
  {
    type: "achievement",
    condition: "达成里程碑",
    content: "恭喜！连续学习7天 🔥",
    action: null
  }
];
```

#### 推送内容示例
```
📌 【每日任务】
AI为你准备了5道针对性练习
预计用时：8分钟
重点：二次根式·绝对值概念

[点击开始]

---

🔄 【复习提醒】
你3天前学过一次函数，现在是最佳复习时机
只需3道题，5分钟巩固

[点击复习]

---

🔥 【学习 streak】
连续学习6天了！再坚持一天就能解锁成就
今天还差5分钟

[点击继续]
```

---

## 四、技术架构

### 4.1 系统架构图

```
┌─────────────────────────────────────────┐
│            微信小程序（极简界面）          │
│  • 今日任务卡                            │
│  • 一键开始                              │
│  • AI提示                                │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         云函数层（AI能力）                │
│  • analyzeMistake - 错因分析             │
│  • generatePersonalized - 个性化出题     │
│  • planPath - 路径规划                   │
│  • updateMemory - 记忆更新               │
│  • generateDailyTask - 每日任务生成      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         Memory系统（持久记忆）            │
│  • SUMMARY.md - 学习摘要                 │
│  • PROFILE.md - 学生画像                 │
│  • mistakes.jsonl - 错题记录             │
│  • interactions.jsonl - 交互历史         │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         LLM层（MiniMax/其他）            │
│  • 题目生成                              │
│  • 错因分析                              │
│  • 路径规划                              │
│  • 记忆总结                              │
└─────────────────────────────────────────┘
```

### 4.2 数据流

```
用户打开小程序
    ↓
请求今日任务 → generateDailyTask云函数
    ↓
    ├─ 读取Memory（PROFILE.md, SUMMARY.md）
    ├─ 分析当前状态
    ├─ 调用AI生成任务
    └─ 返回任务卡片
    ↓
用户开始练习
    ↓
    ├─ 生成个性化题目（generatePersonalized）
    ├─ 用户答题
    ├─ 提交答案
    └─ 分析结果（analyzeMistake）
    ↓
    ├─ 显示AI分析
    ├─ 用户接受/拒绝建议
    └─ 更新Memory（updateMemory）
    ↓
用户离开
    ↓
定时任务触发
    ├─ 检查复习提醒
    ├─ 生成明日任务
    └─ 推送通知
```

### 4.3 云函数列表

| 云函数 | 功能 | AI复杂度 |
|--------|------|----------|
| `generateDailyTask` | 生成每日任务 | ⭐⭐⭐⭐ |
| `analyzeMistake` | 分析错因 | ⭐⭐⭐⭐⭐ |
| `generatePersonalized` | 个性化出题 | ⭐⭐⭐⭐⭐ |
| `planPath` | 路径规划 | ⭐⭐⭐⭐⭐ |
| `updateMemory` | 更新记忆 | ⭐⭐⭐⭐ |
| `getAITask` | 获取AI任务 | ⭐⭐⭐ |
| `submitWithAIAnalysis` | 提交+AI分析 | ⭐⭐⭐⭐ |
| `dailyPush` | 每日推送 | ⭐⭐ |

---

## 五、实现计划

### 5.1 Phase 0: 题目生成重构（AI原生的核心）⭐

**目标：** 从"通用题目生成器"升级为"学习导师式生成"

**为什么这是Phase 0：**
- 这是AI原生的核心差异点
- 所有后续功能都依赖个性化题目
- 必须最先完成，否则其他功能都是空中楼阁

**任务：**
1. 重构`generateAiQuestion`云函数
   - 新增`student_profile`参数
   - 设计个性化Prompt模板
   - 实现基于错误模式的干扰项设计

2. 修改练习流程
   - 从题库模式改为实时生成
   - 实现动态难度调整
   - 每题基于上一题表现生成

3. 数据流改造
   - 练习开始时获取学生画像
   - 每题生成时传入画像数据
   - 答题结果更新画像

**验收标准：**
- 题目prompt包含完整学生画像
- 干扰项基于学生错误模式设计
- 相同知识点、不同学生生成不同题目

### 5.2 Phase 1: Memory基础（1-2周）

**目标：** 建立持久记忆系统

**任务：**
1. 创建Memory云函数
   - `getMemory` - 获取学生记忆
   - `updateMemory` - 更新记忆
   - `initMemory` - 初始化记忆

2. Memory文件结构
   - SUMMARY.md模板
   - PROFILE.md模板
   - mistakes.jsonl格式

3. 数据迁移
   - 将现有kp_progress数据迁移到Memory

**验收标准：**
- 每次练习后自动更新SUMMARY.md
- 首页能显示"AI总结"

### 5.3 Phase 2: 每日任务（1-2周）

**目标：** 首页显示AI生成的每日任务

**任务：**
1. 创建`generateDailyTask`云函数
2. 首页UI改造
3. 任务接受/拒绝逻辑

**验收标准：**
- 打开小程序看到今日任务
- 任务包含：做什么、为什么、多久
- 用户可以接受或拒绝

### 5.4 Phase 3: AI错因分析（2周）

**目标：** 深度分析错因，而非简单记录

**任务：**
1. 创建`analyzeMistake`云函数
2. 设计错因分析prompt
3. 结果页展示AI分析

**验收标准：**
- 每道错题都有AI分析
- 分析包含：错误类型、根本原因、补救建议
- 识别重复错误

### 5.5 Phase 4: 主动推送（2-3周）

**目标：** AI主动推送提醒

**任务：**
1. 定时任务云函数
2. 微信模板消息配置
3. 推送策略实现

**验收标准：**
- 每日定时推送
- 复习提醒准确
- Streak提醒有效

### 5.6 Phase 5: 学习路径规划（2周）

**目标：** 进度页显示AI规划的个性化学习路径

**任务：**
1. 创建`planLearningPath`云函数
2. 进度页UI实现
3. 路径可视化展示

**验收标准：**
- 进度页显示AI规划的学习路径
- 包含预计达成日期
- 规划失败时有fallback方案

---

## 六、成功指标

### 6.1 用户指标
- 每日任务点击率 > 50%
- AI建议接受率 > 60%
- 练习完成率提升 20%
- 用户留存率提升 30%

### 6.2 学习指标
- 平均提分速度提升 30%
- 薄弱点识别准确率 > 80%
- 路径规划准确性 > 70%

### 6.3 AI指标
- AI分析满意度 > 4/5
- 个性化题目质量 > 4/5
- 推送打扰率 < 10%

---

## 七、风险与应对

### 7.1 过度复杂风险

**风险：** AI功能太复杂，用户不理解

**应对：**
- 界面极简，AI在后台
- 用户看到的是简单结果
- 提供"为什么"的解释

### 7.2 AI幻觉风险

**风险：** AI分析不准确

**应对：**
- 基于真实数据，不凭空推断
- 设置置信度阈值
- 提供人工反馈机制

### 7.3 推送打扰风险

**风险：** 推送太频繁，用户反感

**应对：**
- 每天最多1条推送
- 提供关闭选项
- 智能时段选择

---

## 八、下一步

1. 用户确认设计方案
2. 编写实施计划（Task list）
3. 开始Phase 1开发
