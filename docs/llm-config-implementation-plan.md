# LLM 动态配置与架构优化实施计划

## 【三原则审视】
1. **2/8**：核心20%是配置缓存机制 + 数据库配置 + 消除代码重复。其余80%（完整监控、多Provider同时活跃等）暂时不做。
2. **第一性原理**：根本问题是配置分散在101处且无法运行时切换，以及15个llm-core副本造成2.3MB浪费。通过统一配置层+数据库存储解决。
3. **收益递减**：当前方案已够用。HTTP keep-alive等性能优化可延后，避免过度设计。

---

## Phase 1：数据库准备

| Step | Action | 文件路径 | Verification Gate | 依赖 | 风险 |
|------|--------|----------|-------------------|------|------|
| 1.1 | 创建 `llm_config` 集合 | 微信云开发控制台 | 在控制台验证集合存在 | 无 | Low |
| 1.2 | 创建 `idx_active_provider` 唯一索引 | 微信云开发控制台 | `db.collection('llm_config').getIndexes()` 包含 `idx_active_provider` | 1.1 | Low |
| 1.3 | 添加初始 Provider 配置 | 微信云开发控制台 | `db.collection('llm_config').where({is_active:true}).get()` 返回1条记录 | 1.2 | Medium |
| 1.4 | 验证字段完整性 | 微信云开发控制台 | 确认 `_id, api_key, base_url, model, is_active, updated_at` 字段存在 | 1.3 | Low |

**Phase 1 完成验证**：
```bash
# 在微信云开发控制台执行
db.collection('llm_config').where({is_active:true}).get()
# 预期：返回一条 deepseek 记录
```

---

## Phase 2：核心代码改造（P0）

### P0-A：配置缓存机制

| Step | Action | 文件路径 | Verification Gate | 依赖 | 风险 |
|------|--------|----------|-------------------|------|------|
| 2.1 | 新增 `llm-config-db.js` 模块 | `cloudfunctions/shared/llm-config-db.js` | `require('./shared/llm-config-db')` 成功 | Phase 1 | Low |
| 2.2 | 修改 `config.js` - 添加 `loadConfig()` | `cloudfunctions/shared/llm-core/config.js` | 测试 `loadConfig(db)` 返回配置对象 | 2.1 | High |
| 2.3 | 修改 `config.js` - 添加缓存机制 | 同上 | 测试两次 `getConfig()` 返回同一对象 | 2.2 | Medium |
| 2.4 | 修改 `config.js` - 添加 `forceRefresh` | 同上 | 测试 `loadConfig(db, true)` 强制刷新 | 2.3 | Medium |
| 2.5 | 修改 `config.js` - 添加环境变量回退 | 同上 | 删除数据库配置后仍可用 | 2.4 | Medium |

**Step 2.2 详细修改**：
```javascript
// 在 config.js 顶部添加
let cachedConfig = null;
let cacheTimestamp = 0;

// 添加 loadConfig 函数
async function loadConfig(db, forceRefresh = false) {
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
    return loadFromEnv();
  }
}

// 修改导出
module.exports = {
  getConfig,
  loadConfig,      // 新增
  createTimeoutController
};
```

**Verification Gate**：
```bash
# 本地测试
cd cloudfunctions/shared/llm-core
node -e "
const { loadConfig, getConfig } = require('./config');
const mockDb = {
  collection: (name) => ({
    where: () => ({
      limit: () => ({
        get: () => Promise.resolve({ data: [{ _id: 'test', api_key: 'sk-test', base_url: 'https://test.com', model: 'test-model' }] })
      })
    })
  })
};
loadConfig(mockDb).then(c => console.log('Config loaded:', c._source));
"
```

---

### P0-B：共享模块依赖修改

| Step | Action | 文件路径 | Verification Gate | 依赖 | 风险 |
|------|--------|----------|-------------------|------|------|
| 2.6 | 修改 `question-generator.js` - 添加 `db` 参数 | `cloudfunctions/shared/question-generator.js` | 调用 `generateSingleQuestion(params, db)` 不报错 | 2.5 | Medium |
| 2.7 | 修改 `question-generator.js` - 调用 `loadConfig()` | 同上 | 验证配置已加载 | 2.6 | Medium |

