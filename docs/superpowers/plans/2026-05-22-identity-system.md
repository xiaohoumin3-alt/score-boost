# 身份系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为小程序添加微信登录功能，用户 openid 绑定，测评前强制登录

**Architecture:** 基于微信云开发，使用 `wx.cloud.getWXContext()` 获取 openid，upsert 到 users 集合。前端通过云函数调用完成登录流程。

**Tech Stack:** 微信小程序云开发、云函数、云数据库

---

## 实施范围

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| Phase 1 | login 云函数 + users 集合 | P0 |
| Phase 2 | 登录页面 + app.js 改造 | P0 |
| Phase 3 | 测评前登录检查 | P0 |
| Phase 4 | startAssessment 支持 openid | P1 |
| Phase 5 | getUserInfo/updateUserProfile | P1 |

---

## Phase 1: login 云函数 + users 集合

### Task 1.1: 创建 login 云函数目录

**Files:**
- Create: `cloudfunctions/login/index.js`
- Create: `cloudfunctions/login/package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "login",
  "version": "1.0.0",
  "main": "index.js"
}
```

- [ ] **Step 2: 创建 index.js**

```javascript
/**
 * 登录云函数
 * 功能：微信登录，upsert 用户记录
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  const db = cloud.database();
  const now = new Date().toISOString();

  try {
    // 查询用户是否存在
    const { data: existingUsers } = await db.collection('users')
      .where({ openid })
      .get();

    if (existingUsers.length > 0) {
      // 用户存在，更新登录时间
      const user = existingUsers[0];
      await db.collection('users').doc(user._id).update({
        data: {
          updated_at: now,
        }
      });
      return {
        success: true,
        user: {
          openid: user.openid,
          grade: user.grade,
          subject: user.subject,
          vip_status: user.vip_status || 'free',
          points: user.points || 0,
        }
      };
    } else {
      // 新用户创建
      const newUser = {
        openid,
        grade: null,
        subject: null,
        vip_status: 'free',
        vip_expire_at: null,
        points: 0,
        created_at: now,
        updated_at: now,
      };

      await db.collection('users').add({
        data: newUser
      });

      return {
        success: true,
        user: {
          openid: newUser.openid,
          grade: newUser.grade,
          subject: newUser.subject,
          vip_status: newUser.vip_status,
          points: newUser.points,
        }
      };
    }
  } catch (e) {
    console.error('login error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
```

- [ ] **Step 3: 部署云函数**

在微信开发者工具中，右键 `cloudfunctions/login` 文件夹，选择「上传并部署」

**Verification Gate:** `grep -n "exports.main" cloudfunctions/login/index.js` → 输出包含 `exports.main`

---

### Task 1.2: 创建 users 集合索引

在云开发控制台中为 `users` 集合创建唯一索引：

| 字段 | 类型 | 唯一 |
|------|------|------|
| openid | string | ✅ |

**Verification Gate:** 云开发控制台 → 数据库 → users 集合 → 索引管理 → 确认 openid 唯一索引存在

---

## Phase 2: 登录页面 + app.js 改造

### Task 2.1: 更新 app.js

**Files:**
- Modify: `app.js`

- [ ] **Step 1: 更新 globalData**

```javascript
globalData: {
  backendUrl: 'http://192.168.1.7:8002',
  openid: null,        // 新增：用户标识
  studentId: null,      // 保留：兼容旧逻辑
  grade: null,
  subject: null,
  sessionId: null,
},
```

- [ ] **Step 2: 更新 loadSession**

```javascript
loadSession() {
  try {
    const data = wx.getStorageSync('userSession');
    console.log('[app] loadSession data:', data);
    if (data) {
      this.globalData.openid = data.openid;      // 新增
      this.globalData.grade = data.grade;
      this.globalData.subject = data.subject;
      this.globalData.studentId = data.studentId;
      console.log('[app] session loaded, openid:', this.globalData.openid);
    }
  } catch (e) {
    console.error('loadSession error', e);
  }
},
```

- [ ] **Step 3: 更新 saveSession**

```javascript
saveSession(data) {
  if (data.openid) this.globalData.openid = data.openid;
  if (data.grade) this.globalData.grade = data.grade;
  if (data.subject) this.globalData.subject = data.subject;
  if (data.studentId) this.globalData.studentId = data.studentId;
  wx.setStorageSync('userSession', {
    openid: this.globalData.openid,
    grade: this.globalData.grade,
    subject: this.globalData.subject,
    studentId: this.globalData.studentId,
  });
}
```

- [ ] **Step 4: 添加 checkLogin 方法**

```javascript
checkLogin() {
  return !!this.globalData.openid;
},

requireLogin(callback) {
  if (this.checkLogin()) {
    if (callback) callback();
  } else {
    wx.showModal({
      title: '请先登录',
      content: '测评前需要先登录微信账号',
      confirmText: '去登录',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/login/login' });
        }
      }
    });
  }
},
```

**Verification Gate:** `grep -n "openid" app.js` → 输出包含 `this.globalData.openid`

