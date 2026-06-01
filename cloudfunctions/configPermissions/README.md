# question_queue 集合权限配置

## 概述

`question_queue` 集合存储AI题目生成的队列任务，需要正确配置数据库权限。

## 权限要求

### 1. 云函数权限

云函数需要以下权限：
- **读取**: 查询队列任务状态
- **写入**: 创建、更新队列任务
- **删除**: 取消队列任务（可选）

### 2. 前端权限

小程序前端：
- **仅创建**: 允许用户创建队列任务
- **仅读取自己的任务**: 用户只能查看自己的队列状态（基于student_id）

## 配置方法

### 方法1: 云开发控制台配置

1. 打开微信开发者工具
2. 点击"云开发"按钮
3. 进入"数据库"标签
4. 找到 `question_queue` 集合
5. 点击"权限设置"
6. 配置权限规则：

```json
{
  "read": "doc.student_id == auth.openid",
  "write": "doc.student_id == auth.openid && !doc._id"
}
```

### 方法2: 使用安全规则

创建 `database.rules.json` 文件：

```json
{
  "question_queue": {
    "read": "auth != null && doc.student_id == auth.openid",
    "write": "auth != null && doc.student_id == auth.openid"
  }
}
```

### 方法3: 云函数服务端权限

云函数默认拥有服务端权限，可以读写所有数据。确保云函数配置正确：

```javascript
// cloudfunctions/questionGenerator/config.json
{
  "permissions": {
    "openapi": []
  }
}
```

## 验证权限

### 测试读取权限

```javascript
// 在小程序端测试
const db = wx.cloud.database();
db.collection('question_queue').where({
  student_id: '{your_student_id}'
}).get()
.then(res => {
  console.log('读取成功:', res.data);
})
.catch(err => {
  console.error('读取失败:', err);
});
```

### 测试写入权限

```javascript
// 在小程序端测试
const db = wx.cloud.database();
db.collection('question_queue').add({
  data: {
    student_id: '{your_student_id}',
    status: 'pending',
    created_at: new Date().toISOString()
  }
})
.then(res => {
  console.log('写入成功:', res);
})
.catch(err => {
  console.error('写入失败:', err);
});
```

## 云函数权限配置

确保以下云函数有数据库访问权限：

| 云函数 | 集合 | 权限 |
|--------|------|------|
| startAssessment | question_queue | 读写 |
| checkQueueStatus | question_queue | 只读 |
| questionGenerator | question_queue, questions, assessments | 读写 |
| cancelQueueTask | question_queue | 读写 |

## 故障排查

### 问题1: "权限不足"错误

**症状**: 云函数报错 `Permission denied`

**解决方案**:
1. 检查云函数权限配置
2. 确保云函数环境ID正确
3. 重新部署云函数

### 问题2: 前端无法读取数据

**症状**: 小程序端读取返回空数组

**解决方案**:
1. 检查数据库权限规则
2. 确认student_id匹配
3. 使用云函数代理读取

### 问题3: 无法创建队列任务

**症状**: startAssessment返回"创建失败"

**解决方案**:
1. 检查question_queue集合是否存在
2. 确认云函数有写入权限
3. 查看云函数日志
