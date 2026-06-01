# questionGenerator 云函数部署修复指南

## 问题诊断

**根本原因**：`config.json` 缺少 `triggers` 配置，导致定时触发器没有被部署。

## 修复内容

已修复 `/Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/config.json`：

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

## 部署步骤

### 方法 1：微信开发者工具（推荐）

1. 打开微信开发者工具
2. 打开本项目：`/Users/seanxx/score-boost-mini`
3. 在左侧找到 `cloudfunctions/questionGenerator` 目录
4. 右键点击 → **上传并部署：云端安装依赖**
5. 等待部署完成

### 方法 2：命令行（需要配置上传密钥）

```bash
# 设置环境变量
export WECHAT_UPLOAD_KEY=/path/to/private.key
export WECHAT_APPID=your_appid

# 运行部署脚本
node deploy-cloud-functions.js
```

## 验证部署

### 1. 检查触发器是否创建

在微信开发者工具中：
1. 打开 **云开发控制台**
2. 点击 **云函数** → **questionGenerator**
3. 点击 **详情** → **定时触发器**
4. 确认 `processQueueTimer` 存在且状态为启用

### 2. 查看云函数日志

1. 在云开发控制台 → 云函数 → questionGenerator
2. 点击 **日志**
3. 查看是否有定期执行记录（每30秒一条）

### 3. 检查队列处理

查看 `question_queue` 集合：
- `status` 为 `pending` 的任务应该定期被处理
- 任务状态应该从 `pending` → `processing` → `completed`/`failed`

## Cron 表达式说明

`*/30 * * * * *` 表示：
- 秒：每30秒
- 分钟：每分钟
- 小时：每小时
- 日：每天
- 月：每月
- 星期：每天
- 年：每年

**即：每30秒触发一次**

## 故障排查

### 如果触发器没有创建

1. 确认 `config.json` 格式正确（JSON 语法有效）
2. 确认使用的是**云端安装依赖**部署方式
3. 尝试删除云函数后重新上传

### 如果触发器创建了但不执行

1. 检查云函数日志是否有错误
2. 确认云函数代码中没有阻塞操作
3. 检查数据库连接是否正常

### 如果队列任务不处理

1. 检查 `question_queue` 集合中是否有 `status: 'pending'` 的记录
2. 检查云函数日志中的 `[fetchPendingTasks]` 输出
3. 手动触发云函数测试

## 监控建议

在云开发控制台设置告警：
- 云函数执行失败率 > 5%
- 云函数执行超时率 > 10%
- 数据库操作失败率 > 1%

## 参考资料

- [微信云开发 - 定时触发器文档](https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/functions/triggers.html)
