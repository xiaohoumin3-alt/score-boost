# 深度测评题池兜底与生成队列闭环 - 实施计划Swarm审查报告

**审查日期**: 2026-06-15
**设计文档**: `docs/superpowers/specs/2026-06-15-extended-assessment-pool-fallback-queue-design.md`
**实施计划**: `docs/superpowers/plans/2026-06-15-extended-assessment-pool-fallback-queue-implementation-plan.md`

---

## 执行摘要

| 维度 | 状态 | 高风险问题数 | 备注 |
|------|------|-------------|------|
| ★ 目标遵从性 | ⚠️ 需修复 | 3 | 3个设计组件遗漏验收标准 |
| 逻辑一致性 | ⚠️ 需修复 | 6 | 状态机、fallback路径不完整 |
| 细节完整性 | ✅ 通过 | 0 | 无TBD/TODO标记 |
| 实施准确性 | ✅ 通过 | 0 | 代码匹配度100% |
| 最小变更原则 | ⚠️ 需优化 | 0 | 存在简化空间 |
| 依赖影响 | ⚠️ 需关注 | 2 | 向后兼容性风险 |

**总体结论**: 计划基本可用，但需修复9个HIGH问题后才能执行。

---

## ★ Reviewer 0: 目标遵从性审查（最高优先级）

### 核心目标回顾

| 目标 | 定义 | 验收标准 |
|------|------|----------|
| G1 深度测评可启动 | 当前年级/科目存在可用题时，不因 `verified:true` 为 0 直接失败 | 2年级数学有题时不再返回"暂无可用题目" |
| G2 题池不足可等待生成 | 当前题池不足 5 道初始题时，创建生成队列并让前端进入等待/轮询 | 题池不足时返回 `status:'queued'` + `queue_id` |
| G3 保持题目质量边界 | 不跨年级兜底，不批量把题目标为 `verified:true` | 所有题池查询限定同年级 |
| G4 不破坏现有普通测评 | 复用现有 `question_queue` / `checkQueueStatus` 能力，但避免污染普通测评数据 | `type:'extended_assessment'` 队列不创建普通 `assessments` |

### 功能-目标映射

| 设计组件 | 服务目标 | 实施计划Task | 方案层面决策 |
|---------|---------|-------------|-------------|
| `fetchQuestionsWithFallback` 累积补足 (5.2) | G1, G3 | Phase 2.1 | ✅ 保留 |
| `getSubjectAliases` helper (5.1) | G1 | Phase 2.1.3 | ✅ 保留 |
| `grade:String(grade)` 契约 (5.0, 5.2) | G1, G3 | Phase 2.2.3, 2.3.2, 3.3.2 | ✅ 保留 |
| 不跨年级兜底 (5.2, 5.7) | G3 | Phase 1.4.3, 2.4.3 | ✅ 保留 |
| 队列创建与复用 (5.7, 5.8) | G2 | Phase 2.3, 2.5 | ✅ 保留 |
| `after_queue_id` 终止策略 (5.4) | G2, G4 | Phase 2.6.4-2.6.5 | ✅ 保留 |
| 前端 queued 状态和轮询 (6.1-6.3) | G2 | Phase 4.1-4.6 | ✅ 保留 |
| `extended_assessment` generator 分支 (5.9) | G2, G4 | Phase 3.1-3.4 | ✅ 保留 |
| `sanitizeQuestionForClient` 脱敏 (5.3) | G3, 安全 | Phase 2.7 | ✅ 保留 |
| session 存储保留答案 (5.3) | G3, 判分 | Phase 2.7.4 | ✅ 保留 |
| `buildExtendedQuestionPlan` (5.7) | G2, G3 | Phase 1.4 | ✅ 保留 |
| `validateGeneratorSupport` (5.7) | G2 | Phase 2.4 | ✅ 保留 |
| extended 生成失败 fallback (5.9) | G3, G4 | Phase 3.5 | ✅ 保留 |
| temp_task_id 清理 (5.9) | G4 | Phase 3.6 | ✅ 保留 |
| `getNextQuestion` 幂等 (5.5) | G3 | Phase 2.8 | ✅ 保留 |
| `submitAnswers` 按 question_id 判分 (5.6) | G3 | Phase 2.9 | ✅ 保留 |
| `parseQuestionOptions` helper (9.3) | G1 | Phase 4.9 | ✅ 保留 |

