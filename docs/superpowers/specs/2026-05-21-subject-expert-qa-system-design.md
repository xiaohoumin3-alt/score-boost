# 科目专家出题系统设计文档

**日期**: 2026-05-21
**状态**: 待审查
**版本**: 1.0

---

## 1. 问题定义

### 1.1 核心问题
当前AI出题生成5道题高度同质化，具体表现：
- 场景单一（都是梯子靠墙）
- 问法雷同（都是"求高度"）
- 数值重复（都是3-4-5）
- 选项不均衡（正确答案明显更长）

### 1.2 根本原因
1. Temperature过高(0.9)导致输出不稳定
2. 提示词缺少结构化约束
3. 无防重复机制
4. 无科目分化设计

---

## 2. 设计目标

### 2.1 核心目标
实现"润物细无声"的AI题目生成，随着使用量增长自动扩展题库。

### 2.2 验收标准
| 指标 | 验证方法 | 目标 |
|------|----------|------|
| 场景多样性 | 场景种类/场景库覆盖率 | ≥50% |
| 场景不重复 | 连续题目场景重复率 | 0% |
| 数值不重复 | 连续题目勾股数重复率 | 0% |
| 反模板化 | 无模板化表达 | 100% |
| 选项均衡 | 长度差异<30% | 100% |
| 防重复 | 与历史题目相似度<80% | 100% |

---

## 3. 架构设计

### 3.1 整体架构

```
practice_v2/
├── subjects/                    # NEW: 科目配置目录
│   ├── souls/                   # 科目Persona定义
│   │   └── math.yaml            # 数学专家Soul
│   ├── prompts/                 # 科目提示词
│   │   └── math/
│   │       ├── generator.yaml   # 生成器提示词
│   │       └── constraints.yaml # 约束规则
│   └── knowledge/               # 科目知识库
│       └── math_topics.json     # 知识点扩展上下文
├── llm_client.js                # MODIFIED: Soul加载器
├── subject_loader.js            # NEW: 科目配置加载
├── question_validator.js        # NEW: 题目质量验证
├── generation_state.js          # NEW: 生成状态跟踪
└── index.js                     # MODIFIED: 集成Soul
```

### 3.2 设计原则

1. **科目分化**: 每个科目有独立的Soul和提示词
2. **可扩展性**: 新增科目只需添加配置文件
3. **约束驱动**: 用规则约束代替Few-shot示例（避免风格束缚）
4. **状态跟踪**: 跟踪已使用场景/数值/问法

---

## 4. Soul配置

### 4.1 math.yaml

```yaml
id: math_expert
name: 数学出题专家
temperature: 0.5
max_tokens: 2000

persona: |
  你是初中数学出题专家，专注于勾股定理、函数、几何等知识点。

  ## 核心原则
  - 题目必须来源于真实场景（建筑、航海、测量）
  - 数值必须使用多样化勾股数（3-4-5, 5-12-13, 6-8-10等）
  - 选项长度必须均衡，避免通过长度猜答案
  - 禁止模板化表达（如"直角三角形边长为3、4、5"）

  ## 禁止行为
  - 禁止纯计算题（必须是应用场景）
  - 禁止重复使用相同场景
  - 禁止选项长度差异>30%
  - 禁止套用固定句式
```

### 4.2 constraints.yaml

```yaml
diversity_rules:
  场景强制轮换:
    策略: "轮换制"
    场景库:
      - "梯子靠墙问题"
      - "航海航行方向"
      - "矩形对角线计算"
      - "建筑施工测量"
      - "最短路径问题"
      - "平面两点距离"
    约束: "连续3题内场景不得重复"

  数值强制多样化:
    策略: "随机抽取"
    勾股数库:
      - [3, 4, 5]
      - [5, 12, 13]
      - [6, 8, 10]
      - [8, 15, 17]
      - [7, 24, 25]
      - [9, 12, 15]
      - [12, 16, 20]
    约束: "连续5题内勾股数不得重复"

anti_patterns:
  禁止模式:
    - "纯计算题（必须有应用场景）"
    - "直接套用勾股数模板（如'3-4-5三角形'）"
    - "选项长度差异>30%"
    - "问法与历史题目重复"
```

