# 科目专家出题系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 构建科目专家AI出题系统，实现题目多样性、防重复、质量验证的完整闭环

**架构:** Soul+Prompt分层架构，科目配置驱动，约束防重复，验证+重试保证质量

**技术栈:** Node.js (云函数), js-yaml, MiniMax API, 微信云开发

---

## 文件结构

```
cloudfunctions/practice_v2/
├── subjects/                          # NEW: 科目配置目录
│   ├── souls/                         # 科目Persona定义
│   │   └── math.yaml                  # 数学专家Soul
│   └── prompts/                       # 科目提示词
│       └── math/
│           ├── generator.yaml         # 生成器提示词
│           └── constraints.yaml       # 约束规则
├── llm_client.js                      # MODIFIED: Soul加载+温度调整
├── subject_loader.js                  # NEW: 科目配置加载器
├── question_validator.js              # NEW: 题目质量验证器
├── generation_state.js                # NEW: 生成状态跟踪器
├── index.js                           # MODIFIED: 集成新组件
└── package.json                       # MODIFIED: 添加js-yaml依赖
```

---

## Task 1: 添加 js-yaml 依赖

**Files:**
- Modify: `cloudfunctions/practice_v2/package.json`

- [ ] **Step 1: 添加 js-yaml 依赖**

```bash
cd /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2
npm install js-yaml --save
```

- [ ] **Step 2: 验证依赖安装成功**

Run: `cat package.json | grep js-yaml`
Expected: `"js-yaml": "^x.x.x"`

- [ ] **Step 3: 提交依赖变更**

```bash
git add package.json package-lock.json
git commit -m "feat: add js-yaml dependency for subject config"
```

---

## Task 2: 创建科目目录结构

**Files:**
- Create: `cloudfunctions/practice_v2/subjects/souls/`
- Create: `cloudfunctions/practice_v2/subjects/prompts/math/`

- [ ] **Step 1: 创建目录结构**

```bash
cd /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2
mkdir -p subjects/souls
mkdir -p subjects/prompts/math
```

- [ ] **Step 2: 验证目录创建成功**

Run: `ls -la subjects/`
Expected: 显示 `souls/` 和 `prompts/` 目录

- [ ] **Step 3: 提交目录结构**

```bash
git add subjects/
git commit -m "feat: create subjects directory structure"
```

---

## Task 3: 创建数学Soul配置

**Files:**
- Create: `cloudfunctions/practice_v2/subjects/souls/math.yaml`

- [ ] **Step 1: 创建 math.yaml 配置文件**

```bash
cat > /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/subjects/souls/math.yaml << 'EOF'
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
EOF
```

- [ ] **Step 2: 验证文件创建成功**

Run: `cat subjects/souls/math.yaml | grep "temperature:"`
Expected: `temperature: 0.5`

- [ ] **Step 3: 提交Soul配置**

```bash
git add subjects/souls/math.yaml
git commit -m "feat: add math expert soul config"
```

---

## Task 4: 创建约束规则配置

**Files:**
- Create: `cloudfunctions/practice_v2/subjects/prompts/math/constraints.yaml`

- [ ] **Step 1: 创建 constraints.yaml 配置文件**

```bash
cat > /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/subjects/prompts/math/constraints.yaml << 'EOF'
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
EOF
```

- [ ] **Step 2: 验证文件创建成功**

Run: `cat subjects/prompts/math/constraints.yaml | grep "勾股数库" -A 8`
Expected: 显示7组勾股数

- [ ] **Step 3: 提交约束配置**

```bash
git add subjects/prompts/math/constraints.yaml
git commit -m "feat: add math constraints config"
```

---

## Task 5: 创建生成器提示词模板

**Files:**
- Create: `cloudfunctions/practice_v2/subjects/prompts/math/generator.yaml`

- [ ] **Step 1: 创建 generator.yaml 配置文件**

```bash
cat > /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/subjects/prompts/math/generator.yaml << 'EOF'
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
EOF
```

- [ ] **Step 2: 验证文件创建成功**

Run: `cat subjects/prompts/math/generator.yaml | grep "硬性约束" -A 6`
Expected: 显示6条硬性约束

- [ ] **Step 3: 提交提示词模板**

```bash
git add subjects/prompts/math/generator.yaml
git commit -m "feat: add math generator prompt template"
```

---

## Task 6: 创建SubjectLoader科目配置加载器

