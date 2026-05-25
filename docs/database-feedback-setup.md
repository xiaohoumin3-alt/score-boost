# feedback 数据库集合设置指南

## 操作步骤

1. 打开微信开发者工具
2. 点击顶部"云开发"按钮
3. 进入"数据库"标签
4. 点击"添加集合"，输入集合名称：`feedback`
5. 点击"确定"

## 集合结构

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | string | 是 | 自动生成 |
| openid | string | 是 | 用户openid |
| content | string | 是 | 反馈内容（2-500字） |
| contact | string | 否 | 联系方式 |
| category | string | 是 | 分类：bug / suggestion / other |
| status | string | 是 | 状态：pending / replied |
| hasReply | boolean | 是 | 是否有未读回复 |
| replies | array | 是 | 回复数组 |
| repliedAt | string | 否 | 最后回复时间（ISO格式） |
| createdAt | string | 是 | 提交时间（ISO格式） |
| updatedAt | string | 是 | 更新时间（ISO格式） |

## replies 数组元素

| 字段名 | 类型 | 说明 |
|--------|------|------|
| content | string | 回复内容 |
| isAdmin | boolean | true=管理员回复 |
| createdAt | string | 回复时间（ISO格式） |

## 索引设置

在云数据库控制台中为以下字段创建索引：

1. **openid 索引**：用于查询用户反馈列表
2. **createdAt 索引**：用于时间倒序排序

## 验证

集合创建完成后，可以在控制台插入一条测试数据验证：

```json
{
  "openid": "test_openid_123",
  "content": "这是一条测试反馈",
  "contact": "test@example.com",
  "category": "suggestion",
  "status": "pending",
  "hasReply": false,
  "replies": [],
  "createdAt": "2026-05-24T00:00:00.000Z",
  "updatedAt": "2026-05-24T00:00:00.000Z"
}
```
