# LLM 调用层重构设计文档

**日期**: 2026-05-29
**目标**: 将 score-boost-mini 的大模型调用重构为统一、鲁棒、可配置的多 Provider 架构

---

## 1. 背景与问题

### 当前问题

1. **代码重复**: 4 处独立的 `LlmClient` 实现
   - `generateAiQuestion/index.js`
   - `shared/llm-client.js`
   - `startAssessment/llm-client.js`
   - `initQuestionBank/shared/llm-client.js`

2. **缺乏鲁棒性**:
   - 错误处理不统一，某些错误未捕获
   - 重试机制简单，缺少智能退避
   - 无流量控制，可能触发限流
   - 无熔断器，连续失败时仍持续请求

3. **Provider 耦合**: 硬编码 MiniMax，无法切换

### 解决方案

参考 DeepTutor 生产级架构，设计统一的 LLM 调用层。

---

## 2. 核心目标

| 目标 | 描述 |
|------|------|
| 代码统一 | 消除重复，共享核心模块 |
| 鲁棒性 | 完整异常体系 + 智能重试 + 限流 + 熔断 |
| 可配置 | 通过环境变量切换 Provider 和模型 |
| 可测试 | 单元测试 + 集成测试覆盖 |

---

## 3. 架构设计

### 3.1 目录结构

**Phase 1（核心功能，立即实施）：**
```
cloudfunctions/
├── shared/
│   └── llm-core/                    # 新增统一 LLM 核心层
│       ├── config.js                 # 配置管理（环境变量读取）
│       ├── exceptions.js             # 异常体系（3类：Config/API/Parse）
│       ├── error-mapping.js           # 错误分类映射（401/429/超时）
│       ├── retry.js                  # 指数退避重试
│       ├── minimax-client.js          # MiniMax 实现 + 重试内置
│       └── index.js                   # 统一导出
├── generateAiQuestion/
│   └── index.js                      # 重构：使用 llm-core
├── startAssessment/
│   └── index.js                      # 重构：使用 llm-core
└── initQuestionBank/
    └── index.js                      # 重构：使用 llm-core
```

**暂缓功能（Phase 2，等有明确需求再加）：**
- `traffic-controller.js` - 限流器（多实例部署时需要）
- `circuit-breaker.js` - 熔断器（高并发场景需要）
- `provider-factory.js` - Provider 工厂（多 Provider 时需要）
- `providers/base-provider.js` - 基础 Provider 类

### 3.2 异常体系

**Phase 1 核心异常（3类）：**
```javascript
// LLMError 基类
class LLMError extends Error {
  constructor(message, code = 'LLM_ERROR') {
    super(message)
    this.code = code
    this.name = 'LLMError'
  }
}

// 配置错误（缺少 API Key 等）
class LLMConfigError extends LLMError {
  constructor(message) {
    super(message, 'LLM_CONFIG_ERROR')
    this.name = 'LLMConfigError'
  }
}

// API 调用失败
class LLMAPIError extends LLMError {
  constructor(message, status = null, retryable = false, retryAfter = null) {
    super(message, 'LLM_API_ERROR')
    this.status = status
    this.retryable = retryable
    this.retryAfter = retryAfter
    this.name = 'LLMAPIError'
  }
}

// 响应解析失败
class LLMParseError extends LLMError {
  constructor(message, rawContent = null) {
    super(message, 'LLM_PARSE_ERROR')
    this.rawContent = rawContent
    this.name = 'LLMParseError'
  }
}
```

**暂缓异常（Phase 2）：**
- `LLMTimeoutError` - 可用 `LLMAPIError` + `retryable=true` 表示
- `LLMRateLimitError` - 可用 `LLMAPIError` + `status=429` + `retryAfter` 表示
- `LLMAuthError` - 可用 `LLMAPIError` + `status=401` 表示

### 3.3 错误映射规则

