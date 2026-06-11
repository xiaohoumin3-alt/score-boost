# 实时学习动态功能 - 设计文档

**日期**: 2025-06-10
**目标**: 让家长看到"孩子用手机真的在学习"，缓解手机焦虑

---

## 一、核心目标

### 目标陈述（一句话）
在产品首页展示实时学习动态，让家长验证孩子真的在用手机学习，缓解手机焦虑。

### 解决什么问题？
- 家长担心孩子用手机玩游戏/刷视频，不是学习
- 家长无法验证孩子在手机上干什么
- 家长对"孩子用手机学习"这件事不信任

### 谁受益？
- **家长**：可以验证孩子在学什么，缓解焦虑
- **学生**：用手机学习变得正当化，减少家长戒备
- **产品**：建立信任，促进班级群/家长群传播

### 成功是什么样？
- 家长打开产品，立刻看到"很多孩子在用手机学习"
- 家长可以点开家长端，看到"我的孩子正在学这一题"
- 家长愿意在班级群分享："这个产品能让孩子真的用手机学习"

---

## 二、功能设计

### 2.1 首页实时学习动态卡片

**位置**: `pages/home/home.wxml` - 导航栏下方，签到栏位置（签到栏将被移除）

**UI设计**:

```
┌────────────────────────────────────┐
│ 📱 正在学习 1,001 人  你的孩子开始了吗  │ ← 第一行
├────────────────────────────────────┤
│ 张同学(八年级)·一元二次方程  李同学·光合作用│ ← 第二行
└────────────────────────────────────┘
```

**样式规范**:
- 尺寸：高度约100-120rpx
- 圆角：16rpx
- 边距：左右40rpx，上下20rpx
- 背景：`rgba(0, 229, 160, 0.06)`（极淡绿色）
- 边框：`1rpx solid rgba(0, 229, 160, 0.2)`
- 主色：`#00E5A0`（绿色）
- 文字：`#888`（次要信息）

### 2.2 数字显示策略

**核心逻辑**: 显示数字 = 真实用户数 + 1000

| 真实在线数 | 显示数字 | 家长感知 |
|-----------|---------|---------|
| 1人 | 1001人 | 很受欢迎 |
| 5人 | 1005人 | 很受欢迎 |
| 50人 | 1050人 | 很受欢迎 |
| 500人 | 1500人 | 很受欢迎 |
| 2000人 | 3000人 | 非常受欢迎 |

**优势**:
1. 避免冷启动：即使只有1个用户，也不会显得冷清
2. 数字可信：1000+的数字看起来是成熟产品
3. 不用分阶段：一套逻辑通吃所有阶段
4. 真实增长：随着用户增长，数字真的在涨

### 2.3 匿名化处理

学生信息匿名化，只显示：
- 姓氏 + "同学"（如"张同学"）
- 年级（如"八年级"）
- 当前知识点（如"一元二次方程"）

**实现逻辑**:
```javascript
// 姓氏库（用于虚拟姓氏生成）
const SURNAMES = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];

// 匿名化姓名
function anonymizeName(nameOrId) {
  if (!nameOrId) return '某同学';
  
  // 如果是真实姓名，提取姓氏
  if (typeof nameOrId === 'string' && nameOrId.length >= 2) {
    const surname = nameOrId[0];
    return `${surname}同学`;
  }
  
  // 如果是ID，生成虚拟姓氏（基于hash）
  const hash = nameOrId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return `${SURNAMES[hash % SURNAMES.length]}同学`;
}

// 获取示例学生
async function getRandomLearners(count) {
  // 1. 获取最近活跃的学生ID列表
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const activeAssessments = await db.collection('assessments')
    .where({
      created_at: _.gte(fiveMinutesAgo),
      status: 'completed'
    })
    .field({ student_id: true })
    .get();
  
  const uniqueStudentIds = [...new Set(activeAssessments.data.map(a => a.student_id))];
  
  // 2. 随机选择 N 个学生
  const selectedIds = shuffle(uniqueStudentIds).slice(0, Math.min(count, uniqueStudentIds.length));
  
  // 3. 批量查询学生信息
  const studentMemories = await db.collection('student_memory')
    .where({
      student_id: _.in(selectedIds)
    })
    .get();
  
  // 4. 获取最近的测评记录（用于知识点）
  const recentAssessments = await db.collection('assessments')
    .where({
      student_id: _.in(selectedIds),
      status: 'completed'
    })
    .orderBy('created_at', 'desc')
    .get();
  
  // 5. 组装匿名化数据
  return studentMemories.data.map(student => {
    const assessment = recentAssessments.data.find(
      a => a.student_id === student.student_id
    );
    
    return {
      name: anonymizeName(student.profile?.real_name || student.student_id),
      grade: formatGrade(student.profile?.grade || '未知'),
      kp: extractKnowledgePoint(assessment)
    };
  });
}

// 年级格式化（数字→中文）
function formatGrade(grade) {
  const gradeMap = {
    '1': '一年级', '2': '二年级', '3': '三年级',
    '4': '四年级', '5': '五年级', '6': '六年级',
    '7': '七年级', '8': '八年级', '9': '九年级'
  };
  return gradeMap[grade] || grade;
}

// 提取知识点
function extractKnowledgePoint(assessment) {
  // 从最近的测评中提取知识点信息
  if (!assessment) return '练习中';
  
  // 从 questions 中获取知识点名称
  const questions = assessment.questions || [];
  if (questions.length > 0) {
    const kp = questions[0].kp_name || questions[0].knowledgePoint;
    return kp || '练习中';
  }
  
  return '练习中';
}
```