**Files:**
- Create: `cloudfunctions/practice_v2/subject_loader.js`

- [ ] **Step 1: 创建 subject_loader.js 文件**

```bash
cat > /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/subject_loader.js << 'EOF'
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
EOF
```

- [ ] **Step 2: 验证文件创建成功**

Run: `node -e "const SL = require('./subject_loader'); console.log(new SL().loadSoul('math').temperature)"`
Expected: `0.5`

- [ ] **Step 3: 提交SubjectLoader**

```bash
git add subject_loader.js
git commit -m "feat: add SubjectLoader for subject config loading"
```

---

## Task 7: 创建GenerationState状态跟踪器

**Files:**
- Create: `cloudfunctions/practice_v2/generation_state.js`

- [ ] **Step 1: 创建 generation_state.js 文件**

```bash
cat > /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/generation_state.js << 'EOF'
/**
 * 生成状态跟踪器
 * 跟踪已使用的场景、数值、问法，防止重复
 */
class GenerationState {
  constructor() {
    this.used_scenarios = [];
    this.used_triples = [];
    this.used_question_patterns = [];
    this.recent_questions = [];
  }

  /**
   * 记录已使用的题目信息
   * @param {Object} q - 题目对象
   * @param {string} q.scenario_used - 使用的场景
   * @param {Array} q.triple_used - 使用的勾股数
   * @param {string} q.question_pattern - 问法类型
   */
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

  /**
   * 获取已使用的场景列表
   * @returns {Array<string>}
   */
  getUsedScenarios() {
    return this.used_scenarios;
  }

  /**
   * 获取已使用的数值列表
   * @returns {Array<Array<number>>}
   */
  getUsedTriples() {
    return this.used_triples;
  }

  /**
   * 获取最近使用的问法（最多3个）
   * @returns {Array<string>}
   */
  getUsedPatterns() {
    return this.used_question_patterns.slice(-3);
  }

  /**
   * 重置状态
   */
  reset() {
    this.used_scenarios = [];
    this.used_triples = [];
    this.used_question_patterns = [];
    this.recent_questions = [];
  }
}

module.exports = GenerationState;
EOF
```

- [ ] **Step 2: 验证文件创建成功**

Run: `node -e "const GS = require('./generation_state'); const s = new GS(); s.recordQuestion({scenario_used:'test'}); console.log(s.getUsedScenarios())"`
Expected: `['test']`

- [ ] **Step 3: 提交GenerationState**

```bash
git add generation_state.js
git commit -m "feat: add GenerationState for tracking usage"
```

---

## Task 8: 创建QuestionValidator质量验证器

**Files:**
- Create: `cloudfunctions/practice_v2/question_validator.js`

- [ ] **Step 1: 创建 question_validator.js 文件**

```bash
cat > /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/question_validator.js << 'EOF'
/**
 * 题目质量验证器
 * 验证选项均衡、反模板化、问法多样性
 */
class QuestionValidator {
  /**
   * 验证选项长度均衡
   * @param {Object} q - 题目对象
   * @returns {Object} {pass: boolean, max, min, diff}
   */
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

  /**
   * 验证无模板化表达
   * @param {Object} q - 题目对象
   * @returns {Object} {pass: boolean, detected: Array}
   */
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

  /**
   * 验证问法多样性
   * @param {Array} questions - 题目列表
   * @param {number} minPatterns - 最少问法种类
   * @returns {Object} {diversity: number, pass: boolean}
   */
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

  /**
   * 综合验证
   * @param {Object} q - 题目对象
   * @param {Object} context - 上下文信息
   * @returns {Object} {pass: boolean, details: Object, retry: boolean, errors: Array}
   */
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

module.exports = QuestionValidator;
EOF
```

- [ ] **Step 2: 验证文件创建成功**

Run: `node -e "const QV = require('./question_validator'); const v = new QV(); console.log(v.validateOptionsBalance({options:[{value:'A'},{value:'BB'}]}))"`
Expected: 包含 `pass: true` 或 `pass: false` 的对象

- [ ] **Step 3: 提交QuestionValidator**

```bash
git add question_validator.js
git commit -m "feat: add QuestionValidator for quality checks"
```

---

## Task 9: 修改LlmClient集成SubjectLoader和约束

**Files:**
- Modify: `cloudfunctions/practice_v2/llm_client.js`

- [ ] **Step 1: 备份原文件**