**Step 2.6 详细修改**：
```javascript
// 原函数签名
async function generateSingleQuestion(params) {
  const llm = createLLMClient();
  // ...
}

// 修改为
async function generateSingleQuestion(params, db) {
  // 确保配置已加载
  const { loadConfig } = require('./llm-core/config');
  await loadConfig(db);
  
  const llm = createLLMClient();
  // ...
}

module.exports = {
  generateSingleQuestion,  // 函数签名已变更
  // ...
};
```

**Verification Gate**：
```bash
# 本地测试 - 验证函数接受 db 参数
node -e "
const { generateSingleQuestion } = require('./shared/question-generator');
console.log('Function signature check: params count:', generateSingleQuestion.length);
"
# 预期输出：2 (params, db)
```

**Step 2.7：修改调用点传递 db 参数**

| Step | Action | 文件路径 | Verification Gate | 风险 |
|------|--------|----------|-------------------|------|
| 2.7.1 | 修改 `questionGenerator/index.js` 调用点 | `cloudfunctions/questionGenerator/index.js` | 搜索 `generateSingleQuestion` 确认传递 `db` | Medium |
| 2.7.2 | 修改 `scheduledTaskGenerator/index.js` 调用点 | `cloudfunctions/scheduledTaskGenerator/index.js` | 同上 | Medium |

**Step 2.7.1 详细修改**：
```javascript
// 原调用
const result = await generateSingleQuestion(params);

// 修改为
const db = cloud.database();
const result = await generateSingleQuestion(params, db);
```

**Verification Gate**：
```bash
# 验证所有调用点已传递 db 参数
cd cloudfunctions
grep -r "generateSingleQuestion" . --include="*.js" --exclude-dir=node_modules -A 1 | grep -v "db"
# 预期：无输出（所有调用都已传递 db 参数）
```

---

### P0-C：统一 LLM 调用（重构 generateAiQuestion）

| Step | Action | 文件路径 | Verification Gate | 依赖 | 风险 |
|------|--------|----------|-------------------|------|------|
| 2.8 | 读取 `generateAiQuestion/index.js` | `cloudfunctions/generateAiQuestion/index.js` | 确认文件结构 | 无 | Low |
| 2.9 | 识别独立的 `LlmClient` 类位置 | 同上 | 找到第 246-517 行的类定义 | 2.8 | Low |
| 2.10 | 删除独立的 `LlmClient` 类 | 同上 | 文件减少约 270 行 | 2.9 | High |
| 2.11 | 添加统一模块引用 | 同上 | `require('../../../shared/llm-core')` 成功 | 2.10 | High |
| 2.12 | 修改 LLM 调用代码 | 同上 | 使用 `createLLMClient()` 替代原 `LlmClient` | 2.11 | High |

**Step 2.10-2.12 详细修改**：
```javascript
// 删除整个 LlmClient 类（第 246-517 行）

// 在文件顶部添加
const { createLLMClient } = require('../../../shared/llm-core');

// 在 main 函数中
exports.main = async (event, context) => {
  const db = getDb();
  
  // 预加载配置
  const { loadConfig } = require('../../../shared/llm-core/config');
  await loadConfig(db);
  
  // 创建客户端
  const llm = createLLMClient();
  
  // 使用客户端（替换原有的 LlmClient 调用）
  const result = await llm.complete({
    systemPrompt: '...',
    userPrompt: prompt,
    temperature: 0.7,
    maxTokens: 800
  });
};
```

**依赖分析（Bug 预防）**：
```bash
# 搜索残留引用
cd cloudfunctions/generateAiQuestion
grep -r "LlmClient" . --exclude-dir=node_modules
grep -r "require.*llm-client" . --exclude-dir=node_modules
# 预期：无输出
```

---

## Phase 3：消除代码重复（P0-D）

### 3.1：依赖分析（Bug 预防）

| Step | Action | Verification Gate | 风险 |
|------|--------|-------------------|------|
| 3.1.1 | 搜索所有 `require('./shared/llm-core')` 引用 | 找出 13 个云函数的引用位置 | High |
| 3.1.2 | 搜索所有 `require('./shared/llm-client')` 引用 | 找出 13 个云函数的引用位置 | High |
| 3.1.3 | 检查是否有定制化逻辑 | 确认副本是否可安全删除 | High |

**Verification Gate**：
```bash
cd cloudfunctions

# 搜索所有 llm-core 引用
find . -name "*.js" -not -path "./node_modules/*" -not -path "./shared/*" \
  -exec grep -l "require.*shared/llm-core" {} \;

# 搜索所有 llm-client 引用
find . -name "*.js" -not -path "./node_modules/*" -not -path "./shared/*" \
  -exec grep -l "require.*shared/llm-client" {} \;
```

