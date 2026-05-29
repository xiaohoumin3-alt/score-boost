# LLM 调用层重构实施计划

**日期**: 2026-05-29
**设计文档**: `docs/superpowers/specs/2026-05-29-llm-refactor-design.md`

---

## 代码库现状分析

### 现有 LLM 客户端实现位置

| 文件 | 行数 | 状态 | 调用者 |
|------|------|------|--------|
| `cloudfunctions/generateAiQuestion/index.js` (内嵌 LlmClient) | ~270 行 | 复杂，含 safeFetch | 自用 |
| `cloudfunctions/shared/llm-client.js` | 123 行 | 简单版 | `shared/question_bank.js` |
| `cloudfunctions/startAssessment/llm_client.js` | 139 行 | http 模块 | `startAssessment/index.js`, `startAssessment/evaluator.js` |
| `cloudfunctions/initQuestionBank/shared/llm-client.js` | 142 行 | fetch | `initQuestionBank/shared/question_bank.js` |
| `cloudfunctions/practice_v2/llm_client.js` | 330 行 | 复杂，含状态跟踪 | `practice_v2/index.js` |

### 关键发现

1. **重复代码**：5 个独立的 LlmClient 实现
2. **API 不一致**：有的用 `generate()`，有的用 `generateQuestion()`
3. **错误处理不统一**：有的简单抛错，有的无错误处理
4. **超时控制分散**：每个实现都有自己的超时逻辑
5. **重试机制缺失**：仅在 generateAiQuestion 中有简单重试

---

## Phase 1: 创建共享模块

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 1.1 | **创建目录** `cloudfunctions/shared/llm-core/` | `ls -la /Users/seanxx/score-boost-mini/cloudfunctions/shared/llm-core/` |
| 1.2 | **创建异常体系** `cloudfunctions/shared/llm-core/exceptions.js`<br>- LLMError 基类<br>- LLMConfigError<br>- LLMAPIError<br>- LLMParseError<br>每个异常包含 code、name、retryable、retryAfter 字段 | `node -e "const {LLMError,LLMAPIError,LLMConfigError,LLMParseError}=require('./cloudfunctions/shared/llm-core/exceptions.js');console.log('LLMError:',typeof LLMError,'LLMAPIError:',typeof LLMAPIError)"` |
| 1.3 | **创建错误映射** `cloudfunctions/shared/llm-core/error-mapping.js`<br>- mapError(error, context) 函数<br>- 处理 HTTP 状态码 (401, 429, 5xx)<br>- 处理网络错误 (ETIMEDOUT, ECONNREFUSED)<br>- 处理 JSON 解析错误 | `node -e "const {mapError}=require('./cloudfunctions/shared/llm-core/error-mapping.js');const e=new Error('test');console.log('mapError:',typeof mapError)"` |
| 1.4 | **创建重试逻辑** `cloudfunctions/shared/llm-core/retry.js`<br>- retryWithBackoff(fn, options)<br>- 指数退避 (baseDelay=1s, maxDelay=60s)<br>- 最大重试次数 (maxRetries=3)<br>- 仅对 retryable=true 的错误重试 | `node -e "const {retryWithBackoff}=require('./cloudfunctions/shared/llm-core/retry.js');console.log('retryWithBackoff:',typeof retryWithBackoff)"` |
| 1.5 | **创建配置管理** `cloudfunctions/shared/llm-core/config.js`<br>- getConfig() 读取环境变量<br>- 默认值：provider=minimax, model=mimo-v2-flash<br>- 验证必需的 API Key | `node -e "const {getConfig}=require('./cloudfunctions/shared/llm-core/config.js');const cfg=getConfig();console.log('provider:',cfg.provider,'model:',cfg.model)"` |
| 1.6 | **创建 MiniMax 客户端** `cloudfunctions/shared/llm-core/minimax-client.js`<br>- MiniMaxClient 类<br>- complete(params) 方法（OpenAI 兼容格式）<br>- 内置重试和错误映射<br>- 支持 systemPrompt, userPrompt, temperature, maxTokens | `node -e "const {MiniMaxClient}=require('./cloudfunctions/shared/llm-core/minimax-client.js');console.log('MiniMaxClient:',typeof MiniMaxClient)"` |
| 1.7 | **创建统一导出** `cloudfunctions/shared/llm-core/index.js`<br>- 导出所有异常类<br>- 导出 createLLMClient() 工厂函数<br>- 导出 mapError, retryWithBackoff, getConfig | `node -e "const {createLLMClient,LLMAPIError}=require('./cloudfunctions/shared/llm-core/index.js');console.log('createLLMClient:',typeof createLLMClient,'LLMAPIError:',typeof LLMAPIError)"` |