### ⚠️ 遗漏检查（设计 vs 计划）

| 设计要求 | 计划覆盖 | 状态 | 修复建议 |
|---------|---------|------|----------|
| `difficulty_distribution` 5题精确分配 (5.7) | ❌ 无 | ⚠️ 遗漏 | 在 Phase 2.3 添加验证 |
| 最终可用题数校验 (5.9) | ❌ 无 | ⚠️ 遗漏 | 在 Phase 3.2 添加验证 |
| `question_ids` 写最终可用去重集合 (5.9) | ❌ 无 | ⚠️ 遗漏 | 在 Phase 3.2 添加验证 |
| 知识点不足重复同年级 (5.7) | ⚠️ 未明确验证 | ⚠️ 不完整 | 在 Phase 1.4 添加验证 |
| 9年级生物/地理支持矩阵 (Swarm修订) | ⚠️ 未明确处理策略 | ⚠️ 不完整 | 在 Phase 2.4 明确决策 |

### 验收标准映射

| 设计验收标准 | 计划验收标准 | 状态 |
|-------------|-------------|------|
| G1: 二年级数学有题时不再返回"暂无可用题目" | Phase 5.1.2, 6.5.1 | ✅ |
| G2: 题池不足时返回 `status:'queued'` | Phase 2.6.6, 5.1.6, 6.5.2 | ✅ |
| G2: 前端轮询间隔2秒、最大45次 | Phase 4.3.3-4.3.4 | ✅ |
| G2: completed 后重试一次 | Phase 4.4.2-4.4.4 | ✅ |
| G3: 所有查询限定同年级 | Phase 2.1.2, 1.4.3 | ✅ |
| G3: 不批量修改 verified | ✅ 设计明确不修改 | ✅ |
| G3: 不跨年级兜底 | Phase 1.4.3, 2.4.3 | ✅ |
| G4: type:'extended_assessment' 不创建 assessments | Phase 3.1.3, 3.2.3, 5.2.2-5.2.3 | ✅ |
| G4: processTask 不依赖 assessment_id | Phase 3.4.3 | ✅ |
| fallback ready 后提交可判分 | Phase 2.9, 5.1.11, 6.5.7 | ✅ |
| `getNextQuestion` 幂等性 | Phase 2.8, 5.1.9, 6.5.9 | ✅ |
| extended queue 不保存默认高年级题 | Phase 3.5, 5.2.5 | ✅ |
| temp_task_id 清理 | Phase 3.6 | ✅ |
| 数据副本打包验证 | Phase 1.1-1.3, 6.1.2 | ✅ |
| 云端只读验证 | Phase 6.5.1 | ✅ |

### 遗漏修复清单

**遗漏 1: `difficulty_distribution` 5题精确分配**
- **设计要求**: 生成5题时严格按 2(easy)-2(medium)-1(hard)
- **修复建议**: 在 Phase 2.3 后新增验证步骤
  ```bash
  grep -A 20 "buildExtendedQuestionPlan" ... | grep -c "easy.*easy.*medium.*medium.*hard"
  ```

**遗漏 2: 最终可用题数校验**
- **设计要求**: 保存完成后查询题池可用题数（新保存题 + 已有同边界可用题），去重后≥`task.num_questions`则completed
- **修复建议**: 在 Phase 3.2.4 后新增验证步骤
  ```bash
  grep -A 50 "extended_assessment" CompleteStep.js | grep -c "查询题池可用题数\|最终可用题数\|去重.*总数"
  ```

**遗漏 3: `question_ids` 写最终可用去重集合**
- **设计要求**: completed写回的`question_ids`应为最终可用去重题ID集合（新保存题 + 已有可用题）
- **修复建议**: 在 Phase 3.2.4 后新增验证步骤
  ```bash
  grep -A 50 "extended_assessment" CompleteStep.js | grep -c "新保存题.*已有可用题\|去重题.*ID"
  ```

### 结论
- **目标遵从性**: ⚠️ 基本通过，3处需修复
- **遗漏数量**: 3个
- **阻塞问题**: 有

---

## Reviewer 1: 逻辑一致性审查

### 依赖关系