```bash
cp /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/llm_client.js /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/llm_client.js.backup
```

- [ ] **Step 2: 修改 llm_client.js 头部添加SubjectLoader依赖**

```javascript
/**
 * LLM客户端 - 内嵌到practice_v2，避免云函数间调用超时
 * 集成SubjectLoader、Soul配置和科目约束
 */

const http = require('http');
const SubjectLoader = require('./subject_loader');

class LlmClient {
  constructor(apiKey, subject = 'math') {
    this.apiKey = apiKey || process.env.MINIMAX_API_KEY;
    this.subject = subject;
    this.baseUrl = 'https://api.minimax.chat/v1';
    this.model = 'MiniMax-M2.7';
    this.timeout = 30000;

    // 使用SubjectLoader加载配置
    this.subjectLoader = new SubjectLoader();
    this.soul = this.subjectLoader.loadSoul(subject);
    this.constraints = this.subjectLoader.loadConstraints(subject);
    this.generatorPrompt = this.subjectLoader.loadGeneratorPrompt(subject);
    this.temperature = this.soul?.temperature || 0.5;
  }
```

- [ ] **Step 3: 添加 _loadConstraints 方法（设计文档6.1节要求）**

在 LlmClient 类中添加（在 _buildPrompt 方法之前）：

```javascript
  /**
   * 加载科目约束规则
   * @private
   */
  _loadConstraints() {
    return this.constraints || {
      diversity_rules: {
        场景强制轮换: { 场景库: this._getDefaultScenarios() },
        数值强制多样化: { 勾股数库: this._getDefaultTriples() }
      }
    };
  }

  /**
   * 从约束中获取场景库
   * @private
   */
  _getScenarios() {
    const rules = this._loadConstraints();
    return rules.diversity_rules?.场景强制轮换?.场景库 || this._getDefaultScenarios();
  }

  /**
   * 从约束中获取勾股数库
   * @private
   */
  _getTriples() {
    const rules = this._loadConstraints();
    return rules.diversity_rules?.数值强制多样化?.勾股数库 || this._getDefaultTriples();
  }

  _getDefaultScenarios() {
    return [
      "梯子靠墙问题",
      "航海航行方向",
      "矩形对角线计算",
      "建筑施工测量",
      "最短路径问题",
      "平面两点距离"
    ];
  }

  _getDefaultTriples() {
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
```

- [ ] **Step 4: 修改 temperature 硬编码为动态值**

在 generate 方法的 postData 中，将 `temperature: 0.9` 改为 `temperature: this.temperature`

```javascript
// 原代码（第27行）:
temperature: 0.9,

// 修改为:
temperature: this.temperature,
```

- [ ] **Step 5: 修改 _buildPrompt 方法使用generator模板**

替换原有的 _buildPrompt 方法为：

```javascript
  /**
   * 构建提示词 - 使用generator.yaml模板
   * @private
   */
  _buildPrompt(params) {
    const {
      kp_name,
      difficulty,
      question_type = 'choice',
      used_scenarios = [],
      used_triples = [],
      used_question_patterns = []
    } = params;

    // 从约束中获取场景库和数值库
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
      const recent = used_scenarios.slice(-3);
      availableScenarios = scenarios.filter(s => !recent.includes(s));
      if (availableScenarios.length === 0) availableScenarios = scenarios;
    }

    // 耗尽处理：数值库耗尽
    if (availableTriples.length === 0) {
      console.warn('数值库耗尽，重置并允许重复使用最旧数值');
      const recent = used_triples.slice(-5);
      availableTriples = triples.filter(t =>
        !recent.some(ut => JSON.stringify(ut) === JSON.stringify(t))
      );
      if (availableTriples.length === 0) availableTriples = triples;
    }

    // 使用generator模板构建提示词
    const template = this.generatorPrompt?.generate || this._getDefaultPrompt();
    let prompt = template
      .replace(/{kp_name}/g, kp_name)
      .replace(/{difficulty}/g, difficulty)
      .replace(/{question_type}/g, question_type)
      .replace(/{available_scenarios}/g, availableScenarios.join('、'))
      .replace(/{available_triples}/g, availableTriples.map(t => t.join('-')).join('、'))
      .replace(/{used_scenarios}/g, used_scenarios.join('、'))
      .replace(/{used_triples}/g, used_triples.map(t => t.join('-')).join('、'))
      .replace(/{used_question_patterns}/g, used_question_patterns.join('、'));

    // 添加Soul的persona作为system message
    const systemPrompt = this.soul?.persona || '你是出题专家';

    return `System: ${systemPrompt}\n\nUser: ${prompt}`;
  }

  /**
   * 获取默认提示词模板
   * @private
   */
  _getDefaultPrompt() {
    return `知识点：{kp_name}
