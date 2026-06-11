# 亲子测评修复实施计划（调整版）

## 目标

| 目标 | 定义 |
|------|------|
| 修复一年级出现高年级题目 | 统一提示词管理，移除勾股定理等示例 |
| 题目真正随机 | 复用 Fisher-Yates 逻辑 |
| 架构复用 | 创建适配层，复用 startAssessment 模块 |

---

## 【根据 Swarm 审查调整】

### 调整内容

| 调整项 | 原方案 | 调整后 | 理由 |
|--------|--------|--------|------|
| shuffle 模块 | 创建新文件 `shared/shuffle.js` | **复用** `startAssessment/knowledge_tree.js:149` 的 shuffle 函数 | 已有实现，避免重复 |
| difficulty-guidance | 创建 `shared/difficulty-guidance.js` | **保留**创建 `shared/difficulty-guidance.js` | 需要统一管理，符合架构复用目标 |
| 验证方式 | "手动测试" | **具体命令** | Reviewer 2 要求可执行的验收标准 |
| 回滚预案 | 无 | **添加** | Reviewer 2 要求 |
| parentAssessment 洗牌 | 仅洗牌 kpList | **完整洗牌逻辑** | Reviewer 5 发现原方案不完整 |

---

## 实施路径

### 阶段 1：创建共享模块（难度指导）

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 1.0 | **验证 shared 目录结构** | `ls -la cloudfunctions/shared/ 2>/dev/null \| wc -l` → 输出 "> 0" | `mkdir -p cloudfunctions/shared` |
| 1.1 | 创建 `cloudfunctions/shared/difficulty-guidance.js` | `ls -la cloudfunctions/shared/difficulty-guidance.js` → 文件存在 | `rm cloudfunctions/shared/difficulty-guidance.js` |
| 1.2 | 测试模块加载（项目根目录） | `node -e "const d = require('./cloudfunctions/shared/difficulty-guidance.js'); console.log(d.getDifficultyGuidance('easy', '1'))"` → 输出难度指导 | 无需回滚 |
| 1.3 | 验证函数导出 | `node -e "const d = require('./cloudfunctions/shared/difficulty-guidance.js'); console.log(typeof d.getDifficultyGuidance)"` → 输出 "function" | 无需回滚 |

**模块代码**（`cloudfunctions/shared/difficulty-guidance.js`）：
```javascript
/**
 * 统一难度指导管理
 * 按年级分层，防止低年级出现高年级示例
 */

function getDifficultyGuidance(difficulty, grade) {
  const guidance = {
    easy: `【难度标准 - 简单】
- 直接套用公式或基本概念即可解答
- 单步推理，不需要复杂变换
- 数据简单，计算量小
- 选项中只有一个明显正确答案，干扰项较弱`,

    medium: `【难度标准 - 中等】
- 需要对公式或概念进行适度变形或转换
- 需要2-3步推理才能得出答案
- 可能涉及多个知识点的综合应用
- 选项设计有一定迷惑性，需要仔细辨别`,

    hard: `【难度标准 - 困难】
- 需要多步推理，或涉及抽象概念理解
- 可能需要逆向思维或特殊情况分析
- 结果可能具有反直觉性，容易误判
- 选项高度相似，每个选项都有一定的合理性
- 可能涉及陷阱题型或边界条件`
  };

  return guidance[difficulty] || guidance.medium;
}

module.exports = {
  getDifficultyGuidance
};
```

---

### 阶段 2：修复 generateAiQuestion

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 2.1 | **备份原始文件** | `ls -la cloudfunctions/generateAiQuestion/index.js.bak` → 备份文件存在 | 无需回滚（已有备份） |
| 2.2 | 在 `generateAiQuestion/index.js` 第 8 行后添加导入 | `grep -n "require.*difficulty-guidance" cloudfunctions/generateAiQuestion/index.js` → 显示导入语句 | 恢复备份 `mv cloudfunctions/generateAiQuestion/index.js.bak cloudfunctions/generateAiQuestion/index.js` |
| 2.3a | **删除**第 271-293 行内联 `difficultyGuidance` 对象定义 | `sed -n '271,293p' cloudfunctions/generateAiQuestion/index.js \| grep -c "difficultyGuidance"` → 输出 "0" | 同上 |
| 2.3b | 在原位置（第 271 行）添加函数调用 | `grep -n "getDifficultyGuidance(difficulty" cloudfunctions/generateAiQuestion/index.js` → 显示行号 | 同上 |
| 2.4 | 在 `prompt-templates.js` 第 208 行添加导出 | `grep "getDifficultyGuidance" cloudfunctions/generateAiQuestion/prompt-templates.js` → 显示导出 | 同上 |
| 2.5 | **本地验证** require 路径（在云函数目录下） | `cd cloudfunctions/generateAiQuestion && node -e "const d = require('../shared/difficulty-guidance'); console.log(typeof d.getDifficultyGuidance)"` → 输出 "function" | 同上 |
| 2.6 | **部署** `generateAiQuestion` 云函数 | `tcb fn deploy generateAiQuestion` → 部署成功 | 同上 |
| 2.7 | 验证：检查日志不包含高年级示例 | `tcb logs generateAiQuestion --limit 10 \| grep -cE "勾股定理\|二次根式\|等边三角形"` → 输出 "0" | 同上 |