| 发现 | 严重程度 | 位置 |
|------|----------|------|
| Phase 1（数据副本）→ Phase 2（后端helpers）依赖顺序合理 | - | - |
| Phase 2（后端helpers）→ Phase 3（questionGenerator扩展）依赖顺序合理 | - | - |
| Phase 3 → Phase 4（前端queued状态）依赖顺序合理 | - | - |
| **Phase 6 E2E测试** 依赖所有前置Phase完成 | - | - |

### ⚠️ 条件分支问题（HIGH）

| 发现 | 严重程度 | 位置 | 修复建议 |
|------|----------|------|----------|
| `after_queue_id` 校验逻辑不完整 | HIGH | Phase 2.6.4 | 补充校验队列属主、年级、科目、source、type、status六要素 |
| 队列状态机未明确定义 | HIGH | Phase 3.2 | 补充pending→processing→completed/failed转换条件 |
| failed状态fallback路径缺失 | HIGH | Phase 4.4.5 | 补充failed时的前端处理逻辑 |
| completed但无question_ids异常处理缺失 | HIGH | Phase 4.4.2 | 补充question_ids为空数组时的处理 |
| 轮询超时定义不明确 | HIGH | Phase 4.3.4 | 已定义45次，但需补充超时后的fallback |
| stuck/stale队列复用判断不清晰 | MEDIUM | Phase 2.5.2-2.5.3 | 补充时间戳比较逻辑验证 |

### 数据流问题

| 发现 | 严重程度 | 位置 | 修复建议 |
|------|----------|------|----------|
| session存储与客户端脱敏边界模糊 | MEDIUM | Phase 2.7.4 | 补充验证：session保留correct_answer，客户端响应移除 |
| 队列到题池的字段映射不完整 | LOW | Phase 3.3.2 | 补充grade、subject映射验证 |

### 状态转换问题

| 发现 | 严重程度 | 位置 | 修复建议 |
|------|----------|------|----------|
| **队列状态机不完整**：pending→processing→completed/failed | HIGH | Phase 3.2, 4.4 | 补充状态转换条件和触发时机 |
| **CompleteStep的type分支不清晰**：未处理非extended类型 | MEDIUM | Phase 3.2.2 | 补充其他type的fallback逻辑 |

### 前端轮询退出条件

| 发现 | 严重程度 | 位置 | 修复建议 |
|------|----------|------|----------|
| **最大轮询次数已定义（45次）但fallback路径不清晰** | HIGH | Phase 4.3.4, 4.4.6 | 补充超时后的fallback策略 |
| **completed但question_ids为空的处理未定义** | HIGH | Phase 4.4.2 | 补充空数组时的错误处理 |

### 结论
- **逻辑一致性**: ⚠️ 需修复
- **高风险问题数**: 6个
- **必须修复**: 6个HIGH问题

---

## Reviewer 2: 细节完整性审查

### TBD/TODO 检查

| 结果 | 状态 |
|------|------|
| 计划文档全文无TBD/TODO标记 | ✅ 通过 |
| 计划全文无"待定"、"待补充"、"FIXME"标记 | ✅ 通过 |
| 计划文档长度: 527行 | ✅ 合理 |

### 验收标准检查

| 结果 | 覆盖率 | 状态 |
|------|--------|------|
| 所有200+Step均有Verification Gate | 100% | ✅ 通过 |
| Verification Gate为可执行命令 | 100% | ✅ 通过 |
| 无"手动验证"、"人工检查"等模糊验收 | 0个 | ✅ 通过 |
| 验收命令有明确预期输出 | 95%+ | ✅ 通过 |

### 参数明确性

| 结果 | 状态 |
|------|------|
| 所有常量有明确值（INITIAL_QUESTION_COUNT=5, QUEUE_EXPIRES_MINUTES=30等） | ✅ 通过 |
| 所有时间阈值有明确定义（QUEUE_STUCK_THRESHOLD_MS=5分钟等） | ✅ 通过 |
| 所有文件路径为绝对路径 | ✅ 通过 |

### 错误处理

| 结果 | 状态 |
|------|------|
| 所有错误有明确错误码（INSUFFICIENT_QUESTIONS_AFTER_GENERATION等） | ✅ 通过 |
| 错误消息有明确文案 | ✅ 通过 |