### 3.2：删除 llm-core 副本

**云函数名单（14个）**：
1. startAssessment
2. practice_v2
3. initDatabase
4. generateAiQuestion
5. questionGenerator
6. getAssessment
7. submitAnswer
8. scheduledTaskGenerator
9. startExclusiveExam
10. uploadMaterial
11. initQuestionBank
12. studentMemory
13. recordKpRequest
14. migrateQuestionBank

| Step | Action | Verification Gate | 依赖 |
|------|--------|-------------------|------|
| 3.2.1 | 删除 `startAssessment/shared/llm-core/` | 目录不存在 | 3.1.3 |
| 3.2.2 | 删除 `practice_v2/shared/llm-core/` | 目录不存在 | 3.2.1 |
| 3.2.3 | 删除 `initDatabase/shared/llm-core/` | 目录不存在 | 3.2.2 |
| 3.2.4 | 删除 `generateAiQuestion/shared/llm-core/` | 目录不存在 | 3.2.3 |
| 3.2.5 | 删除 `questionGenerator/shared/llm-core/` | 目录不存在 | 3.2.4 |
| 3.2.6 | 删除 `getAssessment/shared/llm-core/` | 目录不存在 | 3.2.5 |
| 3.2.7 | 删除 `submitAnswer/shared/llm-core/` | 目录不存在 | 3.2.6 |
| 3.2.8 | 删除 `scheduledTaskGenerator/shared/llm-core/` | 目录不存在 | 3.2.7 |
| 3.2.9 | 删除 `startExclusiveExam/shared/llm-core/` | 目录不存在 | 3.2.8 |
| 3.2.10 | 删除 `uploadMaterial/shared/llm-core/` | 目录不存在 | 3.2.9 |
| 3.2.11 | 删除 `initQuestionBank/shared/llm-core/` | 目录不存在 | 3.2.10 |
| 3.2.12 | 删除 `studentMemory/shared/llm-core/` | 目录不存在 | 3.2.11 |
| 3.2.13 | 删除 `recordKpRequest/shared/llm-core/` | 目录不存在 | 3.2.12 |
| 3.2.14 | 删除 `migrateQuestionBank/shared/llm-core/` | 目录不存在 | 3.2.13 |

**Verification Gate（批量验证）**：
```bash
# 验证所有副本已删除
cd cloudfunctions
find . -type d -name "llm-core" -not -path "./shared/*" -not -path "./node_modules/*"
# 预期：无输出

# 验证唯一源保留
ls -la cloudfunctions/shared/llm-core/
# 预期：显示目录内容
```

### 3.3：修改引用路径

| Step | Action | 模式 | 风险 |
|------|--------|------|------|
| 3.3.1-3.3.14 | 修改 13 个云函数的引用路径 | `require('./shared/llm-core')` → `require('../../../shared/llm-core')` | High |

**Verification Gate（批量验证）**：
```bash
# 验证所有引用已更新
cd cloudfunctions
grep -r "require.*shared/llm-core" . --include="*.js" --exclude-dir=node_modules --exclude-dir=shared | grep -v "\.\./\.\./\.\./shared"
# 预期：无输出（所有引用都已改为 ../../../shared）

# 验证新引用有效
find . -name "*.js" -not -path "./node_modules/*" -not -path "./shared/*" \
  -exec grep -l "require.*\.\./\.\./\.\./shared/llm-core" {} \; | wc -l
# 预期：13 个文件
```

### 3.4：删除 llm-client 副本

| Step | Action | Verification Gate | 依赖 |
|------|--------|-------------------|------|
| 3.4.1-3.4.13 | 删除 13 个 `shared/llm-client.js` 副本 | 文件不存在 | 3.3 |

**注意**：保留以下定制化版本（如存在）：
- `cloudfunctions/uploadMaterial/llm-client.js`（根目录版本）
- `cloudfunctions/practice_v2/llm_client.js`（根目录版本）

**Verification Gate**：
```bash
# 验证副本已删除
cd cloudfunctions
find . -name "llm-client.js" -not -path "./shared/*" -not -path "./node_modules/*" | grep -v "/llm_client.js"
# 预期：无输出（或仅显示根目录的定制版本）
```

---