**Phase 1 核心映射：**
| 错误来源 | 判断条件 | 映射类型 | retryable |
|----------|----------|----------|-----------|
| HTTP 401 | `status === 401` | `LLMAPIError` | false |
| HTTP 429 | `status === 429` | `LLMAPIError` | true |
| 超时 | `error.code === 'ETIMEDOUT' \|\| 'Request timeout'` | `LLMAPIError` | true |
| 消息内容含限流 | `"rate limit" in message.toLowerCase()` | `LLMAPIError` | true |
| 5xx 服务器错误 | `status >= 500` | `LLMAPIError` | true |
| 网络错误 | `code === 'ECONNREFUSED' \|\| 'ENOTFOUND'` | `LLMAPIError` | true |
| JSON 解析失败 | `JSON.parse()` 抛出异常 | `LLMParseError` | false |
| 响应格式错误 | `!response.choices` | `LLMParseError` | false |

**映射函数签名：**
```javascript
function mapError(error, context = {}) {
  // 返回适当的异常实例
  // context 可包含: { status, body, retryAfter }
}
```

### 3.4 重试策略

**指数退避：**
```javascript
// 临时错误标记
const RETRYABLE_STATUS = [429, 500, 502, 503, 504]
const RETRYABLE_CODES = ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND']

// 指数退避计算
delay = min(baseDelay * 2^attempt, maxDelay)
// 默认: baseDelay=1s, maxDelay=60s, maxRetries=3
```

**重试流程：**
1. 检查 `error.retryable === true`
2. 如果是，等待 `delay` 后重试
3. 达到 `maxRetries` 后抛出原始异常

---

### 暂缓功能（Phase 2）

以下功能等有明确需求时再实现：

**TrafficController（限流器）：**
```javascript
class TrafficController {
  maxConcurrency: 20      // 最大并发
  requestsPerMinute: 600  // RPM 限制
}
```

**CircuitBreaker（熔断器）：**
```javascript
class CircuitBreaker {
  failureThreshold: 5     // 连续失败次数阈值
  recoveryTimeout: 60     // 恢复探测间隔（秒）
  // 状态: closed → open → half-open → closed
  // half-open 恢复条件: 连续 2 次成功
}
```

---

## 4. 配置管理

### 4.1 环境变量（Phase 1）

```bash
# Provider 配置
LLM_PROVIDER=minimax          # provider 类型（仅 minimax）
LLM_API_KEY=xxx              # API 密钥（必需）
LLM_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1  # API 端点
LLM_MODEL=mimo-v2-flash      # 模型名称

# 重试与超时
LLM_MAX_RETRIES=3             # 默认 3
LLM_TIMEOUT_MS=30000          # 默认 30000ms
LLM_RETRY_DELAY_MS=1000       # 基础延迟，默认 1000ms
```

**配置优先级**: 环境变量 > 代码默认值

### 4.2 暂缓配置（Phase 2）

```bash
# 限流配置（多实例部署时需要）
LLM_MAX_CONCURRENCY=20
LLM_REQUESTS_PER_MINUTE=600

# 熔断器配置（高并发场景需要）
LLM_CIRCUIT_FAILURE_THRESHOLD=5
LLM_CIRCUIT_RECOVERY_TIMEOUT=60
```

---

## 5. 使用方式

### 5.1 基本调用

```javascript
const { createLLMClient } = require('../shared/llm-core')

// 创建客户端
const llm = createLLMClient()

// 生成题目
const result = await llm.complete({
  systemPrompt: '你是一个出题助手',
  userPrompt: '出一道数学题',
  temperature: 0.7,
  maxTokens: 500
})

// result 结构:
// {
//   content: string,
//   finishReason: string,
//   usage?: { promptTokens: number, completionTokens: number }
// }
console.log(result.content)
```

### 5.2 错误处理

```javascript
const { LLMError, LLMAPIError } = require('../shared/llm-core')

try {
  const result = await llm.complete({ ... })
} catch (error) {
  if (error instanceof LLMAPIError) {
    if (error.status === 429 && error.retryAfter) {
      // 处理限流
      console.log(`限流，等待 ${error.retryAfter}s`)
    } else if (error.status === 401) {
      // 处理认证失败
      console.log(`认证失败，请检查 API Key`)
    } else if (error.retryable) {
      // 处理可重试错误
      console.log(`可重试错误: ${error.message}`)
    } else {
      // 处理其他 API 错误
      console.log(`API 错误 (${error.status}): ${error.message}`)
    }
  } else if (error instanceof LLMError) {
    console.error(`LLM 错误: ${error.message}`)
  }
}
```

