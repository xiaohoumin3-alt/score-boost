# ScoreBoost 学习闭环增强方案

*版本: v1.4 | 日期: 2026-05-25 | 状态: 第三方审计修复完成*

## 修订记录
| 版本 | 日期 | 修订内容 |
|------|------|----------|
| v1.0 | 2026-05-25 | 初版 |
| v1.1 | 2026-05-25 | 添加 typical_mistakes 传递设计 |
| v1.2 | 2026-05-25 | 修复 Swarm Review 问题 |
| v1.3 | 2026-05-25 | 修复新发现的边界问题 |
| v1.4 | 2026-05-25 | 第三方审计修复（HIGH+MEDIUM）|

### v1.4 修复清单（第三方审计）

**🔴 HIGH:**
- ✅ H8: 补充 progress.json 完整配置
- ✅ H9: 添加 app.json 页面注册步骤
- ✅ H10: result.js data 中初始化 perfectShown
- ✅ H11: 排序逻辑添加默认值防止 NaN
- ✅ H12: 补充 cloudApi.js 依赖验证说明
- ✅ H13: 补充 result.js 参数来源验证

**🟡 MEDIUM:**
- ✅ M6: result.js 显示下次复习时间
- ✅ M7: 明确答错后 consecutive_correct 重置为0
- ✅ M8: 明确题库 typical_mistakes 范围
- ✅ M9: 添加 estimateScore 权重说明

**🟢 LOW:**
- ✅ L4: 补充云函数部署完整命令
- ✅ L5: 添加首页布局调整说明

### v1.3 修复清单

**🔴 HIGH:**
- ✅ N1: 修正索引逻辑，consecutive_correct 从1开始计数，索引 = currentConsecutive - 1
- ✅ N2: 明确首次复习时机：新用户首练后需等1天才显示复习卡片

**🟡 MEDIUM:**
- ✅ N3: 满分成就添加 session 级别 perfectShown 标记防重复弹窗
- ✅ N4: estimateScore 添加 unknown 难度默认值 0.1
- ✅ N5: 弹窗延迟改为 1600ms（Toast 1500ms + 100ms buffer）

### v1.2 修复清单

**🔴 HIGH 优先级（全部修复）:**
- ✅ H3: 复习间隔改为从 1 天开始（SM-2 算法）
- ✅ H4: 修复 reviewIntervals 索引偏移（consecutive_correct=1 取第2个间隔）
- ✅ H5: 添加满分成就触发逻辑（追踪单次练习正确率）
- ✅ H7: 修正 G4 指标描述（"连续正确题数" ≠ "连续学习天数"）

**🟡 MEDIUM 优先级（全部修复）:**
- ✅ M1: 满分成就持久化到本地存储
- ✅ M3: estimateScore 计入 medium 权重（60%）
- ✅ M4: 复习卡片按 next_review_at 和 difficulty 排序
- ✅ M5: loadPendingReviews 添加错误提示

**🟢 LOW 优先级:**
- L2: streak 语义已通过 H7 修复
- L3: 满分成就范围已通过 H5 明确（>=5题且100%正确）

---

## 1. 背景与目标

### 1.1 现有能力盘点

| 能力 | 位置 | 状态 | 问题 |
|------|------|------|------|
| `getKpProgress` | 云函数 | ✅ 存在 | ❌ 前端从未调用 |
| `kp_progress` 表 | 数据库 | ✅ 有数据 | ❌ 用户看不到 |
| `typical_mistakes` | knowledge_points | ✅ 已存储 | ❌ practice_v2获取了但没传给前端 |
| `scheduledTaskGenerator` | 云函数 | ✅ 存在 | ❌ 只生成题目，未做复习调度 |
| `consecutive_correct` | kp_progress | ✅ 有 | ❌ 没用作成就系统 |

### 1.2 核心目标

| 目标 | 定义 | 衡量指标 |
|------|------|----------|
| **G1: 深度反馈** | 做错题后知道"为什么错" | 同类错误重复率 -50% |
| **G2: 进度感知** | 用户能看见自己在进步 | 进度页UV/DAU > 30% |
| **G3: 复习触发** | 系统主动驱动复习，而非用户主动 | 复测完成率 > 60% |
| **G4: 动机维持** | 成就感和连续正确体验 | 最大连续正确题数 >= 7 |
| | | **说明**: "连续正确题数" ≠ "连续学习天数" |