---

## 5. 提示词设计

### 5.1 generator.yaml

```yaml
system: |
  {soul.persona}

generate: |
  知识点：{kp_name}
  难度：{difficulty}
  题型：{question_type}

  === 场景库（必须选择，不得自创） ===
  {available_scenarios}

  === 数值库（必须选择，不得自创） ===
  {available_triples}

  === 已使用场景（必须避开） ===
  {used_scenarios}

  === 已使用数值（必须避开） ===
  {used_triples}

  === 已使用问法（必须避开） ===
  {used_question_patterns}

  === 硬性约束 ===
  1. 场景必须从场景库选择，与已使用场景不同
  2. 数值必须从数值库选择，与已使用数值不同
  3. 选项长度差异必须<30%
  4. 禁止"计算题"，必须是应用场景
  5. 禁止问法与历史题目重复
  6. 禁止模板化表达

  === 反模式警告 ===
  不要生成：
  - "一个3-4-5的直角三角形..."  ❌ 直接套用模板
  - "计算√(9+16)的值"           ❌ 纯计算题
  - "求斜边长度"（连续3题都用）  ❌ 问法重复

  返回JSON：
  {
    "question": "题目内容",
    "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
    "correct_answer": "A",
    "explanation": "详细解释",
    "scenario_used": "使用的场景",
    "triple_used": [a, b, c],
    "question_pattern": "问法类型"
  }
```

---

## 6. 核心组件

### 6.1 LlmClient (修改)

```javascript
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

class LlmClient {
  constructor(apiKey, subject = 'math') {
    this.apiKey = apiKey || process.env.MINIMAX_API_KEY;
    this.subject = subject;
    this.baseUrl = 'https://api.minimax.chat/v1';
    this.model = 'MiniMax-M2.7';
    this.timeout = 30000;
    this.soul = this._loadSoul(subject);
    this.temperature = this.soul?.temperature || 0.5;
  }

  // 加载科目Soul配置
  _loadSoul(subject) {
    try {
      const soulPath = path.join(__dirname, 'subjects', 'souls', `${subject}.yaml`);
      const fileContents = fs.readFileSync(soulPath, 'utf8');
      return yaml.load(fileContents);
    } catch (e) {
      console.warn(`Failed to load soul for ${subject}:`, e.message);
      // 返回默认Soul
      return {
        id: 'default_math',
        name: '默认数学专家',
        temperature: 0.5,
        persona: '你是初中数学出题专家。'
      };
    }
  }

  // 加载科目约束规则
  _loadConstraints(subject) {
    try {
      const constraintPath = path.join(__dirname, 'subjects', 'prompts', subject, 'constraints.yaml');
      const fileContents = fs.readFileSync(constraintPath, 'utf8');
      return yaml.load(fileContents);
    } catch (e) {
      console.warn(`Failed to load constraints for ${subject}:`, e.message);
      // 返回默认约束
      return {
        diversity_rules: {
          场景强制轮换: { 场景库: this._getScenarios() },
          数值强制多样化: { 勾股数库: this._getTriples() }
        }
      };
    }
  }

  _buildPrompt(params) {
    const {
      kp_name,
      difficulty,
      question_type = 'choice',
      used_scenarios = [],
      used_triples = [],
      used_question_patterns = []
    } = params;

    // 获取场景库和数值库
    const scenarios = this._getScenarios();
    const triples = this._getTriples();

    // 过滤已使用
    const availableScenarios = scenarios.filter(s =>
      !used_scenarios.includes(s)
    );
    const availableTriples = triples.filter(t =>
      !used_triples.some(ut => JSON.stringify(ut) === JSON.stringify(t))
    );

    // 构建提示词
    let prompt = `知识点：${kp_name}\n`;
    prompt += `难度：${difficulty}\n\n`;
    prompt += `=== 场景库（必须选择） ===\n${availableScenarios.join('、')}\n\n`;
    prompt += `=== 数值库（必须选择） ===\n${availableTriples.map(t => t.join('-')).join('、')}\n\n`;

    if (used_scenarios.length > 0) {
      prompt += `=== 已使用场景（避开） ===\n${used_scenarios.join('、')}\n\n`;
    }
    if (used_triples.length > 0) {
      prompt += `=== 已使用数值（避开） ===\n${used_triples.map(t => t.join('-')).join('、')}\n\n`;
    }

    prompt += `=== 硬性约束 ===\n`;
    prompt += `1. 场景必须从场景库选择\n`;
    prompt += `2. 数值必须从数值库选择\n`;
    prompt += `3. 选项长度差异<30%\n`;
    prompt += `4. 必须是应用场景题\n`;
    prompt += `5. 禁止模板化表达\n\n`;

    return prompt;
  }

  _getScenarios() {
    return [
      "梯子靠墙问题",
      "航海航行方向",
      "矩形对角线计算",
      "建筑施工测量",
      "最短路径问题",
      "平面两点距离"
    ];
  }

  _getTriples() {
    return [
      [3, 4, 5],
      [5, 12, 13],
      [6, 8, 10],
      [8, 15, 17],
      [7, 24, 25],
      [9, 12, 15],
      [12, 16, 20]
    ];
  }
}
```