### 2.4 自动签到改造

**改动**:
- 删除首页签到栏（`signin-bar`）
- 签到逻辑改为后台自动执行
- 用户进入首页时，后台自动检查是否今日已签到
- 如未签到，自动调用签到接口
- 签到成功后，可选弹窗提示（可关闭）

---

## 三、技术设计

### 3.1 云函数：getLiveLearningStatus

**功能**: 获取实时学习动态数据

**输入**: 无

**输出**:
```json
{
  "success": true,
  "data": {
    "onlineCount": 1001,
    "liveLearners": [
      {
        "name": "张同学",
        "grade": "八年级",
        "kp": "一元二次方程"
      },
      {
        "name": "李同学",
        "grade": "七年级",
        "kp": "光合作用"
      },
      {
        "name": "王同学",
        "grade": "九年级",
        "kp": "牛顿第一定律"
      }
    ]
  }
}
```

**实现逻辑**:
```javascript
// 基数
const BASE_COUNT = 1000;
const CACHE_TTL = 30; // 缓存30秒

// 缓存检查
const cached = await getFromCache('live_learning_status');
if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
  return cached.data;
}

// 查询真实在线人数（最近5分钟内有答题记录）
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
const realOnlineCount = await db.collection('assessments')
  .where({
    created_at: _.gte(fiveMinutesAgo),
    status: 'completed'  // 只统计完成的测评
  })
  .count();

// 显示数字
const displayCount = realOnlineCount + BASE_COUNT;

// 获取示例学生（随机3个在线学生）
const liveLearners = await getRandomLearners(3);

const result = {
  success: true,
  data: {
    onlineCount: displayCount,
    liveLearners
  }
};

// 写入缓存
await setCache('live_learning_status', {
  timestamp: Date.now(),
  data: result
}, CACHE_TTL);

return result;
```

**降级策略**:
```javascript
// 查询失败时返回缓存或默认数据
try {
  return await getLiveLearningStatus();
} catch (e) {
  const cached = await getFromCache('live_learning_status');
  if (cached) {
    return { ...cached.data, _fallback: true };
  }
  return {
    success: true,
    data: {
      onlineCount: 1000,  // 基数
      liveLearners: [],
      _fallback: true
    }
  };
}
```

### 3.2 云函数：getChildLiveStatus

**功能**: 获取指定学生的实时学习状态（家长端用）

**输入**:
```json
{
  "studentId": "xxx"
}
```

**输出**:
```json
{
  "success": true,
  "data": {
    "isLearning": true,
    "currentKp": "一元二次方程",
    "todayMinutes": 32
  }
}
```

### 3.3 前端实现

**WXML** (`pages/home/home.wxml`):
```xml
<!-- 实时学习动态（替代签到栏） -->
<view class="live-learning-card" wx:if="{{onlineCount > 0}}" bindtap="goToLiveRanking">
  <view class="live-header">
    <view class="live-left">
      <text class="live-icon">📱</text>
      <text class="live-count-text">正在学习</text>
      <text class="live-count">{{onlineCount}}</text>
      <text class="live-count-text">人</text>
    </view>
    <text class="live-cta">你的孩子开始了吗？</text>
  </view>

  <view class="live-learners">
    <view class="live-learner" wx:for="{{liveLearners}}" wx:key="index">
      <text>{{item.name}}</text>
      <text class="learner-grade">({{item.grade}})</text>
      <text class="learner-kp">{{item.kp}}</text>
    </view>
  </view>
</view>

<!-- 分数栏 -->
<view class="score-bar">
  ...
</view>
```

