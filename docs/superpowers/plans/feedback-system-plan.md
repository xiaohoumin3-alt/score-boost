# 反馈系统实施计划

**日期**: 2026-05-24
**状态**: 计划完成

## Overview

为 score-boost-mini 小程序实现用户反馈系统，包含：C 端小程序（反馈表单、我的反馈、反馈详情）、B 端 H5 管理后台（登录、列表、回复）、5 个云函数、数据库集合。

## Requirements

**设计文档**: `docs/superpowers/specs/2026-05-24-feedback-system-design.md`

**数据模型**:
- feedback 集合: _id, openid, content, contact, category (bug/suggestion/other), status (pending/replied/closed), hasReply, replies[], createdAt, updatedAt
- replies 数组: content, isAdmin, createdAt

**技术栈**:
- 小程序: wxml + js (现有模式)
- 云函数: wx-server-sdk (现有模式)
- 管理后台: H5 单页应用
- 数据库: 微信云开发

## 分阶段实施计划

### Phase 1: 数据库准备与基础云函数 (C端)

#### Task 1.0 - 创建 feedback 数据库集合

| 项目 | 内容 |
|------|------|
| 操作 | 在云数据库创建 feedback 集合 |
| 字段 | _id, openid, content(≥2字,≤500字), contact, category(bug/suggestion/other), status(pending/replied), hasReply, replies[], repliedAt, createdAt, updatedAt |
| 索引 | openid（用于用户查询）, createdAt（用于排序） |
| 依赖 | 无 |
| 风险 | Low |

**验证标准**:
- [ ] 云数据库控制台 feedback 集合已创建
- [ ] 索引已配置

---

#### Task 1.1 - 创建 submitFeedback 云函数

| 项目 | 内容 |
|------|------|
| 文件 | `cloudfunctions/submitFeedback/index.js` |
| 逻辑 | 获取openid -> 校验内容非空 -> 写入feedback集合 |
| 依赖 | 无 |
| 风险 | Low |

**验证命令**:
```bash
# 测试云函数
wx.cloud.callFunction({ name: 'submitFeedback', data: { content: '测试', category: 'bug', contact: '' } })
# 预期: 数据库有新增记录
```

---

#### Task 1.2 - 创建 getMyFeedback 云函数

| 项目 | 内容 |
|------|------|
| 文件 | `cloudfunctions/getMyFeedback/index.js` |
| 逻辑 | 获取openid -> 查询该用户的反馈列表 -> 按时间倒序返回 |
| 依赖 | Task 1.1 |
| 风险 | Low |

**验证命令**:
```bash
wx.cloud.callFunction({ name: 'getMyFeedback' })
# 预期: 返回该用户的反馈列表
```

---

#### Task 1.3 - 创建 markAsRead 云函数

| 项目 | 内容 |
|------|------|
| 文件 | `cloudfunctions/markAsRead/index.js` |
| 逻辑 | 更新 feedback.hasReply = false |
| 依赖 | Task 1.1 |
| 风险 | Low |

**验证命令**:
```bash
wx.cloud.callFunction({ name: 'markAsRead', data: { feedbackId: 'xxx' } })
# 预期: hasReply 字段更新为 false
```

---

### Phase 2: C端 - 反馈表单页面

#### Task 2.1 - 创建反馈表单页

| 项目 | 内容 |
|------|------|
| 文件 | `pages/feedback/feedback.{wxml,js,json,wxss}` |
| 功能 | 分类选择、内容输入(500字)、联系方式、提交按钮 |
| 依赖 | Task 1.1 |
| 风险 | Low |

**验证标准**:
- [ ] 页面路径可访问
- [ ] 分类选择器可切换
- [ ] 内容限制500字
- [ ] 提交后数据写入数据库
- [ ] 提交成功跳转"我的反馈"

---

### Phase 3: C端 - 我的反馈页面

#### Task 3.1 - 创建我的反馈页

| 项目 | 内容 |
|------|------|
| 文件 | `pages/feedback-list/feedback-list.{wxml,js,json,wxss}` |
| 功能 | 反馈列表、分类标签、状态标签、红点提示、空状态 |
| 依赖 | Task 1.2 |
| 风险 | Low |

**验证标准**:
- [ ] 空状态正常显示
- [ ] 反馈列表时间倒序
- [ ] hasReply=true 时显示红点
- [ ] 下拉刷新正常

