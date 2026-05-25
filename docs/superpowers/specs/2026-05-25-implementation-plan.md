# 提分神器 AI原生架构 - 实施计划

> 创建日期: 2026-05-25
> 基于设计文档: 2026-05-25-ai-native-design.md

## Phase 顺序

```
Phase 0: 题目生成重构 ⭐ AI原生的核心
    ↓
Phase 1: Memory系统
    ↓
Phase 2: 每日任务
    ↓
Phase 3: AI错因分析
    ↓
Phase 4: 主动推送
    ↓
Phase 5: 学习路径规划
```

---

## Phase 0: 题目生成重构（AI原生的核心）

**目标：** 从"通用题目生成器"升级为"学习导师式生成"

**为什么这是Phase 0：**
- 这是AI原生的核心差异点
- 所有后续功能都依赖个性化题目
- 必须最先完成，否则其他功能都是空中楼阁

### Step 0.1: 分析现有代码

**Action**: 分析现有 `generateAiQuestion` 云函数

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 当前prompt结构 | ✅ 已分析 | 通用模板，无学生信息 |
| RAG上下文 | ✅ 已分析 | 有knowledge_context但不是个性化 |
| 防重复机制 | ✅ 已分析 | 有exclude_questions |
| 图片生成 | ✅ 已分析 | 有ImageClient |

**现有问题确认：**
```javascript
// 第257-375行：_buildPrompt函数
// ❌ 只有 kp_name, difficulty, chapter
// ❌ 完全没有 student_profile 参数
```

**Verification Gate:**
```bash
# 确认现有代码结构
grep -n "student_profile\|studentId\|student_id" \
  /Users/seanxx/score-boost-mini/cloudfunctions/generateAiQuestion/index.js
# 预期: 无结果（确认没有学生画像参数）
```

**Dependencies**: 无
**Risk Prevention**: 无风险，仅分析

---

### Step 0.2: 设计个性化Prompt模板

**文件**: `cloudfunctions/generateAiQuestion/prompt-templates.js`（新建）

**Action**:
```javascript
/**
 * 个性化题目生成Prompt模板
 */

// 学生画像结构
const STUDENT_PROFILE_SCHEMA = {
  weak_points: ['绝对值概念', '负号处理'],           // 薄弱知识点
  mastered: ['勾股定理基础', '平行四边形性质'],      // 已掌握
  learning_style: 'visual|auditory|kinesthetic',    // 学习风格
  error_patterns: ['直接去掉绝对值符号'],            // 错误模式
  recent_mistakes: [{question, error, timestamp}],  // 最近错题
  preferred_difficulty: 'easy|medium|hard',         // 偏好难度
  avg_time_per_question: 90,                        // 平均答题时间(秒)
};

/**
 * 构建个性化Prompt
 */
function buildPersonalizedPrompt(params) {
  const { kp_name, difficulty, student_profile = {} } = params;

  // 学生画像部分
  const profileSection = buildStudentProfileSection(student_profile);

  // 生成要求部分
  const requirementSection = buildRequirementSection(student_profile);

  // 干扰项设计部分
  const distractorSection = buildDistractorSection(student_profile.error_patterns || []);

  const prompt = `你是一位专业的数学学习导师，正在为学生生成个性化练习题。

${profileSection}

## 生成要求
${requirementSection}

## 干扰项设计
${distractorSection}

## 目标知识点
知识点：${kp_name}
难度：${difficulty}

${getDifficultyGuidance(difficulty)}

${getQuestionTypeRequirements(params.question_type || 'choice')}

**严格返回纯JSON格式，不要任何其他文字**

${getJsonSchema(params.question_type || 'choice')}`;

  return prompt;
}

/**
 * 构建学生画像部分
 */
function buildStudentProfileSection(profile) {
  if (!profile || Object.keys(profile).length === 0) {
    return '## 学生画像\n（新用户，暂无历史数据）';
  }

  return `## 学生画像