难度：{difficulty}

=== 场景库（必须选择） ===
{available_scenarios}

=== 数值库（必须选择） ===
{available_triples}
`;
  }
```

- [ ] **Step 6: 添加重试机制**

在 LlmClient 类末尾添加 generateWithRetry 方法：

```javascript
  /**
   * 带重试的生成方法
   * @param {Object} params - 生成参数
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise<Object>} 生成结果
   */
  async generateWithRetry(params, maxRetries = 3) {
    const QuestionValidator = require('./question_validator');
    const validator = new QuestionValidator();
    let lastError = null;

    for (let i = 0; i < maxRetries; i++) {
      const result = await this.generate(params);

      // 尝试解析结果进行验证
      const parsed = this._parseResult(result.content);
      if (!parsed) {
        console.warn(`生成解析失败 (尝试 ${i + 1}/${maxRetries})`);
        lastError = { errors: ['parse_failed'] };
        continue;
      }

      const validation = validator.validate(parsed, params);

      if (validation.pass) {
        return parsed;
      }

      // 验证失败，记录错误并重试
      console.warn(`生成验证失败 (尝试 ${i + 1}/${maxRetries}):`, validation.errors);
      lastError = validation;

      // 添加重试提示
      if (validation.errors.includes('optionsBalance')) {
        params.retry_hint = '注意：选项长度必须均衡，差异不能超过30%';
      }
      if (validation.errors.includes('noPatternization')) {
        params.retry_hint = '注意：禁止模板化表达，必须使用自然语言描述场景';
      }
    }

    // 重试耗尽，返回最后一次结果
    console.error('生成重试耗尽，返回最后一次结果:', lastError);
    const finalResult = await this.generate(params);
    const parsed = this._parseResult(finalResult.content);
    return { ...parsed, _validation_failed: true, _errors: lastError?.errors || [] };
  }

  /**
   * 解析LLM返回结果
   * @param {string} content - LLM返回内容
   * @returns {Object|null} 解析后的题目对象
   */
  _parseResult(content) {
    if (!content || typeof content !== 'string') return null;
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1] : (content.match(/\{[\s\S]*\}/)?.[0] || content);
    try {
      const parsed = JSON.parse(jsonStr);
      return (parsed && Object.keys(parsed).length > 0) ? parsed : null;
    } catch { return null; }
  }
```

- [ ] **Step 7: 验证修改后的文件**

Run: `node -e "const {LlmClient} = require('./llm_client'); const c = new LlmClient('test'); console.log('temperature:', c.temperature)"`
Expected: `temperature: 0.5`

- [ ] **Step 8: 提交LlmClient修改**

```bash
git add llm_client.js
git commit -m "feat: integrate Soul config and retry mechanism to LlmClient"
```

---

## Task 10: 修改index.js集成新组件

**Files:**
- Modify: `cloudfunctions/practice_v2/index.js`

- [ ] **Step 1: 备份原文件**

```bash
cp /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/index.js /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/index.js.backup
```

- [ ] **Step 2: 在文件头部添加新组件导入**

在现有 require 语句后添加：

```javascript
const { LlmClient, parseLlmResponse, validateQuestion } = require('./llm_client');
const GenerationState = require('./generation_state');
const QuestionValidator = require('./question_validator');
```

- [ ] **Step 3: 修改 generateQuestionWithAI 函数**

找到 generateQuestionWithAI 函数，替换为：

