# 反馈系统数据库设置指南

## 前置条件

- 云环境ID: `cloud1-7gg9y9tjb2b867b6`
- 云函数已部署: submitFeedback, getMyFeedback, markAsRead, adminLogin, getFeedbackList, replyFeedback

## 数据库集合创建

### 方式一：云开发控制台（推荐）

1. 登录[微信小程序管理后台](https://mp.weixin.qq.com)
2. 进入: 开发 -> 云开发
3. 选择云环境: `cloud1-7gg9y9tjb2b867b6`
4. 点击"数据库"
5. 创建以下集合:

---

## 集合1: feedback（用户反馈）

**集合名称**: `feedback`

**权限设置**: 仅创建者可读写

**索引**:
```json
{
  "indexes": [
    {
      "name": "openid_1",
      "keys": { "openid": 1 },
      "unique": false
    },
    {
      "name": "status_1",
      "keys": { "status": 1 },
      "unique": false
    },
    {
      "name": "category_1",
      "keys": { "category": 1 },
      "unique": false
    },
    {
      "name": "createdAt_-1",
      "keys": { "createdAt": -1 },
      "unique": false
    }
  ]
}
```

**数据结构**:
```json
{
  "_id": "自动生成",
  "openid": "用户openid",
  "content": "反馈内容（2-500字）",
  "contact": "联系方式（可选）",
  "category": "分类：bug | suggestion | other",
  "status": "pending | replied",
  "hasReply": "是否有回复（true/false）",
  "replies": "回复数组 []",
  "repliedAt": "最后回复时间戳（可选）",
  "createdAt": "创建时间戳（ISO格式）",
  "updatedAt": "更新时间戳（ISO格式）"
}
```

---

## 集合2: admin（管理员）

**集合名称**: `admin`

**权限设置**: 仅创建者可读写

**索引**:
```json
{
  "indexes": [
    {
      "name": "username_1",
      "keys": { "username": 1 },
      "unique": true
    }
  ]
}
```

**数据结构**:
```json
{
  "_id": "自动生成",
  "username": "管理员用户名",
  "password": "加密后的密码"
}
```

**初始管理员账号**:
```javascript
// 在云开发控制台 -> 数据库 -> admin集合 -> 添加记录
{
  "username": "admin",
  "password": "YWRtaW4="
  // 这是Base64编码，原始密码是"admin"
}
```

**密码编码说明**: 云函数使用Base64编码存储密码（非SHA256）。如需生成其他密码的编码：
```javascript
// 在浏览器控制台运行
btoa("your-password")  // 输出编码后的密码
```

---

## 验证设置

### 1. 检查集合创建
在云开发控制台数据库中应该能看到:
- feedback 集合
- admin 集合

### 2. 检查索引
每个集合的索引标签页应该显示上述配置的索引

### 3. 创建管理员账号
在admin集合中添加第一条记录（使用上面的初始账号）

---

## 常见问题

**Q: 权限设置为什么选"仅创建者可读写"?**
A: 反馈数据需要用户权限隔离，每个用户只能读写自己的反馈。管理员通过云函数绕过限制。

**Q: 索引创建失败怎么办?**
A: 检查集合中是否已有数据，有数据时创建unique索引可能会冲突。先清空集合再创建。

**Q: 如何修改管理员密码?**
A: 使用Base64编码。在浏览器控制台运行 `btoa("new-password")`，然后在数据库中更新记录。
