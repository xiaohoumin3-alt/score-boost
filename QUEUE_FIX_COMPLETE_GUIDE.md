# 队列处理问题完整修复指南

## 问题诊断结果

经过广泛调研和代码分析，问题根本原因已确定：

**根本原因**：`config.json` 缺少 `triggers` 配置，导致定时触发器没有被部署

## 已完成的修复

### 1. ✅ 配置文件修复
`/Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/config.json`

```json
{
  "permissions": {
    "openapi": []
  },
  "triggers": [
    {
      "name": "processQueueTimer",
      "type": "timer",
      "config": "*/30 * * * * *"
    }
  ]
}
```

### 2. ✅ 创建手动触发器
`/Users/seanxx/score-boost-mini/cloudfunctions/manualTriggerQueue/`

用于手动触发队列处理，便于诊断和测试。

### 3. ✅ 创建诊断脚本
`/Users/seanxx/score-boost-mini/scripts/diagnose-queue.js`

用于检查配置和代码完整性。

## 立即执行的部署步骤

### 步骤 1：部署 questionGenerator 云函数

1. 打开**微信开发者工具**
2. 打开项目：`/Users/seanxx/score-boost-mini`
3. 在左侧目录找到：`cloudfunctions/questionGenerator`
4. **右键点击** → 选择 **"上传并部署：云端安装依赖"**
5. 等待部署完成（可能需要几分钟）

**⚠️ 重要**：必须选择"云端安装依赖"，这样才能识别 `config.json` 中的触发器配置！

### 步骤 2：部署 manualTriggerQueue 云函数（可选）

1. 在左侧目录找到：`cloudfunctions/manualTriggerQueue`
2. 右键点击 → 选择 "上传并部署：云端安装依赖"
3. 部署完成后可以手动触发队列处理

### 步骤 3：验证定时触发器

在**云开发控制台**中验证：

1. 打开云开发控制台
2. 点击 **云函数** → 找到 `questionGenerator`
3. 点击 **详情** → **定时触发器**
4. 确认：
   - ✅ 触发器名称：`processQueueTimer`
   - ✅ 触发器类型：`定时触发器`
   - ✅ Cron表达式：`*/30 * * * * *`
   - ✅ 状态：**启用**

### 步骤 4：查看云函数日志

1. 在云开发控制台 → 云函数 → questionGenerator
2. 点击 **日志**
3. 查看是否有定期执行记录：
   - 应该每30秒有一条日志
   - 日志内容应包含：`[fetchPendingTasks] Pending tasks count:`

### 步骤 5：验证队列处理

调用 `checkQueueStatus` 云函数检查任务状态：

```javascript
wx.cloud.callFunction({
  name: 'checkQueueStatus',
  data: { queue_id: '669eebf36a17092800eea1aa0a8c721b' }
}).then(res => {
  console.log('队列状态:', res.result);
});
```

或者调用 `manualTriggerQueue` 手动触发处理：

```javascript
wx.cloud.callFunction({
  name: 'manualTriggerQueue'
}).then(res => {
  console.log('手动触发结果:', res.result);
});
```

## 预期结果

### 成功标志

1. **云函数日志**：每30秒有一条执行记录
2. **队列状态**：`status` 从 `pending` → `processing` → `completed`
3. **assessment_id**：任务完成后会有 `generated_assessment_id`

### 日志示例

```
=== questionGenerator === started at 2026-05-28T10:30:00.000Z
[fetchPendingTasks] Recent 20 tasks count: 5
[fetchPendingTasks] Status distribution: {"pending":2,"processing":0,"completed":3}
[fetchPendingTasks] Pending tasks count: 2
[processTask] START task:669eebf36a17092800eea1aa0a8c721b student:xxx subject:math num:10
[processTask] SUCCESS task:669eebf36a17092800eea1aa0a8c721b assessment:f9d11e1d6a171ce900ee92c27af4da31 questions:7 duration:96809ms
```

## 故障排查

### 问题 1：触发器未创建

**症状**：云开发控制台中看不到定时触发器

**解决方案**：
1. 确认 `config.json` 格式正确（JSON 语法有效）
2. 确认使用"云端安装依赖"方式部署
3. 尝试删除云函数后重新上传

### 问题 2：触发器存在但不执行

**症状**：控制台显示触发器，但日志中没有执行记录

**解决方案**：
1. 检查触发器状态是否为"启用"
2. 检查 Cron 表达式格式是否正确
3. 在控制台手动测试触发器

### 问题 3：云函数执行但任务不处理

**症状**：日志中有执行记录，但队列任务状态不变

**解决方案**：
1. 检查日志中的错误信息
2. 确认 `question_queue` 集合中有 `status: 'pending'` 的记录
3. 检查数据库权限配置

### 问题 4：云函数超时

**症状**：日志显示执行但未完成

**解决方案**：
1. 检查 `cloudbaserc.json` 中的 `timeout` 配置（当前 300 秒）
2. 如果 AI 生成耗时过长，考虑增加超时时间
3. 或减少单次处理的任务数量

## 监控建议

在云开发控制台设置告警：
- 云函数执行失败率 > 5%
- 云函数执行超时率 > 10%
- `question_queue` 中 `status: 'pending'` 的记录数量 > 100

## 技术细节

### Cron 表达式说明

`*/30 * * * * *` 表示：
- **秒**：`*/30` = 每30秒
- **分钟**：`*` = 每分钟
- **小时**：`*` = 每小时
- **日**：`*` = 每天
- **月**：`*` = 每月
- **星期**：`*` = 每天
- **年**：`*` = 每年

**时区**：UTC+8（北京时间）

### 工作流引擎

队列处理使用工作流引擎模式：
1. **InitStateStep**：更新状态为 `processing`
2. **GenerateStep**：调用 AI 生成题目
3. **SaveQuestionsStep**：保存题目到 `ai_question_pool`
4. **CreateAssessmentStep**：创建 `assessments` 记录
5. **CompleteStep**：更新状态为 `completed`

每个步骤都有 **rollback** 机制，确保失败时状态正确回滚。

## 参考资料

- [微信云开发 - 定时触发器文档](https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/functions/triggers.html)
- [微信云开发 - 云函数运行机制](https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/functions/runtime.html)
- [微信云开发 - 数据库权限管理](https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/database/permission.html)

---

**最后更新**：2026-05-28
**状态**：配置修复完成，等待部署验证
