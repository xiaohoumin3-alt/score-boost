# 测试方案文档

> 生成日期: 2026-06-07
> 对应修复方案: [fix-plan.md](../docs/architecture/fix-plan.md)

---

## 测试架构

```
tests/
├── README.md                          # 本文档
├── run-all-tests.sh                   # 统一测试运行脚本
├── regression/                        # 回归测试
│   ├── assessment-full-chain.test.js  # G2: 测评全链路
│   ├── practice-full-chain.test.js    # G3: 练习全链路
│   └── global-acceptance.test.js      # G4-G7: 总体验收
│
cloudfunctions/shared/__tests__/       # 单元测试（修复验证）
├── question-normalizer.test.js        # P0-01: 题目归一化
├── api-layer-unified.test.js          # P0-02: API层统一
├── scheduled-task-generator.test.js   # P0-03: 安全验证
├── practice-v1-deprecated.test.js     # P1-03: v1废弃
├── knowledge-tree-unified.test.js     # P1-01: 知识树去重
├── code-dedup-verification.test.js    # P1-01: 代码去重验证
├── student-id-unified.test.js         # P2-01: student_id统一
└── queue-cleanup-robust.test.js       # P2-05: 队列清理健壮化
```

---

## 运行方式

```bash
# 运行全部测试
bash tests/run-all-tests.sh

# 仅运行单元测试（修复验证）
bash tests/run-all-tests.sh --unit

# 仅运行回归测试（全链路）
bash tests/run-all-tests.sh --regression

# 运行并生成覆盖率报告
bash tests/run-all-tests.sh --coverage

# 使用 jest 直接运行单个测试文件
npx jest cloudfunctions/shared/__tests__/question-normalizer.test.js --verbose
```

---

## 测试与验收标准映射

### 单元测试（验证修复正确性）

| 测试文件 | 验收标准 | 测试数 | 说明 |
|---------|---------|-------|------|
| `question-normalizer.test.js` | P0-01 A1-A5 | 20+ | normalizeOptions/normalizeAnswer/normalizeQuestion/formatQuestionForApi 全覆盖 |
| `knowledge-tree-unified.test.js` | P1-01 A6-A7 | 10+ | 9科知识点加载、kp_id唯一性、结构规范 |
| `scheduled-task-generator.test.js` | P0-03 A1-A4 | 6+ | 无明文密钥、环境变量、动态知识点、集合目标 |
| `api-layer-unified.test.js` | P0-02 A1-A4 | 3+ | 前端无api.js引用、科目映射完整 |
| `practice-v1-deprecated.test.js` | P1-03 A2-A4 | 3+ | v1废弃标记、QUESTION_BANK清空、cloudApi调用v2 |
| `code-dedup-verification.test.js` | P1-01 A1-A3 | 6+ | llm-core/knowledge_tree/llm_client 副本数验证 |
| `student-id-unified.test.js` | P2-01 A1-A2 | 4+ | 服务端wxContext验证、不信任前端参数 |
| `queue-cleanup-robust.test.js` | P2-05 A1-A4 | 5+ | 无TARGET_QUEUE_ID、重试逻辑、不删除failed |

### 回归测试（验证全链路不回退）

| 测试文件 | 验收标准 | 测试数 | 说明 |
|---------|---------|-------|------|
| `assessment-full-chain.test.js` | G2 | 5+ | 测评→答题→判分 全链路数据一致性 |
| `practice-full-chain.test.js` | G3 | 15+ | 练习→难度调整→复习间隔→错误分类 全链路 |
| `global-acceptance.test.js` | G4-G7 | 15+ | 无密钥、零重复、知识树覆盖、Schema验证 |

---

## 测试分类说明

### 单元测试
- **目标**：验证每个修复点的代码逻辑正确
- **特点**：不依赖外部服务（mock数据库/LLM）
- **运行频率**：每次代码修改后

### 回归测试
- **目标**：验证核心业务流程未因修复而回退
- **特点**：端到端验证数据流（mock数据库但不mock业务逻辑）
- **运行频率**：每次 Phase 完成后

### 已有测试
- **目标**：确保修复不破坏现有功能
- **特点**：项目中原有的 ~50 个测试文件
- **运行频率**：每次提交前

---

## 持续集成建议

```yaml
# .github/workflows/test.yml 示例
name: Test
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: bash tests/run-all-tests.sh --unit

  regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: bash tests/run-all-tests.sh --regression
```
