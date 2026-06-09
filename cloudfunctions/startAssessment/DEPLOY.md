# startAssessment 修复部署指南

## 变更内容

### 1. semester 字段标准化
- 从中文（上/下）统一为英文（up/down）
- 兼容中英文输入

### 2. 移除同步触发 questionGenerator
- 删除两处同步调用代码
- 依赖后台定时触发器处理队列

### 3. 队列查询增加过滤
- 按学科、年级过滤队列任务
- 防止不同学科任务互相干扰

## 部署步骤

### 1. 语法验证
```bash
cd /Users/seanxx/score-boost-mini
node -c cloudfunctions/startAssessment/index.js
node -c cloudfunctions/startAssessment/shared/knowledge_tree.js
node -c cloudfunctions/startAssessment/queue_manager.js
```

### 2. 运行测试
```bash
cd /Users/seanxx/score-boost-mini
npx jest cloudfunctions/startAssessment/__tests__/knowledge_tree.test.js
npx jest cloudfunctions/startAssessment/__tests__/queue-check.test.js
```

### 3. 部署到微信云开发
```bash
# 方式1: 通过微信开发者工具
# 1. 打开微信开发者工具
# 2. 右键 cloudfunctions/startAssessment
# 3. 选择 "上传并部署：云端安装依赖"

# 方式2: 通过 CLI
tcb functions:deploy startAssessment
```

### 4. 部署 questionGenerator（如未部署最新版本）
```bash
# 确保 questionGenerator 已配置定时触发器
# 定时器间隔建议：1分钟
```

### 5. 验证部署
```bash
# 1. 在小程序中发起测评请求
# 2. 观察 waiting 页面轮询
# 3. 确认题目生成完成
```

## 回滚计划

如遇问题，恢复以下文件：
- cloudfunctions/startAssessment/index.js
- cloudfunctions/startAssessment/queue_manager.js
- cloudfunctions/startAssessment/shared/knowledge_tree.js

## 测试用例
- semester 中英文互转
- 队列查询按学科过滤
- 后台异步生成题目
