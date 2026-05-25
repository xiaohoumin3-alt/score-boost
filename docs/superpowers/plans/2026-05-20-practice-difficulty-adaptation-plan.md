# 练习难度自适应体系实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现练习难度自适应系统，根据学生答题历史动态调整题目难度

**Architecture:** 数据持久化层（kp_progress）+ 自适应算法层。题目来源复用现有 QUESTION_BANK，云开发数据库存储进度。

**Tech Stack:** 微信云开发（Node.js云函数）、云数据库

---

## 文件结构

```
cloudfunctions/
├── practice_v2/              # 修改：添加自适应难度选择
│   ├── index.js              # 修改：查询 kp_progress 确定初始难度
│   ├── question_bank.js       # 修改：按难度筛选 + 题目轮换
│   └── knowledge_tree.js      # 已有
├── submitPracticeResult/      # 新建：提交练习答案并更新进度
│   └── index.js
├── getKpProgress/             # 新建：查询学生知识点进度
│   └── index.js
└── checkRetestEligibility/    # 新建：检查复测条件
    └── index.js

pages/
├── practice/
│   └── practice.js            # 修改：答题后调用 submitPracticeResult
└── utils/
    └── cloudApi.js          # 修改：传递 student_id, assessment_id
```

---

## Task 1: 创建 kp_progress 集合

**Files:**
- 操作：微信开发者工具云开发控制台

- [ ] **Step 1: 创建集合**

在微信开发者工具云开发控制台创建 `kp_progress` 集合。

- [ ] **Step 2: 创建索引**

为以下字段创建复合索引：
- `(student_id, kp_id)` - 查询单个学生单个知识点进度
- `(assessment_id)` - 按测评查询所有关联进度

---

## Task 2: 创建 getKpProgress 云函数

**Files:**
- Create: `cloudfunctions/getKpProgress/index.js`

- [ ] **Step 1: 创建云函数目录**

```bash
mkdir -p cloudfunctions/getKpProgress
```

- [ ] **Step 2: 编写 getKpProgress 云函数**

```javascript
/**
 * 获取学生知识点进度
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 默认进度模板
const DEFAULT_PROGRESS = {
  easy: { consecutive_correct: 0, completed: false },
  medium: { consecutive_correct: 0, completed: false },
  hard: { consecutive_correct: 0, completed: false },
  current_difficulty: 'easy'
};

exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const { student_id, kp_id } = params;

    if (!student_id) {
      return { success: false, error: '缺少 student_id' };
    }

    // 查询进度记录
    const query = kp_id
      ? db.collection('kp_progress').where({ student_id, kp_id })
      : db.collection('kp_progress').where({ student_id });

    const result = await query.get();

    // 没有记录时返回默认值
    if (!result.data || result.data.length === 0) {
      return {
        success: true,
        data: kp_id
          ? { kp_id, ...DEFAULT_PROGRESS }
          : []
      };
    }

    // 有记录时返回
    return {
      success: true,
      data: kp_id ? result.data[0] : result.data
    };

  } catch (e) {
    console.error('getKpProgress error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
```

- [ ] **Step 3: 上传云函数**

在微信开发者工具中右键 `getKpProgress` 文件夹，选择"上传并部署"。

- [ ] **Step 4: 验证云函数**

在云开发控制台测试：
```javascript
// 输入
{ "student_id": "test_user", "kp_id": "kp2_1" }
// 预期输出
{ "success": true, "data": { "kp_id": "kp2_1", "current_difficulty": "easy", "easy": { "consecutive_correct": 0, "completed": false }, "medium": { "consecutive_correct": 0, "completed": false }, "hard": { "consecutive_correct": 0, "completed": false } } }
```

---

## Task 3: 创建 submitPracticeResult 云函数

**Files:**
- Create: `cloudfunctions/submitPracticeResult/index.js`

- [ ] **Step 1: 创建云函数目录**

```bash
mkdir -p cloudfunctions/submitPracticeResult
```

- [ ] **Step 2: 编写 submitPracticeResult 云函数**