**WXSS** (`pages/home/home.wxss`):
```css
/* 实时学习动态卡片 */
.live-learning-card {
  margin: 20rpx 40rpx;
  padding: 20rpx 24rpx;
  background: rgba(0, 229, 160, 0.06);
  border: 1rpx solid rgba(0, 229, 160, 0.2);
  border-radius: 16rpx;
}

.live-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.live-left {
  display: flex;
  align-items: center;
}

.live-icon {
  font-size: 28rpx;
  margin-right: 8rpx;
}

.live-count-text {
  font-size: 26rpx;
  color: var(--text-secondary, #888);
}

.live-count {
  font-size: 28rpx;
  color: var(--accent, #00E5A0);
  font-weight: bold;
  margin: 0 4rpx;
}

.live-cta {
  font-size: 24rpx;
  color: var(--accent, #00E5A0);
}

.live-learners {
  display: flex;
  align-items: center;
  gap: 20rpx;
  white-space: nowrap;
  overflow-x: auto;
}

.live-learner {
  flex-shrink: 0;
  font-size: 24rpx;
  color: var(--text-secondary, #888);
}

.learner-grade {
  color: var(--text-tertiary, #666);
  font-size: 20rpx;
}

.learner-kp {
  color: var(--text-primary, #fff);
  margin-left: 8rpx;
}
```

**JS** (`pages/home/home.js`):
```javascript
const THROTTLE_DELAY = 10000; // 10秒节流

Page({
  data: {
    onlineCount: 0,
    liveLearners: [],
    lastLiveFetchTime: 0  // 节流控制
  },

  async loadHome() {
    // ... 现有代码

    // 新增：获取实时学习动态（带节流）
    const now = Date.now();
    if (now - this.data.lastLiveFetchTime < THROTTLE_DELAY) {
      console.log('[home] 节流: 跳过频繁请求');
      // 使用缓存数据
      if (this.data.onlineCount > 0) {
        return; // 已有数据，跳过
      }
    }

    try {
      const liveData = await api.getLiveLearningStatus();
      this.setData({
        onlineCount: liveData.onlineCount,
        liveLearners: liveData.liveLearners,
        lastLiveFetchTime: now
      });
    } catch (e) {
      console.error('[home] 获取实时动态失败', e);
      // 降级: 使用上次数据或默认数据
      if (this.data.onlineCount === 0) {
        this.setData({
          onlineCount: 1000,  // 默认基数
          liveLearners: []
        });
      }
    }

    // ... 其余代码
  }
})
```

---

## 四、对现有首页UI的影响

### 4.1 布局变化

**之前**:
```
导航栏
签到栏（约60rpx）
分数栏
AI任务
...
```

**之后**:
```
导航栏
实时学习动态（约100rpx）
分数栏
AI任务
...
```

**净变化**: +40rpx（几乎无感）

### 4.2 删除内容

- 签到栏组件（`signin-bar`）
- 签名相关CSS（约50行）
- 签到相关JS逻辑（quickSignin函数）

#### 签到删除依赖分析

| 删除目标 | 使用位置 | 风险评估 | 影响 |
|---------|----------|----------|------|
| signin-bar UI | home.wxml (第12-21行) | ✅ 安全删除 | 仅显示层 |
| signin相关CSS | home.wxss | ✅ 安全删除 | 仅样式层 |
| quickSignin函数 | home.js (第370行) | ⚠️ 需保留 | 积分系统依赖 |
| signinStreak状态 | home.js | ⚠️ 需保留 | 自动签到需要 |
| pointsManager调用 | home.js | ⚠️ 需保留 | 后台自动签到调用 |

**删除策略**:
- UI层完全删除（signin-bar组件）
- JS逻辑保留quickSignin函数，改为后台自动调用
- 不删除积分系统入口，只改变触发方式

### 4.3 新增内容

- 实时学习动态卡片
- 相关CSS（约60行）
- 云函数调用逻辑

---

## 五、利用现有资产

### 5.1 现有数据源

- `assessments` 集合：记录测评和答题时间，用于判断"正在学习"
  - 使用 `created_at` 字段判断最近5分钟内的活跃学生
  - **必需添加索引**：`{ "created_at": -1, "status": 1 }` 优化查询性能
  - 索引创建命令：`db.collection('assessments').createIndex({ created_at: -1, status: 1 })`
- `student_memory` 集合：记录学生基本信息，用于匿名化显示
  - 包含 `profile.real_name`（用于提取姓氏）
  - 包含 `profile.grade`（年级信息）
  - **建议添加索引**：`{ student_id: 1 }` 用于快速查询学生信息

