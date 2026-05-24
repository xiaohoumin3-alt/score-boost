# 身份系统设计方案

> **目标**：为小程序搭建用户身份系统，支持微信登录，为未来收费/VIP功能奠定基础

**核心约束**：
- 无游客模式，测评前强制登录
- 数据跨设备同步（openid 绑定）
- 收费模式暂不确定，预留扩展字段

---

## 1. 架构概览

基于微信云开发（已有 `cloud1-7gg9y9tjb2b867b6` 环境），无需自建后端。

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   微信小程序  │────▶│  wx.login()  │────▶│ 云函数 login │
└─────────────┘     └──────────────┘     └──────────────┘
                                                    │
                                                    ▼
┌─────────────┐                              ┌─────────────┐
│  云数据库    │◀─────────────────────────────│ upsert user │
│  users 集合  │                              └─────────────┘
└─────────────┘
```

---

## 2. 用户数据模型

### 2.1 users 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | ObjectId | 自动生成 |
| `openid` | string | 微信唯一标识，**唯一索引** |
| `grade` | string | 年级（如 "八年级"） |
| `subject` | string | 科目（如 "数学"） |
| `vip_status` | string | `'free'` \| `'vip'` |
| `vip_expire_at` | Date | VIP过期时间 |
| `points` | number | 积分（未来计费用） |
| `created_at` | Date | 注册时间 |
| `updated_at` | Date | 更新时间 |

### 2.2 assessments 集合扩展

现有 `assessments` 集合增加 `openid` 字段，实现用户数据绑定：

| 字段 | 类型 | 说明 |
|------|------|------|
| `openid` | string | 用户标识（新增） |

---

## 3. 云函数设计

### 3.1 login

**职责**：微信登录，upsert 用户记录

**输入**：
```javascript
{
  // 空对象，openid 从 wx.cloud.getUserInfo() 获取
}
```

**逻辑**：
1. 从 `cloud.getWXContext()` 获取 `OPENID`（自动注入，无需前端传递）
2. 查询 `users` 集合是否存在该 openid
3. 不存在 → 创建新记录；存在 → 更新时间
4. 迁移本地 session 数据（grade/subject）
5. 返回用户信息给小程序

**输出**：
```javascript
{
  success: true,
  user: {
    openid: string,
    grade: string,
    subject: string,
    vip_status: string,
    points: number,
  }
}
```

### 3.2 getUserInfo

**职责**：获取当前用户信息

**输入**：
```javascript
{
  openid: string  // 可选，不传则用当前登录用户
}
```

**输出**：同 login.user

### 3.3 updateUserProfile

**职责**：更新用户资料（年级/科目）

**输入**：
```javascript
{
  grade?: string,
  subject?: string,
}
```

### 3.4 checkVipStatus

**职责**：检查VIP状态（未来计费前置检查）

**输入**：
```javascript
{
  openid: string
}
```

**输出**：
```javascript
{
  vip_status: 'free' | 'vip',
  points: number,
  can_use: boolean,  // true: free可用或vip有效
}
```

---

## 4. 登录流程

### 4.1 首次打开小程序

```
App.onLaunch()
    ↓
检查本地 session.openid
    ↓
存在？
  ├─ 是 → 调用 getUserInfo 验证 → 成功 → 设置 globalData → 进入主页
  └─ 否 → 调用 login() → 获取/创建用户 → 存储 session
        ↓
      检查是否有 grade/subject
        ├─ 有 → 进入主页
        └─ 无 → 进入 onboarding
```

### 4.2 登录页面流程

```
用户进入 /pages/login/login
    ↓
点击"微信一键登录"按钮
    ↓
调用 wx.cloud.callFunction({ name: 'login' })
    ↓
云函数内部：
  1. cloud.getWXContext() 获取 openid
  2. 查询 users 集合
  3. 不存在则创建新记录
  4. 返回用户信息
    ↓
小程序存储 session { openid, grade, subject, ... }
    ↓
跳转 onboarding（如需要）或首页
```

### 4.3 测评前检查

```
进入 /pages/assessment/assessment
    ↓