---

### Task 2.2: 创建登录页面

**Files:**
- Create: `pages/login/login.js`
- Create: `pages/login/login.wxml`
- Create: `pages/login/login.wxss`
- Create: `pages/login/login.json`

- [ ] **Step 1: 创建 login.json**

```json
{
  "usingComponents": {},
  "navigationBarTitleText": "登录"
}
```

- [ ] **Step 2: 创建 login.wxml**

```xml
<view class="container">
  <view class="logo-section">
    <image class="logo" src="/docs/app-icon.svg" mode="aspectFit"/>
    <text class="app-name">提分神器</text>
    <text class="app-desc">智能数学学习助手</text>
  </view>

  <view class="login-section">
    <text class="login-title">微信一键登录</text>
    <text class="login-desc">登录后可同步学习数据，跨设备继续学习</text>

    <button class="login-btn" type="primary" bindtap="onLogin" loading="{{loading}}">
      {{loading ? '登录中...' : '确认登录'}}
    </button>

    <text class="agreement">登录即表示同意《用户协议》和《隐私政策》</text>
  </view>
</view>
```

- [ ] **Step 3: 创建 login.wxss**

```css
.container {
  min-height: 100vh;
  background: linear-gradient(180deg, #0f0f23 0%, #1a1a3e 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 60rpx 60rpx;
}

.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 120rpx;
}

.logo {
  width: 200rpx;
  height: 200rpx;
  border-radius: 40rpx;
  margin-bottom: 40rpx;
}

.app-name {
  font-size: 48rpx;
  font-weight: 600;
  color: #fff;
  margin-bottom: 16rpx;
}

.app-desc {
  font-size: 28rpx;
  color: rgba(255,255,255,0.6);
}

.login-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.login-title {
  font-size: 40rpx;
  font-weight: 500;
  color: #fff;
  margin-bottom: 20rpx;
}

.login-desc {
  font-size: 28rpx;
  color: rgba(255,255,255,0.6);
  text-align: center;
  margin-bottom: 60rpx;
}

.login-btn {
  width: 100%;
  height: 96rpx;
  background: linear-gradient(135deg, #00D9A5, #00B894);
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: 500;
  color: #fff;
  border: none;
}

.login-btn::after {
  border: none;
}

.agreement {
  font-size: 24rpx;
  color: rgba(255,255,255,0.4);
  margin-top: 40rpx;
  text-align: center;
}
```

- [ ] **Step 4: 创建 login.js**

```javascript
const app = getApp();

Page({
  data: {
    loading: false,
  },

  onLoad() {
    // 如果已登录，直接跳转
    if (app.checkLogin()) {
      this.redirectAfterLogin();
    }
  },

  onLogin() {
    if (this.data.loading) return;

    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'login',
      data: {},
      success: (res) => {
        console.log('[login] success:', res);
        if (res.result && res.result.success) {
          const user = res.result.user;

          // 保存登录信息
          app.saveSession({
            openid: user.openid,
            grade: user.grade,
            subject: user.subject,
          });

          wx.showToast({ title: '登录成功', icon: 'success' });

          // 延迟跳转，等待 toast 显示
          setTimeout(() => {
            this.redirectAfterLogin();
          }, 1500);
        } else {
          wx.showToast({ title: res.result?.error || '登录失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('[login] fail:', err);
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  redirectAfterLogin() {
    // 检查是否已完成初始化（grade/subject）
    if (app.globalData.grade && app.globalData.subject) {
      wx.reLaunch({ url: '/pages/home/home' });
    } else {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
    }
  },
});
```

**Verification Gate:**
- `ls pages/login/` → 输出包含 login.js, login.wxml, login.wxss, login.json
- `grep -n "redirectAfterLogin" pages/login/login.js` → 输出包含该函数

---

### Task 2.3: 更新 app.json 添加登录页面

**Files:**
- Modify: `app.json`

- [ ] **Step 1: 添加 login 页面到 pages 数组**

```json
{
  "pages": [
    "pages/home/home",
    "pages/onboarding/onboarding",
    "pages/login/login",
    "pages/assessment/assessment",
    "pages/practice/practice",
    "pages/result/result",
    "pages/path/path"
  ]
}
```

**Verification Gate:** `grep -n "login" app.json` → 输出包含 `"pages/login/login"`

---

## Phase 3: 测评前登录检查

### Task 3.1: 更新 assessment.js 添加登录检查

**Files:**
- Modify: `pages/assessment/assessment.js`

- [ ] **Step 1: 在 onLoad 开头添加登录检查**

在 `onLoad()` 函数开头添加：

```javascript
onLoad() {
  // 检查登录状态
  if (!app.checkLogin()) {
    app.requireLogin();
    return;
  }

  // 原有的 onLoad 逻辑...
```

**Verification Gate:** `grep -n "requireLogin" pages/assessment/assessment.js` → 输出包含登录检查

---

### Task 3.2: 更新 practice.js 添加登录检查

**Files:**
- Modify: `pages/practice/practice.js`