### Phase 1 验收标准

- [ ] 所有文件创建完成
- [ ] `node -e "require('./cloudfunctions/shared/llm-core/index.js')"` 无错误
- [ ] `getConfig()` 正确读取环境变量
- [ ] `mapError()` 正确映射 401/429/5xx 错误
- [ ] `retryWithBackoff()` 在测试场景下正确重试

---

## Phase 2: 迁移现有代码

### 2.1 迁移 generateAiQuestion (最复杂，优先)

| Step | Action | Verification Gate | Risk |
|------|--------|-------------------|------|
| 2.1.1 | **备份原始文件**<br>`cp cloudfunctions/generateAiQuestion/index.js cloudfunctions/generateAiQuestion/index.js.bak` | 文件存在 | 低 |
| 2.1.2 | **分析依赖关系**<br>- 确认 LlmClient 内嵌类的使用位置<br>- 确认 safeFetch 的调用范围<br>- 确认 generateQuestion 函数的调用者 | `grep -n "new LlmClient\|safeFetch\|generateQuestion" cloudfunctions/generateAiQuestion/index.js` | 低 |
| 2.1.3 | **重构 LlmClient 为使用 llm-core**<br>- 删除内嵌 LlmClient 类<br>- 从 llm-core 导入 createLLMClient<br>- 保留 ImageClient（独立功能）<br>- 保留 parseLlmResponse, validateQuestion（业务逻辑）<br>- 保留 postProcessLatex（业务逻辑） | `grep -n "class LlmClient" cloudfunctions/generateAiQuestion/index.js \| wc -l` 输出 0 | 中 |
| 2.1.4 | **重构 generateQuestion 函数**<br>- 使用 llm-core 的重试机制替代内嵌重试<br>- 移除手动 429 处理<br>- 确保异常类型正确 | `grep -n "isRateLimit\|exponential backoff" cloudfunctions/generateAiQuestion/index.js \| wc -l` 输出 0 | 中 |
| 2.1.5 | **保留 safeFetch 作为兼容层**<br>- 标记为 @deprecated<br>- 仅在 ImageClient 中使用 | `grep -n "safeFetch" cloudfunctions/generateAiQuestion/index.js` 仅出现在 ImageClient | 低 |
| 2.1.6 | **云函数部署测试**<br>- 部署到微信云开发<br>- 调用 generateAiQuestion 验证功能 | 微信小程序调用成功 | 高 |

### 2.2 迁移 startAssessment

| Step | Action | Verification Gate | Risk |
|------|--------|-------------------|------|
| 2.2.1 | **备份原始文件**<br>`cp cloudfunctions/startAssessment/llm_client.js cloudfunctions/startAssessment/llm_client.js.bak` | 文件存在 | 低 |
| 2.2.2 | **分析使用情况**<br>- startAssessment/index.js 中的调用<br>- evaluator.js 中的调用<br>- 确认 callWithTimeout 的使用（evaluator.js） | `grep -rn "LlmClient\|parseLlmResponse\|validateQuestion" cloudfunctions/startAssessment/ --include="*.js" \| grep -v node_modules \| grep -v ".bak"` | 低 |
| 2.2.3 | **创建兼容适配器**<br>- `startAssessment/llm_client.js` 现在是 llm-core 的薄包装<br>- 保留原有的 API（generate, callWithTimeout）<br>- 内部使用 llm-core 的 MiniMaxClient | `node -e "const {LlmClient}=require('./cloudfunctions/startAssessment/llm_client.js');console.log('LlmClient:',typeof LlmClient)"` | 中 |
| 2.2.4 | **重构 evaluator.js**<br>- 使用 llm-core 的超时控制<br>- 移除 callWithTimeout（集成到 llm-core） | `grep -n "callWithTimeout" cloudfunctions/startAssessment/evaluator.js \| wc -l` 输出 0 | 中 |
| 2.2.5 | **云函数部署测试** | 微信小程序调用成功 | 高 |