检查 globalData.openid
    ↓
存在？
  ├─ 是 → 正常进入测评流程
  └─ 否 → wx.showModal 提示登录 → 确认 → 跳转 /pages/login/login
```

---

## 5. 页面变更

### 5.1 新增页面

| 页面 | 路由 | 说明 |
|------|------|------|
| 登录页 | `/pages/login/login` | 微信一键登录引导 |

### 5.2 页面流程变更

```
首页 (home)
    ├─ 已登录 → 显示用户信息、开始测评按钮
    └─ 未登录 → 显示登录引导（不显示测评入口）

测评页 (assessment)
    └─ 未登录 → 弹窗引导登录，不允许进入

练习页 (practice)
    └─ 未登录 → 弹窗引导登录

路径页 (path)
    └─ 依赖测评数据，未登录显示引导
```

---

## 6. 数据迁移

### 6.1 现有数据迁移

首次登录时，检查本地 `wx.getStorageSync('userSession')` 中的 `grade`/`subject`：

```javascript
// login 云函数逻辑
const localSession = clientData.session; // 从小程序传入

if (localSession?.grade && localSession?.subject) {
  // 迁移本地数据到云端
  user.grade = localSession.grade;
  user.subject = localSession.subject;
}
```

### 6.2 assessments 数据绑定

新测评在 `startAssessment` 时直接传入 `openid`，写入 `assessments` 集合：

```javascript
// startAssessment 云函数
async function startAssessment(event) {
  const openid = cloud.getWXContext().OPENID
  const { grade, subject, ... } = event

  // 创建 assessments 记录时关联 openid
  await db.collection('assessments').add({
    data: {
      openid,           // 新增：直接关联
      assessment_id,
      grade,
      subject,
      // ...
    }
  })
}
```

**兼容性处理**：
- 已有 `student_id` 的记录保留
- 新记录使用 `openid`
- 查询时优先用 `openid`，fallback 到 `student_id`

---

## 7. 错误处理

| 场景 | 处理方式 |
|------|----------|
| 微信登录失败 | 弹窗重试，3次后提示联系客服 |
| 云函数调用失败 | 显示错误信息，提供重试按钮 |
| 网络断开 | 缓存操作，恢复后重试 |

---

## 8. 安全考虑

1. **openid 不暴露**：云函数返回时不包含内部 `_id`
2. **权限控制**：云数据库设置 `openid` 为查询/更新条件
3. **数据隔离**：用户只能读写自己的数据

---

## 9. 未来扩展预留

| 字段 | 用途 |
|------|------|
| `vip_status` | VIP 会员标识 |
| `vip_expire_at` | VIP 到期时间 |
| `points` | 积分系统（按次计费） |

**预计新增云函数**：
- `purchaseVip` - 购买VIP
- `deductPoints` - 扣减积分
- `rechargePoints` - 充值积分

---

## 10. app.js 变更说明

现有 `app.js` 需要扩展：

```javascript
// 扩展后的 globalData
globalData: {
  backendUrl: 'http://192.168.1.7:8002',
  openid: null,        // 新增：用户标识
  studentId: null,      // 保留：兼容旧逻辑
  grade: null,
  subject: null,
  sessionId: null,
},

// 扩展后的 loadSession
loadSession() {
  const data = wx.getStorageSync('userSession')
  if (data) {
    this.globalData.openid = data.openid    // 新增
    this.globalData.grade = data.grade
    this.globalData.subject = data.subject
    this.globalData.studentId = data.studentId
  }
}
```

## 12. 实现优先级

| 优先级 | 内容 | 说明 |
|--------|------|------|
| P0 | login 云函数 + users 集合 | 核心登录能力 |
| P0 | 登录页面 | 用户入口 |
| P0 | 测评前登录检查 | 核心业务流程 |
| P1 | getUserInfo + updateUserProfile | 用户信息管理 |
| P2 | checkVipStatus | VIP 基础（为后续收费预留） |

---

**文档版本**：v1.0
**创建时间**：2026-05-22