```javascript
/**
 * 提交练习答案云函数
 * 更新 kp_progress 进度
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 难度升级顺序
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

// 获取下一难度
function getNextDifficulty(current) {
  const idx = DIFFICULTY_ORDER.indexOf(current);
  return idx < DIFFICULTY_ORDER.length - 1 ? DIFFICULTY_ORDER[idx + 1] : null;
}

exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const { student_id, kp_id, difficulty, is_correct, assessment_id } = params;

    if (!student_id || !kp_id || !difficulty) {
      return { success: false, error: '缺少必要参数' };
    }

    // 1. 查询当前进度
    const progressRes = await db.collection('kp_progress')
      .where({ student_id, kp_id })
      .get();

    const currentProgress = progressRes.data && progressRes.data.length > 0
      ? progressRes.data[0]
      : null;

    // 2. 计算新进度
    let newProgress = currentProgress ? { ...currentProgress } : {
      student_id,
      kp_id,
      assessment_id: assessment_id || '',
      easy: { consecutive_correct: 0, completed: false },
      medium: { consecutive_correct: 0, completed: false },
      hard: { consecutive_correct: 0, completed: false },
      current_difficulty: difficulty,
      created_at: new Date().toISOString(),
    };

    // 确保难度对象存在
    if (!newProgress[difficulty]) {
      newProgress[difficulty] = { consecutive_correct: 0, completed: false };
    }

    if (is_correct) {
      // 答对：consecutive_correct++
      newProgress[difficulty].consecutive_correct++;

      // 检查是否连续答对4题
      if (newProgress[difficulty].consecutive_correct >= 4) {
        // 标记该难度完成
        newProgress[difficulty].completed = true;
        newProgress[difficulty].consecutive_correct = 0;

        // 升级到下一难度（hard 不会再升级）
        const nextDifficulty = getNextDifficulty(difficulty);
        if (nextDifficulty) {
          newProgress.current_difficulty = nextDifficulty;
          // 确保下一难度对象存在
          if (!newProgress[nextDifficulty]) {
            newProgress[nextDifficulty] = { consecutive_correct: 0, completed: false };
          }
        }
        // 如果 nextDifficulty 为 null（hard），current_difficulty 保持不变
      }
    } else {
      // 答错：consecutive_correct 归零，难度不变
      newProgress[difficulty].consecutive_correct = 0;
    }

    newProgress.updated_at = new Date().toISOString();

    // 3. 持久化进度
    if (currentProgress) {
      await db.collection('kp_progress').doc(currentProgress._id).update({
        data: newProgress
      });
    } else {
      await db.collection('kp_progress').add({
        data: newProgress
      });
    }

    // 4. 返回结果
    return {
      success: true,
      data: {
        kp_id,
        current_difficulty: newProgress.current_difficulty,
        difficulty_state: newProgress[difficulty],
        should_upgrade: is_correct && newProgress[difficulty].consecutive_correct === 0 &&
          newProgress[difficulty].completed === true,
      }
    };

  } catch (e) {
    console.error('submitPracticeResult error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
```

- [ ] **Step 3: 上传云函数**

在微信开发者工具中右键 `submitPracticeResult` 文件夹，选择"上传并部署"。

- [ ] **Step 4: 验证云函数**

在云开发控制台测试：
```javascript
// 测试答对
{ "student_id": "test", "kp_id": "kp2_1", "difficulty": "easy", "is_correct": true }
// 预期：easy.consecutive_correct = 1

// 测试连续答对4次后
// 预期：easy.completed = true, current_difficulty = "medium"

// 测试 hard 完成后再答对
// 预期：hard.completed = true, current_difficulty = "hard"（不变）
```

---

## Task 4: 修改 practice_v2 云函数

**Files:**
- Modify: `cloudfunctions/practice_v2/index.js`

- [ ] **Step 1: 添加 getKpProgress 调用逻辑**

在 `exports.main` 函数中，plan 生成之前添加：

```javascript
// 查询 kp_progress 获取当前难度
let kpCurrentDifficulty = {};

if (studentId) {
  try {
    const progressRes = await cloud.callFunction({
      name: 'getKpProgress',
      data: { student_id: studentId }
    });
    if (progressRes.result?.success && progressRes.result.data) {
      const progressList = Array.isArray(progressRes.result.data)
        ? progressRes.result.data
        : [progressRes.result.data];
      progressList.forEach(p => {
        kpCurrentDifficulty[p.kp_id] = p.current_difficulty;
      });
    }
  } catch (e) {
    console.error('getKpProgress error:', e);
  }
}
```

- [ ] **Step 2: 修改 plan 生成逻辑**

将硬编码的 `difficulty: 'medium'` 改为：

```javascript
// 在生成 plan 时，优先使用 kp_progress 中的难度
if (weakPoints && weakPoints.length > 0) {
  for (const wp of weakPoints) {
    const kpId = wp.kp_id || wp.id;
    const savedDifficulty = kpCurrentDifficulty[kpId];

    for (let i = 0; i < numQuestions; i++) {
      plan.push({
        kp: { kp_id: kpId, kp_name: wp.kp_name || wp.name, chapter_name: wp.chapter || '' },
        difficulty: savedDifficulty || 'easy',  // 有历史用历史，无历史用 easy
      });
    }
  }
} else if (kpId) {
  const savedDifficulty = kpCurrentDifficulty[kpId];
  for (let i = 0; i < numQuestions; i++) {
    plan.push({
      kp: { kp_id: kpId, kp_name: kpName, chapter_name: chapter },
      difficulty: savedDifficulty || 'easy',
    });
  }
}
```

