# 数据架构分析（第二次验证）

> 生成日期: 2026-06-08
> 上次分析: 2026-06-07
> 范围: 提分神器小程序全系统

---

## 1. 数据资产总览

### 1.1 集合目录（更新至29个）

| # | 集合名 | 用途 | 写入方 | 读取方 | 估算量级 | 变更 |
|---|--------|------|--------|--------|---------|------|
| 1 | `users` | 用户档案 | login, updateUserProfile | getUserInfo, checkVipStatus, home, pointsManager | 用户数 | |
| 2 | `assessments` | 测评记录 | startAssessment, questionGenerator, submitAnswer | getAssessment, home, diagnoseAssessment | 测评次数 | ⚠️ 双重存储 |
| 3 | `ai_question_pool` | 题目池(主) | generateAiQuestion, practice_v2, scheduledTaskGenerator, initQuestionBank | startAssessment, practice_v2, getAssessment, submitAnswer | 题目数 | |
| 4 | `question_queue` | 用户生成队列 | startAssessment, manualTriggerQueue | questionGenerator, checkQueueStatus | 活跃任务 | |
| 5 | `pregen_queue` | 预生成队列 | (外部触发) | questionGenerator | 预生成任务 | |
| 6 | `generation_tasks` | 生成任务跟踪 | queue-manager | queryProgress | 任务数 | |
| 7 | `practices` | 练习会话 | practice_v2 | practice相关 | 练习次数 | |
| 8 | `practice_records` | 练习答题记录 | practice_v2 | mistakes页面 | 答题次数 | |
| 9 | `kp_progress` | 知识点进度 | submitPracticeResult | getKpProgress, path | 学生×知识点 | |
| 10 | `student_memory` | 学生记忆画像 | studentMemory | practice_v2, home | 学生数 | |
| 11 | `knowledge_points` | 知识点库 | initQuestionBank, syncKnowledgePoints | studentMemory, generateAiQuestion | 知识点数 | |
| 12 | `user_points` | 积分账户 | pointsManager | points页面 | 用户数 | |
| 13 | `point_records` | 积分流水 | pointsManager | points页面 | 流水数 | |
| 14 | `invite_codes` | 邀请码 | pointsManager | pointsManager | 用户数 | |
| 15 | `redeem_codes` | 兑换码 | (外部管理) | pointsManager | 兑换码数 | |
| 16 | `feedback` | 用户反馈 | submitFeedback | getFeedbackList, replyFeedback | 反馈数 | |
| 17 | `questions` | 定时生成题目 | ~~scheduledTaskGenerator~~ | check-db-questions(调试) | 题目数 | ✅ 近乎废弃 |
| 18 | `question_generation_queue` | 定时生成队列 | ~~scheduledTaskGenerator~~ | (无) | 任务数 | ✅ 已废弃 |
| 19 | `materials` | 上传材料 | uploadMaterial | adminReviewMaterial, startExclusiveExam | 材料数 | 🆕 |
| 20 | `user_materials` | 用户材料元数据 | uploadMaterial | startExclusiveExam | 用户材料数 | 🆕 |
| 21 | `user_materials_vectors` | RAG向量数据 | uploadMaterial/embedder | startExclusiveExam | 向量数 | 🆕 |
| 22 | `user_exams` | 专属考试记录 | startExclusiveExam | (前端) | 考试数 | 🆕 |
| 23 | `parent_assessments` | 家长测评 | parentAssessment | parentAssessment | 测评数 | 🆕 |
| 24 | `admin` | 管理员账号 | (外部) | adminLogin | 管理员数 | 🆕 |
| 25 | `analytics` | 事件追踪 | analytics | (分析用) | 事件数 | 🆕 |
| 26 | `kp_request_log` | 知识点请求日志 | recordKpRequest | (分析用) | 请求数 | 🆕 |
| 27 | `user_question_history` | 答题历史 | (练习/测评) | (分析用) | 答题数 | 🆕 |
| 28 | `invite_records` | 邀请记录 | pointsManager | (统计用) | 邀请数 | 🆕 |
| 29 | `question_bank` | 题库(迁移用) | initQuestionBank | migrateQuestionBank | 题目数 | 🆕 |

### 1.2 文件系统数据资产

| 路径 | 用途 | 格式 | 变更 |
|------|------|------|------|
| `cloudfunctions/startAssessment/data/` | 知识点定义(权威数据源) | 116 JSON文件 | 无变化 |
| `cloudfunctions/shared/question_bank.js` | 硬编码题库 | `QUESTION_BANK = {}` | ✅ 已清空 |
| `cloudfunctions/shared/question-normalizer.js` | 题目格式归一化 | JS模块 | 🆕 新增 |
| `cloudfunctions/shared/schema-version.js` | Schema版本管理 | JS模块 | 🆕 新增 |
| `cloudfunctions/shared/dedup.js` | 去重工具 | JS模块 | 🆕 新增 |
| `cloudfunctions/shared/response-helper.js` | 统一响应格式 | JS模块 | 🆕 新增(未使用) |
| `cloudfunctions/shared/llm-client.js` | 统一LLM客户端 | JS模块 | 🆕 新增 |
| `cloudfunctions/shared/question-generator.js` | 题目生成器 | JS模块 | 🆕 新增 |

