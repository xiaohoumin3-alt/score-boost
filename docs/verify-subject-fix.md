# 科目混入问题修复验证指南

## 问题描述
用户选择"7年地理"测评，但题目中出现了数学题（科目混入）。

## 修复内容

### 1. 移除危险的默认值
- `questionGenerator/index.js`: 移除 5 处 `|| 'math'` 默认值
- `generateQuestions.js`: 移除 `|| defaultQuestions.math` 默认值

### 2. 添加科目验证
- `questionGenerator/index.js` 第256-267行：添加科目验证逻辑
  - 缺失科目时抛出错误
  - 无效科目时抛出错误

### 3. 部署诊断日志
覆盖参数传递全链路：
- `assessment.js` 第108-113行
- `queue_manager.js` 第73-76行
- `questionGenerator/index.js` 第248-253行

## 部署步骤

### 必须手动部署
在微信开发者工具中：
```
右键 cloudfunctions/questionGenerator → 上传并部署：云端安装依赖
```

### 验证部署
云开发 → 云函数 → 确认 `questionGenerator` 状态为"正常"

## 测试步骤

1. 打开小程序 → 调试工具 → 清除缓存
2. 返回首页 → 选择"7年地理"
3. 点击"开始测评"
4. 查看控制台日志

## 预期日志

按出现顺序，科目值应保持一致：

```
[assessment] === DIAGNOSTIC LOG START ===
[assessment] app.globalData.subject: 地理
...
[cloudApi] startAssessment: ..., 地理, ...
[createQueueTask] taskData.subject: geography
[generateAi] task.subject: geography (type: string)
[generateAi] ✅ Subject validated: geography
```

## 判断标准

- ✅ 通过：题目为地理题（如"中国的地理位置"、"秦岭-淮河一线"等）
- ❌ 失败：题目为数学题（如"√16 的值是"、"| -5 | 的值是"等）

## 失败处理

如果仍显示数学题，请提供控制台日志（搜索 `DIAGNOSTIC LOG`）
