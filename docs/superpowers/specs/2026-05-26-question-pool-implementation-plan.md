# 实施计划：题池系统统一

**日期**: 2026-05-26
**版本**: v2（审查后修订）
**状态**: 待执行

---

## 【三原则审视】

1. **2/8原则**：核心20%是建立题池消费闭环（从题池取题、答题后验证题质量），剩下80%的优化（如复杂去重、精细调优）不在本次范围
2. **第一性原理**：根本问题是AI生成的题目永不复用，解决方式是让出题逻辑优先从数据库取题，答题后更新题目质量
3. **收益递减**：单池方案（verified字段区分）已经够用，不需要双池拆分的复杂度

---

## 阶段 0：依赖分析与风险评估

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 0.1 | 分析 question_bank.js 依赖关系 | `grep -rn "require.*question_bank" cloudfunctions/ --include="*.js" | grep -v test | grep -v node_modules` → 列出所有依赖文件 |
| 0.2 | 检查现有 ai_question_pool 数据结构 | 云开发控制台 → ai_question_pool → 确认集合存在 |
| 0.3 | 备份现有静态题库数据 | `cp cloudfunctions/shared/question_bank.js cloudfunctions/shared/question_bank.js.bak` → 文件存在 |
| 0.4 | 确认数据库权限 | 云开发控制台确认 ai_question_pool 集合可读写 |

---

## 阶段 1：数据库准备（索引 + 表）

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 1.1 | 在 initDatabase 中新增索引创建函数 | `grep -n "idx_kp_difficulty_verified\|idx_verified_quality\|idx_kp_verified_used" cloudfunctions/initDatabase/index.js` → 找到3处定义 |
| 1.2 | 新增 user_question_history 集合创建 | `grep -n "user_question_history" cloudfunctions/initDatabase/index.js` → 找到集合创建逻辑 |
| 1.3 | 创建 user_question_history 索引 | `grep -n "idx_user_question" cloudfunctions/initDatabase/index.js` → 找到索引定义 |
| 1.4 | 部署 initDatabase 云函数 | 云开发控制台显示部署成功 |
| 1.5 | 执行索引和表创建 | 调用云函数 initDatabase action=initQuestionPool → 返回 success: true |
| 1.6 | 验证索引创建成功 | 云开发控制台 → ai_question_pool → 索引管理 → 看到新增3个索引 |
| 1.7 | 验证 user_question_history 表创建 | 云开发控制台 → user_question_history → 集合存在 |

**索引定义**：
```javascript
// ai_question_pool 索引
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

// user_question_history 索引
db.collection('user_question_history').createIndex({
  keys: { user_id: 1, question_id: 1 },
  name: "idx_user_question"
});
```

---

## 阶段 2：静态题库迁移

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.1 | 创建迁移脚本 cloudfunctions/migrateQuestionBank/index.js | 文件存在且包含 migrateStaticBank 函数 |
| 2.2 | 部署迁移云函数 | 云开发控制台显示部署成功 |
| 2.3 | 执行数学题库迁移 | 调用云函数 migrateQuestionBank subject=math → 返回 {success: true, migrated: X} |
| 2.4 | 执行生物题库迁移 | 调用云函数 migrateQuestionBank subject=biology → 返回 {success: true, migrated: X} |
| 2.5 | 执行地理题库迁移 | 调用云函数 migrateQuestionBank subject=geography → 返回 {success: true, migrated: X} |
| 2.6 | 验证迁移结果 | 云开发控制台查询 ai_question_pool where source='static' → 数量匹配题库总数 |

---

## 阶段 3：practice_v2 修改

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.1 | 创建题池查询函数 question_pool.js | `test -f cloudfunctions/practice_v2/question_pool.js` → 文件存在 |
| 3.2 | 实现 fetchQuestionsFromPool 函数 | `grep -n "fetchQuestionsFromPool" cloudfunctions/practice_v2/question_pool.js` → 函数存在 |
| 3.3 | 添加 correct_rate > 0.5 过滤条件 | `grep -n "correct_rate.*0\.5" cloudfunctions/practice_v2/question_pool.js` → 找到过滤逻辑 |
| 3.4 | 添加防重复查询逻辑（7天窗口） | `grep -n "last_used_at.*7.*day" cloudfunctions/practice_v2/question_pool.js` → 逻辑存在 |
| 3.5 | 添加 user_question_history 记录逻辑 | `grep -n "user_question_history" cloudfunctions/practice_v2/question_pool.js` → 记录逻辑存在 |
| 3.6 | 修改 question_generator.js 引入题池查询 | `grep -n "require.*question_pool" cloudfunctions/practice_v2/question_generator.js` → 引入存在 |
| 3.7 | 实现 10:60:30 混合出题策略 | `grep -n "0\.1.*0\.6.*0\.3" cloudfunctions/practice_v2/question_generator.js` → 找到比例逻辑 |
| 3.8 | 部署 practice_v2 云函数 | 云开发控制台显示部署成功 |
| 3.9 | 测试混合出题 | 调用 practice_v2，检查返回题目中 source 字段分布 |