- 薄弱知识点：${(profile.weak_points || []).join(', ') || '无'}
- 已掌握：${(profile.mastered || []).join(', ') || '无'}
- 学习风格：${profile.learning_style || '未知'}
- 常见错误模式：${(profile.error_patterns || []).join('; ') || '无'}
- 最近错题：${formatRecentMistakes(profile.recent_mistakes || [])}
- 平均答题时间：${profile.avg_time_per_question || 90}秒/题`;
}

/**
 * 构建生成要求部分
 */
function buildRequirementSection(profile) {
  const requirements = [
    '1. **针对性设计**：题目必须针对学生的薄弱点',
  ];

  if (profile.learning_style === 'visual') {
    requirements.push('2. **风格适配**：题目应包含几何图形或数轴描述（视觉型）');
  } else if (profile.learning_style === 'auditory') {
    requirements.push('2. **风格适配**：题目以文字叙述为主，便于理解（听觉型）');
  } else {
    requirements.push('2. **风格适配**：题目以代数表达为主（通用型）');
  }

  if (profile.avg_time_per_question && profile.avg_time_per_question < 60) {
    requirements.push('3. **时间匹配**：学生答题速度快，题目可适当增加思考深度');
  }

  return requirements.join('\n');
}

/**
 * 构建干扰项设计部分
 */
function buildDistractorSection(errorPatterns) {
  if (!errorPatterns || errorPatterns.length === 0) {
    return '（无历史错误模式，使用通用干扰项）';
  }

  const hints = errorPatterns.map((pattern, i) => {
    if (pattern.includes('绝对值')) {
      return `  - 选项${String.fromCharCode(66 + i)}：基于错误"直接去掉绝对值符号"设计`;
    }
    if (pattern.includes('负号')) {
      return `  - 选项${String.fromCharCode(66 + i)}：基于错误"忘记处理负号"设计`;
    }
    if (pattern.includes('符号')) {
      return `  - 选项${String.fromCharCode(66 + i)}：基于错误"符号判断错误"设计`;
    }
    return `  - 选项${String.fromCharCode(66 + i)}：基于错误"${pattern}"设计`;
  });

  return `基于学生常见错误模式设计干扰项：\n${hints.join('\n')}`;
}

/**
 * 格式化最近错题
 */
function formatRecentMistakes(mistakes) {
  if (mistakes.length === 0) return '无';
  return mistakes.slice(0, 3).map((m, i) => `${i + 1}. ${m.question}（错误：${m.error}）`).join('\n');
}

/**
 * 获取难度指导
 */
function getDifficultyGuidance(difficulty) {
  const guidance = {
    easy: `【难度标准 - 简单】
- 直接套用公式或基本概念即可解答
- 单步推理，不需要复杂变换
- 数据简单，计算量小`,
    medium: `【难度标准 - 中等】
- 需要对公式或概念进行适度变形或转换
- 需要2-3步推理才能得出答案
- 可能涉及多个知识点的综合应用`,
    hard: `【难度标准 - 困难】
- 需要多步推理，或涉及抽象概念理解
- 可能需要逆向思维或特殊情况分析
- 选项高度相似，每个选项都有一定的合理性`
  };
  return guidance[difficulty] || guidance.medium;
}

/**
 * 获取题型要求
 */
function getQuestionTypeRequirements(questionType) {
  if (questionType === 'choice') {
    return `## 选择题要求
1. 必须提供恰好 4 个选项且仅 1 个正确答案
2. **选项长度均衡**：所有选项长度应大致相同
3. **数学符号格式**：使用Unicode数学符号（√ ≤ ≥ π ² ³ 等），不要使用LaTeX格式
4. **禁止生成需要图片的题目**：所有几何信息必须用文字描述`;
  }
  return '';
}

/**
 * 获取JSON Schema
 */
function getJsonSchema(questionType) {
  if (questionType === 'choice') {
    return `JSON格式：
{
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "correct_answer": 0,
  "explanation": "解析内容"
}`;
  }
  return '';
}

module.exports = {
  buildPersonalizedPrompt,
  STUDENT_PROFILE_SCHEMA
};
```

