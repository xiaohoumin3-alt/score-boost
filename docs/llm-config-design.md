# LLM 动态配置与架构优化设计方案（Swarm审查修复版）

## 概述

本次改造同时解决两个问题，实现**运行时可配置**和**架构升级**：

### 问题1：配置管理
- 配置写在 `cloudbaserc.json`，修改需重新部署
- 无法在运行时切换 Provider
- 配置读取分散在101处，难以统一管理

### 问题2：架构债务
- 代码重复：llm-core 被15个云函数复制（约2.3MB）
- 独立实现：多个 LLM 客户端，配置不一致
- 性能问题：每次调用都重新读取配置，无HTTP连接复用

---

## 双核心目标

### 目标1：多 Provider 配置支持
1. **运行时可配置**：修改数据库立即生效
2. **多 Provider 支持**：可配置并切换多个 Provider
3. **向后兼容**：环境变量作为后备

### 目标2：架构优化升级
1. **消除代码重复**：统一 llm-core 为单一模块
2. **配置缓存机制**：避免重复读取环境变量
3. **统一 LLM 调用**：消除独立的 LLM 客户端实现

---

## 架构诊断结果

### 发现的问题统计

| 严重程度 | 数量 |
|---------|------|
| CRITICAL | 6 |
| HIGH | 12 |
| MEDIUM | 14 |
| LOW | 10 |
| **总计** | **42** |

### 按类别分布

| 类别 | 数量 | 主要问题 |
|------|------|---------|
| config | 10 | 配置重复读取、路径混乱 |
| consistency | 13 | API不统一、日志不一致、错误处理不一致 |
| maintainability | 8 | 15个llm-core副本、14个llm-client副本 |
| dependency | 7 | 紧密耦合、模块依赖复杂 |
| performance | 3 | 无连接复用、超时配置错误 |
| security | 1 | (略) |

---

## 架构设计（优化后）

### 配置读取优先级

```
数据库配置（强制刷新） → 缓存配置 → 环境变量 → 代码默认值
```

### 配置刷新策略

**关键设计**：分离"读取缓存"和"强制刷新"

```javascript
// 场景1：云函数启动 - 预加载配置到缓存
await loadConfig(db);  // 首次从数据库加载

// 场景2：LLM调用 - 使用缓存配置
const config = getConfig();  // 同步返回缓存

// 场景3：手动切换Provider - 强制刷新
await loadConfig(db, true);  // 强制从数据库重新加载
```

### 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                    统一架构（改造后）                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  cloudfunctions/shared/                                     │
│  ├── llm-core/              (唯一LLM核心层)                 │
│  │   ├── config.js         (配置缓存 + 数据库读取)           │
│  │   ├── index.js           (createLLMClient)               │
│  │   ├── minimax-client.js  (HTTP客户端)                    │
│  │   ├── retry.js           (统一重试)                      │
│  │   ├── exceptions.js      (统一异常类)                    │
│  │   └── error-mapping.js   (统一错误映射)                  │
│  ├── llm-client.js          (薄包装层，可选)                │
│  ├── llm-config-db.js       (数据库配置)                    │
│  └── question-generator.js  (修改：增加db参数)              │
│                                                             │
│  所有云函数通过 ../../../shared/ 引用                        │
│  删除各云函数目录下的 llm-core/ 和 llm-client.js 副本          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据库设计（简化版）

### Collection: llm_config

```javascript
{
  _id: "deepseek",              // Provider ID (主键)
  api_key: "sk-xxx",            // API Key（明文）
  base_url: "https://api.deepseek.com",
  model: "deepseek-chat",
  is_active: true,              // 当前激活（全局唯一）
  updated_at: Date
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 是 | Provider ID，作为文档主键 |
| `api_key` | string | 是 | API Key（明文，与 env 安全模型一致） |
| `base_url` | string | 是 | API 端点 |
| `model` | string | 是 | 模型名称 |
| `is_active` | boolean | 是 | 是否为当前激活的 Provider（全局唯一） |
| `updated_at` | Date | 自动 | 更新时间 |

### 数据库索引

```javascript
// 在 llm_config 集合上创建唯一索引
db.collection('llm_config').createIndex(
  { is_active: 1 },
  { 
    unique: true,  // 全局只能有一个激活配置
    name: 'idx_active_provider',
    partialFilterExpression: { is_active: true }
  }
);
```

**索引作用**：
- 确保全局只有一个 `is_active: true` 的记录
- 加速查询当前激活的 Provider

---

## 代码改动

### 新增文件

#### 1. cloudfunctions/shared/llm-config-db.js

```javascript
/**
 * LLM 数据库配置模块
 */