### 6.2 QuestionValidator (新增)

```javascript
class QuestionValidator {
  // 验证场景多样性
  validateScenarioDiversity(questions, scenarioPool) {
    const used = new Set(questions.map(q => q.scenario_used));
    return {
      diversity: used.size,
      coverage: used.size / scenarioPool.length,
      pass: used.size >= 3
    };
  }

  // 验证选项均衡
  validateOptionsBalance(q) {
    const options = q.options || [];
    if (options.length === 0) return { pass: false };

    const lengths = options.map(o => o.value ? o.value.length : 0);
    const max = Math.max(...lengths);
    const min = Math.min(...lengths);

    const diff = max > 0 ? (max - min) / max : 0;
    return {
      max,
      min,
      diff,
      pass: diff < 0.3
    };
  }

  // 验证无模板化
  validateNoPatternization(q) {
    const patterns = [
      /直角三角形.*边长.*3.*4.*5/,
      /计算.*√\(.*\).*值/,
      /^求(斜边|直角边)长度$/
    ];
    return {
      pass: !patterns.some(p => p.test(q.question)),
      detected: patterns.filter(p => p.test(q.question)).map(p => p.source)
    };
  }

  // 验证问法多样性（新增）
  validateQuestionPatternDiversity(questions, minPatterns = 2) {
    const patterns = new Set();
    const patternRegex = [
      { type: '求值', regex: /求(.*?)(的值|是多少|长|宽|高)/ },
      { type: '计算', regex: /计算(.*?)(的值|结果)/ },
      { type: '判断', regex: /判断(.*?)(是否|是)/ },
      { type: '选择', regex: /以下.*?正确/ }
    ];

    questions.forEach(q => {
      patternRegex.forEach(({ type, regex }) => {
        if (regex.test(q.question)) patterns.add(type);
      });
    });

    return {
      diversity: patterns.size,
      pass: patterns.size >= minPatterns
    };
  }

  // 综合验证
  validate(q, context) {
    const results = {
      optionsBalance: this.validateOptionsBalance(q),
      noPatternization: this.validateNoPatternization(q)
    };

    const pass = Object.values(results).every(r => r.pass);

    // 验证失败重试机制
    if (!pass) {
      return {
        pass: false,
        details: results,
        retry: true,
        errors: Object.entries(results)
          .filter(([_, r]) => !r.pass)
          .map(([key, _]) => key)
      };
    }

    return { pass: true, details: results };
  }
}
```

### 6.3 GenerationState (新增)

```javascript
class GenerationState {
  constructor() {
    this.used_scenarios = [];
    this.used_triples = [];
    this.used_question_patterns = [];
    this.recent_questions = [];
  }

  recordQuestion(q) {
    if (q.scenario_used) {
      this.used_scenarios.push(q.scenario_used);
    }
    if (q.triple_used) {
      this.used_triples.push(q.triple_used);
    }
    if (q.question_pattern) {
      this.used_question_patterns.push(q.question_pattern);
    }
    this.recent_questions.push(q);

    // 保持最近5题
    if (this.recent_questions.length > 5) {
      this.recent_questions.shift();
    }
  }

  getUsedScenarios() {
    return this.used_scenarios;
  }

  getUsedTriples() {
    return this.used_triples;
  }

  getUsedPatterns() {
    return this.used_question_patterns.slice(-3);
  }

  reset() {
    this.used_scenarios = [];
    this.used_triples = [];
    this.used_question_patterns = [];
    this.recent_questions = [];
  }
}
```