**Verification Gate:**
```bash
# 测试Prompt模板生成
cd /Users/seanxx/score-boost-mini/cloudfunctions/generateAiQuestion
node -e "
const templates = require('./prompt-templates.js');
const prompt = templates.buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: {
    weak_points: ['绝对值概念'],
    learning_style: 'visual',
    error_patterns: ['直接去掉绝对值符号']
  }
});
console.log('=== Prompt Generated ===');
console.log('包含学生画像:', prompt.includes('学生画像'));
console.log('包含薄弱点:', prompt.includes('绝对值概念'));
console.log('包含错误模式:', prompt.includes('直接去掉绝对值符号'));
console.log('Prompt长度:', prompt.length);
"
# 预期: 所有检查项为 true
```

**Dependencies**: Step 0.1
**Risk Prevention**:
- Prompt模板独立文件，便于测试和迭代
- 支持空学生画像（新用户场景）

---

### Step 0.3: 重构generateAiQuestion云函数

**文件**: `cloudfunctions/generateAiQuestion/index.js`（修改）

**Action**:
```javascript
// 在文件顶部引入新模块
const { buildPersonalizedPrompt, STUDENT_PROFILE_SCHEMA } = require('./prompt-templates.js');

// 修改 LlmClient._buildPrompt 方法
LlmClient.prototype._buildPrompt = function(params) {
  // 新增：优先使用个性化Prompt
  if (params.student_profile) {
    return buildPersonalizedPrompt(params);
  }

  // 保留：原有通用Prompt（fallback）
  return this._buildGenericPrompt(params);
};

// 新增：通用Prompt（原逻辑重命名）
LlmClient.prototype._buildGenericPrompt = function(params) {
  // ... 原有的 _buildPrompt 逻辑 ...
};
```

**Verification Gate:**
```bash
# 部署后测试个性化生成
curl -X POST https://.../generateAiQuestion \
  -d '{
    "kp_id": "kp_003",
    "kp_name": "二次根式",
    "difficulty": "medium",
    "student_id": "test_001",
    "student_profile": {
      "weak_points": ["绝对值概念"],
      "learning_style": "visual",
      "error_patterns": ["直接去掉绝对绝对值符号"]
    }
  }' | jq '.data.question'
# 预期: 返回的题目针对"绝对值概念"薄弱点设计
```

**Dependencies**: Step 0.2
**Risk Prevention**:
- 保留原有通用Prompt作为fallback
- student_profile参数可选，向后兼容

---

### Step 0.4: 修改练习流程调用

**文件**: `pages/practice/practice.js`（修改）

**Action**:
```javascript
// 练习开始时获取学生画像
async onLoad(options) {
  const { kpId, kpName } = options;

  // 获取学生画像
  const studentProfile = await this.getStudentProfile();

  // 生成第一题时传入画像
  const question = await api.generateQuestion({
    kp_id: kpId,
    kp_name: kpName,
    difficulty: 'medium',
    student_profile: studentProfile  // 新增
  });

  this.setData({ currentQuestion: question });
},

// 获取学生画像（从Memory或默认值）
async getStudentProfile() {
  try {
    const memory = await api.getMemory();
    if (memory && memory.profile) {
      return {
        weak_points: memory.summary.weak_points.map(wp => wp.kp_name),
        mastered: memory.summary.mastered,
        learning_style: memory.profile.learning_style,
        error_patterns: memory.summary.weak_points.map(wp => wp.pattern),
        recent_mistakes: [],  // 从mistakes.jsonl获取
        avg_time_per_question: memory.profile.avg_time_per_question || 90
      };
    }
  } catch (e) {
    console.log('获取学生画像失败，使用默认值', e);
  }

  // 默认画像（新用户）
  return {
    weak_points: [],
    mastered: [],
    learning_style: 'visual',
    error_patterns: [],
    recent_mistakes: [],
    avg_time_per_question: 90
  };
}
```

**Verification Gate:**
```bash
# 小程序测试
# 1. 清除缓存，模拟新用户
# 2. 开始练习
# 3. 检查网络请求中是否包含 student_profile 参数
# 预期: 请求包含 student_profile 字段
```

**Dependencies**: Step 0.3
**Risk Prevention**:
- 获取画像失败时使用默认值，不影响练习开始
- 默认画像采用视觉型（大多数学生偏好）

---

### Step 0.5: 测试个性化生成效果

**Action**: 创建测试用例对比不同学生的生成结果