---

## 2. 核心数据模型

### 2.1 Question (题目) — ⚠️ 仍然不一致

存储集合：`ai_question_pool`（主）

**归一化Schema**（`question-normalizer.js` 定义的规范格式）：

```
┌─────────────────────────────────────────────────┐
│ Question (归一化目标)                             │
├─────────────────────────────────────────────────┤
│ question: string           ✅ 统一字段名          │
│ options: string[]          ✅ 统一为纯文本数组     │
│ correct_answer: string     ✅ 统一为 "A"-"D"      │
│ kp_id: string                                    │
│ kp_name: string                                  │
│ difficulty: 'easy'|'medium'|'hard'               │
│ explanation: string                               │
│ question_type: string                             │
│ subject: string                                   │
│ grade: string                                     │
│ chapter: string                                   │
│ schema_version: number  (当前=1)                  │
└─────────────────────────────────────────────────┘
```

**实际写入格式对比（当前状态）**：

| 字段 | questionGenerator ✅ | generateAiQuestion ✅ | startAssessment ❌ | practice_v2 ❌ | scheduledTask ❌ |
|------|:---:|:---:|:---:|:---:|:---:|
| 内容字段 | `question` | `question` | `question` | `question` | `question`+`content` |
| 选项格式 | `string[]` | `string[]` | `{key,value}[]` | `{key,value}[]` | `{key,value}[]` |
| 答案格式 | `"A"`-`"D"` | `"A"`-`"D"` | `"A"`-`"D"` | `"A"`-`"D"` | `String(number)` |
| 使用normalizer | ✅ | ✅ | ❌ 内联 | ❌ 内联 | ❌ 内联 |
| schema_version | ✅ | ✅ | ❌ | ❌ | ✅ 手动 |

---

### 2.2 Assessment (测评) — ⚠️ 双重存储问题

```
┌──────────────────────────────────────────────────────────────┐
│ Assessment                                                    │
├──────────────────────────────────────────────────────────────┤
│ assessment_id: string (UUID)                                  │
│ student_id: string (openid)                                   │
│ subject: string                                               │
│ grade: string                                                 │
│ semester: string                                              │
│ mode: 'quick'|'pre_test'|'retest'|'huikao'                   │
│ status: 'ready'|'in_progress'|'completed'                    │
│ created_at: string (ISO)                                      │
│                                                               │
│ ⚠️ 存储方式A (startAssessment同步路径):                       │
│   questions: [完整Question对象]  ← 内嵌                       │
│                                                               │
│ ⚠️ 存储方式B (questionGenerator队列路径):                     │
│   question_ids: [ai_question_pool._id]  ← 引用               │
│                                                               │
│ 完成后追加:                                                   │
│   answers: [{question_id, answer}]                            │
│   score: {total_correct, total_questions, score_percent}      │
│   results: [{question_id, is_correct, ...}]                   │
│   kp_stats: [{kp_id, correct, total}]                         │
└──────────────────────────────────────────────────────────────┘
```

**问题**：`getAssessment` 和 `submitAnswer` 只处理方式A，方式B创建的记录无法正常读取和判分。

---

### 2.3 🆕 Material (材料)

```
┌─────────────────────────────────────────────────┐
│ Material (materials 集合)                         │
├─────────────────────────────────────────────────┤
│ _id: string                                      │
│ openid: string                                   │
│ material_type: 'personal'|'textbook'             │
│ title: string                                    │
│ file_id: string (云存储)                          │
│ subject: string (可选)                            │
│ grade: string (可选)                              │
│ semester: string (可选)                           │
│ status: 'pending'|'approved'|'rejected'          │
│ created_at: string (ISO)                         │
└─────────────────────────────────────────────────┘
```

---

### 2.4 🆕 ParentAssessment (家长测评)

```
┌─────────────────────────────────────────────────┐
│ ParentAssessment (parent_assessments 集合)       │
├─────────────────────────────────────────────────┤
│ _id: string                                      │
│ parent_openid: string                            │
│ student_openid: string                           │
│ questions: [Question对象]                         │
│ parent_answers: [{question_id, answer}]           │
│ student_answers: [{question_id, answer}]          │
│ status: 'parent_pending'|'student_pending'       │
│            |'completed'                           │
│ comparison: {parent_score, student_score, ...}    │
│ created_at: string (ISO)                         │
└─────────────────────────────────────────────────┘
```

