# 亲子测评修复实施计划（修正版 v2.2）

## 目标

| 目标 | 定义 |
|------|------|
| 修复一年级出现高年级题目 | 移除 prompt 中的高年级示例（勾股定理、等边三角形、二次根式） |
| 题目真正随机 | 为 parentAssessment 添加 Fisher-Yates 洗牌逻辑 |

---

## 【根据 Swarm 审查修正】

### 修正内容

| 修正项 | 原计划 | 修正后 | 理由 |
|--------|--------|--------|------|
| Step 2.3a/2.3b | 拆分为删除+添加两步 | **合并**为一个替换步骤 | 避免行号偏移错误 |
| sed 命令 | 使用 `sed -i ''` | **改用 Node.js 脚本** | macOS 兼容性和可维护性 |
| 备份命名 | `.bak` 后缀 | **添加时间戳** | 避免覆盖旧备份 |
| 验证路径 | 项目根目录验证 | **云函数目录验证** | 路径一致性 |
| grep 验证 | `grep -cE` | `grep -E \| wc -l` | 避免无匹配时返回错误码 |

---

## 实施路径

### 阶段 1：创建共享模块（难度指导）

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 1.0 | **验证/创建 shared 目录结构**<br>`test -d cloudfunctions/shared || mkdir -p cloudfunctions/shared` | `test -d cloudfunctions/shared && echo "OK"` | 如目录错误，删除重建 |
| 1.1 | **创建 difficulty-guidance.js**<br>使用代码块创建文件 | `test -f cloudfunctions/shared/difficulty-guidance.js && echo "OK"` | `rm cloudfunctions/shared/difficulty-guidance.js` |
| 1.2 | **验证模块加载（云函数目录）**<br>`cd cloudfunctions/generateAiQuestion && node -e "const d = require('../shared/difficulty-guidance'); console.log(d.getDifficultyGuidance('easy', '1'))"` | 输出包含"【难度标准 - 简单】"，**不包含**"勾股定理"等 | 无需回滚 |
| 1.3 | **验证函数导出**<br>`cd cloudfunctions/generateAiQuestion && node -e "const d = require('../shared/difficulty-guidance'); console.log(typeof d.getDifficultyGuidance)"` | 输出 `function` | 无需回滚 |