**测试场景**:
```javascript
// 场景1: 学生A（薄弱点：绝对值）
const studentA = {
  weak_points: ['绝对值概念'],
  error_patterns: ['直接去掉绝对值符号']
};

// 场景2: 学生B（薄弱点：计算）
const studentB = {
  weak_points: ['计算准确性'],
  error_patterns: ['符号错误', '计算错误']
};

// 生成对比
const questionA = await generateQuestion('二次根式', 'medium', studentA);
const questionB = await generateQuestion('二次根式', 'medium', studentB);

// 验证差异
console.log('题目A针对薄弱点:', questionA.question.includes('绝对值'));
console.log('题目B针对薄弱点:', questionB.question.includes('计算'));
```

**Verification Gate:**
```bash
# 执行对比测试
node test-personalization.js
# 预期输出:
# 题目A针对薄弱点: true
# 题目B针对薄弱点: true
# 题目内容不同: true
```

**Dependencies**: Step 0.4
**Risk Prevention**:
- 测试用例独立文件
- 不影响生产环境

---

### Phase 0 验收总结

```bash
# 1. 确认Prompt包含学生画像
grep -r "学生画像" cloudfunctions/generateAiQuestion/
# 预期: prompt-templates.js中有定义

# 2. 确认调用时传入画像
grep -r "student_profile" pages/practice/
# 预期: practice.js中有调用

# 3. 测试个性化生成
# 不同学生生成不同题目
curl -X POST https://.../generateAiQuestion \
  -d '{"kp_id":"kp_003","student_profile":{"weak_points":["绝对值"]}}' | jq '.data.question'

curl -X POST https://.../generateAiQuestion \
  -d '{"kp_id":"kp_003","student_profile":{"weak_points":["计算"]}}' | jq '.data.question'

# 预期: 两次返回的题目内容不同
```

---

## Phase 1: Memory系统

### Step 1.1: 创建Memory云函数

**文件**: `cloudfunctions/studentMemory/index.js`（新建）

**Action**:
```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 获取学生记忆
 */
async function getMemory(studentId) {
  try {
    const result = await db.collection('student_memory')
      .where({ student_id: studentId })
      .get();

    if (result.data && result.data.length > 0) {
      return { success: true, data: result.data[0] };
    }

    // 新用户：返回默认记忆模板
    return {
      success: true,
      data: getDefaultMemory(studentId)
    };
  } catch (e) {
    console.error('[getMemory] Error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 更新学生记忆
 */
async function updateMemory(studentId, updateData) {
  try {
    const existing = await db.collection('student_memory')
      .where({ student_id: studentId })
      .get();

    const now = new Date().toISOString();

    if (existing.data && existing.data.length > 0) {
      // 更新现有记忆
      await db.collection('student_memory')
        .doc(existing.data[0]._id)
        .update({
          data: {
            ...updateData,
            updated_at: now
          }
        });
    } else {
      // 创建新记忆
      await db.collection('student_memory').add({
        data: {
          student_id: studentId,
          ...getDefaultMemory(studentId),
          ...updateData,
          created_at: now,
          updated_at: now
        }
      });
    }

    return { success: true };
  } catch (e) {
    console.error('[updateMemory] Error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 获取默认记忆模板
 */
function getDefaultMemory(studentId) {
  return {
    student_id: studentId,
    summary: {
      recent_progress: [],
      current_score: 0,
      target_score: 85,
      weak_points: [],
      mastered: [],
      learning_trend: 'stable',
      consecutive_days: 0,
      ai_summary: ''
    },
    profile: {
      grade: '',
      subject: 'math',
      learning_style: 'visual',
      strong_points: [],
      weak_areas: [],
      preferred_difficulty: 'medium',
      avg_time_per_question: 90
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// 云函数入口
exports.main = async (event, context) => {
  const { action, student_id, data } = event.data || event;

  switch (action) {
    case 'get':
      return await getMemory(student_id);
    case 'update':
      return await updateMemory(student_id, data);
    default:
      return { success: false, error: 'Unknown action' };
  }
};
```

**Verification Gate:**
```bash
# 测试获取记忆
curl -X POST https://.../studentMemory \
  -d '{"action":"get","student_id":"test_001"}' | jq '.success'
# 预期: true

# 测试更新记忆
curl -X POST https://.../studentMemory \
  -d '{"action":"update","student_id":"test_001","data":{"summary":{"current_score":75}}}' | jq '.success'
# 预期: true
```

