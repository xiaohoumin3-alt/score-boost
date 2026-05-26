# 题池系统统一设计文档

**日期**: 2026-05-26
**状态**: 设计中
**作者**: Claude

---

## 1. 问题概述

### 1.1 当前问题

项目中存在两套完全独立、互不相通的"题库"：

1. **AI生成题只写不读**：`generateAiQuestion` 生成的题目写入 `ai_question_pool`，但 `practice_v2` 和 `startAssessment` 都不读取
2. **静态题库与数据库完全割裂**：`question_bank.js` 硬编码200道题，数据库题池形同虚设
3. **成本浪费**：每次练习都调用 MiniMax API，但生成的题永不复用

### 1.2 设计目标

建立"题池消费"闭环：
- 生成题 → 写数据库 ✅（已有）
- 答题后 → 标记题质量 ✅（新增）
- 出题时 → 优先从题池取 ✅（新增）

---

## 2. 核心架构

### 2.1 数据库结构

#### verified_pool（精选题池）

```javascript
{
  _id: "auto",
  question: "题目内容",
  options: [{key: "A", value: "选项A"}],
  correct_answer: "A",
  kp_id: "kp2_3",
  kp_name: "勾股定理",
  chapter: "第14章",
  difficulty: "medium",           // easy | medium | hard
  subject: "math",                // math | biology | geography
  source: "static" | "ai_verified",
  verified: true,
  correct_rate: 0.85,             // 正确率
  usage_count: 10,                // 使用次数
  created_at: "ISO",
  updated_at: "ISO"
}
```

#### ai_generated_pool（新生题池）

```javascript
{
  _id: "auto",
  question: "题目内容",
  options: [{key: "A", value: "选项A"}],
  correct_answer: "A",
  kp_id: "kp2_3",
  kp_name: "勾股定理",
  chapter: "第14章",
  difficulty: "medium",
  subject: "math",
  source: "ai_generated",
  verified: false,
  usage_count: 0,
  created_at: "ISO"
}
```

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    云数据库题池                          │
├─────────────────────────────────────────────────────────┤
│  verified_pool              ai_generated_pool           │
│  ├─ 静态题库迁移              ├─ AI实时生成              │
│  ├─ 验证通过的AI题           ├─ verified=false          │
│  └─ verified=true            └─ 答对后迁移              │
└─────────────────────────────────────────────────────────┘

                    ↓ 出题策略

┌─────────────────────────────────────────────────────────┐
│  Assessment模式:  100% verified_pool                    │
│  Practice模式:    10% verified_pool                     │
│                   60% ai_generated_pool                  │
│                   30% AI实时生成                         │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 出题流程设计

### 3.1 Assessment（测评模式）

**目的**：诊断能力水平，生成薄弱点报告
**要求**：题目稳定、标准化、可比性

```
出题策略：
1. 从 verified_pool 查询 {kp_id, difficulty}
2. 按 correct_rate 高低排序，优先取高质量题
3. 若 verified_pool 不足：
   - 返回错误：该知识点题库建设中
   - 或：降低难度要求重新查询
```

### 3.2 Practice（练习模式）

**目的**：针对薄弱点强化练习
**要求**：题目多样化，避免重复

```
出题策略（混合抽取）：
1. verified_pool: 10% （质量底线）
2. ai_generated_pool: 60% （主要来源）
3. AI实时生成: 30% （持续补充）

防重复逻辑：
- 记录本次会话已使用的题目ID
- 查询时排除已用ID
```

---

## 4. 验证流程设计

### 4.1 答题后验证（submitAnswer）

```javascript
// 答题提交后
if (answer.is_correct && question.source === 'ai_generated_pool') {
  // 1. 迁移到 verified_pool
  await verified_pool.add({
    ...question,
    verified: true,
    correct_rate: 1.0,
    usage_count: question.usage_count + 1
  });

  // 2. 从 ai_generated_pool 删除
  await ai_generated_pool.doc(question._id).remove();
} else if (answer.is_correct) {
  // 更新正确率
  await verified_pool.doc(question._id).update({
    correct_rate: (old.correct_rate * old.usage_count + 1) / (old.usage_count + 1),
    usage_count: old.usage_count + 1
  });
}
```

---

## 5. 迁移方案

### 5.1 静态题库迁移（一次性）

```javascript
// migrate_question_bank.js
const { QUESTION_BANK, BIO_QUESTION_BANK, GEO_QUESTION_BANK } = require('./question_bank');

async function migrateStaticBank() {
  const db = cloud.database();

  // 数学题库
  for (const [kpId, questions] of Object.entries(QUESTION_BANK)) {
    for (const q of questions) {
      await db.collection('verified_pool').add({
        question: q.content,
        options: q.options.map(o => {
          const match = o.match(/^([A-D])\.\s*(.+)$/);
          return match ? {key: match[1], value: match[2]} : {key: '', value: o};
        }),
        correct_answer: q.correct_answer,
        kp_id: kpId,
        difficulty: q.difficulty,
        subject: 'math',
        source: 'static',
        verified: true,
        correct_rate: 0.8,
        usage_count: 0,
        created_at: new Date().toISOString()
      });
    }
  }

  // 生物、地理题库（同理）
}
```

### 5.2 文件变更

- 删除：`cloudfunctions/practice_v2/question_bank.js`
- 修改：`cloudfunctions/practice_v2/question_generator.js`
- 修改：`cloudfunctions/startAssessment/index.js`
- 修改：`cloudfunctions/submitAnswer/index.js`

---

## 6. 验收标准

### 6.1 功能验收

- [ ] Assessment 模式从 verified_pool 出题
- [ ] Practice 模式按 10:60:30 比例混合出题
- [ ] 答题正确后，AI题自动迁移到 verified_pool
- [ ] 静态题库成功迁移到 verified_pool
- [ ] `question_bank.js` 文件删除

### 6.2 性能验收

- [ ] Practice 模式出题时间 < 3秒（含AI生成）
- [ ] Assessment 模式出题时间 < 1秒（纯数据库查询）
- [ ] API 调用次数降低 60%（复用题池）

---

## 7. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| verified_pool 题量不足 | 预先迁移静态题库，保证基础覆盖 |
| AI题质量不稳定 | 设置 correct_rate 阈值，低于0.5的题不迁移 |
| 数据库查询慢 | 建立索引 {kp_id, difficulty, verified} |
| 迁移失败 | 提供回滚脚本，保留原题库备份 |