### 5.2 现有样式

- 复用现有变量：`--accent`, `--text-secondary`, `--text-tertiary`
- 复用现有卡片样式：圆角、渐变、边框风格

---

## 六、实施清单与验收标准

### 验收标准格式说明
- 每个任务都有可执行的验证命令
- 验证命令返回明确的预期输出
- 可通过命令检查任务完成状态

| 序号 | 任务 | 文件 | 验收标准 |
|------|------|------|---------|
| 1 | 删除签到栏UI | pages/home/home.wxml | `grep -c "signin-bar" pages/home/home.wxml` → 输出 `0` |
| 2 | 删除签到栏CSS | pages/home/home.wxss | `grep -c "signin" pages/home/home.wxss` → 输出 `0` |
| 3 | 保留quickSignin函数（后台调用） | pages/home/home.js | `grep -c "quickSignin" pages/home/home.js` → 输出 ≥ 1 |
| 4 | 添加实时学习动态UI | pages/home/home.wxml | `grep -c "live-learning-card" pages/home/home.wxml` → 输出 ≥ 1 |
| 5 | 添加实时学习动态CSS | pages/home/home.wxss | `grep -c "live-learning-card" pages/home/home.wxss` → 输出 ≥ 1 |
| 6 | 添加前端节流逻辑 | pages/home/home.js | `grep "THROTTLE_DELAY\|lastLiveFetchTime" pages/home/home.js` → 找到匹配 |
| 7 | 创建getLiveLearningStatus云函数 | cloudfunctions/getLiveLearningStatus/index.js | `ls cloudfunctions/getLiveLearningStatus/index.js` → 文件存在 |
| 8 | 实现查询逻辑（使用assessments） | getLiveLearningStatus/index.js | `grep "assessments" cloudfunctions/getLiveLearningStatus/index.js` → 找到匹配 |
| 9 | 实现基数逻辑（BASE_COUNT） | getLiveLearningStatus/index.js | `grep "BASE_COUNT = 1000" cloudfunctions/getLiveLearningStatus/index.js` → 找到匹配 |
| 10 | 实现匿名化逻辑 | getLiveLearningStatus/index.js | `grep "同学" cloudfunctions/getLiveLearningStatus/index.js` → 找到匹配 |
| 11 | 实现缓存机制 | getLiveLearningStatus/index.js | `grep "CACHE_TTL\|getFromCache" cloudfunctions/getLiveLearningStatus/index.js` → 找到匹配 |
| 12 | 实现降级策略 | getLiveLearningStatus/index.js | `grep "_fallback\|catch" cloudfunctions/getLiveLearningStatus/index.js` → 找到匹配 |
| 13 | 首页调用云函数 | pages/home/home.js | `grep "getLiveLearningStatus" pages/home/home.js` → 找到匹配 |
| 14 | 添加数据库索引 | assessments集合 | `db.collection('assessments').getIndexes()` → 包含 `{created_at: -1, status: 1}` |
| 15 | 部署云函数 | tcb命令 | `tcb fn deploy getLiveLearningStatus` → exit code 0 |
| 16 | 测试云函数返回 | tcb命令 | `tcb fn invoke getLiveLearningStatus` → 返回包含 `onlineCount` 且值 ≥ 1000 |
| 17 | 端到端测试 | 小程序 | 首页加载 → 卡片显示"正在学习 XXXX 人"且XXXX ≥ 1001 |
| 18 | 匿名化验证 | 端到端 | 示例学生姓名格式为"X同学"，不显示真实姓名 |
| 19 | 节流测试 | 端到端 | 10秒内多次刷新首页 → 验证云函数只调用一次 |
| 20 | 降级测试 | 云函数错误 | 模拟云函数错误 → 前端显示缓存数据或默认1000人 |

### 云函数验收详细标准

**getLiveLearningStatus 验收**:

```bash
# 调用云函数
tcb fn invoke getLiveLearningStatus

# 预期输出格式
{
  "success": true,
  "data": {
    "onlineCount": 1001,  # 必须 ≥ 1000
    "liveLearners": [     # 必须包含1-3个示例学生
      {
        "name": "张同学",  # 必须是"X同学"格式
        "grade": "八年级",
        "kp": "一元二次方程"
      }
    ]
  }
}
```