---

### Phase 4: C端 - 反馈详情页面

#### Task 4.1 - 创建反馈详情页

| 项目 | 内容 |
|------|------|
| 文件 | `pages/feedback-detail/feedback-detail.{wxml,js,json,wxss}` |
| 功能 | 反馈内容、回复历史、进入时标记已读 |
| 依赖 | Task 1.3 |
| 风险 | Low |

**验证标准**:
- [ ] 显示完整反馈内容
- [ ] 回复历史正确展示
- [ ] 进入时 hasReply = false

---

### Phase 5: C端 - 入口与页面注册

#### Task 5.1 - 添加页面到 app.json

| 项目 | 内容 |
|------|------|
| 文件 | `app.json` |
| 操作 | 添加 pages/feedback/feedback, pages/feedback-list/feedback-list, pages/feedback-detail/feedback-detail |
| 依赖 | Phase 2-4 完成 |
| 风险 | Medium |

**验证命令**:
```bash
# 小程序开发者工具编译无报错
```

---

#### Task 5.2 - 添加反馈入口

| 项目 | 内容 |
|------|------|
| 文件 | `pages/home/home.wxml` 或新建个人中心页 |
| 操作 | 在首页或个人中心添加"意见反馈"入口 |
| 依赖 | Task 5.1 |
| 风险 | Medium |

**验证标准**:
- [ ] 反馈入口可见可点击
- [ ] 点击跳转反馈表单页

---

### Phase 6: B端 - 管理后台云函数

#### Task 6.0 - 创建管理员数据库集合

| 项目 | 内容 |
|------|------|
| 操作 | 在云数据库创建 admin 集合 |
| 字段 | username, password(哈希), createdAt |
| 依赖 | 无 |
| 风险 | Low |

**验证标准**:
- [ ] 云数据库控制台 admin 集合已创建
- [ ] 手动插入一条管理员记录（username: admin, password: 哈希后的密码）

---

#### Task 6.0.5 - 创建 adminLogin 云函数

| 项目 | 内容 |
|------|------|
| 文件 | `cloudfunctions/adminLogin/index.js` |
| 逻辑 | 校验账号密码 -> 生成简单token -> 返回token和过期时间 |
| 依赖 | Task 6.0 |
| 风险 | Medium - 安全相关 |

**验证命令**:
```javascript
wx.cloud.callFunction({ name: 'adminLogin', data: { username: 'admin', password: 'xxx' } })
// 正确密码: { success: true, token: 'xxx', expiresAt: 'xxx' }
// 错误密码: { success: false, error: '账号或密码错误' }
```

**权限校验方案**:
- 登录成功后返回 token（简单的 base64(username + timestamp)）
- 后续管理云函数接收 token 参数
- 云函数内解码 token，验证格式和时效性（7天内）
- H5 端通过 localStorage 存储 token

---

#### Task 6.1 - 创建 getFeedbackList 云函数

| 项目 | 内容 |
|------|------|
| 文件 | `cloudfunctions/getFeedbackList/index.js` |
| 逻辑 | 校验管理员权限 -> 查询反馈列表 -> 分页返回 |
| 依赖 | Task 1.1 |
| 风险 | Medium - 权限校验 |

**验证命令**:
```bash
# 管理员token验证
wx.cloud.callFunction({ name: 'getFeedbackList', data: { page: 1, pageSize: 20 } })
# 预期: 返回分页反馈列表
```

---

#### Task 6.2 - 创建 replyFeedback 云函数

| 项目 | 内容 |
|------|------|
| 文件 | `cloudfunctions/replyFeedback/index.js` |
| 逻辑 | 校验管理员权限 -> 写入回复 -> 更新status=replied, hasReply=true |
| 依赖 | Task 6.1 |
| 风险 | Medium - 权限校验 |

**验证命令**:
```bash
wx.cloud.callFunction({ name: 'replyFeedback', data: { feedbackId: 'xxx', content: '已收到反馈' } })
# 预期: 数据库 replies 数组有新增，status=replied，hasReply=true
```

---

### Phase 7: B端 - 管理后台页面

#### Task 7.1 - 创建登录页

| 项目 | 内容 |
|------|------|
| 文件 | `admin/login.html` |
| 功能 | 账号密码登录、错误提示、token存储(7天) |
| 依赖 | Task 6.1 |
| 风险 | Medium |