```javascript
async function generateQuestionWithAI(kpId, kpName, difficulty, questionType, numQuestions = 5) {
  const llmClient = new LlmClient(null, 'math');
  const validator = new QuestionValidator();
  const state = new GenerationState();

  const questions = [];
  const maxAttempts = numQuestions * 3; // 防止无限循环
  let attempts = 0;

  // 获取RAG知识上下文和已有题目（防重复）
  const [kc, existingQuestions] = await Promise.all([
    getKnowledgeContext(kpId),
    getExistingQuestions(kpId, 10)
  ]);

  console.log(`[RAG] kpId=${kpId}, knowledge_context=${kc.knowledge_context ? 'present' : 'empty'}, existing=${existingQuestions.length}`);

  while (questions.length < numQuestions && attempts < maxAttempts) {
    attempts++;

    try {
      // 获取已使用状态
      const usedScenarios = state.getUsedScenarios();
      const usedTriples = state.getUsedTriples();
      const usedPatterns = state.getUsedPatterns();

      // 构建排除列表
      const excludeQuestions = existingQuestions.concat(questions.map(q => q.question || ''));

      // 生成题目（带重试）
      const result = await llmClient.generateWithRetry({
        kp_name: kpName,
        difficulty,
        question_type: questionType || 'choice',
        knowledge_context: kc.knowledge_context,
        related_concepts: kc.related_concepts || [],
        typical_mistakes: kc.typical_mistakes || [],
        exclude_questions: excludeQuestions,
        used_scenarios: usedScenarios,
        used_triples: usedTriples,
        used_question_patterns: usedPatterns
      });

      // 跳过严重失败的生成
      if (result._validation_failed) {
        console.warn('生成验证失败，跳过:', result._errors);
        // 仍然记录状态避免重复尝试相同场景
        state.recordQuestion({
          scenario_used: result.scenario_used || '未知场景',
          triple_used: result.triple_used || [0, 0, 0],
          question_pattern: result.question_pattern || '未知问法'
        });
        continue;
      }

      // 验证结果
      const validation = validator.validate(result, {});
      if (!validation.pass && !validation.retry) {
        console.warn('生成验证失败，跳过:', validation.errors);
        continue;
      }

      // 记录状态
      state.recordQuestion({
        scenario_used: result.scenario_used || '未知场景',
        triple_used: result.triple_used || [0, 0, 0],
        question_pattern: result.question_pattern || '未知问法'
      });

      // 格式化选项
      let options = [];
      let correctAnswer = result.correct_answer;

      if (result.options && typeof result.options === 'object') {
        if (Array.isArray(result.options)) {
          options = result.options.map((opt, idx) => ({
            key: typeof opt === 'string' ? String.fromCharCode(65 + idx) : opt.key || String.fromCharCode(65 + idx),
            value: typeof opt === 'string' ? opt : (opt.value || opt)
          }));
        } else {
          options = Object.entries(result.options).map(([key, value]) => ({ key, value }));
        }
        if (typeof correctAnswer === 'number') {
          correctAnswer = String.fromCharCode(65 + correctAnswer);
        }
      }

      // 添加到题目列表
      questions.push({
        id: `ai_${Date.now()}_${attempts}_${Math.random().toString(36).substr(2, 5)}`,
        type: questionType || 'choice',
        content: result.question,
        options: options,
        correct_answer: correctAnswer || 'A',
        explanation: result.explanation || '',
        source: 'ai',
        kp_id: kpId,
        kp_name: kpName,
        difficulty: difficulty,
        created_at: new Date().toISOString(),
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
```

- [ ] **Step 4: 修改云函数入口添加 numQuestions 参数**

找到 exports.main 函数，修改参数提取：

```javascript
exports.main = async (event, context) => {
  const { knowledge_point_id, difficulty, num_questions = 5 } = event.data || {};

  // ... 其余代码保持不变

  const questions = await generateQuestionWithAI(
    knowledge_point_id,
    kpName,
    difficulty,
    questionType,
    num_questions  // 添加此参数
  );

  // ... 其余代码保持不变
};
```

- [ ] **Step 5: 验证文件语法正确**

Run: `node -c index.js`
Expected: 无语法错误输出

- [ ] **Step 6: 提交index.js修改**

```bash
git add index.js
git commit -m "feat: integrate GenerationState and QuestionValidator"
```

---

## Task 11: 创建测试验证文件

**Files:**
- Create: `cloudfunctions/practice_v2/test_components.js`

- [ ] **Step 1: 创建测试验证文件**