### 2.3 迁移 initQuestionBank

| Step | Action | Verification Gate | Risk |
|------|--------|-------------------|------|
| 2.3.1 | **备份原始文件**<br>`cp cloudfunctions/initQuestionBank/shared/llm-client.js cloudfunctions/initQuestionBank/shared/llm-client.js.bak` | 文件存在 | 低 |
| 2.3.2 | **分析使用情况**<br>- 确认 initQuestionBank/shared/question_bank.js 的调用 | `grep -rn "LlmClient" cloudfunctions/initQuestionBank/shared/ --include="*.js"` | 低 |
| 2.3.3 | **替换为 llm-core**<br>- question_bank.js 直接使用 llm-core<br>- 删除 initQuestionBank/shared/llm-client.js | `ls cloudfunctions/initQuestionBank/shared/llm-client.js 2>/dev/null \| wc -l` 输出 0 | 中 |
| 2.3.4 | **验证功能** | 手动运行迁移成功 | 低 |

### 2.4 迁移 practice_v2 (最复杂，含状态跟踪)

| Step | Action | Verification Gate | Risk |
|------|--------|-------------------|------|
| 2.4.1 | **备份原始文件**<br>`cp cloudfunctions/practice_v2/llm_client.js cloudfunctions/practice_v2/llm_client.js.bak` | 文件存在 | 低 |
| 2.4.2 | **分析特有功能**<br>- generateQuestion 方法<br>- _detectScenario, _detectTriple, _detectPattern<br>- GenerationState 集成<br>- SubjectLoader, QuestionValidator 集成 | `grep -n "generateQuestion\|_detect\|GenerationState\|SubjectLoader" cloudfunctions/practice_v2/llm_client.js` | 低 |
| 2.4.3 | **分离业务逻辑和 LLM 调用**<br>- 保留业务逻辑（_detect*, state）<br>- LLM 调用部分使用 llm-core<br>- 创建 QuestionService 类组合两者 | `grep -n "http.request\|https.request" cloudfunctions/practice_v2/llm_client.js \| wc -l` 输出 0 | 高 |
| 2.4.4 | **保留兼容 API**<br>- generateQuestion(params) 保留<br>- 内部调用 llm-core.complete() | `node -e "const {LlmClient}=require('./cloudfunctions/practice_v2/llm_client.js');console.log('generateQuestion:',typeof new LlmClient().generateQuestion)"` | 中 |
| 2.4.5 | **云函数部署测试** | 微信小程序调用成功 | 高 |

### 2.5 清理 shared/llm-client.js (最终清理)

| Step | Action | Verification Gate | Risk |
|------|--------|-------------------|------|
| 2.5.1 | **分析使用情况**<br>- 确认 shared/question_bank.js 的调用 | `grep -rn "shared/llm-client" cloudfunctions/ --include="*.js" \| grep -v node_modules` | 低 |
| 2.5.2 | **更新 question_bank.js**<br>- 使用 llm-core 替代 shared/llm-client.js | `grep -n "shared/llm-client" cloudfunctions/shared/question_bank.js \| wc -l` 输出 0 | 中 |
| 2.5.3 | **删除旧文件**<br>`rm cloudfunctions/shared/llm-client.js` | `ls cloudfunctions/shared/llm-client.js 2>/dev/null \| wc -l` 输出 0 | 低 |

### Phase 2 验收标准

- [ ] 所有 5 个 LlmClient 实现迁移完成
- [ ] 所有云函数部署成功
- [ ] 微信小程序端功能正常（生成题目、开始测评、练习）
- [ ] 无 console.error 输出（除预期的错误日志）

---

## Phase 3: 测试