### 6.4 SubjectLoader (新增)

```javascript
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

class SubjectLoader {
  constructor() {
    this.basePath = path.join(__dirname, 'subjects');
  }

  // 加载科目Soul
  loadSoul(subject) {
    const soulPath = path.join(this.basePath, 'souls', `${subject}.yaml`);
    try {
      const content = fs.readFileSync(soulPath, 'utf8');
      return yaml.load(content);
    } catch (e) {
      console.warn(`Soul not found for ${subject}, using default`);
      return this._getDefaultSoul(subject);
    }
  }

  // 加载科目约束
  loadConstraints(subject) {
    const constraintPath = path.join(this.basePath, 'prompts', subject, 'constraints.yaml');
    try {
      const content = fs.readFileSync(constraintPath, 'utf8');
      return yaml.load(content);
    } catch (e) {
      console.warn(`Constraints not found for ${subject}, using default`);
      return this._getDefaultConstraints();
    }
  }

  // 加载生成器提示词模板
  loadGeneratorPrompt(subject) {
    const promptPath = path.join(this.basePath, 'prompts', subject, 'generator.yaml');
    try {
      const content = fs.readFileSync(promptPath, 'utf8');
      return yaml.load(content);
    } catch (e) {
      return this._getDefaultPrompt();
    }
  }

  _getDefaultSoul(subject) {
    return {
      id: `${subject}_expert`,
      name: `${subject}出题专家`,
      temperature: 0.5,
      persona: `你是初中${subject}出题专家，专注于生成高质量练习题。`
    };
  }

  _getDefaultConstraints() {
    return {
      diversity_rules: {
        场景强制轮换: {
          策略: '轮换制',
          场景库: ['默认场景1', '默认场景2', '默认场景3'],
          约束: '连续3题内场景不得重复'
        },
        数值强制多样化: {
          策略: '随机抽取',
          数值库: [[1, 2, 3], [2, 3, 4]],
          约束: '连续5题内数值不得重复'
        }
      }
    };
  }

  _getDefaultPrompt() {
    return {
      system: '你是出题专家',
      generate: '请生成一道题目'
    };
  }
}

module.exports = SubjectLoader;
```

---

## 7. 重试与耗尽处理

### 7.1 约束违规重试机制

```javascript
// 在 llm_client.js 中添加
async generateWithRetry(params, maxRetries = 3) {
  const validator = new QuestionValidator();
  let lastError = null;

  for (let i = 0; i < maxRetries; i++) {
    const result = await this.generate(params);

    const validation = validator.validate(result, params);

    if (validation.pass) {
      return result;
    }

    // 验证失败，记录错误并重试
    console.warn(`生成验证失败 (尝试 ${i + 1}/${maxRetries}):`, validation.errors);
    lastError = validation;

    // 如果是选项不均衡，添加明确指令重试
    if (validation.errors.includes('optionsBalance')) {
      params.retry_hint = '注意：选项长度必须均衡，差异不能超过30%';
    }
    // 如果是模板化，添加警告重试
    if (validation.errors.includes('noPatternization')) {
      params.retry_hint = '注意：禁止模板化表达，必须使用自然语言描述场景';
    }
  }

  // 重试耗尽，返回最后一次结果（由调用方决定是否使用）
  console.error('生成重试耗尽，返回最后一次结果:', lastError);
  return { ...await this.generate(params), _validation_failed: true, _errors: lastError.errors };
}
```

### 7.2 场景/数值耗尽处理