## Phase 4：直接使用环境变量的云函数（P1）

| Step | Action | 文件路径 | Verification Gate | 风险 |
|------|--------|----------|-------------------|------|
| 4.1 | 修改 `questionGenerator/index.js` | `cloudfunctions/questionGenerator/index.js` | `grep "getConfig"` 显示新引用 | Medium |
| 4.2 | 修改 `scheduledTaskGenerator/index.js` | `cloudfunctions/scheduledTaskGenerator/index.js` | 同上 | Medium |
| 4.3 | 修改 `getAssessment/index.js` | `cloudfunctions/getAssessment/index.js` | 同上 | Medium |
| 4.4 | 修改 `submitAnswer/index.js` | `cloudfunctions/submitAnswer/index.js` | 同上 | Medium |
| 4.5 | 修改 `startAssessment/index.js` | `cloudfunctions/startAssessment/index.js` | 同上 | Medium |

**Step 4.1 详细修改**：
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

---

## Phase 5：验证与部署

| Step | Action | Verification Gate | 风险 |
|------|--------|-------------------|------|
| 5.1 | 本地语法检查 | `npx eslint cloudfunctions/shared/llm-core/config.js` 无错误 | Low |
| 5.2 | 部署 `shared` 模块 | 微信云开发显示部署成功 | Medium |
| 5.3 | 部署 `questionGenerator` | 部署成功且触发器正常 | High |
| 5.4 | 部署 `generateAiQuestion` | 部署成功 | High |
| 5.5 | 部署其他修改的云函数 | 所有云函数状态正常 | High |
| 5.6 | 验证配置读取 | 云函数日志显示 `[Config] Loaded from DB: deepseek` | High |
| 5.7 | 验证缓存生效 | 第二次调用显示 `[Config] Using cached config` | Medium |
| 5.8 | 验证环境变量回退 | 删除数据库配置后仍可调用 | High |
| 5.9 | 验证强制刷新 | 修改数据库后新配置生效 | Medium |

---

## 风险评估与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 删除副本导致引用错误 | 高 | 中 | 1. 部署前搜索所有引用 2. 本地测试验证 3. 灰度部署 |
| 强制刷新未触发 | 中 | 低 | 1. 提供管理云函数手动刷新 2. 添加日志监控 |
| 索引创建失败 | 中 | 低 | 1. 部署前手动验证索引 2. 添加创建脚本 |
| 向后兼容性破坏 | 高 | 低 | 1. 保留环境变量回退逻辑 2. 测试回退路径 |

---

## 回滚计划

```bash
# 回滚步骤
# 1. 确保环境变量 LLM_API_KEY 等已设置
# 2. 删除数据库配置（或设置 is_active: false）
# 3. 环境变量回退逻辑会自动生效

# 紧急回滚
# 在微信云开发控制台执行
db.collection('llm_config').update({}, {
  data: { is_active: false }
});
```

---

## 成功标准

- [ ] 数据库 `llm_config` 集合已创建
- [ ] `idx_active_provider` 索引已创建
- [ ] 至少有一个 Provider 配置（is_active=true）
- [ ] 13 个 llm-core 副本已删除
- [ ] 13 个 llm-client 副本已删除
- [ ] `shared/llm-core/config.js` 支持 `loadConfig(db, forceRefresh)`
- [ ] `shared/question-generator.js` 增加 `db` 参数
- [ ] 所有云函数统一使用 `getConfig()`
- [ ] 调用 `loadConfig(db, true)` 后新配置立即生效
- [ ] 删除数据库配置后，自动回退到环境变量

---

## ★ 目标遵从性检查

| 目标 | 覆盖 | Phase | Steps |
|------|------|-------|-------|
| 目标1：运行时可配置 | 100% | Phase 1, 2, 5 | 1.1-1.4, 2.1-2.5, 5.6-5.9 |
| 目标1：多Provider支持 | 100% | Phase 1, 5 | 1.1-1.4, 5.9 |
| 目标1：向后兼容 | 100% | Phase 2, 5 | 2.5, 5.8 |
| 目标2：消除代码重复 | 100% | Phase 3 | 3.2.1-3.4.13 |
| 目标2：配置缓存机制 | 100% | Phase 2, 5 | 2.2-2.5, 5.7 |
| 目标2：统一LLM调用 | 100% | Phase 2, 3 | 2.8-2.12, 3.3.1-3.3.14 |
