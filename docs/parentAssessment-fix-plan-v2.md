# 亲子测评修复实施计划（最小变更版）

## 目标

用最小代码变更修复两个问题：
1. **问题1**：一年级测评出现高年级题目（勾股定理等）
2. **问题2**：题目重复（Fisher-Yates洗牌缺失）

---

## 【三原则审视】

1. **2/8原则**：仅需编辑2个文件，改动总计不超过50行代码
   - 问题1：直接修改内联 `difficultyGuidance` 对象
   - 问题2：复制5行现成代码

2. **第一性原理**：
   - 问题1根因：`generateAiQuestion/index.js:271-293` 包含高年级示例
   - 问题2根因：`parentAssessment/index.js:77` 注释与代码不符

3. **收益递减**：当前方案已足够，无需重构代码结构

---

## 问题1：修复提示词高年级示例

**位置**: `cloudfunctions/generateAiQuestion/index.js:271-293`

**当前代码**（第271-293行）：
```javascript
const difficultyGuidance = {
  easy: `【难度标准 - 简单】
- 直接套用公式或基本概念即可解答
- 单步推理，不需要复杂变换
- 数据简单，计算量小
- 选项中只有一个明显正确答案，干扰项较弱
- 示例题型：√16的值是？选项：["2", "4", "8", "16"]；直角三角形两直角边为3和4，斜边长为？选项：["5", "6", "7", "8"]`,

  medium: `【难度标准 - 中等】
- 需要对公式或概念进行适度变形或转换
- 需要2-3步推理才能得出答案
- 可能涉及多个知识点的综合应用
- 选项设计有一定迷惑性，需要仔细辨别
- 示例题型：√(a²)=|a|，当a<0时，√(a²)等于？选项：["a", "-a", "0", "±a"]；等边三角形边长为6，高为？选项：["3", "3√3", "6", "12"]`,

  hard: `【难度标准 - 困难】
- 需要多步推理，或涉及抽象概念理解
- 可能需要逆向思维或特殊情况分析
- 结果可能具有反直觉性，容易误判
- 选项高度相似，每个选项都有一定的合理性
- 可能涉及陷阱题型或边界条件
- 示例题型：判断下列关于二次根式的说法是否正确（多知识点综合）；需要分类讨论的复杂情况`
};
```

**修复方案**：移除高年级示例，保留难度描述

**修复后代码**：
```javascript
const difficultyGuidance = {
  easy: `【难度标准 - 简单】
- 直接套用公式或基本概念即可解答
- 单步推理，不需要复杂变换
- 数据简单，计算量小`,

  medium: `【难度标准 - 中等】
- 需要对公式或概念进行适度变形或转换
- 需要2-3步推理才能得出答案
- 可能涉及多个知识点的综合应用`,

  hard: `【难度标准 - 困难】
- 需要多步推理，或涉及抽象概念理解
- 可能需要逆向思维或特殊情况分析
- 选项高度相似，每个选项都有一定的合理性`
};
```

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 1.1 | 编辑 `generateAiQuestion/index.js` 第271-293行，移除示例题型部分 | `grep -A 3 "示例题型" cloudfunctions/generateAiQuestion/index.js` 应返回空 | 保留原文件备份 `cp cloudfunctions/generateAiQuestion/index.js cloudfunctions/generateAiQuestion/index.js.bak` |
| 1.2 | 重新部署 `generateAiQuestion` 云函数 | `tcb fn detail generateAiQuestion` 检查更新时间 | 恢复备份 `mv cloudfunctions/generateAiQuestion/index.js.bak cloudfunctions/generateAiQuestion/index.js` |
| 1.3 | 验证：调用generateAiQuestion生成题目，检查prompt内容 | 云函数日志中不应包含"勾股定理"、"二次根式"、"等边三角形" | 同上 |

---

## 问题2：添加 Fisher-Yates 洗牌

**位置**: `cloudfunctions/parentAssessment/index.js:77`

**当前状态**（第77行）：
```javascript
// Fisher-Yates 洗牌算法，真正随机
```

**问题**：注释存在但代码缺失，导致题目顺序固定、重复率高

**修复方案**：复制现成的 Fisher-Yates 实现（来自 `startAssessment/question_pool.js:55-60`）

**修复后代码**（第77-82行）：
```javascript
// Fisher-Yates 洗牌算法，真正随机
for (let i = allQuestions.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
}
```

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 2.1 | 在 `parentAssessment/index.js` 第77行后插入5行洗牌代码 | `sed -n '77,82p' cloudfunctions/parentAssessment/index.js` 应显示洗牌逻辑 | 保留原文件备份 `cp cloudfunctions/parentAssessment/index.js cloudfunctions/parentAssessment/index.js.bak` |
| 2.2 | 重新部署 `parentAssessment` 云函数 | `tcb fn detail parentAssessment` 检查更新时间 | 恢复备份 `mv cloudfunctions/parentAssessment/index.js.bak cloudfunctions/parentAssessment/index.js` |
| 2.3 | 验证：连续调用3次startParentAssessment，检查题目顺序 | 每次返回的题目顺序应不同 | 同上 |

---

## 依赖分析

### 被修改的文件

| 文件 | 风险级别 | 影响范围 | 回滚难度 |
|------|----------|----------|----------|
| `generateAiQuestion/index.js` | 低 | 仅影响prompt模板，不影响数据流 | 低（单文件） |
| `parentAssessment/index.js` | 低 | 仅影响题目排序，不影响题目内容 | 低（单文件） |

### 无依赖冲突
- 两文件独立，无相互依赖
- 修改不涉及共享模块
- 不影响其他云函数

---

## 预估工作量

| 任务 | 预计时间 | 验证时间 |
|------|----------|----------|
| 问题1修复 | 5分钟 | 5分钟（部署+日志检查） |
| 问题2修复 | 3分钟 | 5分钟（部署+功能测试） |
| 总计 | **8分钟** | **10分钟** |

---

## 完整验收命令

```bash
# 1. 问题1验证：检查prompt已清理
tcb logs generateAiQuestion --limit 10 | grep -E "勾股定理|二次根式|等边三角形"
# 预期：无输出

# 2. 问题2验证：检查洗牌代码存在
sed -n '77,82p' cloudfunctions/parentAssessment/index.js
# 预期：显示 for (let i = allQuestions.length - 1...

# 3. 完整流程测试（可选）
# 调用parentAssessment三次，对比题目顺序
```

---

## 回滚预案（应急）

```bash
# 恢复问题1
cp cloudfunctions/generateAiQuestion/index.js.bak cloudfunctions/generateAiQuestion/index.js
tcb fn deploy generateAiQuestion

# 恢复问题2
cp cloudfunctions/parentAssessment/index.js.bak cloudfunctions/parentAssessment/index.js
tcb fn deploy parentAssessment
```

---

## 成功标准

- [ ] `difficultyGuidance` 不再包含高年级示例
- [ ] Fisher-Yates 洗牌代码已插入正确位置
- [ ] 两个云函数部署成功
- [ ] 云函数日志验证通过
- [ ] 连续调用parentAssessment产生不同题目顺序