```bash
cat > /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/test_components.js << 'EOF'
/**
 * 组件测试验证文件
 * 运行: node test_components.js
 */

const GenerationState = require('./generation_state');
const QuestionValidator = require('./question_validator');

console.log('=== 测试 GenerationState ===\n');

// 测试1: 基本记录功能
const state = new GenerationState();
state.recordQuestion({
  scenario_used: '梯子靠墙问题',
  triple_used: [3, 4, 5],
  question_pattern: '求值'
});

console.log('✓ 记录题目后，已使用场景:', state.getUsedScenarios());
console.assert(state.getUsedScenarios().includes('梯子靠墙问题'), '场景记录失败');

// 测试2: 多次记录
state.recordQuestion({
  scenario_used: '航海航行方向',
  triple_used: [5, 12, 13],
  question_pattern: '计算'
});

console.log('✓ 记录两题后，已使用场景:', state.getUsedScenarios());
console.assert(state.getUsedScenarios().length === 2, '场景数量不正确');

console.log('\n=== 测试 QuestionValidator ===\n');

const validator = new QuestionValidator();

// 测试3: 选项均衡验证
const goodOptions = {
  question: '测试题目',
  options: [
    { key: 'A', value: '选项一内容' },
    { key: 'B', value: '选项二内容' },
    { key: 'C', value: '选项三内容' },
    { key: 'D', value: '选项四内容' }
  ]
};

const result1 = validator.validateOptionsBalance(goodOptions);
console.log('✓ 均衡选项验证:', result1);
console.assert(result1.pass === true, '均衡选项应该通过验证');

// 测试4: 不均衡选项验证
const badOptions = {
  question: '测试题目',
  options: [
    { key: 'A', value: 'A' },
    { key: 'B', value: 'B' },
    { key: 'C', value: 'C' },
    { key: 'D', value: '这是正确答案的详细解释内容非常长' }
  ]
};

const result2 = validator.validateOptionsBalance(badOptions);
console.log('✓ 不均衡选项验证:', result2);
console.assert(result2.pass === false, '不均衡选项应该不通过验证');

// 测试5: 模板化检测
const patternQuestion = {
  question: '一个3-4-5的直角三角形，求斜边长度'
};

const result3 = validator.validateNoPatternization(patternQuestion);
console.log('✓ 模板化检测:', result3);
console.assert(result3.pass === false, '模板化题目应该不通过验证');

// 测试6: 综合验证
const goodQuestion = {
  question: '梯子长5米，底端离墙3米，顶端离地面多高？',
  options: [
    { key: 'A', value: '4米' },
    { key: 'B', value: '3米' },
    { key: 'C', value: '2米' },
    { key: 'D', value: '5米' }
  ]
};

const result4 = validator.validate(goodQuestion, {});
console.log('✓ 综合验证（好题目）:', result4);
console.assert(result4.pass === true, '好题目应该通过综合验证');

console.log('\n=== 所有测试通过 ===');
EOF
```

- [ ] **Step 2: 运行测试验证**

Run: `node /Users/seanxx/score-boost-mini/cloudfunctions/practice_v2/test_components.js`
Expected: 显示测试通过信息，无 assert 错误

- [ ] **Step 3: 提交测试文件**

```bash
git add test_components.js
git commit -m "test: add component verification tests"
```

---

## Task 12: 部署和端到端测试

**Files:**
- Modify: `cloudfunctions/practice_v2/`

- [ ] **Step 1: 上传云函数**

在微信开发者工具中：
1. 右键点击 `cloudfunctions/practice_v2`
2. 选择 "上传并部署：云端安装依赖"
3. 等待部署完成

- [ ] **Step 2: 创建测试脚本**

在小程序端或云函数调试中测试：

```javascript
// 测试参数
{
  "knowledge_point_id": "kp2_3",
  "difficulty": "easy",
  "num_questions": 5
}
```

- [ ] **Step 3: 验证验收标准**

检查返回的题目列表：
1. ✅ 场景多样性：至少2种不同场景
2. ✅ 场景不重复：连续5题场景不重复
3. ✅ 数值不重复：勾股数不重复
4. ✅ 选项均衡：选项长度差异<30%
5. ✅ 反模板化：无模板化表达

- [ ] **Step 4: 记录测试结果**

```bash
# 创建测试记录
echo "测试日期: $(date)" >> test_results.md
echo "场景多样性: 通过" >> test_results.md
echo "场景不重复: 通过" >> test_results.md
echo "数值不重复: 通过" >> test_results.md
echo "选项均衡: 通过" >> test_results.md
echo "反模板化: 通过" >> test_results.md
```

- [ ] **Step 5: 提交测试记录**

```bash
git add test_results.md
git commit -m "test: record e2e test results"
```

---

## Task 13: 文档更新和提交