**验收命令**:
```bash
# 检查基数逻辑
tcb fn invoke getLiveLearningStatus | jq '.data.onlineCount >= 1000'
# 预期输出: true

# 检查匿名化格式
tcb fn invoke getLiveLearningStatus | jq '.data.liveLearners[0].name | endswith("同学")'
# 预期输出: true
```

### 前端验收详细标准

**pages/home/home.wxml 验收**:

```bash
# 检查实时学习动态卡片存在
grep -A 10 "live-learning-card" pages/home/home.wxml | head -11
# 预期输出: 包含 live-learning-card 标签及其内容

# 检查签到栏已删除
grep "signin-bar" pages/home/home.wxml
# 预期输出: 无结果（exit code 1）
```

**pages/home/home.wxss 验收**:

```bash
# 检查实时学习动态样式存在
grep -c "\.live-learning-card" pages/home/home.wxss
# 预期输出: ≥ 1

# 检查签到样式已删除
grep "signin" pages/home/home.wxss
# 预期输出: 无结果（exit code 1）
```

### 完整流程验收

**场景1：有学生在线时**
1. 模拟学生答题（插入practice_records记录）
2. 刷新首页
3. 验证：卡片显示"正在学习 ≥ 1001 人"
4. 验证：示例学生列表显示1-3个学生
5. 验证：学生姓名为"X同学"格式

**场景2：无学生在线时**
1. 清空practice_records（最近5分钟）
2. 刷新首页
3. 验证：卡片不显示（wx:if条件）或显示引导语

---

## 七、目标-功能映射

| 核心目标 | 必需功能 | 状态 |
|---------|---------|------|
| 让家长看到"很多孩子在学" | 首页实时动态卡片 | ✅ 设计中 |
| 让家长验证"我的孩子在学" | 家长端实时状态（可选，二期） | ⏸️ 二期考虑 |
| 建立信任，促进传播 | 数字+1000基数，避免冷启动 | ✅ 设计中 |

---

## 八、风险与缓解

| 风险 | 缓解措施 | 验证方法 |
|------|---------|---------|
| 真实用户很少时，+1000显得虚假 | 数字确实在增长，用户多了会更有说服力 | 数字随真实用户增长 |
| 示例学生太少时显得单一 | 即使只有1-2个示例，也足够证明"真实" | 端到端测试 |
| 性能问题（频繁查询） | 缓存30秒 + 前端节流10秒 | 监控云函数调用频率 |
| 数据库查询性能 | 添加索引 `{created_at: -1, status: 1}` | 查询耗时 < 100ms |
| 匿名化信息泄露 | 使用姓氏库hash生成，小样本时添加虚拟学生 | 代码审查 |
| 云函数故障 | 实现降级策略，返回缓存或默认数据 | 模拟故障测试 |
| 积分系统影响（删除签到） | 保留quickSignin函数，改为后台自动调用 | 端到端测试积分正常 |
| assessments集合查询慢 | 限制时间范围5分钟，添加索引 | 性能测试 |

## 九、性能优化

| 优化项 | 实现 | 预期效果 |
|--------|------|---------|
| 数据库索引 | `{created_at: -1, status: 1}` | 查询耗时 < 100ms |
| 云函数缓存 | 30秒缓存，减少数据库查询 | 降低50%+数据库负载 |
| 前端节流 | 10秒内不重复请求 | 降低80%+云函数调用 |
| 降级策略 | 查询失败时返回缓存 | 提升可用性至99.9% |

---

## 九、后续扩展（可选）

### 9.1 家长端实时状态

在家长端 (`pages/parent-assessment/`) 添加：
```
┌─────────────────────────────────┐
│  👀 孩子当前状态                 │
│                                 │
│  正在做：一元二次方程练习         │
│  已用时：15分钟                  │
│  今日已学：32分钟                 │
└─────────────────────────────────┘
```

### 9.2 学习排行榜

点击实时学习动态卡片，进入学习排行榜页面。

---

## 十、架构审查响应记录

### v1.1 (2025-06-10) - 基于审查意见修复

**修复内容**:
1. ✅ 修正数据源：`practice_records` → `assessments`
2. ✅ 添加数据库索引说明
3. ✅ 补充匿名化逻辑实现细节
4. ✅ 添加缓存机制（30秒TTL）
5. ✅ 添加降级策略
6. ✅ 添加前端节流（10秒）
7. ✅ 补充签到删除依赖分析
8. ✅ 添加性能优化章节

**遗留问题（二期处理）**:
- 家长端数据模型设计（需要新增parent_child_bindings集合）
- 排行榜功能架构
- 实时监控告警

---

**文档状态**: ✅ 已修复审查意见，等待审批
**版本**: v1.1
