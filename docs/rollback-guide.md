# 异步队列系统回滚指南

## 概述

本指南用于将系统从异步队列模式回滚到同步模式。

## 前置检查

### 1. 检查当前系统状态

在云开发控制台创建临时云函数，复制 `scripts/rollback-queue-system.js` 内容，然后调用：

```json
{
  "action": "check"
}
```

返回示例：
```json
{
  "success": true,
  "data": {
    "queue_collection_exists": true,
    "queue_tasks_count": 15,
    "queue_tasks_by_status": {
      "pending": 5,
      "processing": 2,
      "completed": 6,
      "failed": 2,
      "cancelled": 0
    }
  }
}
```

## 回滚步骤

### 方式 1：安全回滚（推荐）

#### Step 1: Dry Run 预演

```json
{
  "action": "dryRun"
}
```

这会显示将要删除的任务数量，但不实际删除。

#### Step 2: 执行回滚

```json
{
  "action": "rollback",
  "options": {
    "confirm": true
  }
}
```

此操作会：
- 删除所有 pending 状态的任务
- 删除所有 processing 状态的任务
- 删除所有 failed 状态的任务
- **保留** completed 状态的任务（用于审计）

#### Step 3: 手动清理前端代码

1. **删除等待页面**
   ```bash
   rm -rf pages/waiting
   ```

2. **从 app.json 移除 waiting 页面**
   ```json
   {
     "pages": [
       "pages/index/index",
       "pages/assessment/assessment"
       // 移除: "pages/waiting/waiting"
     ]
   }
   ```

3. **恢复 assessment.js**
   - 移除 `handleQueuedResponse` 和 `resumeQueuedAssessment` 方法
   - 恢复 `initAssessment` 到直接调用 startAssessment

4. **移除 cloudApi.js 中的队列函数**
   - 删除 `checkQueueStatus`
   - 删除 `pollQueueStatus`
   - 删除 `cancelQueueTask`

#### Step 4: 清理云函数

1. **删除 questionGenerator 的定时触发器**
   - 云开发控制台 → 云函数 → questionGenerator → 定时触发器
   - 删除所有定时触发器

2. **删除 checkQueueStatus 云函数**
   - 云开发控制台 → 云函数 → checkQueueStatus → 删除

3. **保留 questionGenerator**（可选，后续可删除）

### 方式 2：完全清理

删除所有队列任务（包括 completed）：

```json
{
  "action": "fullCleanup",
  "options": {
    "confirm": true
  }
}
```

⚠️ **警告**：此操作不可逆，所有队列数据将被删除！

## 验证回滚

### 1. 检查 question_queue 集合

```json
{
  "action": "check"
}
```

确认 `queue_tasks_count` 为 0 或仅包含 completed 状态。

### 2. 测试 startAssessment

在小程序中测试创建评估，确认：
- 直接返回 assessment（不进入 waiting 页面）
- 题目正常显示
- 没有队列相关错误

## 紧急回滚

如果系统出现严重问题需要立即回滚：

1. **禁用定时触发器**
   - 在云开发控制台直接禁用 questionGenerator 的定时触发器

2. **删除队列集合**
   - 云开发控制台 → 数据库 → question_queue → 删除集合

3. **恢复前端代码**
   - Git 回滚到异步队列之前的状态

## 故障排查

### 问题 1: 回滚后 startAssessment 仍然返回 queued

**原因**: startAssessment 云函数仍使用队列模式

**解决**: 检查 `cloudfunctions/startAssessment/index.js`，确保没有调用 `checkQueueStatus` 或 `addToQueue`

### 问题 2: 小程序仍然跳转到 waiting 页面

**原因**: app.json 或 assessment.js 仍包含 waiting 相关代码

**解决**:
1. 检查 app.json 中是否移除了 waiting 页面配置
2. 检查 assessment.js 中是否移除了 handleQueuedResponse 调用

### 问题 3: question_queue 集合删除失败

**原因**: 集合可能被锁定或有活跃连接

**解决**:
1. 确保没有正在运行的 questionGenerator 实例
2. 在云开发控制台手动删除

## 恢复异步模式

如果需要重新启用异步队列：

1. 恢复所有被删除/修改的文件
2. 重新配置定时触发器
3. 确保 startAssessment 使用队列模式

## 联系支持

如有问题，请检查：
- 云开发控制台日志
- 云函数执行记录
- 浏览器控制台错误
