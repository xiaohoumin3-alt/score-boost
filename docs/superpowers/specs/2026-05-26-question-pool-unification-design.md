# 题池系统统一设计文档

**日期**: 2026-05-26
**状态**: 设计中
**版本**: v2（审查后修订）
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

### 2.1 数据库结构（单池方案）

**设计决策**：采用单集合 `ai_question_pool` + `verified` 字段区分，而非双集合拆分。

**理由**：
- 代码中已存在 `verified: true` 查询（recordKpRequest）
- 避免数据迁移复杂度
- 查询性能通过索引保证

#### ai_question_pool（统一题池）

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
  source: "static" | "ai_verified" | "ai_generated",
  verified: true | false,         // 核心区分字段
  correct_rate: 0.85,             // 正确率
  usage_count: 10,                // 使用次数
  last_used_at: "ISO",            // 防重复用
  created_at: "ISO",
  updated_at: "ISO"
}
```

#### 数据库索引（新增）

```javascript
// 云数据库索引定义
db.collection('ai_question_pool').createIndex({
  keys: { kp_id: 1, difficulty: 1, verified: 1 },
  name: "idx_kp_difficulty_verified"
});

db.collection('ai_question_pool').createIndex({
  keys: { verified: 1, correct_rate: -1 },
  name: "idx_verified_quality"
});

db.collection('ai_question_pool').createIndex({
  keys: { kp_id: 1, verified: 1, last_used_at: 1 },
  name: "idx_kp_verified_used"
});
```

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────┐
│              ai_question_pool（统一题池）                │
├─────────────────────────────────────────────────────────┤
│  verified=true          verified=false                   │
│  ├─ 静态题库迁移          ├─ AI实时生成                  │
│  ├─ 答对后的AI题         ├─ 等待验证                     │
│  └─ 高质量复用源          └─ 答对后迁移                   │
└─────────────────────────────────────────────────────────┘

                    ↓ 出题策略

┌─────────────────────────────────────────────────────────┐
│  Assessment模式:  100% verified=true                   │
│  Practice模式:    10% verified=true                    │
│                   60% verified=false                   │
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
1. 从题池查询 {kp_id, difficulty, verified: true}
2. 按 correct_rate 高低排序，优先取高质量题
3. 若题量不足：
   a) 降级：尝试 verified: false 的同 kp_id 题
   b) 兜底：返回错误提示"该知识点题库建设中"
```

**容错策略（新增）**：
- verified=true 题量 ≥ 目标：正常出题
- verified=true 题量 < 目标：混合 verified=false 补足
- 总题量 < 目标：返回错误，不建议强行出题

### 3.2 Practice（练习模式）

**目的**：针对薄弱点强化练习
**要求**：题目多样化，避免重复

```
出题策略（混合抽取）：
1. verified=true: 10% （质量底线）
2. verified=false: 60% （主要来源）
3. AI实时生成: 30% （持续补充）

防重复逻辑（新增）：
- 查询条件：排除 last_used_at 在 7 天内的题目
- 跨会话防重复：用户维度记录已做题ID（user_question_history）
- 查询时：WHERE user_id NOT IN (history_ids)
```

---

## 4. 验证流程设计

### 4.1 答题后验证（submitAnswer）

**设计决策**：在 `submitAnswer` 中新增验证逻辑，不影响现有评分功能。

```javascript
// submitAnswer/index.js 新增逻辑
async function verifyQuestion(db, questionId, isCorrect) {
  const q = await db.collection('ai_question_pool').doc(questionId).get();

  if (!q.data.length) return;

  const question = q.data[0];

  // 答对且未验证 → 迁移到 verified=true
  if (isCorrect && !question.verified) {
    await db.collection('ai_question_pool').doc(questionId).update({
      data: {
        verified: true,
        correct_rate: 1.0,
        usage_count: (question.usage_count || 0) + 1,
        updated_at: new Date().toISOString()
      }
    });
  }
  // 已验证题 → 更新正确率
  else if (question.verified) {
    const oldRate = question.correct_rate || 0.5;
    const oldCount = question.usage_count || 1;
    const newRate = ((oldRate * oldCount) + (isCorrect ? 1 : 0)) / (oldCount + 1);

    await db.collection('ai_question_pool').doc(questionId).update({
      data: {
        correct_rate: newRate,
        usage_count: oldCount + 1,
        updated_at: new Date().toISOString()
      }
    });
  }
}

// 在现有评分逻辑后调用
for (const result of allResults) {
  if (result.is_correct) {
    await verifyQuestion(db, result.question_id, true);
  }
}
```