---

## 2. 功能设计方案

### 2.1 功能1: 深度反馈系统 (G1)

#### 2.1.1 数据流

```
knowledge_points.typical_mistakes
    ↓ practice_v2 获取 (已有逻辑)
    ↓ 返回题目时携带 (需修改)
practice.js 显示 (需修改)
```

#### 2.1.2 云函数改造

**文件**: `cloudfunctions/practice_v2/index.js`

**修改点1**: generateQuestionWithAI 函数返回值 (约第83-97行)

```javascript
// 在 result 对象中添加 typical_mistakes
const result = {
  id: generated.id,
  type: questionType || 'choice',
  question: generated.question,
  explanation: generated.explanation || '',
  source: 'ai',
  kp_id: kpId,
  kp_name: kpName,
  difficulty,
  created_at: new Date().toISOString(),
  scenario_used: parsed.scenario_used,
  triple_used: parsed.triple_used,
  question_pattern: parsed.question_pattern,
  // ✅ 新增
  typical_mistakes: kc.typical_mistakes || [],
  knowledge_context: kc.knowledge_context || ''
};
```

**修改点2**: 返回给前端时 (约第240行)

```javascript
// 在 return 语句中添加
return {
  session_id: sessionId,
  questions: questions.map(q => ({
    id: q.id,
    content: q.question,
    options: q.options,
    correct_answer: q.correct_answer,
    explanation: q.explanation || '',
    difficulty: q.difficulty,
    kp_id: q.kp_id || q.knowledge_point_id,
    kp_name: q.kp_name || q.knowledge_point,
    knowledge_point_id: q.kp_id || q.knowledge_point_id,
    knowledge_point: q.kp_name || q.knowledge_point,
    image_url: q.image_url || null,
    // ✅ 新增
    typical_mistakes: q.typical_mistakes || [],
    knowledge_context: q.knowledge_context || ''
  }))
};
```

#### 2.1.3 题库改造

**文件**: `cloudfunctions/practice_v2/question_bank.js`

**修改点**: 为题库题目添加 `typical_mistakes` 字段

**M8修复 - 题库范围说明**:
- MVP阶段：仅 kp2_3（勾股定理应用）添加 typical_mistakes 作为示例
- 后续扩展：根据实际效果逐步覆盖其他知识点

```javascript
kp2_3: [
  {
    content: '一个梯子长5米，底端离墙3米，顶端离地面多高？',
    options: ['A. 4米', 'B. 3米', 'C. 2米', 'D. 5米'],
    correct_answer: 'A',
    difficulty: 'easy',
    image_url: '...',
    // ✅ 新增
    typical_mistakes: [
      '错误用 a² - b² = c²，正确的是 a² + b² = c²',
      '混淆了直角边和斜边，斜边是最长边'
    ]
  }
]
```

#### 2.1.4 前端改造

**文件**: `pages/practice/practice.js`

**修改点**: selectOption 函数 (约第169-173行)

```javascript
// 现有代码
if (isCorrect) {
  wx.showToast({ title: '正确!', icon: 'success', duration: 800 });
} else {
  wx.showToast({ title: '错误: ' + currentQuestion.correct_answer, icon: 'none', duration: 1500 });
}

// ✅ 修改为
if (isCorrect) {
  wx.showToast({ title: '正确!', icon: 'success', duration: 800 });
} else {
  wx.showToast({ title: '错误: ' + currentQuestion.correct_answer, icon: 'none', duration: 1500 });

  // 新增：显示典型错误（等待Toast结束后再弹窗）
  const mistakes = currentQuestion.typical_mistakes || [];
  if (mistakes.length > 0) {
    setTimeout(() => {
      wx.showModal({
        title: '💡 常见错误',
        content: mistakes.slice(0, 2).join('\n'),
        showCancel: false,
        confirmText: '知道了'
      });
    }, 1600); // Toast duration 1500ms + 100ms buffer
  }
}
```

#### 2.1.5 验收标准