```javascript
// 在 llm_client.js 的 _buildPrompt 中添加耗尽检测
_buildPrompt(params) {
  const {
    kp_name,
    difficulty,
    question_type = 'choice',
    used_scenarios = [],
    used_triples = [],
    used_question_patterns = []
  } = params;

  // 获取场景库和数值库
  const scenarios = this._getScenarios();
  const triples = this._getTriples();

  // 过滤已使用
  let availableScenarios = scenarios.filter(s => !used_scenarios.includes(s));
  let availableTriples = triples.filter(t =>
    !used_triples.some(ut => JSON.stringify(ut) === JSON.stringify(t))
  );

  // 耗尽处理：场景库耗尽
  if (availableScenarios.length === 0) {
    console.warn('场景库耗尽，重置并允许重复使用最旧场景');
    // 保留最近3题，清除更早的记录
    const recent = used_scenarios.slice(-3);
    availableScenarios = scenarios.filter(s => !recent.includes(s));

    // 如果还是不够，允许重复使用（降低质量保证连续性）
    if (availableScenarios.length === 0) {
      availableScenarios = scenarios;
    }
  }

  // 耗尽处理：数值库耗尽
  if (availableTriples.length === 0) {
    console.warn('数值库耗尽，重置并允许重复使用最旧数值');
    const recent = used_triples.slice(-5);
    availableTriples = triples.filter(t =>
      !recent.some(ut => JSON.stringify(ut) === JSON.stringify(t))
    );

    if (availableTriples.length === 0) {
      availableTriples = triples;
    }
  }

  // 构建提示词（保持原逻辑）
  let prompt = `知识点：${kp_name}\n`;
  prompt += `难度：${difficulty}\n\n`;
  prompt += `=== 场景库（必须选择） ===\n${availableScenarios.join('、')}\n\n`;
  prompt += `=== 数值库（必须选择） ===\n${availableTriples.map(t => t.join('-')).join('、')}\n\n`;

  if (used_scenarios.length > 0) {
    prompt += `=== 已使用场景（避开） ===\n${used_scenarios.join('、')}\n\n`;
  }
  if (used_triples.length > 0) {
    prompt += `=== 已使用数值（避开） ===\n${used_triples.map(t => t.join('-')).join('、')}\n\n`;
  }

  prompt += `=== 硬性约束 ===\n`;
  prompt += `1. 场景必须从场景库选择\n`;
  prompt += `2. 数值必须从数值库选择\n`;
  prompt += `3. 选项长度差异<30%\n`;
  prompt += `4. 必须是应用场景题\n`;
  prompt += `5. 禁止模板化表达\n\n`;

  return prompt;
}
```

---

## 8. index.js 集成示例

```javascript
// cloudfunctions/practice_v2/index.js
const LlmClient = require('./llm_client');
const QuestionValidator = require('./question_validator');
const GenerationState = require('./generation_state');

// 生成题目（AI生成入口）
async function generateQuestionWithAI(knowledgePoint, difficulty = 'easy', numQuestions = 5) {
  const llmClient = new LlmClient();
  const validator = new QuestionValidator();
  const state = new GenerationState();

  const questions = [];
  const maxAttempts = numQuestions * 3; // 防止无限循环
  let attempts = 0;

  while (questions.length < numQuestions && attempts < maxAttempts) {
    attempts++;

    try {
      // 获取已使用状态
      const usedScenarios = state.getUsedScenarios();
      const usedTriples = state.getUsedTriples();
      const usedPatterns = state.getUsedPatterns();

      // 生成题目（带重试）
      const result = await llmClient.generateWithRetry({
        kp_name: knowledgePoint.name,
        difficulty,
        question_type: 'choice',
        used_scenarios: usedScenarios,
        used_triples: usedTriples,
        used_question_patterns: usedPatterns
      });

      // 验证结果
      const validation = validator.validate(result, {});

      // 跳过严重失败的生成
      if (result._validation_failed && validation.errors.includes('critical')) {
        console.warn('生成严重失败，跳过:', validation.errors);
        continue;
      }

      // 记录状态（即使验证失败也记录，避免重复尝试）
      state.recordQuestion({
        scenario_used: result.scenario_used || '未知场景',
        triple_used: result.triple_used || [0, 0, 0],
        question_pattern: result.question_pattern || '未知问法'
      });

      // 添加到题目列表（格式化）
      questions.push({
        id: `ai_${Date.now()}_${attempts}`,
        type: 'choice',
        content: result.question,
        options: formatOptions(result.options),
        correct_answer: result.correct_answer,
        explanation: result.explanation,
        knowledge_point: knowledgePoint.id,
        difficulty: difficulty,
        source: 'ai',
        _meta: {
          scenario: result.scenario_used,
          triple: result.triple_used,
          validation_warnings: result._errors || []
        }
      });

    } catch (error) {
      console.error('生成题目失败:', error);
      // 继续尝试，不中断流程
    }
  }

  // 如果生成的题目不足，记录警告
  if (questions.length < numQuestions) {
    console.warn(`仅生成 ${questions.length}/${numQuestions} 道题目`);
  }

  return questions;
}

// 格式化选项为前端需要的格式
function formatOptions(optionsObj) {
  return Object.entries(optionsObj).map(([key, value]) => ({
    key,
    value
  }));
}

// 导出云函数
exports.main = async (event, context) => {
  const { knowledge_point_id, difficulty, num_questions = 5 } = event.data;

  // 获取知识点（假设已有实现）
  const knowledgePoint = await getKnowledgePoint(knowledge_point_id);

  // 生成题目
  const questions = await generateQuestionWithAI(knowledgePoint, difficulty, num_questions);

  return {
    success: true,
    questions,
    session_id: generateSessionId()
  };
};
```