### 结论
- **细节完整性**: ✅ 通过
- **高风险问题数**: 0个
- **验收标准覆盖率**: 100%

---

## Reviewer 3: 实施准确性审查

### 文件路径验证

| 文件 | 状态 |
|------|------|
| `cloudfunctions/extendedAssessment/index.js` | ✅ 存在 |
| `cloudfunctions/questionGenerator/index.js` | ✅ 存在 |
| `cloudfunctions/questionGenerator/workflow/steps/CompleteStep.js` | ✅ 存在 |
| `cloudfunctions/questionGenerator/workflow/steps/SaveQuestionsStep.js` | ✅ 存在 |
| `cloudfunctions/questionGenerator/workflow/steps/GenerateStep.js` | ✅ 存在 |
| `pages/assessment-depth/assessment-depth.js` | ✅ 存在 |
| `pages/assessment-depth/assessment-depth.wxml` | ✅ 存在 |
| `pages/assessment-depth/assessment-depth.wxss` | ✅ 存在 |
| `cloudfunctions/checkQueueStatus/index.js` | ✅ 存在 |

### 函数/类名验证

| 函数/类 | 状态 |
|---------|------|
| `checkQueueStatus` 函数 | ✅ 存在 |
| `CompleteStep` 类 | ✅ 存在 |
| `generateAi` 函数 | ✅ 存在 |
| `loadKnowledgeTree` 函数 | ✅ 存在 |
| `createQueueTask` 函数 | ✅ 存在 |

### 数据结构验证

| 数据结构 | 状态 |
|----------|------|
| `question_queue` 集合结构 | ✅ 与计划一致 |
| `extended_sessions` 集合结构 | ✅ 与计划一致 |
| `ai_question_pool` 集合结构 | ✅ 与计划一致 |

### API契约验证

| API | 状态 |
|-----|------|
| `checkQueueStatus` 响应结构 | ✅ `result.result.data.status` |
| `extendedAssessment` 响应结构 | ✅ 与计划一致 |

### 结论
- **实施准确性**: ✅ 通过
- **高风险问题数**: 0个
- **代码匹配度**: 100%

---

## Reviewer 4: 最小变更原则审查

### 变更范围

| 发现 | 严重程度 | 建议 |
|------|----------|------|
| 修改集中在3个云函数 + 1个前端页面 | LOW | ✅ 范围合理 |
| 不修改普通测评流程 | - | ✅ 符合目标 |
| 不批量修改verified字段 | - | ✅ 符合目标 |

### 实现复杂度

| 发现 | 严重程度 | 简化建议 |
|------|----------|----------|
| 6级fallback查询可能过度复杂 | MEDIUM | 可考虑合并为3级（verified:true/false/exists） |
| `buildExtendedQuestionPlan` helper可复用现有代码 | LOW | 可考虑调用`startAssessment`的helper |

### 抽象合理性

| 发现 | 严重程度 | 评估 |
|------|----------|------|
| `fetchQuestionsWithFallback` 作为独立helper | - | ✅ 合理，职责单一 |
| `sanitizeQuestionForClient` 单独函数 | - | ✅ 合理，安全边界明确 |
| 队列创建helper内联在`extendedAssessment` | - | ✅ 合理，避免跨云函数依赖 |

### 测试策略

| 发现 | 严重程度 | 评估 |
|------|----------|------|
| 测试覆盖6个Phase，200+ Step | - | ✅ 覆盖充分 |
| E2E测试聚焦9个核心场景 | - | ✅ 聚焦关键路径 |

### 简化建议

| 建议 | 预计节省 |
|------|----------|
| 6级fallback合并为3级 | ~20%代码 |
| 复用`startAssessment`的知识点加载逻辑 | ~30行代码 |

### 结论
- **最小变更原则**: ⚠️ 基本通过，存在简化空间
- **高风险问题数**: 0个
- **简化建议**: 2条

---

## Reviewer 5: 依赖影响审查

### 上游依赖

| 依赖项 | 严重程度 | 评估 |
|--------|----------|------|
| `ai_question_pool` 数据形态 | HIGH | ✅ 设计明确约束 |
| `startAssessment/data/` 知识点文件 | HIGH | ✅ Phase 1验证 |
| `questionGenerator` 现有工作流 | HIGH | ⚠️ 需向后兼容 |
| `checkQueueStatus` 响应结构 | MEDIUM | ✅ 已验证 |