**Dependencies**: 无
**Risk Prevention**:
- 新用户返回默认模板而非null
- 更新失败不影响主流程

---

### Step 1.2: 练习后自动更新Memory

**文件**: `cloudfunctions/submitPracticeResult/index.js`（修改）

**Action**:
```javascript
// 在提交练习结果后调用Memory更新
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 新增：调用Memory云函数
async function updateStudentMemory(studentId, practiceData) {
  try {
    // 调用studentMemory云函数
    const result = await cloud.callFunction({
      name: 'studentMemory',
      data: {
        action: 'update',
        student_id: studentId,
        data: {
          'summary.recent_progress': cloud.database.FieldValue.arrayUnion([{
            date: new Date().toISOString().split('T')[0],
            kp_id: practiceData.kp_id,
            is_correct: practiceData.is_correct,
            score: practiceData.score
          }])
        }
      }
    });

    return result.result;
  } catch (e) {
    console.log('[updateStudentMemory] Failed (non-critical):', e.message);
    return null;  // 失败不影响主流程
  }
}

// 修改主函数
exports.main = async (event, context) => {
  const { student_id, kp_id, answers, score } = event.data || event;

  // ... 原有逻辑 ...

  // 新增：异步更新Memory（不阻塞）
  updateStudentMemory(student_id, { kp_id, score });

  return { success: true, data: result };
};
```

**Verification Gate:**
```bash
# 完成一次练习后检查Memory
# 1. 提交练习结果
# 2. 查询Memory
curl -X POST https://.../studentMemory \
  -d '{"action":"get","student_id":"test_001"}' | jq '.data.summary.recent_progress | length'
# 预期: > 0
```

**Dependencies**: Step 1.1
**Risk Prevention**:
- Memory更新失败不影响练习结果保存
- 异步执行，不阻塞主流程

---

## Phase 2: 每日任务

### Step 2.1: 创建每日任务生成云函数

**文件**: `cloudfunctions/generateDailyTask/index.js`（新建）

**Action**:
```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 生成每日任务
 */
exports.main = async (event, context) => {
  const { student_id } = event.data || event;

  try {
    // 1. 获取学生Memory
    const memoryResult = await cloud.callFunction({
      name: 'studentMemory',
      data: { action: 'get', student_id }
    });

    const memory = memoryResult.result.data;

    // 2. 冷启动处理
    if (!memory || !memory.summary.weak_points || memory.summary.weak_points.length === 0) {
      return getColdStartTask();
    }

    // 3. 选择最紧迫的薄弱点
    const targetWP = selectMostUrgentWeakPoint(memory.summary.weak_points);

    // 4. 生成任务卡片
    const task = {
      title: `${targetWP.kp_name}·5分钟`,
      reason: `因为你昨天在"${targetWP.pattern || '相关题目'}"上错了${targetWP.error_count || 1}次`,
      estimated_time: 5,
      question_count: 3,
      kp_id: targetWP.kp_id,
      kp_name: targetWP.kp_name,
      difficulty: 'easy',  // 从薄弱点开始
      generated_at: new Date().toISOString()
    };

    return { success: true, data: task };

  } catch (e) {
    console.error('[generateDailyTask] Error:', e);
    // 失败时返回默认任务
    return { success: true, data: getColdStartTask().data };
  }
};

/**
 * 冷启动任务（新用户）
 */
function getColdStartTask() {
  return {
    success: true,
    data: {
      title: '二次根式基础·5分钟',
      reason: '让我们开始今天的练习，巩固基础',
      estimated_time: 5,
      question_count: 3,
      kp_id: 'kp_003',
      kp_name: '二次根式',
      difficulty: 'easy',
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * 选择最紧迫的薄弱点
 */
function selectMostUrgentWeakPoint(weakPoints) {
  // 按错误次数排序
  return weakPoints.sort((a, b) => (b.error_count || 0) - (a.error_count || 0))[0];
}
```

**Verification Gate:**
```bash
# 测试冷启动
curl -X POST https://.../generateDailyTask \
  -d '{"student_id":"new_user_001"}' | jq '.data.title'
# 预期: "二次根式基础·5分钟"
```