/**
 * 获取当前激活的 Provider 配置
 * @param {Object} db - 数据库实例
 * @returns {Promise<Object>} 配置对象
 */
async function getConfig(db) {
  try {
    const res = await db.collection('llm_config')
      .where({ is_active: true })
      .limit(1)
      .get();

    if (res.data && res.data.length > 0) {
      const config = res.data[0];
      
      // 字段完整性验证
      if (!config.api_key || !config.base_url || !config.model) {
        throw new Error('Invalid config: missing required fields');
      }

      console.log('[LLM Config DB] Using provider:', config._id);
      
      return {
        apiKey: config.api_key,
        baseUrl: config.base_url,
        model: config.model,
        providerId: config._id
      };
    }

    throw new Error('No active provider found');
  } catch (e) {
    console.log('[LLM Config DB] Read failed:', e.message);
    throw e;
  }
}

module.exports = { getConfig };
```

---

### 修改文件（按依赖关系）

#### P0-A：核心配置层 - 配置缓存机制

**1. cloudfunctions/shared/llm-core/config.js**

```javascript
/**
 * LLM 配置管理模块（优化版）
 * 
 * 特性：
 * 1. 配置缓存：避免重复读取
 * 2. 数据库优先：支持从数据库读取配置
 * 3. 强制刷新：支持运行时切换 Provider
 * 4. 向后兼容：数据库失败时回退到环境变量
 */

const { LLMConfigError } = require('./exceptions');

// 模块级配置缓存
let cachedConfig = null;
let cacheTimestamp = 0;

/**
 * 预加载配置（在云函数启动时调用）
 * @param {Object} db - 数据库实例
 * @param {boolean} forceRefresh - 是否强制刷新（默认false）
 */
async function loadConfig(db, forceRefresh = false) {
  // 如果有缓存且未过期且不强制刷新，直接返回
  if (!forceRefresh && cachedConfig && cacheTimestamp > 0) {
    console.log('[Config] Using cached config');
    return cachedConfig;
  }

  try {
    const { getConfig: getDbConfig } = require('../llm-config-db');
    const dbConfig = await getDbConfig(db);
    
    cachedConfig = {
      apiKey: dbConfig.apiKey,
      baseUrl: dbConfig.baseUrl,
      model: dbConfig.model,
      maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '2', 10),
      timeout: parseInt(process.env.LLM_TIMEOUT_MS || '45000', 10),
      retryDelay: parseInt(process.env.LLM_RETRY_DELAY_MS || '1000', 10),
      maxDelay: parseInt(process.env.LLM_MAX_RETRY_DELAY_MS || '10000', 10),
      _source: 'database',
      _providerId: dbConfig.providerId
    };
    cacheTimestamp = Date.now();
    
    console.log('[Config] Loaded from DB:', cachedConfig._providerId);
    return cachedConfig;
  } catch (e) {
    console.log('[Config] DB load failed, using env:', e.message);
    // 继续使用环境变量
    return loadFromEnv();
  }
}

/**
 * 从环境变量加载配置
 */
function loadFromEnv() {
  const env = typeof process !== 'undefined' ? process.env : {};
  
  cachedConfig = {
    apiKey: env.LLM_API_KEY || '',
    baseUrl: env.LLM_BASE_URL || 'https://api.deepseek.com',
    model: env.LLM_MODEL || 'deepseek-chat',
    maxRetries: parseInt(env.LLM_MAX_RETRIES || '2', 10),
    timeout: parseInt(env.LLM_TIMEOUT_MS || '45000', 10),
    retryDelay: parseInt(env.LLM_RETRY_DELAY_MS || '1000', 10),
    maxDelay: parseInt(env.LLM_MAX_RETRY_DELAY_MS || '10000', 10),
    _source: 'env'
  };
  cacheTimestamp = Date.now();
  
  return cachedConfig;
}

/**
 * 获取配置（同步，使用缓存）
 * 
 * 优先级：缓存 > 环境变量 > 默认值
 * 
 * @returns {Object} 配置对象
 * @throws {LLMConfigError} 缺少必需配置时抛出
 */
function getConfig() {
  // 如果有缓存，直接返回
  if (cachedConfig && cacheTimestamp > 0) {
    return cachedConfig;
  }
  
  // 否则从环境变量加载
  const config = loadFromEnv();
  
  // 验证配置
  if (!config.apiKey) {
    throw new LLMConfigError('LLM_API_KEY not configured');
  }

  return config;
}