- [ ] **Step 3: 上传云函数**

在微信开发者工具中右键 `practice_v2` 文件夹，选择"上传并部署"。

- [ ] **Step 4: 验证**

清空测试用户的 kp_progress，调用 practice_v2，检查初始难度是否为 easy。

---

## Task 5: 修改前端

**Files:**
- Modify: `utils/cloudApi.js`
- Modify: `pages/practice/practice.js`

- [ ] **Step 1: 修改 cloudApi.js - startPractice 添加 student_id**

在 `startPractice` 函数中添加 `student_id` 和 `assessment_id` 参数：

```javascript
function startPractice(knowledgePointId, knowledgePointName, numQuestions, weakPoints, assessmentId) {
  return callCloudFunction('practice_v2', {
    knowledge_point_id: knowledgePointId || null,
    kp_name: knowledgePointName || '',
    num_questions: numQuestions || 5,
    grade: app.globalData.grade || '8',
    weak_points: weakPoints || [],
    student_id: app.globalData.studentId || null,
    assessment_id: assessmentId || null,
  });
}
```

- [ ] **Step 2: 修改 cloudApi.js - 添加 submitPracticeResult**

```javascript
function submitPracticeResult(data) {
  return callCloudFunction('submitPracticeResult', {
    student_id: app.globalData.studentId,
    kp_id: data.kp_id,
    difficulty: data.difficulty,
    is_correct: data.is_correct,
    assessment_id: data.assessment_id || null,
  });
}

// 添加 checkRetestEligibility
function checkRetestEligibility(assessmentId, score) {
  return callCloudFunction('checkRetestEligibility', {
    assessment_id: assessmentId,
    score: score,
  });
}

// 导出
module.exports = {
  // ... 现有导出
  submitPracticeResult,
  checkRetestEligibility,
};
```

- [ ] **Step 3: 修改 practice.js - 答题后调用 submitPracticeResult**

在 `submitAll` 函数中批量提交：

```javascript
async submitAll() {
  this.setData({ loading: true });

  // 批量提交答案
  for (const answer of this.data.answers) {
    const question = this.data.questions.find(q => q.id === answer.question_id);
    try {
      await api.submitPracticeResult({
        kp_id: question.knowledge_point_id,
        difficulty: question.difficulty,
        is_correct: answer.is_correct,
      });
    } catch (e) {
      console.error('submit result error:', e);
    }
  }

  // 跳转到结果页
  const correctCount = this.data.answers.filter(a => a.is_correct).length;
  wx.redirectTo({
    url: `/pages/result/result?mode=practice&correct=${correctCount}&total=${this.data.questions.length}`
  });
}
```

- [ ] **Step 4: 修改结果页 - 显示复测入口**

在 `result.js` 或调用方页面中，调用 `checkRetestEligibility` 判断是否显示复测按钮：

```javascript
// 在结果页 onLoad 中检查复测资格
async checkRetestEligibility() {
  const res = await api.checkRetestEligibility(this.data.assessmentId, this.data.score);
  if (res.data && res.data.eligible) {
    this.setData({ showRetestButton: true });
  }
}
```

- [ ] **Step 5: 验证前端调用**

在微信开发者工具中测试：
1. 答题后查看控制台是否有 submitPracticeResult 调用日志
2. 所有薄弱点难度通过后，查看是否显示复测按钮

---

## Task 6: 创建 checkRetestEligibility 云函数

**Files:**
- Create: `cloudfunctions/checkRetestEligibility/index.js`

- [ ] **Step 1: 创建云函数目录**

```bash
mkdir -p cloudfunctions/checkRetestEligibility
```

- [ ] **Step 2: 编写 checkRetestEligibility 云函数**

```javascript
/**
 * 检查复测条件
 * 判断所有薄弱点是否已通过目标难度
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 根据测评分数确定目标难度
function getTargetDifficulty(score) {
  if (score < 60) return 'easy';
  if (score < 80) return 'medium';
  return 'hard';  // 80-90
}

exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const { assessment_id, score } = params;

    if (!assessment_id || score === undefined) {
      return { success: false, error: '缺少 assessment_id 或 score' };
    }

    // 1. 查询该测评关联的所有 kp_progress 记录
    const progressRes = await db.collection('kp_progress')
      .where({ assessment_id })
      .get();

    // 2. 如果没有记录（>90分或首次测评），直接允许复测
    if (!progressRes.data || progressRes.data.length === 0) {
      const targetDifficulty = getTargetDifficulty(score);
      return {
        success: true,
        data: {
          eligible: true,
          target_difficulty: targetDifficulty,
          reason: '无练习记录，可直接复测',
          progress: [],
        }
      };
    }

    // 3. 有记录时，检查目标难度.completed 是否全为 true
    const targetDifficulty = getTargetDifficulty(score);
    const allCompleted = progressRes.data.every(p => {
      const targetState = p[targetDifficulty];
      return targetState && targetState.completed === true;
    });

    // 4. 返回结果
    return {
      success: true,
      data: {
        eligible: allCompleted,
        target_difficulty: targetDifficulty,
        reason: allCompleted
          ? '所有薄弱点目标难度已通过'
          : `还需完成 ${targetDifficulty} 难度的薄弱点`,
        progress: progressRes.data.map(p => ({
          kp_id: p.kp_id,
          current_difficulty: p.current_difficulty,
          target_completed: p[targetDifficulty]?.completed || false,
        })),
      }
    };

  } catch (e) {
    console.error('checkRetestEligibility error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
```