**Dependencies**: Phase 1完成
**Risk Prevention**:
- 冷启动返回默认任务
- AI分析超时返回缓存任务

---

### Step 2.2: 首页UI改造

**文件**: `pages/home/home.wxml`（修改）

**Action**:
```xml
<!-- 新增：今日任务卡片 -->
<view class="task-card" wx:if="{{todayTask}}">
  <view class="task-header">
    <text class="task-icon">🎯</text>
    <text class="task-title">今日任务</text>
  </view>
  <view class="task-content">
    <text class="task-name">{{todayTask.title}}</text>
    <text class="task-reason">{{todayTask.reason}}</text>
  </view>
  <view class="task-footer">
    <button class="btn-primary" bindtap="startTodayTask">开始练习</button>
  </view>
</view>

<!-- 次要入口折叠 -->
<view class="other-entry" bindtap="showAllTopics">
  <text>我想自己选知识点</text>
  <text>></text>
</view>
```

**Verification Gate:**
```bash
# 小程序测试
# 1. 打开首页
# 2. 检查是否显示"今日任务"卡片
# 预期: 显示任务卡片
```

**Dependencies**: Step 2.1
**Risk Prevention**:
- 任务加载失败时隐藏卡片
- 保留原有知识点选择入口

---

## Phase 3: AI错因分析

### Step 3.1: 创建错因分析云函数

**文件**: `cloudfunctions/analyzeMistake/index.js`（新建）

**Action**:
```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 复用LLM客户端
const { LlmClient } = require('../generateAiQuestion/index.js');

/**
 * 分析错因
 */
exports.main = async (event, context) => {
  const { question, userAnswer, correctAnswer, studentHistory, timeSpent } = event.data || event;

  try {
    const prompt = `你是一位专业的数学学习导师，请分析学生的答题情况。

学生答题历史：${JSON.stringify(studentHistory || [])}
题目：${question}
学生答案：${userAnswer}
正确答案：${correctAnswer}
答题时长：${timeSpent || 0}秒

请分析：
1. 错误类型：概念模糊/计算错误/审题不清/其他
2. 根本原因：具体到知识点
3. 是否重复错误：查找历史记录中的相似错误
4. 错误模式：描述学生的思维误区
5. 补救建议：具体练习方案

返回JSON格式。`;

    const llm = new LlmClient();
    const response = await llm.generate({ prompt });

    const analysis = parseAnalysis(response.content);

    return { success: true, data: analysis };

  } catch (e) {
    console.error('[analyzeMistake] Error:', e);
    return { success: false, error: e.message };
  }
};

function parseAnalysis(content) {
  // 解析LLM返回的JSON
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.log('[parseAnalysis] Parse failed');
  }

  // 默认分析
  return {
    error_type: '其他',
    root_cause: '建议复习相关知识点',
    is_repeated: false,
    error_pattern: '',
    remedy: { action: '练习3道同类题', difficulty: 'easy', estimated_time: 5 }
  };
}
```

**Verification Gate:**
```bash
curl -X POST https://.../analyzeMistake \
  -d '{
    "question": "化简|a+3|+|a-2|，已知-3<a<2",
    "userAnswer": "5",
    "correctAnswer": "4",
    "studentHistory": [],
    "timeSpent": 45
  }' | jq '.data.error_type'
# 预期: "概念模糊" 或类似值
```

**Dependencies**: 无（独立功能）
**Risk Prevention**:
- AI分析超时返回默认分析
- 缓存相似问题的分析结果

---

## Phase 4: 主动推送

### Step 4.1: 创建定时任务云函数

**文件**: `cloudfunctions/scheduledTaskGenerator/index.js`（新建）

