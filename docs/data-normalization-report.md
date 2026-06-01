# 数据模型规范化报告

**执行日期**: 2026-05-28
**任务**: 移除 ai_question_pool 中的冗余 grade/semester 字段

---

## 执行摘要

✅ **成功移除题库中的 grade/semester 字段**
✅ **代码已更新并部署**
✅ **数据库已清理（1489 条记录）**

---

## 变更详情

### 1. 代码变更

| 文件 | 变更 |
|------|------|
| `questionGenerator/index.js:305-308` | ❌ 移除 grade/semester 字段写入 |
| `checkFields/index.js` | ✅ 更新为只检查 subject/knowledge_point/chapter |

### 2. 新增文件

| 文件 | 用途 |
|------|------|
| `removeGradeSemester/index.js` | 数据库清理云函数 |

### 3. 数据库清理

| 批次 | 清理数量 | 剩余 |
|------|----------|------|
| 第1批 | 789 | 700 |
| 第2批 | 400 | 300 |
| 第3批 | 200 | 100 |
| 第4批 | 100 | 0 |
| **总计** | **1489** | **0** |

---

## 数据模型对比

### 规范化前（冗余）

```javascript
// ai_question_pool
{
  _id: 'xxx',
  content: '题目内容',
  kp_id: 'bio_kp1_1',        // ← 已隐含 grade/semester
  subject: 'biology',
  grade: '7',                // ❌ 冗余
  semester: '下'             // ❌ 冗余
}
```

### 规范化后（干净）

```javascript
// ai_question_pool
{
  _id: 'xxx',
  content: '题目内容',
  kp_id: 'bio_kp1_1',        // ← 通过知识点树隐含 grade/semester
  subject: 'biology',        // ✅ 保留：题目固有属性
  chapter: ''                // ✅ 保留：知识点组织维度
}

// 知识点树已包含 grade/semester 信息
loadKnowledgeTree('biology', '7', '下')
  → 知识点按年级学期组织
    → 每个 kp_id 唯一对应特定年级学期
```

---

## 保留字段的位置

| 集合/层级 | 保留 grade/semester | 理由 |
|-----------|-------------------|------|
| **knowledge_tree.js** | ✅ | 知识点按年级学期组织 |
| **assessments** | ✅ | 记录学生测评时的年级学期 |
| **question_queue** | ✅ | 队列任务的上下文参数 |
| **users** | ✅ | 用户当前的年级学期 |
| **ai_question_pool** | ❌ 已移除 | 通过 kp_id 间接关联 |

---

## 影响分析

### 查询逻辑

**题池查询**（无影响）:
```javascript
// 只用 kp_id 查询，不过滤 grade/semester
where = {
  kp_id: db.command.in(kpIds),
  verified: verified
}
```

**知识点树查询**（无影响）:
```javascript
// 已通过参数传递 grade/semester
loadKnowledgeTree(subject, grade, semester)
```

### 写入逻辑

**AI 生成题目**（已更新）:
```javascript
// 旧版：写入 grade/semester
const question = { subject, grade, semester, ... }

// 新版：只写入 subject 和 chapter
const question = { subject, chapter, ... }
```

---

## 验证结果

```
题库字段状态（采样 100 条）:
├── subject: 78/100 有值（22 个空值）
├── knowledge_point: 0/100 有值（需修复）
├── knowledge_point_id: 0/100 有值（需修复）
└── chapter: 1/100 有值

✅ grade/semester: 0/1489 存在（已完全移除）
```

---

## 后续建议

1. **修复 knowledge_point 空值**: 1139 条记录缺少知识点关联
2. **统一 kp_id 命名**: 确保与知识点树一致
3. **添加索引**: kp_id + verified 组合索引

---

**执行人**: Claude (investigate skill)
**状态**: ✅ 完成