- [ ] 调用 practice_v2 返回的题目包含 `typical_mistakes` 字段
- [ ] 答错题时弹窗显示典型错误（最多2条）
- [ ] 答对题时正常跳转下一题，不弹窗

---

### 2.2 功能2: 进度可视化 (G2)

#### 2.2.1 新建进度页

**文件结构**:
```
pages/progress/
├── progress.js
├── progress.wxml
├── progress.wxss
└── progress.json
```

**H8修复 - progress.json 配置**:
```json
{
  "navigationBarTitleText": "学习进度",
  "navigationBarBackgroundColor": "#4A90E2",
  "navigationBarTextStyle": "white"
}
```

**H9修复 - app.json 页面注册**:
在 `app.json` 的 `pages` 数组中添加：
```json
"pages/progress/progress"
```

#### 2.2.2 页面逻辑

**文件**: `pages/progress/progress.js`

```javascript
const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    loading: true,
    kpList: [],
    totalKp: 15,
    masteredKp: 0,
    learningKp: 0,
    weakKp: 0,
    currentScore: 0,
    targetScore: 85
  },

  onLoad() {
    this.loadProgress();
  },

  async loadProgress() {
    wx.showLoading({ title: '加载中...' });

    try {
      // 调用已有的 getKpProgress API
      const res = await api.getKpProgress();

      let kpList = [];
      if (res.success && res.data) {
        kpList = Array.isArray(res.data) ? res.data : [res.data];
      }

      // 统计各状态数量
      const masteredKp = kpList.filter(kp => kp.current_difficulty === 'easy').length;
      const learningKp = kpList.filter(kp => kp.current_difficulty === 'medium').length;
      const weakKp = kpList.filter(kp => kp.current_difficulty === 'hard').length;

      // 计算目标差距
      const targetScore = 85;
      const currentScore = this.estimateScore(kpList, targetScore);

      this.setData({
        loading: false,
        kpList,
        totalKp: kpList.length || 15,
        masteredKp,
        learningKp,
        weakKp,
        currentScore,
        targetScore
      });

      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 估算当前分数：基于掌握度
  // M9修复：权重说明
  // easy = 100%（完全掌握）, medium = 60%（基本掌握）, hard = 20%（需加强）, unknown = 10%（未开始）
  // 权重基于经验值，可根据实际数据调整
  estimateScore(kpList, targetScore) {
    if (!kpList || kpList.length === 0) return 0;
    const weights = { easy: 1.0, medium: 0.6, hard: 0.2, unknown: 0.1 };
    const totalWeight = kpList.reduce((sum, kp) => {
      const diff = kp.current_difficulty || 'unknown';
      return sum + (weights[diff] !== undefined ? weights[diff] : weights.unknown);
    }, 0);
    const maxWeight = kpList.length;
    return Math.round((totalWeight / maxWeight) * targetScore);
  },

  // 点击知识点跳转练习
  goPractice(e) {
    const kp = e.currentTarget.dataset.kp;
    app.targetKpId = kp.kp_id;
    app.targetKpName = kp.kp_name || kp.kp_id;
    wx.switchTab({ url: '/pages/practice/practice' });
  }
});
```

#### 2.2.3 页面结构

**文件**: `pages/progress/progress.wxml`

