# 反馈系统设计

**日期**: 2026-05-24
**状态**: 设计完成

## 1. 目标

提供用户反馈入口，收集使用问题和建议；提供管理员后台，查看和回复反馈，形成闭环。

## 2. 系统架构

```
┌─────────────────┐     ┌─────────────────┐
│   小程序 (C端)   │     │  管理后台 (H5)  │
├─────────────────┤     ├─────────────────┤
│  - 反馈表单页    │     │  - 管理员登录    │
│  - 我的反馈页    │     │  - 反馈列表      │
│  - 查看回复     │     │  - 回复功能      │
└────────┬────────┘     └────────┬────────┘
         │                         │
         └───────────┬─────────────┘
                     ▼
            ┌─────────────────┐
            │   云数据库       │
            ├─────────────────┤
            │  - feedback      │
            └─────────────────┘
```

## 3. 数据模型

### 3.1 feedback 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 反馈ID（自动生成） |
| openid | string | 用户openid |
| content | string | 反馈内容（必填，≤500字，≥2字） |
| contact | string | 联系方式（选填） |
| category | string | 分类：bug / suggestion / other |
| status | string | 状态：pending / replied |
| hasReply | boolean | 是否有未读回复（用户端红点提示） |
| replies | array | 回复数组 |
| repliedAt | string | 最后回复时间（ISO格式，管理员回复时更新） |
| createdAt | string | 提交时间（ISO格式） |
| updatedAt | string | 更新时间 |

### 3.2 replies 数组元素

| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 回复内容 |
| isAdmin | boolean | true=管理员回复 |
| createdAt | string | 回复时间 |

## 4. C端功能

### 4.1 反馈表单页 (pages/feedback/feedback)

**路径**: 小程序内入口
- **入口位置**：home 页面（首页）增加"意见反馈"入口

**页面元素**:
1. 分类选择器（单选）
   - Bug 问题
   - 功能建议
   - 其他
2. 反馈内容输入框
   - 多行文本
   - 必填
   - 限 500 字
   - 占位文字："请描述您遇到的问题或建议..."
3. 联系方式输入框（选填）
   - 占位文字："手机号或微信号（选填）"
4. 提交按钮
   - 需登录后提交
   - 提交中显示 loading
5. 提交成功弹窗
   - 提示："反馈已提交，感谢您的建议！"
   - 按钮："查看我的反馈"

**交互逻辑**:
- 提交前校验内容非空
- 提交后清空表单
- 自动跳转至"我的反馈"页面

### 4.2 我的反馈页 (pages/feedback-list/feedback-list)

**页面元素**:
1. 反馈列表
   - 按时间倒序
   - 每条显示：分类标签、内容摘要（最多2行）、状态标签、提交时间
   - 有未读回复时显示红点
2. 空状态
   - 图标 + 文字："暂无反馈记录"
3. 下拉刷新

**交互逻辑**:
- 进入页面时检测 hasReply=true 的反馈，显示红点
- 用户点击查看详情后，hasReply 设为 false

### 4.3 反馈详情页 (pages/feedback-detail/feedback-detail)

**页面元素**:
1. 反馈内容区域
   - 分类标签
   - 完整内容
   - 提交时间
2. 回复列表
   - 用户提交（左侧）
   - 管理员回复（右侧，绿色背景）
3. 回复提示
   - "暂无回复" 或 最后回复时间

**交互逻辑**:
- 进入时标记 hasReply=false（已读）
- 支持下拉刷新

## 5. B端管理后台

**技术栈**: H5 单页应用，部署为静态托管

**访问路径**: /admin/feedback (待定)

### 5.1 登录页 (admin/login.html)

**页面元素**:
1. 账号输入框
2. 密码输入框
3. 登录按钮
4. 错误提示

**交互逻辑**:
- 账号密码存放在云数据库 admin 集合中
- 登录成功后存储 token 到 localStorage
- 登录状态有效期 7 天

### 5.2 反馈列表页 (admin/feedback.html)

**页面元素**:
1. 筛选器
   - 状态筛选：全部 / 待处理 / 已回复
   - 分类筛选：全部 / Bug / 建议 / 其他
2. 搜索框（按内容关键词）
3. 反馈列表
   - 每条显示：分类、摘要、状态、时间、操作
   - 点击进入详情
4. 分页（20条/页）

**交互逻辑**:
- 默认显示待处理（status=pending）
- 点击状态可快速筛选

### 5.3 反馈详情页 (admin/feedback-detail.html)

**页面元素**:
1. 反馈信息卡片
   - 用户 openid（脱敏显示）
   - 联系方式
   - 分类
   - 提交时间
2. 反馈内容（完整）
3. 回复历史
4. 回复输入框
5. 提交回复按钮

**交互逻辑**:
- 提交回复后更新数据库
- 回复后自动标记 status=replied

## 6. 云函数

### 6.1 submitFeedback

**参数**:
```javascript
{
  content: string,
  contact: string,
  category: string
}
```

**逻辑**:
1. 获取用户 openid
2. 校验内容非空
3. 写入 feedback 集合
4. 返回成功

### 6.2 getMyFeedback

**参数**: 无（从云函数获取 openid）

**逻辑**:
1. 获取用户 openid
2. 查询该用户的反馈列表
3. 按时间倒序返回

### 6.3 markAsRead

**参数**:
```javascript
{
  feedbackId: string
}
```

**逻辑**:
1. 更新 feedback.hasReply = false
2. 返回成功

### 6.4 getFeedbackList (管理端)

**参数**:
```javascript
{
  status: string,      // optional
  category: string,    // optional
  keyword: string,     // optional
  page: number,
  pageSize: number
}
```

**逻辑**:
1. 校验管理员权限
2. 查询反馈列表
3. 返回分页结果

### 6.5 replyFeedback (管理端)

**参数**:
```javascript
{
  feedbackId: string,
  content: string
}
```

**逻辑**:
1. 校验管理员权限
2. 写入回复到 replies 数组
3. 更新 status=replied
4. 更新 hasReply=true
5. 更新 repliedAt

## 7. 小程序入口

在 home 页面（首页）增加"意见反馈"入口：
- 入口位置：home 页面显眼位置（如顶部或中部卡片）
- 点击后跳转到 pages/feedback/feedback 反馈表单页

## 8. 验收标准

| 功能 | 验收条件 |
|------|----------|
| 反馈提交 | 用户填写表单后数据正确写入数据库 |
| 我的反馈列表 | 正确显示用户提交的所有反馈 |
| 收到回复 | 我的反馈页显示红点提示 |
| 查看回复 | 进入详情页能看到完整对话 |
| 后台登录 | 账号密码正确可登录，错误提示 |
| 后台列表 | 能筛选、搜索、查看反馈 |
| 后台回复 | 提交回复后用户端能看到 |