/**
 * 创建带超时的 AbortController
 */
function createTimeoutController(timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  controller.signal.addEventListener('abort', () => clearTimeout(timer));
  return controller;
}

module.exports = {
  getConfig,
  loadConfig,      // 预加载/强制刷新配置
  loadFromEnv,     // 从环境变量加载
  createTimeoutController
};
```

**关键改进**：
- 配置缓存：永久缓存，直到强制刷新
- 强制刷新：`loadConfig(db, true)` 实现运行时切换
- 同步 `getConfig()`：保持向后兼容

---

#### P0-B：共享模块依赖修改

**2. cloudfunctions/shared/question-generator.js**

修改函数签名，增加 `db` 参数：

```javascript
// 原函数签名
async function generateSingleQuestion(params) {
  const llm = createLLMClient();
  // ...
}

// 修改为
async function generateSingleQuestion(params, db) {
  // 确保配置已加载
  const { loadConfig } = require('../llm-core/config');
  await loadConfig(db);
  
  const llm = createLLMClient();
  // ...
}
```

**影响范围**：所有调用 `generateSingleQuestion` 的云函数需要传递 `db` 参数。

---

#### P0-C：统一 LLM 调用

**3. cloudfunctions/generateAiQuestion/index.js**

删除独立的 `LlmClient` 类（第 246-517 行），使用统一模块：

```javascript
// 删除独立的 LlmClient 类

// 使用统一的 llm-core
const { createLLMClient } = require('../../../shared/llm-core');

exports.main = async (event, context) => {
  const db = cloud.database();
  
  // 预加载配置
  const { loadConfig } = require('../../../shared/llm-core/config');
  await loadConfig(db);
  
  // 创建客户端
  const llm = createLLMClient();
  
  // 使用客户端
  const result = await llm.complete({
    systemPrompt: '...',
    userPrompt: prompt,
    temperature: 0.9,
    maxTokens: 800
  });
};
```

---

#### P0-D：消除代码重复

**4. 删除所有 llm-core/ 副本**

| 云函数 | 操作 |
|-------|------|
| questionGenerator/shared/llm-core/ | 删除 |
| scheduledTaskGenerator/shared/llm-core/ | 删除 |
| generateAiQuestion/shared/llm-core/ | 删除 |
| initQuestionBank/shared/llm-core/ | 删除 |
| studentMemory/shared/llm-core/ | 删除 |
| initDatabase/shared/llm-core/ | 删除 |
| migrateQuestionBank/shared/llm-core/ | 删除 |
| submitAnswer/shared/llm-core/ | 删除 |
| startExclusiveExam/shared/llm-core/ | 删除 |
| getAssessment/shared/llm-core/ | 删除 |
| recordKpRequest/shared/llm-core/ | 删除 |
| uploadMaterial/shared/llm-core/ | 删除 |
| practice_v2/shared/llm-core/ | 删除 |
| startAssessment/shared/llm-core/ | 删除 |

**保留唯一源**：
- `cloudfunctions/shared/llm-core/`（不删除）

**修改引用**：
- 将所有 `require('./shared/llm-core')` 改为 `require('../../../shared/llm-core')`

---

**5. 删除所有 llm-client.js 副本**

| 位置 | 操作 |
|------|------|
| questionGenerator/shared/llm-client.js | 删除 |
| scheduledTaskGenerator/shared/llm-client.js | 删除 |
| generateAiQuestion/shared/llm-client.js | 删除 |
| initQuestionBank/shared/llm-client.js | 删除 |
| studentMemory/shared/llm-client.js | 删除 |
| initDatabase/shared/llm-client.js | 删除 |
| migrateQuestionBank/shared/llm-client.js | 删除 |
| submitAnswer/shared/llm-client.js | 删除 |
| startExclusiveExam/shared/llm-client.js | 删除 |
| getAssessment/shared/llm-client.js | 删除 |
| recordKpRequest/shared/llm-client.js | 删除 |
| uploadMaterial/shared/llm-client.js | 删除 |
| practice_v2/shared/llm-client.js | 删除 |
| startAssessment/shared/llm-client.js | 删除 |

**保留唯一源**：
- `cloudfunctions/shared/llm-client.js`（不删除）

**修改引用**：
- 将所有 `require('./shared/llm-client')` 改为 `require('../../../shared/llm-client')`

**保留定制化版本**（如存在业务逻辑）：
- `cloudfunctions/practice_v2/llm_client.js`（根目录版本，保留）
- `cloudfunctions/startAssessment/llm_client.js`（根目录版本，保留）

---

#### P1：直接使用环境变量的云函数

**6. cloudfunctions/questionGenerator/index.js**

修改第 347-349 行：

```javascript
// 原代码
const apiKey = process.env.LLM_API_KEY;
const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
const model = process.env.LLM_MODEL || 'deepseek-chat';

