# [Bug] 题池系统形同虚设：AI生成题只写不读，静态题库与数据库题池完全割裂

## Bug 描述

项目中存在两套完全独立、互不相通的"题库"，且各自存在严重缺陷：

### 问题一：AI生成题只写不读

**涉及文件**：`cloudfunctions/generateAiQuestion/index.js`

AI实时生成的每道题目都会写入云数据库 `ai_question_pool`，但生成后**从未被复用**：

- `practice_v2` 每次出题都重新调AI生成新的题目
- `startAssessment` 根本不走AI，完全跳过题池
- AI生成时虽然查了 `exclude_questions` 字段试图防重复，但题池里根本没积累足够的题，这个防护形同虚设

**结果**：题池成为一个只写的日志表，越积越多但毫无用处。每次练习都要掏真金白银调用MiniMax API。

### 问题二：静态题库与数据库题池完全割裂

**涉及文件**：
- `cloudfunctions/practice_v2/question_bank.js` — 硬编码的静态题库（几十道预置题）
- `cloudfunctions/practice_v2/question_generator.js` — 只在AI超时时降级到静态题库兜底
- `cloudfunctions/startAssessment/index.js` — 只读静态题库，从不看数据库题池

```
当前流程：

Assessment（测评）
  └─→ 只读静态题库 question_bank.js
       × 不看 ai_question_pool

Practice（练习）
  ├─→ AI实时生成
  │    └─ 写进 ai_question_pool（但永不复用）
  └─→ AI超时 → 降级静态题库
       × 不看 ai_question_pool
```

静态题库是兜底网，数据库题池是日志仓库。两者老死不相往来。

### 问题三：静态题库规模过小且只增不减

`question_bank.js` 里每个 `kp` 下的题数量极少（2-4道），且没有验证状态、不记录正确率。

## 影响

1. **费用浪费**：每次练习都走AI API调用，但生成的题从未复用，白花token钱
2. **速度慢**：AI冷启动延迟明显，用户等题时间长
3. **质量不稳定**：AI每次实时生成，题目可能出现奇葩答案，无法利用历史数据筛选优质题
4. **静态题库命中率高却从不用**：Assessment 模式的50道题全从只有几十道题的静态库出，每次几乎必命中旧题
5. **题池数据白白堆积**：数据库存储成本增加但无收益

## 根因分析

代码架构中没有建立"题池消费"的闭环逻辑：

1. 生成题 → 写数据库 ✅（已有）
2. 练习答题 → 标记题目质量 ❌（未实现）
3. 出题时 → 优先从题池取优质题 ❌（未实现）

Step 2 缺失导致题池无法积累"已验证题"，Step 3 缺失导致题池永远不被消费。

## 建议修复方案

### Phase 1（快速见效）
在 `submitAnswer` 或 `submitPracticeResult` 中：
1. 答完题后，根据正确率标记 `ai_question_pool` 中对应题目为 `verified`
2. practice 出题时**优先从题池取 `verified: true` 的题**，只有题池空了才调AI

### Phase 2（长期优化）
1. 建立题目质量评分机制（结合正确率+提交次数）
2. Assessment 也纳入题池：50道测评题从题池+静态库合并出
3. 删除或大幅缩减静态题库（保留兜底功能即可）

### Phase 3（架构升级）
1. 将静态题库迁移到云数据库，与题池合并管理
2. 题库支持标签、变体、知识点关联度等元数据
3. 根据学生画像动态决定AI生成 vs 题池抽取的比例