**模块代码**（`cloudfunctions/shared/difficulty-guidance.js`）：
```javascript
/**
 * 统一难度指导管理
 * 移除高年级示例（勾股定理、等边三角形、二次根式）
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

### 阶段 2：修复 generateAiQuestion 云函数

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 2.0 | **预检文件存在性**<br>`test -f cloudfunctions/generateAiQuestion/index.js && echo "OK"` | 输出 `OK` | 文件不存在需中止 |
| 2.1 | **备份原始文件（带时间戳）**<br>`TIMESTAMP=$(date +%Y%m%d_%H%M%S)`<br>`cp cloudfunctions/generateAiQuestion/index.js cloudfunctions/generateAiQuestion/index.js.backup_$TIMESTAMP`<br>`cp cloudfunctions/generateAiQuestion/prompt-templates.js cloudfunctions/generateAiQuestion/prompt-templates.js.backup_$TIMESTAMP` | `ls cloudfunctions/generateAiQuestion/*.backup_* | tail -1` | `mv cloudfunctions/generateAiQuestion/index.js.backup_$TIMESTAMP cloudfunctions/generateAiQuestion/index.js` |
| 2.2 | **在第 8 行后添加导入** | `grep -n "require.*difficulty-guidance" cloudfunctions/generateAiQuestion/index.js` | 恢复备份 |
| 2.3 | **替换第 271-293 行为函数调用** | `grep -n "getDifficultyGuidance(difficulty" cloudfunctions/generateAiQuestion/index.js` | 恢复备份 |
| 2.4 | **修改 prompt-templates.js 导出** | `grep "getDifficultyGuidance" cloudfunctions/generateAiQuestion/prompt-templates.js` | 恢复备份 |
| 2.5 | **本地验证 require 路径**<br>`cd cloudfunctions/generateAiQuestion && node -e "const d = require('../shared/difficulty-guidance'); console.log(typeof d.getDifficultyGuidance)"` | 输出 `function` | 恢复备份 |
| 2.6 | **部署云函数**<br>`cd /Users/seanxx/score-boost-mini && tcb fn deploy generateAiQuestion`<br>**验证 shared 模块已打包**<br>`tcb fn code generateAiQuestion 2>/dev/null \| grep -o "difficulty-guidance" \| wc -l` | `tcb fn detail generateAiQuestion \| grep -E "状态|State"` | 恢复备份 |
| 2.7 | **验证日志不包含高年级示例**<br>`tcb logs generateAiQuestion --limit 10 \| grep -E "勾股定理|二次根式|等边三角形" \| wc -l` | 输出 `0` | 恢复备份 |

**Step 2.2-2.4 具体修改（使用 Node.js 脚本）**：

创建 `scripts/fix-generateAiQuestion.js`：
```javascript
const fs = require('fs');
const path = require('path');

const projectDir = '/Users/seanxx/score-boost-mini';

// 1. 修改 index.js - 添加导入
const indexPath = path.join(projectDir, 'cloudfunctions/generateAiQuestion/index.js');
let indexContent = fs.readFileSync(indexPath, 'utf8');

// 在第 8 行后添加导入（找到 cloud SDK 导入后的位置）
if (!indexContent.includes("require('../shared/difficulty-guidance')")) {
  indexContent = indexContent.replace(
    /(\n)(const cloud = require\('@cloudbase\/node-sdk'\);)/,
    '\nconst { getDifficultyGuidance } = require('"'"'../shared/difficulty-guidance'"'"');\n$2'
  );
  fs.writeFileSync(indexPath, indexContent);
  console.log('✓ 添加导入语句');
} else {
  console.log('✓ 导入语句已存在');
}

// 2. 修改 index.js - 替换 difficultyGuidance 对象为函数调用
indexContent = fs.readFileSync(indexPath, 'utf8');
const oldPattern = /const difficultyGuidance = \{\s*easy: [`'\s\S]*?示例题型：√16的值是？[^}]*?\n\s*\};\s*\n/g;
const newCall = 'const difficultyGuidance = getDifficultyGuidance(difficulty, null);\n';

if (oldPattern.test(indexContent)) {
  indexContent = indexContent.replace(oldPattern, newCall);
  fs.writeFileSync(indexPath, indexContent);
  console.log('✓ 替换 difficultyGuidance 对象为函数调用');
} else {
  console.log('✓ difficultyGuidance 已替换');
}

// 3. 修改 prompt-templates.js - 添加导出
const templatePath = path.join(projectDir, 'cloudfunctions/generateAiQuestion/prompt-templates.js');
let templateContent = fs.readFileSync(templatePath, 'utf8');

if (!templateContent.includes('getDifficultyGuidance')) {
  templateContent = templateContent.replace(
    /module\.exports = \{\s*buildPersonalizedPrompt,\s*STUDENT_PROFILE_SCHEMA\s*\};/,
    'module.exports = {\n  buildPersonalizedPrompt,\n  STUDENT_PROFILE_SCHEMA,\n  getDifficultyGuidance\n};'
  );
  fs.writeFileSync(templatePath, templateContent);
  console.log('✓ 添加 getDifficultyGuidance 导出');
} else {
  console.log('✓ getDifficultyGuidance 导出已存在');
}

console.log('generateAiQuestion 修改完成');
```

执行脚本：
```bash
node scripts/fix-generateAiQuestion.js
```

---

### 阶段 3：修复 parentAssessment 云函数（知识点洗牌）

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 3.0 | **预检文件存在性**<br>`test -f cloudfunctions/parentAssessment/index.js && echo "OK"` | 输出 `OK` | 文件不存在需中止 |
| 3.1 | **备份原始文件（带时间戳）**<br>`TIMESTAMP=$(date +%Y%m%d_%H%M%S)`<br>`cp cloudfunctions/parentAssessment/index.js cloudfunctions/parentAssessment/index.js.backup_$TIMESTAMP` | `ls cloudfunctions/parentAssessment/*.backup_* | tail -1` | `mv cloudfunctions/parentAssessment/index.js.backup_$TIMESTAMP cloudfunctions/parentAssessment/index.js` |
| 3.2 | **在第 43 行后添加 shuffle 函数** | `grep -n "function shuffle(array)" cloudfunctions/parentAssessment/index.js` | 恢复备份 |
| 3.3 | **修改第 105 行，添加知识点洗牌** | `grep -B 1 -A 3 "shuffledKpList" cloudfunctions/parentAssessment/index.js` | 恢复备份 |
| 3.4 | **部署云函数**<br>`tcb fn deploy parentAssessment` | `tcb fn detail parentAssessment \| grep -E "状态|State"` | 恢复备份 |
| 3.5 | **验证洗牌代码存在**<br>`grep -c "shuffle" cloudfunctions/parentAssessment/index.js` | 输出 `> 0` | 恢复备份 |

**Step 3.2-3.3 具体修改**：

创建 `scripts/fix-parentAssessment.js`：
```javascript
const fs = require('fs');
const path = require('path');

const projectDir = '/Users/seanxx/score-boost-mini';
const indexPath = path.join(projectDir, 'cloudfunctions/parentAssessment/index.js');
let content = fs.readFileSync(indexPath, 'utf8');

// 1. 在第 43 行后添加 shuffle 函数（knowledgePoints 对象定义后）
const shuffleFunction = `

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
`;

if (!content.includes('function shuffle(array)')) {
  // 在 knowledgePoints 对象结束后添加
  content = content.replace(
    /(};\n)(\n\/\*\* 从题库中获取题目)/,
    '$1' + shuffleFunction + '$2'
  );
  fs.writeFileSync(indexPath, content);
  console.log('✓ 添加 shuffle 函数');
} else {
  console.log('✓ shuffle 函数已存在');
}

// 2. 修改第 105 行，添加知识点洗牌
content = fs.readFileSync(indexPath, 'utf8');
const oldQuestions = 'const questions = kpList.slice(0, count).map((kpName, idx)';
const newQuestions = 'const shuffledKpList = shuffle([...kpList]);\n  const questions = shuffledKpList.slice(0, count).map((kpName, idx)';

if (content.includes(oldQuestions) && !content.includes('shuffledKpList')) {
  content = content.replace(oldQuestions, newQuestions);
  fs.writeFileSync(indexPath, content);
  console.log('✓ 添加知识点洗牌逻辑');
} else if (content.includes('shuffledKpList')) {
  console.log('✓ 洗牌逻辑已存在');
} else {
  console.log('⚠️ 未找到目标代码，请手动检查');
}

console.log('parentAssessment 修改完成');
```

执行脚本：
```bash
node scripts/fix-parentAssessment.js
```

---

### 阶段 4：统一验证

| Step | Action | Verification Gate | Rollback |
|------|--------|-------------------|----------|
| 4.1 | **随机性算法测试** | 输出 `PASS` | 无需回滚 |
| 4.2 | **端到端测试**<br>`tcb functions call parentAssessment --data '{"grade":"1","subject":"math"}' \| jq -r '.result.questions[0].knowledge_point'` | 输出一一年级知识点，**不包含**"勾股定理"等 | 回滚阶段2/3 |
| 4.3 | **随机性验证**<br>`for i in 1 2 3; do tcb functions call parentAssessment --data '{"grade":"1","subject":"math"}' \| jq -r '.result.questions[0:3][] | .knowledge_point' \| paste -sd " "; done \| sort \| uniq -c` | 至少显示 2 个不同的顺序 | 同上 |

**Step 4.1 验证脚本**：
```bash
node -e "
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const arr = [1, 2, 3, 4, 5];
const s = new Set();
for (let i = 0; i < 10; i++) {
  s.add(JSON.stringify(shuffle([...arr])));
}
console.log(s.size > 1 ? 'PASS' : 'FAIL');
"
```

---

## 回滚预案（应急）

### 场景 1：generateAiQuestion 部署后异常

```bash
# 查找最新备份
LATEST_BACKUP=$(ls -t cloudfunctions/generateAiQuestion/*.backup_* | head -1)

# 恢复文件
cp $LATEST_BACKUP cloudfunctions/generateAiQuestion/index.js
cp cloudfunctions/generateAiQuestion/prompt-templates.js.backup_* cloudfunctions/generateAiQuestion/prompt-templates.js

# 重新部署
cd /Users/seanxx/score-boost-mini
tcb fn deploy generateAiQuestion
```

### 场景 2：parentAssessment 部署后异常

```bash
# 查找最新备份
LATEST_BACKUP=$(ls -t cloudfunctions/parentAssessment/*.backup_* | head -1)

# 恢复文件
cp $LATEST_BACKUP cloudfunctions/parentAssessment/index.js

# 重新部署
cd /Users/seanxx/score-boost-mini
tcb fn deploy parentAssessment
```

### 场景 3：shared 模块加载失败

```bash
# 查找最新备份
LATEST_INDEX_BACKUP=$(ls -t cloudfunctions/generateAiQuestion/index.js.backup_* | head -1)

# 1. 先恢复云函数代码
cp $LATEST_INDEX_BACKUP cloudfunctions/generateAiQuestion/index.js

# 2. 删除 shared 模块
rm cloudfunctions/shared/difficulty-guidance.js

# 3. 重新部署
cd /Users/seanxx/score-boost-mini
tcb fn deploy generateAiQuestion
```

---

## 修正说明

### 修正 1：合并 Step 2.3a 和 2.3b

**原因**：删除第 271-293 行后，行号会变化，导致后续插入位置错误。

**修正**：使用 Node.js 脚本进行正则替换，一次性完成删除和添加。

### 修正 2：使用 Node.js 脚本替代 sed

**原因**：
- macOS 的 sed 命令与 Linux 不完全兼容
- 行号在代码变化后会失效
- 正则匹配更可靠

**修正**：创建 `scripts/fix-generateAiQuestion.js` 和 `scripts/fix-parentAssessment.js`。

### 修正 3：备份添加时间戳

**原因**：`.bak` 文件会被多次覆盖，导致无法回滚到特定版本。

**修正**：使用 `index.js.backup_YYYYMMDD_HHMMSS` 格式。

### 修正 4：修正验证命令

**原因**：`grep -c` 在无匹配时返回错误码 1，会被视为验证失败。

**修正**：使用 `grep -E ... | wc -l`，无匹配时返回 0。

### 修正 5：验证路径统一

**原因**：Step 1.2 在项目根目录验证，与实际使用路径不一致。

**修正**：所有验证都在云函数目录下执行。

---

## 成功标准

- [ ] `difficultyGuidance` 不再包含高年级示例（勾股定理、二次根式、等边三角形）
- [ ] Fisher-Yates 洗牌代码已添加到 parentAssessment
- [ ] 两个云函数部署成功
- [ ] 云函数日志验证通过（无高年级示例）
- [ ] 连续调用 parentAssessment 产生不同题目顺序
- [ ] shared 模块可被正确 require

---

## 预估工作量

| 阶段 | 预计时间 |
|------|----------|
| 阶段 1：创建共享模块 | 10 分钟 |
| 阶段 2：修复 generateAiQuestion | 20 分钟 |
| 阶段 3：修复 parentAssessment | 15 分钟 |
| 阶段 4：统一验证 | 15 分钟 |
| 缓冲时间 | 10 分钟 |
| **总计** | **70 分钟** |

---

## 注意事项

1. **执行顺序**：必须按照阶段1 → 阶段2 → 阶段3的顺序执行
2. **备份优先**：每个修改前都执行备份命令
3. **验证门禁**：每个 Step 的 Verification Gate 必须通过才进入下一步
4. **部署等待**：云函数部署可能需要 1-2 分钟，请等待完成
5. **脚本执行**：确保 scripts 目录存在，脚本有执行权限

---

**版本历史**：
- v1.0（初始版）：50 分钟，基础修复方案
- v2.0（Swarm 调整版）：70 分钟，添加回滚预案和完整验证
- v2.1（架构审查改进版）：添加 shared 目录验证，明确 difficultyGuidance 移除步骤，添加 require 路径本地验证
- v2.2（Swarm 审查修正版）：合并 Step 2.3a/2.3b，使用 Node.js 脚本替代 sed，添加时间戳备份，修正验证命令