// 修改为
const { getConfig } = require('../../../shared/llm-core/config');
const config = getConfig();
const apiKey = config.apiKey;
const baseUrl = config.baseUrl;
const model = config.model;
```

**7. cloudfunctions/scheduledTaskGenerator/index.js**

删除第 15-21 行的 `LLM_CONFIG` 常量。

**8-10.** 同样修改 `parentAssessment/index.js`、`practice_v2/index.js`、`startAssessment/index.js`。

---

## 初始化流程

### 手动创建（推荐）

在微信云开发控制台操作：

1. 数据库 → 新建集合 `llm_config`
2. 创建索引：
   ```javascript
   db.collection('llm_config').createIndex(
     { is_active: 1 },
     { unique: true, name: 'idx_active_provider' }
   );
   ```
3. 添加记录：

```json
{
  "_id": "deepseek",
  "api_key": "sk-your-api-key",
  "base_url": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "is_active": true,
  "updated_at": {"$date": "2025-01-09T00:00:00Z"}
}
```

---

## 使用方式

### 修改当前 Provider

```
1. 将当前 is_active: true 改为 false
2. 将目标 Provider 的 is_active 改为 true
3. 调用云函数时会使用新配置
```

### 强制刷新配置（如果需要）

如果需要在运行时立即生效而不等待下一次云函数调用：

```javascript
// 在管理云函数中
const db = cloud.database();
const { loadConfig } = require('./shared/llm-core/config');
await loadConfig(db, true);  // 强制刷新
```

---

## 测试计划（具体实现）

### 单元测试

**llm-config-db.test.js**：

```javascript
const { getConfig } = require('../shared/llm-config-db');

describe('LLM Config DB', () => {
  it('should return active provider config', async () => {
    const mockDb = {
      collection: () => ({
        where: () => ({
          limit: () => ({
            get: () => ({
              data: [{ 
                _id: 'deepseek',
                api_key: 'sk-test',
                base_url: 'https://api.test.com',
                model: 'test-model'
              }]
            })
          })
        })
      })
    };
    
    const config = await getConfig(mockDb);
    expect(config.providerId).toBe('deepseek');
    expect(config.apiKey).toBe('sk-test');
  });

  it('should throw when no active provider', async () => {
    const mockDb = {
      collection: () => ({
        where: () => ({
          limit: () => ({
            get: () => ({ data: [] })
          })
        })
      })
    };
    
    await expect(getConfig(mockDb)).rejects.toThrow('No active provider');
  });

  it('should throw when config missing required fields', async () => {
    const mockDb = {
      collection: () => ({
        where: () => ({
          limit: () => ({
            get: () => ({
              data: [{ _id: 'test', api_key: '' }]  // 缺少 base_url
            })
          })
        })
      })
    };
    
    await expect(getConfig(mockDb)).rejects.toThrow('missing required fields');
  });
});
```

**config.test.js**：

```javascript
const { loadConfig, getConfig } = require('../shared/llm-core/config');

describe('Config Cache', () => {
  beforeEach(() => {
    // 清除缓存
    jest.clearAllMocks();
  });

  it('should load config from DB', async () => {
    const mockDb = { /* ... */ };
    const config = await loadConfig(mockDb);
    expect(config._source).toBe('database');
  });

  it('should fallback to env when DB fails', async () => {
    process.env.LLM_API_KEY = 'sk-env';
    const mockDb = { 
      collection: () => { throw new Error('DB error'); }
    };
    
    const config = await loadConfig(mockDb);
    expect(config._source).toBe('env');
    expect(config.apiKey).toBe('sk-env');
  });

  it('should use cached config on subsequent calls', async () => {
    const mockDb = { /* ... */ };
    await loadConfig(mockDb);
    
    const config1 = getConfig();
    const config2 = getConfig();
    
    expect(config1).toBe(config2);
  });

  it('should force refresh when forceRefresh=true', async () => {
    const mockDb = { /* ... */ };
    await loadConfig(mockDb, false);
    
    // 修改数据库...
    // 强制刷新
    await loadConfig(mockDb, true);
    
    const config = getConfig();
    expect(config._providerId).toBe('new-provider');
  });
});
```

### 集成测试

```bash
# 1. 验证配置读取
# 在云函数日志中查找
tcb logs questionGenerator | grep "Using provider"

