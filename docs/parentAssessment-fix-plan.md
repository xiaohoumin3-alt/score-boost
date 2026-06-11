# 亲子测评修复实施计划

**日期**：2026-06-11
**目标**：修复亲子测评中一年级出现高年级题目和题目重复的问题

---

## 核心目标

| 目标 | 定义 |
|------|------|
| 修复一年级出现高年级题目 | 统一提示词管理，移除勾股定理等示例 |
| 题目真正随机 | 复用 Fisher-Yates 逻辑 |
| 架构复用 | 创建适配层，复用 startAssessment 模块 |

---

## 问题1：提示词统一（方案C）

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 1.1 | 分析 `prompt-templates.js` 的 `getDifficultyGuidance` 函数签名 | `grep -A 5 "function getDifficultyGuidance" cloudfunctions/generateAiQuestion/prompt-templates.js` → 显示函数定义 |
| 1.2 | 在 `index.js` 中导入 `getDifficultyGuidance` | `grep "getDifficultyGuidance.*require" cloudfunctions/generateAiQuestion/index.js` → 显示导入语句 |
| 1.3 | 修改 `buildGenericPrompt` 调用 `getDifficultyGuidance` 替代内联的 `difficultyGuidance` | `grep -A 2 "const difficultyGuidance = {" cloudfunctions/generateAiQuestion/index.js` → 无输出（已删除内联定义） |
| 1.4 | 删除原有的内联 `difficultyGuidance` 对象（第 271-293 行） | `wc -l cloudfunctions/generateAiQuestion/index.js` → 行数减少约 23 行 |
| 1.5 | 部署 `generateAiQuestion` 云函数 | `tcb fn deploy generateAiQuestion --dir cloudfunctions/generateAiQuestion` → 显示部署成功 |
| 1.6 | 测试验证：一年级测评不出现高年级题目 | 手动测试或查看日志 → 无勾股定理等题目 |

---

## 问题2：创建适配层（方案C）

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.1 | 创建 `parentAssessment/kpAdapter.js` 模块 | `ls -la cloudfunctions/parentAssessment/kpAdapter.js` → 文件存在 |
| 2.2 | 实现知识点格式转换函数（扁平数组 → startAssessment 格式） | `grep "function convertKpFormat" cloudfunctions/parentAssessment/kpAdapter.js` → 显示函数定义 |
| 2.3 | 复制 `startAssessment/question_pool.js` 到 `parentAssessment/` | `ls -la cloudfunctions/parentAssessment/question_pool.js` → 文件存在 |
| 2.4 | 复制 `startAssessment/knowledge_tree.js` 到 `parentAssessment/` | `ls -la cloudfunctions/parentAssessment/knowledge_tree.js` → 文件存在 |
| 2.5 | 复制 `startAssessment/llm_client.js` 到 `parentAssessment/` | `ls -la cloudfunctions/parentAssessment/llm_client.js` → 文件存在 |
| 2.6 | 修改 `parentAssessment/index.js` 导入新模块 | `grep "require.*question_pool\|require.*kpAdapter" cloudfunctions/parentAssessment/index.js` → 显示导入语句 |
| 2.7 | 修改 `fetchQuestionsFromPool` 使用 `question_pool.js` 的逻辑 | `grep "fetchQuestionsBatch" cloudfunctions/parentAssessment/index.js` → 显示调用 |
| 2.8 | 部署 `parentAssessment` 云函数 | `tcb fn deploy parentAssessment --dir cloudfunctions/parentAssessment` → 显示部署成功 |
| 2.9 | 测试验证：题目随机且符合年级 | 手动测试 → 题目不重复且符合一年级 |

---

## 依赖分析

| 删除/修改目标 | 风险评估 | 缓解措施 |
|-------------|---------|---------|
| 删除 `buildGenericPrompt` 内联 `difficultyGuidance` | 如果其他代码依赖该对象会报错 | 通过导入 `getDifficultyGuidance` 替代 |
| 复制多个模块到 `parentAssessment` | 可能需要额外依赖处理 | 逐步验证部署 |

---

## 预估工作量

- **问题1（提示词）**：15 分钟
- **问题2（适配层）**：45 分钟
- **总计**：约 60 分钟

---

## 目标遵从性检查

| 核心目标 | 必需功能 | 实施计划Task | 状态 |
|---------|---------|-------------|------|
| 修复一年级出现高年级题目 | 统一提示词管理 | Step 1.1-1.6 | ✅ |
| 题目真正随机 | 复用 Fisher-Yates 逻辑 | Step 2.3-2.7 | ✅ |
| 架构复用 | 创建适配层 | Step 2.1-2.9 | ✅ |

---

## 方案选择记录

- **问题1**：选择方案C - 让 `buildGenericPrompt` 调用 `prompt-templates.js` 的函数
- **问题2**：选择方案C - 创建适配层，转换格式并调用 `startAssessment` 的查询逻辑