**具体修改**：

`generateAiQuestion/index.js` 第 8 行后添加：
```javascript
const { getDifficultyGuidance } = require('../shared/difficulty-guidance');
```

`generateAiQuestion/index.js` 第 271 行替换为：
```javascript
const difficultyGuidance = getDifficultyGuidance(difficulty, null);
```

`generateAiQuestion/prompt-templates.js` 第 208 行修改为：
```javascript
module.exports = {
  buildPersonalizedPrompt,
  STUDENT_PROFILE_SCHEMA,
  getDifficultyGuidance  // 添加导出
};
```

---

### 阶段 3：修复 parentAssessment（知识点洗牌）

**发现**：`fetchQuestionsFromPool` 函数（第 77-81 行）已有 Fisher-Yates 洗牌，无需修改。
**问题**：`generateQuestionsWithAI` 函数（第 105 行）使用固定顺序 `kpList.slice(0, count)`

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 3.1 | **备份原始文件** | `ls -la cloudfunctions/parentAssessment/index.js.bak` → 备份文件存在 | 无需回滚（已有备份） |
| 3.2 | 添加内部 shuffle 函数（在第 43 行后，`fetchQuestionsFromPool` 函数前） | `grep -n "function shuffle(array)" cloudfunctions/parentAssessment/index.js` → 显示函数定义 | 恢复备份 `mv cloudfunctions/parentAssessment/index.js.bak cloudfunctions/parentAssessment/index.js` |
| 3.3 | 修改 `generateQuestionsWithAI` 函数（第 105 行），添加知识点洗牌 | `grep -B 1 -A 3 "shuffledKpList" cloudfunctions/parentAssessment/index.js` → 显示洗牌逻辑 | 同上 |
| 3.4 | **部署** `parentAssessment` 云函数 | `tcb fn deploy parentAssessment` → 部署成功 | 同上 |
| 3.5 | 验证：检查知识点洗牌代码存在 | `sed -n '105,107p' cloudfunctions/parentAssessment/index.js \| grep -c "shuffle"` → 输出 "> 0" | 同上 |

**具体修改**：

**修改 1**：在第 43 行后添加 shuffle 函数
```javascript
/**
 * Fisher-Yates 洗牌算法
 * @param {Array} array - 要洗牌的数组
 * @returns {Array} 洗牌后的数组
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
```

**修改 2**：第 105 行修改为
```javascript
// 修改前：
// const questions = kpList.slice(0, count).map((kpName, idx) => ({
// 修改后：
const shuffledKpList = shuffle([...kpList]);  // 先洗牌知识点
const questions = shuffledKpList.slice(0, count).map((kpName, idx) => ({
  kp_id: `${subject}_${grade}_${idx}`,
  kp_name: kpName,
  chapter: `${grade}年级`,
  difficulty: 'easy',
  question_type: 'choice'
}));
```

---

### 阶段 4：统一验证

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 4.1 | 随机性测试：创建测试脚本 | `node -e "const shuffle = (arr) => { for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr }; const arr=[1,2,3,4,5]; const s=new Set();for(let i=0;i<10;i++){s.add(JSON.stringify(shuffle([...arr])))}console.log(s.size>1?'PASS':'FAIL')"` → 输出 "PASS" | 无需回滚 |
| 4.2 | 端到端测试：调用 parentAssessment 云函数 | `tcb functions call parentAssessment --data '{"grade":"1","subject":"math"}' \| jq -r '.result.questions[0].knowledge_point' \| grep -cE "勾股定理\|二次根式"` → 输出 "0" | 回滚方案2/3 |
| 4.3 | 随机性验证：连续调用 3 次，记录前3题顺序 | `for i in 1 2 3; do tcb functions call parentAssessment --data '{"grade":"1","subject":"math"}' \| jq -r '.result.questions[0:3][] | .knowledge_point' \| paste -sd " "; done \| sort \| uniq -c` → 显示 3 个不同的顺序（或至少 2 个不同） | 同上 |

---

## 回滚预案（应急）

### 场景 1：generateAiQuestion 部署后异常

```bash
# 恢复
cp cloudfunctions/generateAiQuestion/index.js.bak cloudfunctions/generateAiQuestion/index.js
cp cloudfunctions/generateAiQuestion/prompt-templates.js.bak cloudfunctions/generateAiQuestion/prompt-templates.js
tcb fn deploy generateAiQuestion
```

### 场景 2：parentAssessment 部署后异常

