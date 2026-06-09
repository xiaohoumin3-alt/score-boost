# 上下游依赖深度审查报告

## 审查结论

⚠️ **发现关键遗漏：实施计划未覆盖所有LLM调用路径**

---

## 完整LLM调用链

### 调用层次结构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        云函数入口 (index.js)                             │
│                    db = cloud.database() ✅ 有 db 实例                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  方式A: 直接env   │   │  方式B: 独立Client  │   │  方式C: llm-core   │
│                   │   │                   │   │                   │
│ process.env.LLM_* │   │ new LlmClient()   │   │ createLLMClient() │
└───────────────────┘   └───────────────────┘   └───────────────────┘
                                │                           │
                                ▼                           ▼
                    ┌───────────────────┐   ┌───────────────────┐
                    │ llm-client.js    │   │ llm-core/index.js │
                    │ (薄包装层)        │   │                   │
                    │ constructor()     │   │ createLLMClient() │
                    │   ├─ process.env  │   │   ├─ getConfig()  │
                    │   └─ createLLM() │   │   └─ new Client() │
                    └───────────────────┘   └───────────────────┘
                                                        │
                                                        ▼
                                        ┌───────────────────────────┐
                                        │ llm-core/config.js       │
                                        │ ┌─────────────────────┐  │
                                        │ │ getConfig()         │  │
                                        │ │ ↓                   │  │
                                        │ │ process.env.LLM_*  │  │
                                        │ └─────────────────────┘  │
                                        └───────────────────────────┘