# 预期输出
[LLM Config DB] Using provider: deepseek

# 2. 验证缓存生效
# 第二次调用应该使用缓存
tcb logs questionGenerator | grep "Using cached config"

# 3. 验证回退逻辑
# 删除数据库配置后
tcb logs questionGenerator | grep "DB load failed, using env"

# 4. 验证索引创建
db.collection('llm_config').getIndexes()
# 预期输出包含 idx_active_provider
```

---

## 实施检查清单

### 数据库
- [ ] 创建 `llm_config` collection
- [ ] 创建 `idx_active_provider` 唯一索引
- [ ] 添加至少一个 Provider 配置（deepseek）

### 代码（按依赖顺序）

#### P0-A：配置缓存
- [ ] 修改 `shared/llm-core/config.js`
  - 添加 `loadConfig(db, forceRefresh)` 函数
  - 保持 `getConfig()` 同步
  - 实现强制刷新逻辑

#### P0-B：共享模块
- [ ] 修改 `shared/question-generator.js`
  - 增加 `db` 参数
  - 调用 `loadConfig(db)`

#### P0-C：统一 LLM 调用
- [ ] 重构 `generateAiQuestion/index.js`
  - 删除独立的 `LlmClient` 类
  - 使用 `shared/llm-core` 模块

#### P0-D：消除代码重复
- [ ] 删除 14 个云函数目录下的 `llm-core/` 副本
- [ ] 删除 14 个云函数目录下的 `llm-client.js` 副本
- [ ] 修改所有引用路径为 `../../../shared/llm-core`
- [ ] 修改所有引用路径为 `../../../shared/llm-client`

#### P1：直接使用环境变量的云函数
- [ ] 修改 `questionGenerator/index.js`
- [ ] 修改 `scheduledTaskGenerator/index.js`
- [ ] 修改 `parentAssessment/index.js`
- [ ] 修改 `practice_v2/index.js`
- [ ] 修改 `startAssessment/index.js`

### 验证
- [ ] 部署云函数
- [ ] 测试配置读取（数据库 → env → default）
- [ ] 测试配置缓存机制
- [ ] 测试强制刷新（`loadConfig(db, true)`）
- [ ] 验证索引生效（只能有一个 `is_active: true`）
- [ ] 验证向后兼容（删除数据库配置）

---

## 架构改进效果

### 改进前 vs 改进后

| 指标 | 改进前 | 改进后 | 改善 |
|------|--------|--------|------|
| 代码重复 | 2.3MB × 15 | 单一模块 | -34.5MB |
| 配置读取点 | 101处分散 | 统一 getConfig() | -90% |
| LLM客户端实现 | 3种独立 | 1种统一 | -67% |
| 配置缓存 | 无 | 永久缓存+强制刷新 | 重复读取-100% |
| 新增云函数 | 手动复制2.3MB | 直接引用 | 复杂度-80% |
| 数据库字段 | 7个字段 | 6个字段（删除enabled） | 简化-14% |

---

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 删除副本导致引用错误 | 高 | 中 | 部署前验证所有引用路径 |
| 强制刷新未触发 | 中 | 低 | 提供管理云函数手动刷新 |
| 索引创建失败 | 中 | 低 | 部署前手动验证索引 |
| 向后兼容性破坏 | 高 | 低 | 保留环境变量回退逻辑 |

---

## 回滚计划

如果部署后出现问题：

```bash
# 回滚步骤 1：确保环境变量 LLM_API_KEY 等已设置
# 回滚步骤 2：删除数据库配置（或设置 is_active: false）
# 回滚步骤 3：环境变量回退逻辑会自动生效
```

---

## 成功标准

- [ ] 数据库 `llm_config` 集合已创建
- [ ] `idx_active_provider` 索引已创建
- [ ] 至少有一个 Provider 配置（is_active=true）
- [ ] 14个 llm-core 副本已删除
- [ ] 14个 llm-client 副本已删除
- [ ] `shared/llm-core/config.js` 支持 `loadConfig(db, forceRefresh)`
- [ ] `shared/question-generator.js` 增加 `db` 参数
- [ ] 所有云函数统一使用 `getConfig()`
- [ ] 调用 `loadConfig(db, true)` 后新配置立即生效
- [ ] 删除数据库配置后，自动回退到环境变量