**验证标准**:
- [ ] 正确账号密码可登录
- [ ] 错误提示正常
- [ ] token存储到localStorage

---

#### Task 7.2 - 创建反馈列表页

| 项目 | 内容 |
|------|------|
| 文件 | `admin/feedback.html` |
| 功能 | 状态/分类筛选、关键词搜索、分页(20条/页) |
| 依赖 | Task 7.1, 6.1 |
| 风险 | Low |

**验证标准**:
- [ ] 筛选/搜索/分页正常
- [ ] 点击进入详情页

---

#### Task 7.3 - 创建反馈详情页

| 项目 | 内容 |
|------|------|
| 文件 | `admin/feedback-detail.html` |
| 功能 | 反馈信息、回复历史、回复输入框 |
| 依赖 | Task 7.2, 6.2 |
| 风险 | Low |

**验证标准**:
- [ ] 显示完整反馈信息
- [ ] 回复后数据库更新正确

---

### Phase 8: 端到端集成验证

#### Task 8.1 - 全流程测试

| 功能 | 验收条件 | 验证方法 |
|------|----------|----------|
| 反馈提交 | 数据写入数据库 | 提交后查询确认 |
| 我的反馈列表 | 显示用户所有反馈 | 列表完整性 |
| 收到回复 | 显示红点提示 | 后台回复后检查 |
| 查看回复 | 看到完整对话 | 详情页验证 |
| 后台登录 | 正确/错误密码处理 | 登录测试 |
| 后台列表 | 筛选/搜索/分页 | 功能测试 |
| 后台回复 | 用户端收到 | 端到端验证 |

---

## 文件清单

### 新建文件

**云函数 (7个)**:
```
cloudfunctions/submitFeedback/index.js
cloudfunctions/submitFeedback/config.json
cloudfunctions/getMyFeedback/index.js
cloudfunctions/getMyFeedback/config.json
cloudfunctions/markAsRead/index.js
cloudfunctions/markAsRead/config.json
cloudfunctions/adminLogin/index.js
cloudfunctions/adminLogin/config.json
cloudfunctions/getFeedbackList/index.js
cloudfunctions/getFeedbackList/config.json
cloudfunctions/replyFeedback/index.js
cloudfunctions/replyFeedback/config.json
```

**小程序页面 (3个)**:
```
pages/feedback/feedback.wxml
pages/feedback/feedback.js
pages/feedback/feedback.json
pages/feedback/feedback.wxss
pages/feedback-list/feedback-list.wxml
pages/feedback-list/feedback-list.js
pages/feedback-list/feedback-list.json
pages/feedback-list/feedback-list.wxss
pages/feedback-detail/feedback-detail.wxml
pages/feedback-detail/feedback-detail.js
pages/feedback-detail/feedback-detail.json
pages/feedback-detail/feedback-detail.wxss
```

**管理后台 (3个)**:
```
admin/login.html
admin/feedback.html
admin/feedback-detail.html
```

### 修改文件
```
app.json (添加新页面)
```

### 数据库集合
```
feedback - 反馈主表（Task 1.0 创建）
admin - 管理员账号表（Task 6.0 创建）
```

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 云函数调用失败 | 高 | 添加loading和错误提示 |
| 管理员权限绕过 | 高 | 云函数内校验token |
| 数据库写入失败 | 高 | 添加重试机制 |
| 用户未登录提交 | 中 | 提交前检查登录状态 |
| 回复后状态不一致 | 中 | 事务更新status和hasReply |

---

## 验收标准

- [ ] 用户可提交反馈，数据写入feedback集合
- [ ] 用户可在"我的反馈"查看列表
- [ ] 管理员回复后用户端显示红点
- [ ] 用户进入详情页看到完整对话
- [ ] 管理员可登录后台
- [ ] 管理员可筛选/搜索/分页查看反馈
- [ ] 管理员可提交回复
- [ ] 所有云函数正确部署

## 交付顺序

**Phase 1-2**: 数据库 + 表单页 (核心用户流程)
**Phase 3-4**: 列表页 + 详情页 (用户查看流程)
**Phase 5**: 入口 + 页面注册 (完整用户路径)
**Phase 6-7**: 管理端云函数 + 页面 (管理员流程)
**Phase 8**: 端到端验证 (质量保证)

每Phase完成后可独立测试，无需等待全部完成。