- [ ] **Step 1: 在 onLoad 开头添加登录检查**

同上，在 `onLoad()` 开头添加登录检查。

**Verification Gate:** `grep -n "requireLogin" pages/practice/practice.js` → 输出包含登录检查

---

## Phase 4: startAssessment 支持 openid

### Task 4.1: 更新 startAssessment 云函数

**Files:**
- Modify: `cloudfunctions/startAssessment/index.js`

- [ ] **Step 1: 在 assessments.add() 中添加 openid**

找到第77-91行的 `db.collection('assessments').add()` 调用，修改为：

```javascript
await db.collection('assessments').add({
  data: {
    assessment_id: assessmentId,
    subject,
    grade,
    semester,
    mode,
    questions: questions,
    time_limit_minutes: result.time_limit_minutes,
    status: 'in_progress',
    answers: [],
    created_at: new Date().toISOString(),
    student_id: studentId,
    openid: wxContext.OPENID,  // 新增：关联用户
  }
});
```

- [ ] **Step 2: 获取 wxContext**

在 `exports.main = async (event, context) => {` 之后添加：

```javascript
const wxContext = cloud.getWXContext();
```

**Verification Gate:** `grep -n "openid" cloudfunctions/startAssessment/index.js` → 输出包含 openid 字段

---

## Phase 5: getUserInfo / updateUserProfile / checkVipStatus (P1)

### Task 5.1: 创建 getUserInfo 云函数

**Files:**
- Create: `cloudfunctions/getUserInfo/index.js`
- Create: `cloudfunctions/getUserInfo/package.json`

```javascript
/**
 * 获取用户信息云函数
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  const db = cloud.database();

  try {
    const { data: users } = await db.collection('users')
      .where({ openid })
      .get();

    if (users.length > 0) {
      const user = users[0];
      return {
        success: true,
        user: {
          openid: user.openid,
          grade: user.grade,
          subject: user.subject,
          vip_status: user.vip_status || 'free',
          points: user.points || 0,
        }
      };
    } else {
      return { success: false, error: '用户不存在' };
    }
  } catch (e) {
    console.error('getUserInfo error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
```

**Verification Gate:** `grep -n "exports.main" cloudfunctions/getUserInfo/index.js` → 输出包含该函数

---

### Task 5.2: 创建 updateUserProfile 云函数

**Files:**
- Create: `cloudfunctions/updateUserProfile/index.js`
- Create: `cloudfunctions/updateUserProfile/package.json`

```javascript
/**
 * 更新用户资料云函数
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  const { grade, subject } = event;
  const db = cloud.database();
  const now = new Date().toISOString();

  try {
    const { data: users } = await db.collection('users')
      .where({ openid })
      .get();

    if (users.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    const updateData = { updated_at: now };
    if (grade !== undefined) updateData.grade = grade;
    if (subject !== undefined) updateData.subject = subject;

    await db.collection('users').doc(users[0]._id).update({
      data: updateData
    });

    return { success: true };
  } catch (e) {
    console.error('updateUserProfile error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
```

**Verification Gate:** `grep -n "exports.main" cloudfunctions/updateUserProfile/index.js` → 输出包含该函数

---

### Task 5.3: 创建 checkVipStatus 云函数

**Files:**
- Create: `cloudfunctions/checkVipStatus/index.js`
- Create: `cloudfunctions/checkVipStatus/package.json`

```javascript
/**
 * 检查VIP状态云函数
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  const db = cloud.database();

  try {
    const { data: users } = await db.collection('users')
      .where({ openid })
      .get();

    if (users.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    const user = users[0];
    const vipStatus = user.vip_status || 'free';
    const points = user.points || 0;
    const vipExpireAt = user.vip_expire_at;

    // 检查 VIP 是否有效
    let canUse = true;
    if (vipStatus === 'vip' && vipExpireAt) {
      canUse = new Date(vipExpireAt) > new Date();
    }

    return {
      success: true,
      vip_status: vipStatus,
      points: points,
      can_use: canUse,
    };
  } catch (e) {
    console.error('checkVipStatus error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
```

**Verification Gate:** `grep -n "exports.main" cloudfunctions/checkVipStatus/index.js` → 输出包含该函数

---

## 部署检查清单

完成所有 Task 后，在微信开发者工具中执行以下检查：

| 检查项 | 命令/操作 | 预期结果 |
|--------|-----------|----------|
| 云函数部署 | 上传所有新增云函数 (login, getUserInfo, updateUserProfile, checkVipStatus) | 无报错 |
| users 集合索引 | 云开发控制台检查 | openid 唯一索引存在 |
| 登录流程 | 真机调试 | 点击登录 → 跳转首页 |
| 测评入口 | 真机调试 | 未登录 → 弹窗提示 |
| 数据关联 | 开发者工具云数据库 | assessments 新记录含 openid |
| checkVipStatus | 云开发控制台测试 | 返回 vip_status, points, can_use |

---

**计划版本**：v1.0
**创建时间**：2026-05-22