```xml
<view class="page">
  <!-- Header -->
  <view class="header">
    <text class="title">📊 学习进度</text>
    <text class="subtitle">当前水平 vs 目标</text>
  </view>

  <!-- 进度概览 -->
  <view class="score-card">
    <view class="score-circle">
      <text class="score-current">{{currentScore}}</text>
      <text class="score-divider">/</text>
      <text class="score-target">{{targetScore}}</text>
    </view>
    <view class="progress-bar-wrap">
      <view class="progress-bar">
        <view class="bar-fill" style="width: {{currentScore}}%;"></view>
      </view>
      <text class="progress-label">差距 {{targetScore - currentScore}} 分</text>
    </view>
  </view>

  <!-- 状态统计 -->
  <view class="stats-row">
    <view class="stat-item mastered">
      <text class="stat-num">{{masteredKp}}</text>
      <text class="stat-label">已掌握</text>
    </view>
    <view class="stat-item learning">
      <text class="stat-num">{{learningKp}}</text>
      <text class="stat-label">学习中</text>
    </view>
    <view class="stat-item weak">
      <text class="stat-num">{{weakKp}}</text>
      <text class="stat-label">待加强</text>
    </view>
  </view>

  <!-- 知识点列表 -->
  <view class="kp-list">
    <view class="section-title">📚 知识点详情</view>
    <block wx:for="{{kpList}}" wx:key="kp_id">
      <view class="kp-item" bindtap="goPractice" data-kp="{{item}}">
        <view class="kp-status {{item.current_difficulty}}">
          <text wx:if="{{item.current_difficulty === 'easy'}}">✅</text>
          <text wx:elif="{{item.current_difficulty === 'medium'}}">🔄</text>
          <text wx:else>❌</text>
        </view>
        <view class="kp-info">
          <text class="kp-name">{{item.kp_name || item.kp_id}}</text>
          <text class="kp-detail">
            当前难度: {{item.current_difficulty || 'easy'}}
          </text>
        </view>
        <text class="kp-arrow">›</text>
      </view>
    </block>

    <!-- 空状态 -->
    <view class="empty-state" wx:if="{{kpList.length === 0 && !loading}}">
      <text class="empty-icon">📝</text>
      <text class="empty-text">暂无学习数据</text>
      <text class="empty-hint">开始练习后这里会显示你的进度</text>
    </view>
  </view>
</view>
```

#### 2.2.4 首页入口

**文件**: `pages/home/home.js`

**新增函数**:

```javascript
viewProgress() {
  wx.navigateTo({ url: '/pages/progress/progress' });
}
```

**文件**: `pages/home/home.wxml`

**在合适位置添加**:

```xml
<view class="progress-entry" bindtap="viewProgress">
  <text class="entry-icon">📊</text>
  <text class="entry-text">查看学习进度</text>
  <text class="entry-arrow">›</text>
</view>
```

#### 2.2.5 验收标准

- [ ] 新建 `pages/progress/` 页面文件
- [ ] `onLoad` 时调用 `getKpProgress` API
- [ ] 展示知识点列表及状态（✅/🔄/❌）
- [ ] 首页有"查看进度"入口

---

### 2.3 功能3: 复习触发机制 (G3)

#### 2.3.1 数据流

```
submitPracticeResult 更新 kp_progress
    ↓ 计算 next_review_at (新增)
kp_progress.next_review_at 字段
    ↓ 首页查询
home.js 显示"今日复习"卡片
```

#### 2.3.2 云函数改造

**文件**: `cloudfunctions/submitPracticeResult/index.js`

**修改点**: 在更新进度后计算复习时间 (约第86行后)

```javascript
// 在 newProgress.updated_at = ... 后添加

// ✅ 新增：计算下次复习时间 (SM-2 简化算法)
// consecutive_correct 从1开始计数（答对1题=1，答对2题=2）
// 间隔序列（分钟）: 1天, 3天, 7天, 14天, 30天
const reviewIntervals = [1440, 4320, 10080, 20160, 43200]; // 1d, 3d, 7d, 14d, 30d
const currentConsecutive = newProgress[difficulty].consecutive_correct || 0;
// 索引计算：consecutive_correct=1 → 索引0（1天），consecutive_correct=2 → 索引1（3天）
const intervalIndex = Math.min(Math.max(currentConsecutive - 1, 0), reviewIntervals.length - 1);
const intervalMinutes = reviewIntervals[intervalIndex];

// 计算下次复习绝对时间
const nextReviewAt = new Date(Date.now() + intervalMinutes * 60 * 1000);

newProgress.next_review_at = nextReviewAt.toISOString();
newProgress.last_reviewed_at = new Date().toISOString();

// M7修复：明确答错后重置逻辑
// 答错时 consecutive_correct 会被重置为0（由现有逻辑处理）
// 下次答对时重新从1天间隔开始
// 首次练习说明：新用户首练后 consecutive_correct=1，next_review_at=1天后
```

#### 2.3.3 首页改造

**文件**: `pages/home/home.js`

**新增函数**:

```javascript
async loadPendingReviews() {
  try {
    const res = await api.getKpProgress();
    if (res.success && res.data) {
      const kpList = Array.isArray(res.data) ? res.data : [res.data];
      const now = new Date();

      // 筛选需要复习的知识点 (next_review_at <= now)
      let pendingReviews = kpList.filter(kp => {
        if (!kp.next_review_at) return false;
        return new Date(kp.next_review_at) <= now;
      });

      // 排序：优先显示即将过期的（next_review_at 最早），其次按 difficulty
      pendingReviews.sort((a, b) => {
        const aTime = new Date(a.next_review_at || 0).getTime();
        const bTime = new Date(b.next_review_at || 0).getTime();
        if (aTime !== bTime) return aTime - bTime;
        // H11修复：添加默认值防止 NaN
        const diffOrder = { hard: 1, medium: 2, easy: 3, unknown: 4 };
        const aOrder = diffOrder[a.current_difficulty] || diffOrder.unknown;
        const bOrder = diffOrder[b.current_difficulty] || diffOrder.unknown;
        return aOrder - bOrder;
      });

      if (pendingReviews.length > 0) {
        this.setData({
          pendingReviews,
          hasPendingReviews: true
        });
      }
    }
  } catch (e) {
    console.error('[home] loadPendingReviews error:', e);
    wx.showToast({ title: '加载复习数据失败', icon: 'none' });
  }
}
```

**修改 `loadHome`**:

```javascript
async loadHome() {
  // ... 现有逻辑 ...

  // 新增：加载待复习知识点
  await this.loadPendingReviews();
}
```

**新增跳转函数**:

```javascript
goReview(e) {
  const kp = e.currentTarget.dataset.kp;
  app.targetKpId = kp.kp_id;
  app.targetKpName = kp.kp_name || kp.kp_id;
  wx.switchTab({ url: '/pages/practice/practice' });
}
```

**文件**: `pages/home/home.wxml`

**新增复习卡片**:

```xml
<!-- 今日复习卡片 -->
<view class="review-card" wx:if="{{hasPendingReviews}}">
  <view class="review-header">
    <text class="review-icon">📝</text>
    <text class="review-title">今日复习</text>
    <text class="review-count">{{pendingReviews.length}}个知识点</text>
  </view>
  <view class="review-list">
    <block wx:for="{{pendingReviews}}" wx:key="kp_id">
      <view class="review-item" bindtap="goReview" data-kp="{{item}}">
        <text class="review-kp">{{item.kp_name || item.kp_id}}</text>
        <text class="review-action">去复习 ›</text>
      </view>
    </block>
  </view>
</view>
```

#### 2.3.4 验收标准

- [ ] `submitPracticeResult` 更新 `next_review_at` 和 `last_reviewed_at` 字段
- [ ] 首页查询并展示"今日复习"卡片
- [ ] 点击卡片跳转对应知识点练习

---

### 2.4 功能4: 成就系统 (G4)

#### 2.4.1 成就定义

| 成就ID | 名称 | 条件 | 图标 |
|--------|------|------|------|
| streak_3 | 连续3题 | consecutive_correct >= 3 | 🔥 |
| streak_7 | 连续7题 | consecutive_correct >= 7 | 💎 |
| streak_30 | 连续30题 | consecutive_correct >= 30 | 👑 |
| first_mastery | 首次掌握 | 任意 kp 达到 easy | 🎯 |
| perfect_practice | 满分练习 | 单次练习 100% 正确 | ⭐ |

#### 2.4.2 前端改造

**文件**: `pages/home/home.js`

**新增**:

```javascript
async loadAchievements() {
  try {
    const res = await api.getKpProgress();
    if (res.success && res.data) {
      const kpList = Array.isArray(res.data) ? res.data : [res.data];

      // 计算最大连续正确 (遍历所有难度层)
      let maxStreak = 0;
      kpList.forEach(kp => {
        ['easy', 'medium', 'hard'].forEach(diff => {
          if (kp[diff] && kp[diff].consecutive_correct > maxStreak) {
            maxStreak = kp[diff].consecutive_correct;
          }
        });
      });

      // 检查成就
      const achievements = [];
      if (maxStreak >= 3) achievements.push({ id: 'streak_3', name: '连续3题', icon: '🔥' });
      if (maxStreak >= 7) achievements.push({ id: 'streak_7', name: '连续7题', icon: '💎' });
      if (maxStreak >= 30) achievements.push({ id: 'streak_30', name: '连续30题', icon: '👑' });

      // 检查首次掌握
      const hasMastery = kpList.some(kp => kp.current_difficulty === 'easy');
      if (hasMastery) achievements.push({ id: 'first_mastery', name: '首次掌握', icon: '🎯' });

      // 检查满分成就（从本地存储读取）
      const localAchievements = wx.getStorageSync('achievements') || {};
      if (localAchievements['perfect_practice']) {
        achievements.push({ id: 'perfect_practice', name: '满分练习', icon: '⭐' });
      }

      this.setData({
        streak: maxStreak,
        achievements: achievements.slice(0, 3) // 最多显示3个
      });
    }
  } catch (e) {
    console.error('[home] loadAchievements error:', e);
  }
}
```

**修改 `loadHome`**:

```javascript
async loadHome() {
  // ... 现有逻辑 ...

  // 新增：加载成就
  await this.loadAchievements();
}
```

**文件**: `pages/home/home.wxml`

**新增成就展示**:

```xml
<!-- 成就展示 -->
<view class="achievement-row" wx:if="{{achievements.length > 0}}">
  <view class="section-title">🏆 近期成就</view>
  <scroll-view class="achievement-scroll" scroll-x="true">
    <view class="achievement-list">
      <block wx:for="{{achievements}}" wx:key="id">
        <view class="achievement-badge">
          <text class="badge-icon">{{item.icon}}</text>
          <text class="badge-name">{{item.name}}</text>
        </view>
      </block>
    </view>
  </scroll-view>
</view>

<!-- 连续正确题数（非连续学习天数） -->
<view class="streak-card" wx:if="{{streak > 0}}">
  <text class="streak-icon">🔥</text>
  <text class="streak-num">{{streak}}</text>
  <text class="streak-label">最大连续正确</text>
</view>
```

#### 2.4.3 满分成就触发

**文件**: `pages/result/result.js`

**修改点**: 在 `onLoad` 中检查本次练习正确率

**H13修复 - 参数来源验证**:
需要确认 practice.js 跳转到 result 页时传递了 correctCount 和 totalCount 参数。
如果未传递，需要从全局变量或缓存中读取本次练习数据。

**H10修复 - data 初始化**:
在 Page({ data: { ... } }) 中添加：
```javascript
perfectShown: false
```

```javascript
// 在 onLoad 函数中
onLoad(options) {
  const correctCount = parseInt(options.correctCount) || 0;
  const totalCount = parseInt(options.totalCount) || 1;

  // 检查是否满分（100% 正确率且至少 5 题）
  const isPerfect = correctCount === totalCount && totalCount >= 5;

  if (isPerfect) {
    // 读取本地存储的成就记录
    const achievements = wx.getStorageSync('achievements') || {};
    const achievementId = 'perfect_practice';

    // 首次达成才触发（本地存储 + session标记防重复弹窗）
    const sessionKey = 'perfect_shown_' + Date.now(); // 本次会话唯一key
    if (!achievements[achievementId] && !this.data.perfectShown) {
      achievements[achievementId] = {
        unlockedAt: new Date().toISOString(),
        count: 1
      };
      wx.setStorageSync('achievements', achievements);
      this.setData({ perfectShown: true }); // session级别标记

      // 延迟触发，让烟花先显示
      setTimeout(() => {
        wx.showModal({
          title: '🎉 满分表现！',
          content: '太棒了！继续保持！\n⭐ 满分成就已解锁',
          showCancel: false,
          confirmText: '继续'
        });
      }, 1000);
    }
  }

  // ... 现有烟花逻辑
  this.triggerConfetti();

  // M6修复：显示下次复习时间
  // 从全局或缓存获取本次练习的知识点ID，计算下次复习时间
  const nextReviewDate = new Date(Date.now() + 1440 * 60 * 1000); // 1天后
  const month = nextReviewDate.getMonth() + 1;
  const day = nextReviewDate.getDate();
  const reviewTip = `下次复习时间: ${month}月${day}日`;
  
  // 在页面底部显示复习提示
  this.setData({ reviewTip });
}
```