---

## 9. 数据流

```
用户请求(practice)
    ↓
index.js: 初始化GenerationState
    ↓
for each question:
    ├─ 获取已使用状态
    ├─ 调用llm_client.generateWithRetry({used_scenarios, used_triples, ...})
    │   ├─ 构建约束提示词
    │   ├─ 检测耗尽并重置
    │   ├─ 过滤已使用场景/数值
    │   ├─ 调用MiniMax API
    │   └─ 验证失败则重试
    ├─ question_validator.validate(result)
    │   ├─ 选项均衡检查
    │   └─ 反模板化检查
    └─ generationState.recordQuestion(result)
    ↓
返回题目列表
```

---

## 10. 文件清单

### 新增文件
1. `subjects/souls/math.yaml` - 数学Soul配置
2. `subjects/prompts/math/generator.yaml` - 生成器提示词
3. `subjects/prompts/math/constraints.yaml` - 约束规则
4. `subject_loader.js` - 科目配置加载器
5. `question_validator.js` - 题目质量验证器
6. `generation_state.js` - 生成状态跟踪器

### 修改文件
1. `llm_client.js` - 集成Soul加载和约束提示词
2. `index.js` - 集成GenerationState和Validator

---

## 11. 实施优先级

### Phase 1: 立即修复 (1-2天)
- [ ] 修改temperature: 0.9 → 0.5
- [ ] 添加场景库和数值库
- [ ] 实现GenerationState状态跟踪
- [ ] 强化提示词约束

### Phase 2: 架构实现 (3-5天)
- [ ] 创建subjects目录结构
- [ ] 实现subject_loader.js
- [ ] 实现question_validator.js
- [ ] 更新llm_client.js集成Soul

### Phase 3: 验证与优化 (2-3天)
- [ ] 实现验收标准检查
- [ ] 添加日志和监控
- [ ] 性能优化

---

## 12. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 场景库耗尽 | 无法生成新题目 | 定期扩充场景库，支持自定义场景 |
| 约束过严 | 生成失败率上升 | 渐进式约束，允许fallback |
| 状态丢失 | 防重复失效 | 使用Redis持久化状态 |
| LLM不遵守约束 | 验证失败 | 重试机制+人工审核 |

---

## 附录

### A. 场景库扩展方向
- 勾股定理: 梯子、航海、建筑、测量、运动、矩形、最短路径
- 函数: 行程问题、销售问题、通信问题、增长问题
- 几何: 面积计算、体积计算、角度计算

### B. 数值库扩展
- 更多勾股数变体
- 不同难度等级的数值
- 实际测量数据

### C. 问法类型
- "求..." (直接计算)
- "...是多少？" (逆向问题)
- "判断..." (判断题)
- "证明..." (证明题)