---

## 6. 兼容性

### 6.1 MiniMax API 兼容

- OpenAI 兼容格式 (`/v1/chat/completions`)
- 支持 `messages` 数组格式
- 支持 `temperature`, `max_tokens` 参数

### 6.2 微信云函数环境

- 使用原生 `fetch`（Node.js 18+）
- 保留 `safeFetch` 作为 fallback
- AbortController 控制超时

---

## 7. 测试覆盖

### 7.1 单元测试（Phase 1）

| 模块 | 测试内容 | 覆盖目标 |
|------|----------|----------|
| `exceptions.js` | 异常类型正确性、字段完整性 | 90% |
| `error-mapping.js` | 错误映射准确性（所有 HTTP 状态码） | 85% |
| `retry.js` | 指数退避计算、最大重试限制 | 80% |
| `minimax-client.js` | 正常请求、错误处理、重试逻辑 | 75% |

### 7.2 集成测试（Phase 1）

| 场景 | 验证点 | 优先级 |
|------|--------|--------|
| 正常调用 | 返回正确响应 | 高 |
| 429 限流 | 触发重试、退避 | 高 |
| 超时 | 抛出 `LLMAPIError` + `retryable=true` | 高 |
| 认证失败 | 抛出 `LLMAPIError` + `status=401` | 中 |
| JSON 解析失败 | 抛出 `LLMParseError` | 中 |

### 7.3 暂缓测试（Phase 2）

| 场景 | 验证点 |
|------|--------|
| 熔断触发 | 连续失败后拒绝请求 |
| 熔断恢复 | 半开状态成功后恢复 |
| 限流并发 | 并发控制、令牌获取 |

---

## 8. 迁移计划

### 阶段 1: 创建共享模块（Phase 1）

1. 创建 `cloudfunctions/shared/llm-core/` 目录
2. 实现异常体系 (`exceptions.js`)
3. 实现错误映射 (`error-mapping.js`)
4. 实现重试逻辑 (`retry.js`)
5. 实现 MiniMax 客户端 (`minimax-client.js`)
6. 实现配置管理 (`config.js`)
7. 实现统一导出 (`index.js`)

### 阶段 2: 迁移现有代码（Phase 1）

1. 迁移 `generateAiQuestion/index.js`
2. 迁移 `startAssessment/` 相关文件
3. 迁移 `initQuestionBank/` 相关文件
4. 删除旧的 `shared/llm-client.js`（或保留兼容）

### 阶段 3: 测试（Phase 1）

1. 编写单元测试
2. 编写集成测试
3. 验证所有场景

### 阶段 4: 暂缓功能（Phase 2，等需求明确）

1. 实现限流器 (`traffic-controller.js`)
2. 实现熔断器 (`circuit-breaker.js`)
3. 实现 Provider 工厂 (`provider-factory.js`)
4. 支持其他 Provider

---

## 9. 验收标准

### Phase 1（本次实施）

- [ ] **代码统一**: 4 处重复的 `LlmClient` 合并为统一 `llm-core`
- [ ] **异常体系**: 可区分 Config/API/Parse 三类错误，`LLMAPIError` 包含 `status`、`retryable`、`retryAfter` 字段
- [ ] **重试机制**: 429/5xx/超时自动重试，指数退避 (1s → 60s)，最多 3 次
- [ ] **可配置**: 所有参数通过环境变量设置，配置优先级正确
- [ ] **单元测试**: 核心模块覆盖 >= 75%
- [ ] **集成测试**: 正常调用/429/超时/认证失败场景覆盖

### Phase 2（暂缓，等需求明确）

- [ ] **限流器**: 并发控制（可配置），RPM 限制（可配置）
- [ ] **熔断器**: 连续失败后拒绝请求，半开状态恢复
- [ ] **多 Provider**: 支持切换 Provider，预留扩展接口

---

## 10. 参考

- DeepTutor LLM 调用架构: `/Users/seanxx/DeepTutor/deeptutor/services/llm/`