---

## 5. 迁移方案

### 5.1 静态题库迁移（一次性）

**调整**：直接写入 `ai_question_pool`，标记 `verified: true, source: 'static'`。

```javascript
// migrate_question_bank.js
const { QUESTION_BANK, BIO_QUESTION_BANK, GEO_QUESTION_BANK } = require('./question_bank');

async function migrateStaticBank() {
  const db = cloud.database();

  // 数学题库
  for (const [kpId, questions] of Object.entries(QUESTION_BANK)) {
    for (const q of questions) {
      await db.collection('ai_question_pool').add({
        data: {
          question: q.content,
          options: q.options.map(o => {
            const match = o.match(/^([A-D])\.\s*(.+)$/);
            return match ? {key: match[1], value: match[2]} : {key: '', value: o};
          }),
          correct_answer: q.correct_answer,
          kp_id: kpId,
          kp_name: q.kp_name || '',
          chapter: q.chapter || '',
          difficulty: q.difficulty || 'medium',
          subject: 'math',
          source: 'static',
          verified: true,
          correct_rate: 0.8,
          usage_count: 0,
          created_at: new Date().toISOString()
        }
      });
    }
  }

  // 生物、地理题库（同理）
}
```

### 5.2 文件变更

- **删除**：`cloudfunctions/practice_v2/question_bank.js`
- **删除**：`cloudfunctions/startAssessment/question_bank.js`
- **修改**：`cloudfunctions/practice_v2/question_generator.js`
- **修改**：`cloudfunctions/startAssessment/index.js`
- **修改**：`cloudfunctions/submitAnswer/index.js`

---

## 6. 验收标准

### 6.1 功能验收

- [ ] Assessment 模式从题池 verified=true 出题
- [ ] Assessment 题量不足时降级到 verified=false
- [ ] Practice 模式按 10:60:30 比例混合出题
- [ ] 防重复逻辑生效（7天内不重复）
- [ ] 答题正确后，AI题自动标记 verified=true
- [ ] 静态题库成功迁移到题池
- [ ] `question_bank.js` 文件删除
- [ ] 数据库索引创建成功

### 6.2 性能验收

- [ ] Practice 模式出题时间 < 3秒（含AI生成）
- [ ] Assessment 模式出题时间 < 1秒（纯数据库查询）
- [ ] API 调用次数降低 60%（复用题池）
- [ ] 数据库查询命中索引（explain plan 验证）

### 6.3 迁移验收（新增）

- [ ] 静态题库迁移后题量验证（数学/生物/地理分别计数）
- [ ] 现有 `ai_question_pool` 数据兼容性验证
- [ ] `recordKpRequest` 对 verified 字段的查询不受影响

---

## 7. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 题池题量不足 | 预先迁移静态题库，保证基础覆盖 |
| AI题质量不稳定 | 设置 correct_rate 阈值，低于0.5的题不优先展示 |
| 数据库查询慢 | 建立复合索引 {kp_id, difficulty, verified} |
| 迁移失败 | 提供回滚脚本，保留原题库备份 |
| 前端兼容性 | 保持返回格式不变，仅变更数据来源 |
| 防重复失效 | user_question_history 表记录用户做题历史 |

---

## 8. 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1 | 2026-05-26 | 初版设计（双池方案） |
| v2 | 2026-05-26 | 修订：单池方案 + 索引定义 + 防重复逻辑 + 容错策略 |