- [ ] **Step 3: 上传云函数**

在微信开发者工具中右键 `checkRetestEligibility` 文件夹，选择"上传并部署"。

- [ ] **Step 4: 验证云函数**

在云开发控制台测试：
```javascript
// 测试无记录（>90分）
{ "assessment_id": "test123", "score": 95 }
// 预期：{ eligible: true, reason: "无练习记录，可直接复测" }

// 测试有记录但未完成
{ "assessment_id": "test123", "score": 75 }
// 预期：{ eligible: false, target_difficulty: "medium" }

// 测试全部完成
// 预期：{ eligible: true, reason: "所有薄弱点目标难度已通过" }
```

---

## Task 7: 题库检查

**Files:**
- Modify: `cloudfunctions/practice_v2/question_bank.js`

- [ ] **Step 1: 检查当前题库难度分布**

分析每个 KP 的 easy/medium/hard 题目数量。

- [ ] **Step 2: 标记缺失的 hard 题目**

为缺少 hard 题目的 KP 补充题目，确保每个难度级别至少有 2-3 道题。

---

## Task 8: 端到端测试

**Files:**
- Test: 微信开发者工具手动测试

- [ ] **Test 1: 新用户初始难度**

```bash
# 1. 清空测试用户的 kp_progress 记录
# 2. 调用 practice_v2
# 3. 检查返回题目的 difficulty === "easy"
```

- [ ] **Test 2: 连续答对4题升级**

```bash
# 1. 在 easy 难度下连续答对 4 题
# 2. 检查 kp_progress: easy.completed === true, current_difficulty === "medium"
```

- [ ] **Test 3: 答错保持难度**

```bash
# 1. 在 medium 难度下答错 1 题
# 2. 检查 kp_progress: medium.consecutive_correct === 0, current_difficulty === "medium"
```

- [ ] **Test 4: hard 完成不再升级**

```bash
# 1. 在 hard 难度下连续答对 4 题
# 2. 检查 kp_progress: hard.completed === true, current_difficulty === "hard"（不变）
```

- [ ] **Test 5: 复测条件判断 - 无记录（>90分）**

```bash
# 1. 测评分数 95，无 kp_progress 记录
# 2. 调用 checkRetestEligibility
# 3. 检查：eligible === true
```

- [ ] **Test 6: 复测条件判断 - 部分完成**

```bash
# 1. 测评分数 80，薄弱点 [kp2_1, kp2_3]
# 2. kp2_1.hard.completed = true, kp2_3.hard.completed = false
# 3. 调用 checkRetestEligibility
# 4. 检查：eligible === false
```

- [ ] **Test 7: 复测条件判断 - 全部完成**

```bash
# 1. 测评分数 80，薄弱点 [kp2_1, kp2_3]
# 2. kp2_1.hard.completed = true, kp2_3.hard.completed = true
# 3. 调用 checkRetestEligibility
# 4. 检查：eligible === true
```

---

## 验收标准

| 验收项 | 验证方法 |
|--------|----------|
| 初始难度正确 | 无 kp_progress 记录时，新题 difficulty === "easy" |
| 连续答对4题升级 | easy.completed=true, current_difficulty="medium" |
| 答错不降级 | consecutive_correct=0, current_difficulty 不变 |
| hard 不再升级 | hard.completed=true, current_difficulty="hard" |
| 进度持久化 | kp_progress 表数据正确 |
| 复测条件正确（无记录） | 无 kp_progress 时 eligible=true |
| 复测条件正确（部分完成） | 部分 completed=false 时 eligible=false |
| 复测条件正确（全部完成） | 所有目标难度 completed=true 时 eligible=true |

---

## 实现顺序

```
Task 1 (数据库) → Task 2 (getKpProgress) → Task 3 (submitPracticeResult)
       ↓
Task 4 (practice_v2) → Task 5 (前端) → Task 6 (checkRetestEligibility)
       ↓
Task 7 (题库) → Task 8 (测试)
```

---

Plan complete and saved to `docs/superpowers/plans/2026-05-20-practice-difficulty-adaptation-plan.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**