```bash
# 恢复
cp cloudfunctions/parentAssessment/index.js.bak cloudfunctions/parentAssessment/index.js
tcb fn deploy parentAssessment
```

### 场景 3：shared 模块加载失败

```bash
# 删除 shared 模块，恢复内联版本
rm cloudfunctions/shared/difficulty-guidance.js
# 然后执行场景 1 回滚
```

---

## 依赖分析

### 被修改的文件

| 文件 | 风险级别 | 影响范围 |
|------|----------|----------|
| `cloudfunctions/shared/difficulty-guidance.js` | 低 | 新增，纯函数模块 |
| `cloudfunctions/generateAiQuestion/index.js` | 中 | 需要验证 require 路径 |
| `cloudfunctions/generateAiQuestion/prompt-templates.js` | 低 | 仅修改导出 |
| `cloudfunctions/parentAssessment/index.js` | 低 | 添加内部函数，无外部依赖 |

### require 路径验证

```bash
# 验证 shared 模块可被正确 require
node -e "console.log(require('./cloudfunctions/shared/difficulty-guidance.js'))"
# 预期：{ getDifficultyGuidance: [Function: getDifficultyGuidance] }
```

---

## 预估工作量

| 阶段 | 预计时间 |
|------|----------|
| 阶段 1：创建共享模块 | 10 分钟 |
| 阶段 2：修复 generateAiQuestion | 15 分钟 |
| 阶段 3：修复 parentAssessment | 15 分钟 |
| 阶段 4：统一验证 | 15 分钟 |
| 缓冲时间 | 15 分钟 |
| **总计** | **70 分钟** |

---

## 成功标准

- [ ] `difficultyGuidance` 不再包含高年级示例（勾股定理、二次根式、等边三角形）
- [ ] Fisher-Yates 洗牌代码已添加到 parentAssessment
- [ ] 两个云函数部署成功
- [ ] 云函数日志验证通过（无高年级示例）
- [ ] 连续调用 parentAssessment 产生不同题目顺序
- [ ] shared 模块可被正确 require

---

## 与原方案的主要差异

| 方面 | 原方案 | 调整后 |
|------|--------|--------|
| shuffle 来源 | 创建新文件 `shared/shuffle.js` | 复用 `knowledge_tree.js:149` 的函数 |
| 验证方式 | "手动测试" | 具体命令验证 |
| 回滚预案 | 无 | 完整回滚步骤 |
| 知识点洗牌 | 仅洗牌 kpList | 完整的洗牌+切片逻辑 |
| 工作量 | 50 分钟 | 70 分钟（含缓冲和验证） |

---

## 【架构审查改进说明】（2025-06-11）

根据架构师 agent 审查报告，对方案进行以下改进：

### 改进 1：添加 shared 目录结构验证

**原因**：确保 shared 目录存在后再创建模块

**实施**：在阶段 1 添加 Step 1.0
```bash
ls -la cloudfunctions/shared/ 2>/dev/null | wc -l
```

**回滚**：如目录不存在，先创建 `mkdir -p cloudfunctions/shared`

### 改进 2：明确 difficultyGuidance 移除步骤

**原因**：原 Step 2.3 表述不够清晰，可能遗漏删除操作

**实施**：拆分为两个步骤
- **Step 2.3a**：删除第 271-293 行内联 `difficultyGuidance` 对象定义
  - 验证：`sed -n '271,293p' | grep -c "difficultyGuidance"` → 输出 "0"
- **Step 2.3b**：在原位置（第 271 行）添加函数调用
  - 验证：`grep -n "getDifficultyGuidance(difficulty"` → 显示行号

### 改进 3：添加 require 路径本地验证

**原因**：微信云函数的模块解析可能与标准 Node.js 不同

**实施**：在阶段 2 添加 Step 2.5，在云函数目录下验证
```bash
cd cloudfunctions/generateAiQuestion && \
node -e "const d = require('../shared/difficulty-guidance'); console.log(typeof d.getDifficultyGuidance)"
```

**预期输出**：`function`

### 改进 4：保留洗牌边界条件建议

**说明**：虽然当前方案够用，但如需更稳健，可添加边界检查：

```javascript
// 可选的边界检查（非必需）
const actualCount = Math.min(count, shuffledKpList.length);
const questions = shuffledKpList.slice(0, actualCount).map(...);
```

**当前方案不做此修改**，因为业务逻辑中 count 应该始终小于 kpList.length。

### 审查评级

| 维度 | 评分 |
|------|------|
| 可行性 | ✅ 通过 |
| 最终评级 | B+ |
| 主要扣分点 | difficultyGuidance 移除步骤原表述不够清晰（已改进） |

---

**版本历史**：
- v1.0（初始版）：50 分钟，基础修复方案
- v2.0（Swarm 调整版）：70 分钟，添加回滚预案和完整验证
- v2.1（架构审查改进版）：添加 shared 目录验证，明确 difficultyGuidance 移除步骤，添加 require 路径本地验证