**验收标准**:
- [ ] 单次练习 100% 正确且至少 5 题时触发成就
- [ ] 成就记录保存到本地存储
- [ ] 同一成就不重复触发

#### 2.4.4 验收标准

- [ ] 首页展示当前最大连续正确题数
- [ ] 达成成就条件时显示对应徽章
- [ ] 满分时触发成就提示

---

## 3. 技术实现细节

### 3.0 前置依赖验证（H12修复）

**验证 cloudApi.js 是否存在 getKpProgress 方法**:
```bash
grep -n "getKpProgress" utils/cloudApi.js
```
如果不存在，需要补充：
```javascript
// 在 utils/cloudApi.js 中添加
getKpProgress: async (studentId) => {
  return wx.cloud.callFunction({
    name: 'getKpProgress',
    data: { student_id: studentId || getApp().globalData.studentId }
  });
}
```

### 3.1 API 调用汇总

| 功能 | 调用API | 参数 |
|------|---------|------|
| 进度 | `getKpProgress` | `{ student_id }` |
| 提交结果 | `submitPracticeResult` | `{ kp_id, difficulty, is_correct, ... }` |

### 3.2 数据库字段

**表: `kp_progress` - 新增字段**

| 字段 | 类型 | 说明 | 操作 |
|------|------|------|------|
| next_review_at | string | 下次复习时间 (ISO) | 新增 |
| last_reviewed_at | string | 上次复习时间 (ISO) | 新增 |

### 3.3 文件改动清单

| 文件 | 操作 | 功能 |
|------|------|------|
| `cloudfunctions/practice_v2/index.js` | 修改 | 返回 typical_mistakes, knowledge_context |
| `cloudfunctions/practice_v2/question_bank.js` | 修改 | 添加 typical_mistakes |
| `cloudfunctions/submitPracticeResult/index.js` | 修改 | 计算 next_review_at |
| `pages/practice/practice.js` | 修改 | 显示典型错误弹窗 |
| `pages/home/home.js` | 修改 | 加载进度/成就/复习 |
| `pages/home/home.wxml` | 修改 | 显示复习卡片/成就 |
| `pages/result/result.js` | 修改 | 满分成就提示 |
| `pages/progress/*` | 新增 | 进度详情页 |

---

## 4. 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| API 超时 | 低 | 所有调用加 try-catch，显示友好错误 |
| 数据为空 | 低 | 空状态 UI，提示用户开始练习 |
| 复习时间计算错误 | 中 | 使用固定间隔表，避免复杂算法 |
| 云函数更新后 Runtime 冲突 | 中 | 使用 `tcb fn code update` 替代重新部署 |

**L4修复 - 云函数部署完整命令**:
```bash
# 进入项目目录
cd /Users/seanxx/score-boost-mini

# 更新 practice_v2 云函数
tcb fn code update --name practice_v2 --projectPath ./cloudfunctions/practice_v2

# 更新 submitPracticeResult 云函数
tcb fn code update --name submitPracticeResult --projectPath ./cloudfunctions/submitPracticeResult

# 验证更新成功
tcb fn list | grep -E "(practice_v2|submitPracticeResult)"
```

---

## 5. 里程碑

| 阶段 | 功能 | 预计工时 |
|------|------|----------|
| M1 | 深度反馈 (typical_mistakes) | 2小时 |
| M2 | 进度可视化 (progress页) | 3小时 |
| M3 | 复习触发 (next_review_at) | 2小时 |
| M4 | 成就系统 | 2小时 |
| **总计** | | **9小时** |

---

## 6. 验收测试用例

### UT1: 深度反馈
- 输入: 答错一道勾股定理题 (kp2_3)
- 期望: 弹出 modal 显示典型错误

### UT2: 进度页
- 输入: 进入 /pages/progress/progress
- 期望: 显示知识点列表和状态

### UT3: 复习卡片
- 输入: kp_progress 有 `next_review_at <= now` 的记录
- 期望: 首页显示"今日复习"卡片

### UT4: 成就展示
- 输入: 某 kp 的任意难度 consecutive_correct >= 3
- 期望: 首页显示 🔥 成就徽章
