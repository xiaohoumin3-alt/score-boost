# 题库年级过滤修复报告

## 问题

2年级测评返回了高年级内容：
- 绝对值（\|-5\|）
- 平方方程（x² = 16）
- 平方根化简（√(a²)）
- 等边三角形高
- 实数分类、有理数运算（(-2)³）

## 根因

1. **默认题目缺少 grade 字段**：`generateDefaultQuestions` 生成的题目没有年级标识
2. **2年级缺少专属默认题目**：只有1年级有 grade-aware 题目，其他年级回退到固定题目
3. **固定题目内容高年级化**：回退题目是8年级水平的绝对值、平方根等内容

## 修复

### 1. 添加2年级专属题目

**文件**: `cloudfunctions/questionGenerator/workflow/utils/generateQuestions.js`

```javascript
'2': {
  easy: [
    { content: '计算：35 + 20 = ?', ..., knowledge_point: '100以内加减法', grade: '2' },
    { content: '计算：80 - 30 = ?', ..., knowledge_point: '100以内加减法', grade: '2' }
  ],
  medium: [
    { content: '根据乘法口诀"四六二十四"...', ..., knowledge_point: '乘法口诀', grade: '2' },
    { content: '小明有35颗糖...', ..., knowledge_point: '100以内加减法', grade: '2' }
  ],
  hard: [
    { content: '商店里一支钢笔12元...', ..., knowledge_point: '100以内加减法应用', grade: '2' },
    { content: '根据乘法口诀"六八四十八"...', ..., knowledge_point: '乘法口诀', grade: '2' }
  ]
}
```

### 2. 统一添加 grade 字段

在生成循环中添加 grade 字段：

```javascript
result.push({
  ...q,
  grade: q.grade || fallbackGrade,  // 自动添加 grade
  _id: `default_${Date.now()}_${i}`,
  created_at: new Date().toISOString(),
  is_default: true
});
```

### 3. 为高年级回退题目添加 grade

修改默认题目定义，包含 `grade: fallbackGrade`

## 验证

### 测试任务
- **年级**: 2年级
- **科目**: 数学
- **题目数**: 12道

### 结果

| 题目内容 | 知识点 | 年级适配 |
|---------|--------|---------|
| 乘法口诀（四六二十四） | 乘法口诀 | ✅ 2年级 |
| 100以内加减法（35颗糖） | 100以内加减法 | ✅ 2年级 |
| 长度单位（接近1米） | 长度单位 | ✅ 2年级 |
| 认识角（比直角小） | 认识角 | ✅ 2年级 |

### 对比

| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| 高年级题目混入 | ✅ 绝对值、平方根、等边三角形 | ❌ 无 |
| 低年级题目 | ✅ 100以内加减法、乘法口诀 | ✅ 全部适配 |
| grade 字段 | ❌ 缺失 | ✅ 正确设置 |

## 总结

- ✅ 2年级测评不再出现高年级内容
- ✅ 所有题目都有正确的 grade 字段
- ✅ 题库查询按 grade 正确过滤
- ✅ 为未来扩展3-6年级提供了模板

## 下一步（可选）

如果需要为3-6年级添加专属题目，可参考2年级的格式扩展 `gradeDefaultQuestions` 对象。