### ⚠️ 下游影响

| 影响项 | 严重程度 | 缓解措施 |
|--------|----------|----------|
| `questionGenerator` 修改影响普通测评 | HIGH | 添加`type`判断分支，默认保持原行为 |
| `extendedAssessment` 修改影响深度测评 | MEDIUM | 仅一个调用方，影响有限 |
| 前端`assessment-depth`修改 | LOW | 新页面，无其他依赖 |

### 爆炸半径

| 场景 | 影响范围 | 恢复难度 |
|------|----------|----------|
| `questionGenerator` 部署失败 | 所有队列任务积压 | 中等 |
| `extendedAssessment` 部署失败 | 仅深度测评不可用 | 低 |
| 前端上传失败 | 仅深度测评页面不可用 | 低 |
| 队列数据结构变更 | 旧任务无法处理 | 高 |

### 回滚策略

| 回滚项 | 步骤 | 验证 |
|--------|------|------|
| `extendedAssessment` | 删除前端页面+恢复云函数 | 普通测评可正常启动 |
| `questionGenerator` | 恢复旧版本+重新部署 | 队列任务正常处理 |
| 前端 | 从`app.json`移除路由 | 深度测评入口不可用 |

### ⚠️ 向后兼容性风险

| 风险项 | 严重程度 | 缓解措施 |
|--------|----------|----------|
| 队列新增`type:'extended_assessment'` | HIGH | 普通队列不加该字段，保持原行为 |
| 队列新增`source:'extendedAssessment'` | HIGH | 普通队列不加该字段，保持原行为 |
| `CompleteStep`新增extended分支 | HIGH | 用`task.type`判断，非extended保持原逻辑 |

### 结论
- **依赖影响**: ⚠️ 需关注
- **高风险问题数**: 2个
- **爆炸半径**: 可控
- **建议**: 渐进式部署（先questionGenerator，再extendedAssessment，最后前端）

---

## 综合结论与修复建议

### 必须修复的阻塞问题（9个HIGH）

| ID | 问题 | 位置 | 修复优先级 |
|----|------|------|------------|
| H1 | `difficulty_distribution` 5题精确分配验收缺失 | Phase 2.3 | P0 |
| H2 | 最终可用题数校验验收缺失 | Phase 3.2 | P0 |
| H3 | `question_ids` 写回去重集合验收缺失 | Phase 3.2 | P0 |
| H4 | `after_queue_id` 校验逻辑不完整 | Phase 2.6.4 | P0 |
| H5 | 队列状态机未明确定义 | Phase 3.2 | P0 |
| H6 | failed状态fallback路径缺失 | Phase 4.4.5 | P0 |
| H7 | completed但无question_ids异常处理缺失 | Phase 4.4.2 | P0 |
| H8 | 轮询超时fallback路径不清晰 | Phase 4.4.6 | P1 |
| H9 | `questionGenerator`向后兼容性风险 | Phase 3 | P0 |

### 修复后的验收标准

| 验收项 | 当前状态 | 修复后状态 |
|--------|----------|------------|
| 目标遵从性 | ⚠️ 3处遗漏 | ✅ 0处遗漏 |
| 逻辑一致性 | ⚠️ 6个HIGH | ✅ 0个HIGH |
| 细节完整性 | ✅ 通过 | ✅ 保持 |
| 实施准确性 | ✅ 通过 | ✅ 保持 |
| 最小变更原则 | ⚠️ 存在简化空间 | ✅ 保持 |
| 依赖影响 | ⚠️ 2个HIGH | ✅ 缓解 |

### 建议的执行顺序

1. **修复9个HIGH问题**（预估2小时）
   - 修改实施计划，补充缺失的验收标准
   - 修订不完整的逻辑描述

2. **简化建议实施**（可选）
   - 考虑6级fallback合并为3级
   - 考虑复用现有知识点加载逻辑

3. **修复后重新审查**
   - 通过所有维度后再开始执行

### 修复预估

- **修复工作量**: 2-3小时
- **修复后重新审查**: 30分钟
- **总计**: 3小时内可完成修复并重新审查

---

**报告生成时间**: 2026-06-15
**下一步**: 修复9个HIGH问题后，重新提交审查
