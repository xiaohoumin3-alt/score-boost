# 定时触发器配置指南

## 概述

定时触发器用于定期执行`questionGenerator`云函数，自动处理队列中的待处理题目生成任务。

## 配置方法

### 方法1: 微信开发者工具配置（推荐）

1. **打开云开发控制台**
   - 微信开发者工具 → 云开发 → 云函数

2. **进入云函数详情**
   - 找到 `questionGenerator` 云函数
   - 点击"详情"按钮

3. **添加定时触发器**
   - 点击"定时触发器"标签
   - 点击"添加"按钮

4. **配置触发器**
   ```
   名称: processQueueTimer
   Cron表达式: */30 * * * * *
   描述: 每30秒执行一次队列处理
   ```

### 方法2: 通过cloudbasectl配置

如果使用cloudbasectl命令行工具：

```bash
# 创建定时触发器
cloudbase functions:timer create \
  --name questionGenerator \
  --timer-name processQueueTimer \
  --cron "*/30 * * * * *" \
  --env your-env-id
```

### 方法3: 通过云函数配置文件

在`questionGenerator`目录下创建`config.json`：

```json
{
  "permissions": {
    "openapi": []
  },
  "triggers": [
    {
      "type": "timer",
      "name": "processQueueTimer",
      "config": "*/30 * * * * *"
    }
  ]
}
```

## Cron表达式说明

```
*/30 * * * * *
│   │ │ │ │ │
│   │ │ │ │ └─ 星期几 (0-6, 0=周日)
│   │ │ │ └─── 月份 (1-12)
│   │ │ └───── 日期 (1-31)
│   │ └─────── 小时 (0-23)
│   └───────── 分钟 (0-59)
└────────────── 秒 (0-59，微信云不支持)
```

### 常用Cron表达式

| 表达式 | 说明 |
|--------|------|
| `*/30 * * * * *` | 每30秒执行 |
| `0 * * * * *` | 每分钟执行 |
| `0 */5 * * * *` | 每5分钟执行 |
| `0 0 * * * *` | 每小时执行 |
| `0 0 */2 * * *` | 每2小时执行 |
| `0 0 0 * * *` | 每天凌晨执行 |

## 定时触发器参数

云函数会接收以下event参数：

```javascript
{
  "eventId": "timer_event_id",
  "triggerName": "processQueueTimer",
  "createTime": 1678901234567
}
```

## 测试定时触发器

### 手动测试

在云函数控制台可以手动触发测试：

```bash
# 云开发控制台 → 云函数 → questionGenerator → 测试
# 使用空的event对象或模拟timer event
```

### 日志验证

执行后查看云函数日志：

```bash
# 云开发控制台 → 云函数 → questionGenerator → 日志
# 应该看到类似输出：
# [questionGenerator] Timer triggered: processQueueTimer
# [questionGenerator] Processing queue: found 2 pending tasks
```

## 监控与告警

### 推荐监控指标

1. **执行成功率**: 定时触发器是否正常执行
2. **队列积压**: pending状态任务数量
3. **处理时长**: 单次执行的耗时
4. **错误率**: 失败任务的比例

### 告警配置

在云开发控制台配置告警规则：

- 定时触发器执行失败 → 发送告警
- 队列积压超过100 → 发送告警
- 错误率超过10% → 发送告警

## 故障排查

### 问题1: 定时触发器未执行

**症状**: 到了执行时间没有日志

**解决方案**:
1. 检查定时触发器状态是否为"启用"
2. 确认云函数已部署
3. 查看定时触发器日志是否有错误

### 问题2: 队列任务未被处理

**症状**: 定时触发器执行但任务状态未更新

**解决方案**:
1. 检查云函数权限配置
2. 确认question_queue集合存在
3. 查看云函数日志确认是否获取到任务

### 问题3: 定时触发器执行过于频繁

**症状**: Cron表达式配置错误导致执行过于频繁

**解决方案**:
1. 检查Cron表达式是否正确
2. 使用在线Cron表达式验证工具
3. 禁用触发器重新配置

## 最佳实践

1. **避免执行时间重叠**: 设置合理的执行间隔
2. **处理超时保护**: 云函数设置合理的超时时间
3. **错误重试机制**: 失败任务自动重试
4. **资源监控**: 监控云函数资源使用情况

## 相关文件

- `cloudfunctions/questionGenerator/index.js` - 云函数主逻辑
- `cloudfunctions/questionGenerator/config.json` - 云函数配置
- `cloudfunctions/questionGenerator/timers.json` - 定时触发器配置
