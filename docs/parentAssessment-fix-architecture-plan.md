# 亲子测评修复架构方案

## 目标

| 目标 | 定义 |
|------|------|
| 修复一年级出现高年级题目 | 统一提示词管理，移除勾股定理等示例 |
| 题目真正随机 | 复用 Fisher-Yates 逻辑 |
| **架构复用** | 创建适配层，复用 startAssessment 模块 |

---

## 【三原则审视】

### 1. 2/8原则
**核心20%**：
- 统一难度指导管理（移除高年级示例）
- 复用 Fisher-Yates 洗牌逻辑
- 创建共享模块适配层

**不做80%**：
- 不重构整个 LLM 调用链
- 不修改现有数据库结构
- 不改变 parentAssessment 的业务逻辑

### 2. 第一性原理
**根本问题**：
1. **题目难度错配**：generateAiQuestion 有两处难度指导定义（index.js 内联 + prompt-templates.js 纯净版本），内联版本包含高年级示例
2. **题目重复**：parentAssessment 知识点选择顺序固定
3. **架构孤立**：三个云函数各自实现相同功能（随机、难度指导），没有共享模块

**解决方案核心**：创建共享模块，统一管理

---

## 架构设计方案

```
cloudfunctions/
├── shared/
│   ├── llm-core/           # 已有：LLM 客户端
│   ├── difficulty-guidance.js   # 【新增】统一难度指导管理
│   ├── shuffle.js               # 【新增】Fisher-Yates 洗牌算法
│   └── question-normalizer.js   # 已有：题目格式化
├── generateAiQuestion/
│   ├── index.js                  # 修改：移除内联 difficultyGuidance
│   └── prompt-templates.js      # 修改：导出并使用共享模块
├── startAssessment/
│   ├── knowledge_tree.js         # 已有 shuffle 函数
│   └── question_pool.js          # 已有 Fisher-Yates 实现
└── parentAssessment/
    └── index.js                  # 修改：使用共享 shuffle + 知识点洗牌
```

---

## 核心修改

### 1. 创建 `cloudfunctions/shared/difficulty-guidance.js`

```javascript
/**
 * 统一难度指导管理
 * 按年级分层，防止低年级出现高年级示例
 */

/**
 * 获取难度指导（纯净版本，不含高年级示例）
 * @param {string} difficulty - easy | medium | hard
 * @param {string} grade - 年级（1-9），用于验证示例适配性
 * @returns {string} 难度指导文本
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

### 2. 创建 `cloudfunctions/shared/shuffle.js`

```javascript
/**
 * Fisher-Yates 洗牌算法
 * 统一的随机化模块
 */

/**
 * Fisher-Yates 洗牌（原地修改）
 * @param {Array} array - 要洗牌的数组
 * @returns {Array} 洗牌后的数组（同一引用）
 */