```

---

## 关键发现

### 1. 独立 LlmClient 类绕过 getConfig()

**位置**：`cloudfunctions/generateAiQuestion/index.js` 第 247-255 行

**问题**：
```javascript
class LlmClient {
  constructor(config = {}) {
    // 直接读取环境变量
    this.apiKey = config.apiKey || process.env.LLM_API_KEY;
    this.baseUrl = config.baseUrl || process.env.LLM_BASE_URL || '...';
    this.model = config.model || process.env.LLM_MODEL || 'deepseek-chat';

    // 传递完整参数给 createLLMClient，不会触发 getConfig()
    this._client = createLLMClient({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: this.model,
      ...
    });
  }
}
```

**影响**：
- 实施计划中 Phase 2.2 的修改**不完整**
- 即使 `LlmClient` 增加 `loadConfig(db)` 方法，构造函数仍然先读取环境变量
- 需要同时修改构造函数逻辑

---

### 2. llm-core/config.js 需要改造为异步

**当前位置**：`shared/llm-core/config.js` 第 25 行

**当前**：
```javascript
function getConfig() {  // 同步函数
  const env = typeof process !== 'undefined' ? process.env : {}
  // 只读环境变量，无法访问数据库
}
```

**需要改为**：
```javascript
async function getConfig(db) {  // 异步函数，接收 db 参数
  if (db) {
    // 尝试从数据库读取
    try {
      const { getConfig: getDbConfig } = require('../llm-config-db');
      const dbConfig = await getDbConfig(db);
      return { ... };
    } catch (e) {
      // 回退到环境变量
    }
  }
  // 环境变量回退逻辑
}
```

**影响**：
- `createLLMClient()` 需要支持异步配置加载
- 所有调用 `createLLMClient()` 的地方需要 await

---

### 3. shared/question-generator.js 间接依赖

**位置**：`cloudfunctions/*/shared/question-generator.js` 第 82 行

**当前**：
```javascript
async function generateSingleQuestion(params) {
  const llm = createLLMClient();  // 无参数，会触发 getConfig()
  // ...
}
```

**问题**：
- `generateSingleQuestion` 没有接收 `db` 参数
- 无法传递 `db` 给 `getConfig()`

**需要改为**：
```javascript
async function generateSingleQuestion(params, db) {
  const llm = createLLMClient({ db });  // 传递 db
  // 或者
  const config = await getConfig(db);
  const llm = createLLMClient(config);
}
```

---

## 实施计划遗漏点

| 遗漏点 | 位置 | 影响 | 优先级 |
|-------|------|------|--------|
| `shared/question-generator.js` 修改 | 10+个云函数共享 | 这些云函数无法使用数据库配置 | **P0** |
| `llm-core/index.js` 异步支持 | createLLMClient | getConfig() 改为异步后无法调用 | **P0** |
| `llm-client.js` 薄包装层改造 | 3个独立副本 | 构造函数绕过 getConfig() | **P1** |
| `createLLMClient()` 签名变更 | 所有调用点 | 需要传递 db 或支持异步 | **P1** |

---

## 完整修改清单（更新后）

### P0：核心配置层（扩展）

**1.1** ✅ 创建 `shared/llm-config-db.js` （已列入计划）

**1.2** ✅ 修改 `shared/llm-core/config.js` 支持数据库（已列入计划）
- **补充**：需改为异步函数 `async function getConfig(db)`

**1.3** ❌ **新增**：修改 `shared/llm-core/index.js`
```javascript
// createLLMClient 需要支持 db 参数
function createLLMClient(options = {}) {
  const config = options.db ? await getConfig(options.db) : getConfig();
  // ...
}
```

**1.4** ❌ **新增**：修改 `shared/question-generator.js`
```javascript
async function generateSingleQuestion(params, db) {
  const llm = createLLMClient({ db });  // 传递 db
  // ...
}
```

### P1：核心云函数（扩展）

**2.1** ✅ `questionGenerator/index.js` （已列入计划）
- **补充**：如果使用 `shared/question-generator.js`，需要传递 `db` 参数

**2.2** ⚠️ `generateAiQuestion/index.js` （已列入计划，但不完整）
- **修正**：除了添加 `loadConfig(db)` 方法，还需要修改构造函数逻辑

**2.3** ✅ `scheduledTaskGenerator/index.js` （已列入计划）

### P2：薄包装层（新增）

**3.1** ❌ **新增**：修改 `cloudfunctions/generateAiQuestion/shared/llm-client.js`
**3.2** ❌ **新增**：修改 `cloudfunctions/startAssessment/llm_client.js`
**3.3** ❌ **新增**：修改 `cloudfunctions/practice_v2/llm_client.js`

这些文件需要改造构造函数，支持数据库配置。

---

## 严丝合缝集成方案

### 方案A：最小改动（推荐）

**核心思路**：保持 `getConfig()` 同步，在调用前异步加载数据库配置

```javascript
// llm-core/config.js
let cachedConfig = null;  // 缓存配置

async function loadConfig(db) {
  if (cachedConfig) return cachedConfig;

  try {
    const { getConfig: getDbConfig } = require('../llm-config-db');
    cachedConfig = await getDbConfig(db);
    return cachedConfig;
  } catch (e) {
    return null;  // 表示数据库配置不可用
  }
}

function getConfig() {
  if (cachedConfig) {
    return {
      apiKey: cachedConfig.apiKey,
      baseUrl: cachedConfig.baseUrl,
      model: cachedConfig.model,
      // ...
    };
  }
  // 回退到环境变量
  const env = typeof process !== 'undefined' ? process.env : {}
  return {
    apiKey: env.LLM_API_KEY || '',
    baseUrl: env.LLM_BASE_URL || 'https://api.deepseek.com',
    model: env.LLM_MODEL || 'deepseek-chat',
    // ...
  };
}
```

**在云函数入口处加载配置**：
```javascript
// cloudfunctions/*/index.js
exports.main = async (event, context) => {
  const db = cloud.database();

  // 加载LLM配置
  const { loadConfig } = require('./shared/llm-core/config');
  await loadConfig(db);  // 预加载到缓存

  // 后续调用 getConfig() 会使用缓存
  // ...
}
```

**优点**：
- `getConfig()` 保持同步，不破坏现有调用链
- 只需在每个云函数入口添加一行 `await loadConfig(db)`
- 向后兼容

**缺点**：
- 需要修改每个云函数的入口（68+个）

---

### 方案B：全面异步改造

**核心思路**：将 `getConfig()` 改为异步，所有调用点 await

**优点**：
- 架构更清晰
- 支持运行时动态切换

**缺点**：
- 需要修改大量代码
- 破坏性变更，风险高

---

## 推荐方案

**采用方案A（最小改动）**

实施步骤：

1. **P0.1**：修改 `shared/llm-core/config.js`，添加 `loadConfig(db)` 函数
2. **P0.2**：创建 `shared/llm-config-db.js`
3. **P0.3**：在8个核心云函数的入口添加 `await loadConfig(db)`
4. **P1**：其他60+个云函数按需添加

---

## 验证命令（新增）

```bash
# 1. 验证配置加载
# 在云函数日志中查找
tcb logs questionGenerator | grep "loadConfig"

# 预期输出
[Config] loadConfig() called
[Config] DB config loaded: deepseek
[Config] Cached config for subsequent calls

# 2. 验证缓存生效
# 第二次调用应该使用缓存，不查询数据库
tcb logs questionGenerator | grep "Using cached config"

# 3. 验证回退逻辑
# 删除数据库配置后
tcb logs questionGenerator | grep "Fallback to env"
```

---

## 依赖关系完整性检查

| 检查项 | 状态 | 说明 |
|-------|------|------|
| 所有云函数都有 db 实例 | ✅ | `db = cloud.database()` |
| llm-core 可被所有云函数访问 | ✅ | shared 目录 |
| question-generator 被广泛使用 | ⚠️ | 需要传递 db 参数 |
| 独立 llm-client 存在 | ⚠️ | 需要改造构造函数 |
| 配置缓存机制 | ❌ | 需要实现 |

---

## 结论

✅ **原实施计划需要补充**：
1. 添加 `shared/question-generator.js` 修改
2. 添加 `llm-core/index.js` 异步支持或缓存机制
3. 添加独立 `llm-client.js` 改造

✅ **推荐采用方案A（最小改动）**：
- 使用配置缓存机制
- 保持 `getConfig()` 同步
- 在云函数入口预加载配置

---

**下一步**：更新实施计划，采用方案A。