---

### 2.5 🆕 UserExam (专属考试)

```
┌─────────────────────────────────────────────────┐
│ UserExam (user_exams 集合)                       │
├─────────────────────────────────────────────────┤
│ _id: string                                      │
│ openid: string                                   │
│ material_ids: [string]                           │
│ assessment_id: string (关联question_queue)        │
│ status: 'pending'|'ready'|'completed'            │
│ created_at: string (ISO)                         │
└─────────────────────────────────────────────────┘
```

---

## 3. 数据流图（更新版）

### 3.1 测评数据流 — 两条分裂路径

```
路径A: startAssessment 同步
═══════════════════════════
  [题池查询] → questions[] 内嵌 → assessments.questions
                                              ↓
  getAssessment ← session.questions ✅ 正常读取
  submitAnswer  ← session.questions ✅ 正常判分


路径B: questionGenerator 异步队列
════════════════════════════════
  [AI生成] → question_ids[] 引用 → assessments.question_ids
                                              ↓
  getAssessment ← session.questions (空) 🔴 返回0题
  submitAnswer  ← session.questions (空) 🔴 无法判分
```

### 3.2 题目生成数据流

```
                    ┌─────────────────────────┐
                    │ question-normalizer.js   │
                    │ 统一归一化入口            │
                    └───────┬─────┬─────┬─────┘
                            │     │     │
              ✅ 使用normalizer  │     │ ❌ 未使用
                            │     │     │
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│questionGen   │  │generateAiQ   │  │scheduledTask │  │startAssess   │  │practice_v2   │
│  队列        │  │  单题        │  │  定时        │  │  同步AI      │  │  练习        │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │                 │
       ▼                 ▼                 ▼                 ▼                 ▼
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                        ai_question_pool                                          │
  │  格式混杂: string[] + {key,value}[] + schema_version 有/无                       │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 数据一致性矩阵（更新版）

### 4.1 跨集合引用完整性

| 源集合 | 字段 | → 目标集合 | 字段 | 风险 | 变更 |
|--------|------|-----------|------|------|------|
| assessments | `openid` | users | `openid` | openid无外键约束 | |
| assessments | `question_ids[]` | ai_question_pool | `_id` | 🔴 getAssessment不读取此字段 | 恶化 |
| assessments | `questions[]`内嵌 | (自身) | — | ⚠️ 与question_ids不同时存在 | |
| parent_assessments | `parent_openid` | users | `openid` | 无外键约束 | 🆕 |
| user_exams | `material_ids[]` | user_materials | `_id` | 材料可能被删除 | 🆕 |
| student_memory.weak_points | `kp_id` | knowledge_points | `kp_id` | kp_id可能不存在 | |
| kp_progress | `student_id` | student_memory | `student_id` | student_id=openid | |

### 4.2 同步性要求

| 场景 | 涉及集合 | 一致性要求 | 当前实现 | 变更 |
|------|---------|-----------|---------|------|
| 答题后更新 | assessments + ai_question_pool | 最终一致 | 同步更新 | |
| 练习后更新进度 | kp_progress + student_memory | 最终一致 | student_memory异步更新 ⚠️ | |
| 题目生成完成 | question_queue + ai_question_pool + assessments | 需要原子性 | workflow串行但无事务 ⚠️ | |
| 积分操作 | user_points + point_records | 需要原子性 | 分两步写 ⚠️ | |
| 知识点同步 | knowledge_points + 文件系统 | 最终一致 | 手动触发syncKnowledgePoints ⚠️ | 🆕 |

---

## 5. 已识别的数据架构问题（更新版）

| # | 问题 | 严重度 | 变更 |
|---|------|--------|------|
| DA-01 | Assessment双路径存储，消费方只读一条路径 | 🔴 | 恶化 |
| DA-02 | Question options格式仍3种(string[], {key,value}[], normalizer未全覆盖) | 🔴 | 持续 |
| DA-03 | correct_answer类型仍不一致(scheduledTask转String(number)而非字母) | 🔴 | 持续 |
| DA-04 | shared模块16份拷贝(部署约束) | 🟠 | 持续(设计约束) |
| DA-05 | `questions`集合近乎废弃但未清理 | 🟡 | 改善 |
| DA-06 | `question_generation_queue`集合已废弃但未清理 | 🟡 | 改善 |
| DA-07 | knowledge_points同步需手动触发 | 🟡 | 持续 |
| DA-08 | response-helper已创建但未使用 | 🟡 | 🆕 |
| DA-09 | schema_version附加但无消费者 | 🟡 | 🆕 |
| DA-10 | generateDailyTask冷启动硬编码kp_003 | 🟠 | 🆕 |
| DA-11 | 25个调试/修复云函数未归档 | 🟡 | 🆕 |