**题池查询函数结构**：
```javascript
// question_pool.js
async function fetchQuestionsFromPool(db, kpId, difficulty, verified, userId, excludeIds = [], limit = 5) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 获取用户历史
  const history = await db.collection('user_question_history')
    .where({ user_id: userId })
    .get();
  const historyIds = history.data.map(h => h.question_id);

  // 合并排除ID
  const allExcludeIds = [...new Set([...excludeIds, ...historyIds])];

  const where = {
    kp_id: kpId,
    difficulty: difficulty,
    verified: verified,
    correct_rate: db.command.gt(0.5)  // 阈值过滤
  };
  if (allExcludeIds.length > 0) {
    where._id = db.command.nin(allExcludeIds);
  }

  const result = await db.collection('ai_question_pool')
    .where(where)
    .orderBy('correct_rate', 'desc')
    .limit(limit)
    .get();

  // 更新 last_used_at
  for (const q of result.data) {
    db.collection('ai_question_pool').doc(q._id).update({
      data: { last_used_at: new Date().toISOString() }
    });

    // 记录用户历史
    db.collection('user_question_history').add({
      data: {
        user_id: userId,
        question_id: q._id,
        used_at: new Date().toISOString()
      }
    });
  }

  return result.data;
}
```

---

## 阶段 4：startAssessment 修改

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.1 | 创建题池查询模块（复用或新建） | `test -f cloudfunctions/startAssessment/question_pool.js` → 文件存在 |
| 4.2 | 修改 startAssessment/index.js 引入题池 | `grep -n "require.*question_pool" cloudfunctions/startAssessment/index.js` → 引入存在 |
| 4.3 | 实现 100% verified=true 出题策略 | `grep -n "verified.*true" cloudfunctions/startAssessment/index.js` → 找到查询逻辑 |
| 4.4 | 实现降级逻辑（verified 补足） | `grep -n "verified.*false.*补足\|fallback" cloudfunctions/startAssessment/index.js` → 降级逻辑存在 |
| 4.5 | 添加题量不足错误处理 | `grep -n "题库建设中\|insufficient" cloudfunctions/startAssessment/index.js` → 错误提示存在 |
| 4.6 | 移除 question_bank.js 依赖 | `grep -n "require.*question_bank" cloudfunctions/startAssessment/index.js` → 无结果 |
| 4.7 | 部署 startAssessment 云函数 | 云开发控制台显示部署成功 |
| 4.8 | 测试 Assessment 出题 | 调用 startAssessment，检查题目全部 verified=true |

**降级策略具体实现**：
```javascript
// startAssessment/index.js
async function fetchAssessmentQuestions(db, kpId, difficulty, numQuestions) {
  // 优先取 verified=true
  let questions = await db.collection('ai_question_pool')
    .where({ kp_id: kpId, difficulty: difficulty, verified: true })
    .orderBy('correct_rate', 'desc')
    .limit(numQuestions)
    .get();

  // 若 verified 题量不足，混合 verified=false 补足
  if (questions.data.length < numQuestions) {
    const remaining = numQuestions - questions.data.length;
    const fallback = await db.collection('ai_question_pool')
      .where({
        kp_id: kpId,
        difficulty: difficulty,
        verified: false
      })
      .limit(remaining)
      .get();

    questions.data = [...questions.data, ...fallback.data];
  }

  // 若总题量仍不足，返回错误
  if (questions.data.length < numQuestions) {
    throw new Error(`该知识点题库建设中，当前仅有 ${questions.data.length} 道题`);
  }

  return questions.data;
}
```

---

## 阶段 5：submitAnswer 验证逻辑

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 5.1 | 在 submitAnswer 中添加 verifyQuestion 函数 | `grep -n "async function verifyQuestion" cloudfunctions/submitAnswer/index.js` → 函数存在 |
| 5.2 | 实现答对后 verified=true 迁移逻辑 | `grep -n "verified.*true" cloudfunctions/submitAnswer/index.js` → 逻辑存在 |
| 5.3 | 实现 correct_rate 更新逻辑 | `grep -n "correct_rate.*oldRate.*newRate" cloudfunctions/submitAnswer/index.js` → 计算逻辑存在 |
| 5.4 | 在评分循环中调用验证 | `grep -n "verifyQuestion" cloudfunctions/submitAnswer/index.js` → 循环内调用 |
| 5.5 | 部署 submitAnswer 云函数 | 云开发控制台显示部署成功 |
| 5.6 | 测试验证逻辑 | 提交答案后检查 ai_question_pool 中 verified 字段变化 |

---