### 3.1 单元测试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.1.1 | **创建测试目录** `cloudfunctions/shared/llm-core/tests/` | 目录存在 |
| 3.1.2 | **异常体系测试**<br>`exceptions.test.js`<br>- 测试 LLMError, LLMConfigError, LLMAPIError, LLMParseError<br>- 测试 retryable, retryAfter 字段 | `npm test -- exceptions.test.js` |
| 3.1.3 | **错误映射测试**<br>`error-mapping.test.js`<br>- 模拟 401, 429, 500, 超时等错误<br>- 验证映射结果 | `npm test -- error-mapping.test.js` |
| 3.1.4 | **重试逻辑测试**<br>`retry.test.js`<br>- 模拟可重试和不可重试错误<br>- 验证指数退避和最大重试次数 | `npm test -- retry.test.js` |
| 3.1.5 | **配置管理测试**<br>`config.test.js`<br>- 测试环境变量读取<br>- 测试默认值 | `npm test -- config.test.js` |

### 3.2 集成测试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.2.1 | **创建集成测试目录** `cloudfunctions/shared/llm-core/tests/integration/` | 目录存在 |
| 3.2.2 | **正常调用测试**<br>- 使用测试 API Key 调用 complete()<br>- 验证返回格式 | `node tests/integration/normal.test.js` |
| 3.2.3 | **429 限流测试**<br>- Mock 429 响应<br>- 验证重试逻辑 | `node tests/integration/rate-limit.test.js` |
| 3.2.4 | **超时测试**<br>- Mock 超时<br>- 验证 LLMAPIError 抛出 | `node tests/integration/timeout.test.js` |
| 3.2.5 | **认证失败测试**<br>- 使用无效 API Key<br>- 验证 401 错误处理 | `node tests/integration/auth.test.js` |

### 3.3 端到端测试

| Step | Action | Verification Gate |
|------|--------|-------------------|
| 3.3.1 | **generateAiQuestion 测试**<br>- 微信小程序调用生成题目<br>- 验证题目格式和图片生成 | 小程序端验证 |
| 3.3.2 | **startAssessment 测试**<br>- 调用开始测评<br>- 验证题目返回和队列模式 | 小程序端验证 |
| 3.3.3 | **practice_v2 测试**<br>- 调用练习功能<br>- 验证薄弱点练习 | 小程序端验证 |

### Phase 3 验收标准

- [ ] 单元测试覆盖率 >= 75%
- [ ] 所有集成测试通过
- [ ] 端到端测试通过（3 个核心场景）
- [ ] 无性能退化

---

## 依赖分析

### 迁移顺序依赖

```
Phase 1 (必须先完成)
  └─> Phase 2.1 (generateAiQuestion)
       └─> Phase 2.2 (startAssessment)
       └─> Phase 2.3 (initQuestionBank)
       └─> Phase 2.4 (practice_v2)
       └─> Phase 2.5 (shared清理)
  └─> Phase 3 (测试)
```

### 关键风险点

1. **practice_v2 状态跟踪丢失**
   - 缓解：保留 _detect*, state 相关逻辑，仅替换 LLM 调用部分

2. **ImageClient 依赖 safeFetch**
   - 缓解：safeFetch 标记 deprecated，保留在 generateAiQuestion 中

3. **evaluator.js 的 callWithTimeout**
   - 缓解：llm-core 的超时控制可以替代，验证功能一致

4. **云函数部署失败**
   - 缓解：每个步骤完成后立即部署测试，不累积变更

---

## 回滚计划

每个迁移步骤都保留了 `.bak` 备份文件。如需回滚：

```bash
# 回滚特定文件
cp cloudfunctions/generateAiQuestion/index.js.bak cloudfunctions/generateAiQuestion/index.js

# 回滚整个 Phase 2
for f in cloudfunctions/*/index.js.bak cloudfunctions/*/llm_client.js.bak; do
  cp "$f" "${f%.bak}"
done
```

---

## 总体验收标准

- [ ] **代码统一**：5 处 LlmClient 合并为 llm-core
- [ ] **异常体系**：可区分 Config/API/Parse 三类错误
- [ ] **重试机制**：429/5xx/超时自动重试，指数退避
- [ ] **可配置**：所有参数通过环境变量设置
- [ ] **单元测试**：核心模块覆盖 >= 75%
- [ ] **集成测试**：正常/429/超时/认证失败场景覆盖
- [ ] **端到端测试**：3 个核心云函数功能正常