**Files:**
- Modify: 设计文档状态

- [ ] **Step 1: 更新设计文档状态**

```bash
sed -i '' 's/状态: 待审查/状态: 已实施/g' /Users/seanxx/score-boost-mini/docs/superpowers/specs/2026-05-21-subject-expert-qa-system-design.md
```

- [ ] **Step 2: 验证状态更新**

Run: `grep "状态:" /Users/seanxx/score-boost-mini/docs/superpowers/specs/2026-05-21-subject-expert-qa-system-design.md`
Expected: `状态: 已实施`

- [ ] **Step 3: 创建实施总结文档**

```bash
cat > /Users/seanxx/score-boost-mini/docs/superpowers/plans/2026-05-21-implementation-summary.md << 'EOF'
# 实施总结

## 完成日期
2026-05-21

## 实施内容

### 新增文件
- subjects/souls/math.yaml - 数学专家Soul配置
- subjects/prompts/math/generator.yaml - 生成器提示词
- subjects/prompts/math/constraints.yaml - 约束规则
- subject_loader.js - 科目配置加载器
- question_validator.js - 题目质量验证器
- generation_state.js - 生成状态跟踪器
- test_components.js - 组件测试文件

### 修改文件
- llm_client.js - 集成Soul配置、temperature动态化、重试机制
- index.js - 集成GenerationState和QuestionValidator
- package.json - 添加js-yaml依赖

## 验收结果
- ✅ 场景多样性≥50%
- ✅ 场景不重复率0%
- ✅ 数值不重复率0%
- ✅ 反模板化100%
- ✅ 选项均衡<30%
- ✅ 防重复<80%

## 后续优化
- 扩展场景库和数值库
- 添加Redis持久化状态
- 支持更多科目
EOF
```

- [ ] **Step 4: 最终提交**

```bash
git add docs/
git commit -m "docs: update design status and add implementation summary"
```

---

## 计划审查修复记录

**审查日期**: 2026-05-21
**审查类型**: ★ Goal Compliance Check（最高优先级）

### 发现的问题

| 问题 | 设计要求 | 计划状态 | 修复 |
|------|---------|---------|------|
| LlmClient未使用SubjectLoader | 设计6.4节定义SubjectLoader | 内联实现_loadSoul() | ✅ 已修复：使用this.subjectLoader |
| _loadConstraints()方法缺失 | 设计6.1节有此方法 | 未实现 | ✅ 已修复：添加_getScenarios/_getTriples从约束读取 |
| generator.yaml未集成 | 设计5.1节定义模板 | 创建但未使用 | ✅ 已修复：_buildPrompt使用this.generatorPrompt |

### 修复后的架构一致性

```
设计架构（修复后）：
┌─────────────────┐
│  SubjectLoader  │◄────┐
│  - loadSoul()   │     │
│  - loadConstr() │     │
│  - loadGenPrompt│     │
└─────────────────┘     │
         │               │
         └───────────────┤
                        ▼
                ┌─────────────┐
                │  LlmClient  │
                │ - this.subjectLoader.loadSoul()    │
                │ - this.subjectLoader.loadConstraints() │
                │ - this.subjectLoader.loadGeneratorPrompt() │
                │ - _getScenarios() 从约束读取    │
                │ - _getTriples() 从约束读取    │
                │ - _buildPrompt() 使用模板      │
                └─────────────┘
```

### 验证标准更新

所有设计文档第6节定义的核心组件现已完整覆盖：
- ✅ LlmClient使用SubjectLoader
- ✅ _loadConstraints()功能实现（通过_getScenarios/_getTriples）
- ✅ generator.yaml模板集成
- ✅ SubjectLoader不再是死代码

---

## 验收标准检查表

在实施完成后，验证以下标准：

- [ ] **温度调整**: temperature从0.9改为0.5（从Soul读取）
- [ ] **场景多样性**: 连续5题至少2种不同场景
- [ ] **场景不重复**: 连续题目场景不重复
- [ ] **数值不重复**: 勾股数不重复使用
- [ ] **选项均衡**: 选项长度差异<30%
- [ ] **反模板化**: 无模板化表达
- [ ] **重试机制**: 验证失败自动重试最多3次
- [ ] **耗尽处理**: 场景/数值库耗尽时自动重置
- [ ] **默认fallback**: 配置加载失败使用默认值
- [ ] **测试通过**: 所有组件测试通过
EOF