## 阶段 6：清理与验证

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 6.1 | 删除 practice_v2/question_bank.js | `test -f cloudfunctions/practice_v2/question_bank.js` → exit code 1（文件不存在） |
| 6.2 | 删除 startAssessment/question_bank.js | `test -f cloudfunctions/startAssessment/question_bank.js` → exit code 1 |
| 6.3 | 删除 getAssessment/question_bank.js（如存在） | `test -f cloudfunctions/getAssessment/question_bank.js` → exit code 1 |
| 6.4 | 删除 practice/question_bank.js（如存在） | `test -f cloudfunctions/practice/question_bank.js` → exit code 1 |
| 6.5 | 删除 submitAnswer/question_bank.js（如存在） | `test -f cloudfunctions/submitAnswer/question_bank.js` → exit code 1 |
| 6.6 | 检查残留引用 | `grep -rn "require.*question_bank" cloudfunctions/ --include="*.js" | grep -v node_modules | grep -v ".bak" | grep -v "shared/question_bank"` → 无结果 |
| 6.7 | 保留 shared/question_bank.js（供迁移使用） | `test -f cloudfunctions/shared/question_bank.js` → exit code 0 |

---

## 阶段 7：集成测试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 7.1 | Assessment 模式端到端测试 | 调用 startAssessment → 返回题目全部 verified=true |
| 7.2 | Practice 模式端到端测试 | 调用 practice_v2 → 检查题目混合比例接近 10:60:30 |
| 7.3 | 提交答案验证测试 | 提交答案后检查 ai_question_pool 中 verified 字段更新 |
| 7.4 | 防重复测试（7天窗口） | 短时间内多次调用同一kp → 检查 last_used_at 更新 |
| 7.5 | 防重复测试（用户历史） | 不同用户调用同一kp → 检查 user_question_history 记录 |
| 7.6 | 性能测试 | Assessment < 1秒，Practice < 3秒 |
| 7.7 | correct_rate 阈值测试 | 查询结果中 correct_rate 均 > 0.5 |
| 7.8 | recordKpRequest 兼容性测试 | 调用 recordKpRequest → verified 字段查询正常 |

---

## 风险与缓解

| 风险 | 缓解措施 | 验证方法 |
|------|----------|----------|
| 删除 question_bank.js 后功能失效 | 阶段6前完成完整功能测试 | 运行阶段7测试 |
| 数据库查询性能下降 | 建立复合索引，使用 explain plan 分析 | 云开发控制台性能分析 |
| AI题质量不稳定 | 设置 correct_rate > 0.5 阈值过滤 | Step 3.3, 7.7 |
| 迁移数据丢失 | 迁移前备份，分科目迁移 | Step 0.3, 2.6 |
| user_question_history 表缺失 | 阶段1创建表和索引 | Step 1.2, 1.7 |

---

## 文件变更清单

### 新增文件
- `/Users/seanxx/score-boost-mini/cloudfunctions/migrateQuestionBank/index.js` - 迁移脚本
- `/Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/question_pool.js` - 题池查询模块
- `/Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/question_pool.js` - 题池查询模块

### 修改文件
- `/Users/seanxx/score-boost-mini/cloudfunctions/initDatabase/index.js` - 新增索引和表创建
- `/Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/question_generator.js` - 混合出题策略
- `/Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/index.js` - 题池出题逻辑
- `/Users/seanxx/score-boost-mini/cloudfunctions/submitAnswer/index.js` - 验证逻辑

### 删除文件
- `/Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/question_bank.js`
- `/Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/question_bank.js`
- 其他云函数下的 question_bank.js（如存在）

### 保留文件
- `/Users/seanxx/score-boost-mini/cloudfunctions/shared/question_bank.js` - 供迁移使用

---

## 验收标准对照

### 功能验收（设计6.1）
| 设计要求 | 实施计划验证 |
|---------|-------------|
| Assessment 从题池 verified=true 出题 | Step 4.3, 7.1 |
| Assessment 题量不足时降级 | Step 4.4, 4.5 |
| Practice 按 10:60:30 混合出题 | Step 3.7, 7.2 |
| 防重复逻辑生效（7天内） | Step 3.4, 7.4 |
| **防重复逻辑生效（用户历史）** | **Step 3.5, 7.5** ✅补充 |
| 答题正确后 AI题自动标记 verified | Step 5.2, 7.3 |
| 静态题库成功迁移 | Step 2.3-2.6 |
| question_bank.js 文件删除 | Step 6.1-6.6 |
| 数据库索引创建成功 | Step 1.1, 1.6 |
| **user_question_history 表创建** | **Step 1.2, 1.7** ✅补充 |

### 性能验收（设计6.2）
| 设计要求 | 实施计划验证 |
|---------|-------------|
| Practice 出题时间 < 3秒 | Step 7.6 |
| Assessment 出题时间 < 1秒 | Step 7.6 |
| API 调用次数降低 60% | 运行一段时间后统计 |
| 数据库查询命中索引 | 云开发控制台性能分析 |

### 迁移验收（设计6.3）
| 设计要求 | 实施计划验证 |
|---------|-------------|
| 静态题库迁移后题量验证 | Step 2.6 |
| 现有 ai_question_pool 数据兼容性 | 手动检查 |
| recordKpRequest 兼容性 | Step 7.8 |

---

## 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1 | 2026-05-26 | 初版计划 |
| v2 | 2026-05-26 | 补充 user_question_history 表创建、correct_rate 阈值过滤、明确降级策略 |
