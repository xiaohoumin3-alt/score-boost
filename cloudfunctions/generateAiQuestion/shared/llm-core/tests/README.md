# LLM Core 测试

测试 llm-core 统一 LLM 调用层。

## 运行测试

```bash
# 安装依赖
npm install

# 运行所有测试
npm test

# 仅运行单元测试
npm run test:unit

# 仅运行集成测试（需要有效的 API Key）
npm run test:integration

# 运行测试并生成覆盖率报告
npm run test:coverage
```

## 测试结构

```
tests/
├── exceptions.test.js      # 异常体系测试
├── error-mapping.test.js    # 错误映射测试
├── retry.test.js            # 重试逻辑测试
├── config.test.js           # 配置管理测试
└── integration/
    └── minimax-client.test.js  # MiniMax 客户端集成测试
```

## 集成测试环境变量

运行集成测试前设置：

```bash
export LLM_API_KEY=your_api_key_here
export LLM_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
export LLM_MODEL=mimo-v2-flash
```

## 预期覆盖率

| 模块 | 覆盖率目标 |
|------|-----------|
| exceptions.js | 90% |
| error-mapping.js | 85% |
| retry.js | 80% |
| config.js | 75% |
| minimax-client.js | 70% |