**Action**:
```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 定时任务：每天20:00生成并推送
 * 在云开发控制台配置定时触发器
 */
exports.main = async (event, context) => {
  console.log('[scheduledTaskGenerator] Started at', new Date().toISOString());

  try {
    // 1. 查询活跃学生（7天内有登录）
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeStudents = await db.collection('users')
      .where({
        last_login: _.gte(sevenDaysAgo)
      })
      .limit(100)
      .get();

    console.log('[scheduledTaskGenerator] Active students:', activeStudents.data.length);

    // 2. 为每个学生生成并缓存任务
    const tasks = await Promise.all(
      activeStudents.data.map(student => generateAndCacheTask(student.student_id))
    );

    // 3. 发送推送通知
    let pushCount = 0;
    for (const student of activeStudents.data) {
      const result = await sendPush(student.student_id, student.openid);
      if (result) pushCount++;
    }

    console.log('[scheduledTaskGenerator] Completed. Pushed:', pushCount);

    return {
      success: true,
      processed: activeStudents.data.length,
      pushed: pushCount
    };

  } catch (e) {
    console.error('[scheduledTaskGenerator] Error:', e);
    return { success: false, error: e.message };
  }
};

async function generateAndCacheTask(studentId) {
  // 调用generateDailyTask
  const result = await cloud.callFunction({
    name: 'generateDailyTask',
    data: { student_id: studentId }
  });

  // 缓存到数据库
  const today = new Date().toISOString().split('T')[0];
  await db.collection('daily_tasks').add({
    data: {
      student_id: studentId,
      date: today,
      task: result.result.data,
      generated_at: new Date().toISOString(),
      is_sent: false
    }
  });

  return result.result.data;
}

async function sendPush(studentId, openid) {
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: 'YOUR_TEMPLATE_ID',
      page: 'pages/home/home',
      data: {
        thing1: { value: 'AI为你准备了今日任务' },
        thing2: { value: '5分钟' }
      }
    });
    return true;
  } catch (e) {
    console.log('[sendPush] Failed for', studentId, e.message);
    return false;
  }
}
```

**Verification Gate:**
```bash
# 手动触发测试
# 在云开发控制台 → 云函数 → scheduledTaskGenerator → 测试
# 检查日志: "processed: X"
```

**Dependencies**: Phase 1, Phase 2完成
**Risk Prevention**:
- 批量处理限制每次最多100个学生
- 推送失败不影响任务生成

---

## Phase 5: 学习路径规划

### Step 5.1: 创建路径规划云函数

**文件**: `cloudfunctions/planLearningPath/index.js`（新建）

**Action**:
```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 规划学习路径
 */
exports.main = async (event, context) => {
  const { student_id } = event.data || event;

  try {
    // 1. 获取学生Memory
    const memoryResult = await cloud.callFunction({
      name: 'studentMemory',
      data: { action: 'get', student_id }
    });

    const memory = memoryResult.result.data;

    // 2. 分析当前状态
    const currentState = {
      current_score: memory.summary.current_score || 0,
      target_score: memory.summary.target_score || 85,
      mastered: memory.summary.mastered || [],
      weak_points: memory.summary.weak_points || []
    };

    // 3. 调用AI规划路径
    const path = await planPathWithAI(currentState);

    return { success: true, data: path };

  } catch (e) {
    console.error('[planLearningPath] Error:', e);
    // 返回静态路径作为fallback
    return { success: true, data: getStaticPath() };
  }
};

async function planPathWithAI(state) {
  // TODO: 调用LLM规划路径
  // 当前返回简化版
  return {
    path: state.weak_points.map((wp, i) => ({
      step: i + 1,
      kp_id: wp.kp_id,
      kp_name: wp.kp_name,
      priority: '高',
      reason: wp.pattern || '薄弱点',
      estimated_days: 3,
      status: i === 0 ? 'current' : 'pending'
    })),
    milestone: {
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      expected_score: state.target_score,
      confidence: '中'
    }
  };
}

function getStaticPath() {
  return {
    path: [
      { step: 1, kp_name: '二次根式', status: 'pending' },
      { step: 2, kp_name: '一次函数', status: 'pending' }
    ],
    milestone: { date: '2026-06-01', expected_score: 85 }
  };
}
```

**Verification Gate:**
```bash
curl -X POST https://.../planLearningPath \
  -d '{"student_id":"test_001"}' | jq '.data.path | length'
# 预期: > 0
```

**Dependencies**: Phase 1完成
**Risk Prevention**:
- 规划失败时显示静态知识点树
- 空路径时隐藏AI区域

---

## 验收总结

