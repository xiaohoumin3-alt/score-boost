# 家长测评功能调试报告

## 调试日期
2026-06-10

## 症状
- 年级选择器选了不生效
- 缺少科目选择功能

## 根因分析

### 根因1：picker组件使用错误
**问题**：微信小程序picker组件的`value`属性应该是**数组索引**（0,1,2...），但代码误用了**年级值**（'1','2','3'...）

**表现**：
- WXML: `value="{{grade}}"` - grade是字符串如'2'
- JS: `e.detail.value` 返回的是索引（数字）
- 显示: `grades[grade - 1]` - 当grade是索引时会undefined

**修复**：
- 添加`gradeIndex`存储picker索引
- 添加`subjectIndex`存储科目索引
- 修复显示逻辑使用索引访问数组

### 根因2：设计缺陷 - 缺少科目选择
**问题**：只有年级选择器，科目固定为数学，无法选择语文/英语

**用户反馈**："你只有个选孩子年级，难道你是准备考全科天才吗？"

**修复**：
- 添加科目选择器（数学/语文/英语）
- 云函数添加语文和英语知识点定义
- 更新subjectText映射

## 文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| pages/parent-assessment/parent-assessment.js | 修改 | 添加gradeIndex/subjectIndex，修复picker逻辑，添加onSubjectChange |
| pages/parent-assessment/parent-assessment.wxml | 修改 | 添加科目选择器UI，修复picker value绑定 |
| pages/parent-assessment/parent-assessment.wxss | 修改 | 添加科目选择器样式 |
| cloudfunctions/parentAssessment/index.js | 修改 | 添加chinese和english知识点，更新subjectText映射 |
| __tests__/parent-assessment.test.js | 新建 | 验证picker索引映射和科目选择功能 |

## 验证结果

### 单元测试
- 8/8家长测评测试通过
- 810/810完整测试通过
- 0个失败

### 功能验证
- ✅ 年级选择器正常工作
- ✅ 科目选择器正常工作
- ✅ 开始按钮状态正确（年级和科目都选中时启用）
- ✅ 云函数支持数语英三科

## 部署建议
1. 前端页面修改无需特殊部署
2. 云函数需要重新部署：
   ```bash
   tcb fn deploy parentAssessment --dir cloudfunctions/parentAssessment
   ```

## 状态
✅ **DONE** - 根因已修复，测试全部通过