function shuffle(array) {
  if (!Array.isArray(array) || array.length <= 1) {
    return array;
  }

  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

module.exports = {
  shuffle
};
```

### 3. 修改 `generateAiQuestion/index.js`

**位置**：第 8 行后添加导入，第 271-293 行移除内联 `difficultyGuidance`

```javascript
// 在文件顶部添加导入
const { getDifficultyGuidance } = require('../shared/difficulty-guidance');

// 在 buildGenericPrompt 函数中（约第 271 行）
// 移除整个 difficultyGuidance 对象定义
// 替换为：
const difficultyGuidance = getDifficultyGuidance(difficulty, null);
```

### 4. 修改 `generateAiQuestion/prompt-templates.js`

**位置**：第 160-176 行修改函数，第 208-211 行添加导出

```javascript
// 在模块导出中添加
module.exports = {
  buildPersonalizedPrompt,
  STUDENT_PROFILE_SCHEMA,
  getDifficultyGuidance  // 新增导出
};
```

### 5. 修改 `parentAssessment/index.js`

**位置**：第 105 行知识点洗牌

```javascript
// 在文件顶部添加导入
const { shuffle } = require('../shared/shuffle');

// 在 generateQuestionsWithAI 函数中（约第 105 行）
// 修改前：const questions = kpList.slice(0, count).map(...)
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

## 实施路径

### 阶段 1：创建共享模块

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 1.1 | 创建 `cloudfunctions/shared/difficulty-guidance.js` | `ls -la cloudfunctions/shared/difficulty-guidance.js` → 文件存在 |
| 1.2 | 创建 `cloudfunctions/shared/shuffle.js` | `ls -la cloudfunctions/shared/shuffle.js` → 文件存在 |
| 1.3 | 测试 difficulty-guidance.js | `node -e "const d = require('./cloudfunctions/shared/difficulty-guidance.js'); console.log(d.getDifficultyGuidance('easy'))"` → 输出难度指导 |
| 1.4 | 测试 shuffle.js | `node -e "const s = require('./cloudfunctions/shared/shuffle.js'); console.log(s.shuffle([1,2,3]))"` → 输出洗牌后数组 |

### 阶段 2：修复 generateAiQuestion

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 2.1 | 修改 `generateAiQuestion/index.js`：添加导入，移除内联 `difficultyGuidance` | `grep -A 3 "示例题型" cloudfunctions/generateAiQuestion/index.js` → 无输出 |
| 2.2 | 修改 `generateAiQuestion/prompt-templates.js`：添加导出 | `grep "getDifficultyGuidance" cloudfunctions/generateAiQuestion/prompt-templates.js` → 显示导出 |
| 2.3 | 部署 `generateAiQuestion` 云函数 | `tcb fn deploy generateAiQuestion` → 部署成功 |
| 2.4 | 验证：检查日志不包含高年级示例 | `tcb logs generateAiQuestion --limit 10 \| grep -E "勾股定理\|二次根式"` → 无输出 |

### 阶段 3：修复 parentAssessment

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.1 | 修改 `parentAssessment/index.js`：添加导入，知识点洗牌 | `grep -A 2 "shuffledKpList" cloudfunctions/parentAssessment/index.js` → 显示洗牌逻辑 |
| 3.2 | 部署 `parentAssessment` 云函数 | `tcb fn deploy parentAssessment` → 部署成功 |
| 3.3 | 验证：连续调用3次，题目顺序不同 | 手动测试 → 每次题目顺序不同 |

### 阶段 4：统一验证

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 4.1 | 端到端测试：一年级测评 | 手动测试 → 不出现勾股定理 |
| 4.2 | 随机性测试：多次调用 | 手动测试 → 题目顺序不同 |

---

## 依赖分析

```
parentAssessment/index.js
    ↓ 依赖
shared/shuffle.js (新增)
shared/difficulty-guidance.js (新增)
    ↓ 被
generateAiQuestion/index.js 使用
generateAiQuestion/prompt-templates.js 使用
```

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 共享模块路径错误 | 云函数部署失败 | 验证 require 路径正确 |
| parentAssessment 随机性不足 | 题目仍可能重复 | 知识点洗牌 + 题目洗牌双重随机 |
| 高年级示例被过度限制 | 高年级题目太简单 | 保留年级适配逻辑 |

---

## 预估工作量

| 阶段 | 预计时间 |
|------|----------|
| 阶段 1：创建共享模块 | 15 分钟 |
| 阶段 2：修复 generateAiQuestion | 15 分钟 |
| 阶段 3：修复 parentAssessment | 10 分钟 |
| 阶段 4：统一验证 | 10 分钟 |
| **总计** | **50 分钟** |

---

## 成功标准

- [ ] `difficultyGuidance` 不再包含高年级示例
- [ ] 知识点洗牌逻辑已实现
- [ ] 两个云函数部署成功
- [ ] 一年级测评不出现勾股定理
- [ ] 多次调用 parentAssessment 返回不同题目顺序
- [ ] 共享模块可被其他云函数复用