### Phase 0 验收（题目生成重构）
```bash
# 1. Prompt包含学生画像
grep -r "学生画像" cloudfunctions/generateAiQuestion/
# 预期: prompt-templates.js中有定义

# 2. 调用时传入画像
grep -r "student_profile" pages/practice/
# 预期: practice.js中有调用

# 3. 个性化生成有效
# 不同学生生成不同题目
```

### Phase 1 验收（Memory系统）
```bash
# 1. 新用户首次练习后，Memory初始化
curl -X POST https://.../studentMemory \
  -d '{"action":"get","student_id":"new_user"}' | jq '.data.student_id'
# 预期: 返回学生ID

# 2. 练习后Memory更新
# 完成一次练习，检查 recent_progress 非空
```

### Phase 2 验收（每日任务）
```bash
# 1. 首页显示任务卡片
# 打开小程序，检查 "今日任务" 卡片存在

# 2. 任务与Memory一致
# Memory记录薄弱点是"二次根式"，任务应是二次根式
```

### Phase 3 验收（错因分析）
```bash
# 1. 结果页AI分析
# 故意答错题目，检查分析包含错误类型

# 2. 重复错误识别
# 同一错误做两次，分析显示"这是你的第2次同类错误"
```

### Phase 4 验收（定时推送）
```bash
# 1. 定时任务执行
# 检查云函数日志，每天20:00有执行记录

# 2. 推送送达
# 测试账号收到推送通知
```

### Phase 5 验收（学习路径）
```bash
# 1. 进度页显示路径
# 打开进度页，检查显示AI规划的学习路径

# 2. 路径合理性
# 路径包含当前状态、预计达成日期
```

---

## 关键文件路径

| 功能 | 文件路径 |
|------|----------|
| Prompt模板 | `cloudfunctions/generateAiQuestion/prompt-templates.js` |
| 题目生成 | `cloudfunctions/generateAiQuestion/index.js` |
| Memory云函数 | `cloudfunctions/studentMemory/index.js` |
| 每日任务 | `cloudfunctions/generateDailyTask/index.js` |
| 错因分析 | `cloudfunctions/analyzeMistake/index.js` |
| 定时任务 | `cloudfunctions/scheduledTaskGenerator/index.js` |
| 路径规划 | `cloudfunctions/planLearningPath/index.js` |
| 首页 | `pages/home/home.js` |
| 练习页 | `pages/practice/practice.js` |
| 结果页 | `pages/result/result.js` |
| 进度页 | `pages/progress/progress.js` |

---

## 数据库设计

### 集合：student_memory
```javascript
{
  _id: ObjectId,
  student_id: String,
  summary: {
    recent_progress: [Array],
    current_score: Number,
    target_score: Number,
    weak_points: [{
      kp_id: String,
      kp_name: String,
      error_count: Number,
      pattern: String
    }],
    mastered: [String],
    learning_trend: String,
    consecutive_days: Number,
    ai_summary: String
  },
  profile: {
    grade: String,
    subject: String,
    learning_style: String,
    strong_points: [String],
    weak_areas: [String],
    preferred_difficulty: String,
    avg_time_per_question: Number
  },
  created_at: ISODate,
  updated_at: ISODate
}
// 索引：{student_id: 1}
```

### 集合：daily_tasks
```javascript
{
  _id: ObjectId,
  student_id: String,
  date: String,  // YYYY-MM-DD
  task: {
    title: String,
    reason: String,
    estimated_time: Number,
    question_count: Number,
    kp_id: String,
    kp_name: String,
    difficulty: String
  },
  generated_at: ISODate,
  is_sent: Boolean
}
// 索引：{student_id: 1, date: 1}
```

---

## 实施顺序建议

1. **第一周**：Phase 0（题目生成重构）
   - 这是核心，必须最先完成
   - 完成后其他功能才有意义

2. **第二周**：Phase 1（Memory系统）
   - 建立数据基础
   - 支持后续个性化功能

3. **第三周**：Phase 2（每日任务）+ Phase 3（错因分析）
   - 可以并行开发
   - 形成完整体验闭环

4. **第四周**：Phase 4（主动推送）
   - 自动化服务
   - 提升用户留存

5. **第五周**：Phase 5（学习路径规划）
   - 完整的进度可视化
   - 锦上添花功能
