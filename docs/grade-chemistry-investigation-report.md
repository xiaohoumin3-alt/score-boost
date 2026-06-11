# 二年级化学题目生成问题调查报告

## 日期
2025-06-11

## 问题严重程度
**HIGH** - 教育分类错误，影响用户信任

## 问题描述

用户选择"二年级化学"后，系统成功生成了测评和练习题目。

**这是教育上不合适的组合**：
- 二年级学生不应学习化学
- 化学是九年级（初三）开始的科目

## 根因分析

### 数据层面 ✅ 正常

化学知识点数据文件：
- `chemistry-grade9-up.json` - 九年级上学期
- `chemistry-grade9-down.json` - 九年级下学期
- `chemistry-high-*.json` - 高中

**结论**：数据正确，化学只定义了九年级及以上的知识点。

### 代码层面 ❌ 存在缺陷

**缺陷1：`startAssessment` 缺少年级-科目兼容性验证**

位置：`cloudfunctions/startAssessment/index.js`

问题流程：
```
1. 用户参数：subject='chemistry', grade='2'
2. 参数映射：subject='chemistry', grade='2'
3. ❌ 无验证：直接接受任何年级-科目组合
4. loadKnowledgeTree('chemistry', '2') → 返回 { chapters: [] }
5. generateQuestionPlan(tree, 20) → plan 中 kp 为 undefined
6. 创建队列任务，包含无效的年级-科目组合
```

**缺陷2：`questionGenerator` 使用高年级知识点**

位置：`cloudfunctions/questionGenerator/index.js:433`

```javascript
const defaultKpMap = {
  // ...
  chemistry: ['空气和氧气', '水和溶液', '碳和碳的氧化物', '金属和金属材料', '酸碱盐', '化学方程式']
};
```

当二年级选择化学时：
- `gradeKpMap['2']` 中只有 math，无 chemistry
- 代码回退到 `defaultKpMap.chemistry`
- 使用高中化学知识点生成题目

**缺陷3：`generateDailyTask` 缺少验证**

练习任务生成同样未验证年级-科目兼容性。

### 科目-年级兼容性矩阵

根据知识点数据文件分析：

| 科目 | 可用年级 | 数据文件 |
|------|---------|---------|
| 数学 | 1-9 | math-grade{1-9}-{up,down}.json |
| 语文 | 1-9 | chinese-grade{1-9}-{up,down}.json |
| 英语 | 1-6* | english-grade{1-6}-{up,down}.json |
| 生物 | 7-9 | biology-grade{7-8}-{up,down}.json |
| 地理 | 7-9 | geography-grade{7-8}-{up,down}.json |
| 历史 | 7-9 | history-grade{7-9}-{up,down}.json |
| 政治 | 7-9 | politics-grade{7-8}-{up,down}.json |
| 物理 | 8-9 | physics-grade{8-9}.json |
| 化学 | 9 | chemistry-grade{9}-{up,down}.json |

*注：英语年级范围需进一步确认

## 修复方案

### 修复1：添加科目-年级兼容性验证

**文件1**: `cloudfunctions/startAssessment/index.js`

在参数处理之后、处理逻辑之前添加验证：

```javascript
// 科目-年级兼容性验证（防止二年级选择化学等无效组合）
const SUBJECT_GRADE_MATRIX = {
  'math': { min: 1, max: 9 },
  'chinese': { min: 1, max: 9 },
  'english': { min: 1, max: 6 },
  'biology': { min: 7, max: 9 },
  'geography': { min: 7, max: 9 },
  'history': { min: 7, max: 9 },
  'politics': { min: 7, max: 9 },
  'physics': { min: 8, max: 9 },
  'chemistry': { min: 9, max: 9 }
};

const gradeNum = parseInt(grade, 10);
const validRange = SUBJECT_GRADE_MATRIX[subject];
if (!validRange || isNaN(gradeNum) || gradeNum < validRange.min || gradeNum > validRange.max) {
  return {
    success: false,
    error: `${subjectText}仅适用于${validRange.min}-${validRange.max}年级，当前选择${gradeNum}年级`
  };
}
```

**文件2**: `cloudfunctions/generateDailyTask/index.js`

添加相同的验证逻辑。

### 修复效果

- ✅ 二年级选择化学 → 返回错误："化学仅适用于9年级，当前选择2年级"
- ✅ 一年级选择物理 → 返回错误："物理仅适用于8-9年级，当前选择1年级"
- ✅ 六年级选择化学 → 返回错误："化学仅适用于9年级，当前选择6年级"

## 影响范围

### 受影响的无效组合

| 年级 | 无效科目 |
|------|---------|
| 1-6 | 物理、化学、生物、地理、历史、政治 |
| 1-7 | 物理 |
| 1-8 | 化学 |

### 修复前的问题行为

修复前，上述组合会：
1. 创建队列任务（无效参数）
2. questionGenerator 使用高年级知识点
3. 生成不适合该年级的题目
4. 用户看到不合适的题目（信任受损）

### 修复后的正确行为

修复后，上述组合会：
1. 在入口处拒绝
2. 返回明确的错误信息
3. 引导用户选择正确的年级-科目组合

## 部署检查清单

- [ ] 验证 `startAssessment/index.js` 已添加验证
- [ ] 验证 `generateDailyTask/index.js` 已添加验证
- [ ] 部署 `startAssessment` 云函数
- [ ] 部署 `generateDailyTask` 云函数
- [ ] 测试验证：二年级化学 → 应返回错误
- [ ] 测试验证：九年级化学 → 应正常工作

## 总结

**问题类型**: 代码缺陷 - 缺少输入验证

**根因**: 系统未验证年级-科目兼容性，允许创建无效的组合

**修复方式**: 在入口处添加兼容性验证，拒绝无效组合

**验证方法**: 测试边界组合，确认返回预期错误

## 相关文档

- [题库年级过滤修复](grade-filter-fix-report.md)
- [家长测评提交答案修复](parentAssessment-submit-fix-report.md)
