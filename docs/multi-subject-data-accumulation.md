# 多科目 IRT 数据积累指南

## 目标
将 IRT 数据积累从单一科目（数学8年级，297道题）扩展到全科目覆盖。

## 已创建资源

### 1. 云函数
`cloudfunctions/multiSubjectMockAssessments/index.js`
- 支持多科目模拟测评生成
- 覆盖：语数英 + 理化生 + 史地政
- 支持不同能力水平（θ: -2.5 ~ +2.5）

### 2. 执行脚本
`scripts/multi-subject-data-accumulation.js`
- 批量调用云函数
- 按优先级分批生成
- 自动检查覆盖情况

## 部署步骤

### 1. 部署云函数
```bash
# 使用微信开发者工具CLI
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  cloud functions deploy \
  --env cloud1-7gg9y9tjb2b867b6 \
  --paths cloudfunctions/multiSubjectMockAssessments

# 或使用 CloudBase CLI
tcb fn deploy multiSubjectMockAssessments \
  --dir cloudfunctions/multiSubjectMockAssessments
```

### 2. 执行数据积累
```bash
node scripts/multi-subject-data-accumulation.js
```

## 目标数据量

| 科目 | 年级 | 每年级测评数 | 预计积累答题数据 |
|------|------|--------------|------------------|
| 数学 | 7-9 | 20×3 | ~1800条 |
| 语文 | 7-9 | 15×3 | ~1350条 |
| 英语 | 7-9 | 15×3 | ~1350条 |
| 物理 | 8-9 | 15×2 | ~900条 |
| 化学 | 9 | 15 | ~450条 |
| 生物 | 7-9 | 10×3 | ~900条 |
| 地理 | 7-9 | 10×3 | ~900条 |
| 历史 | 7-9 | 10×3 | ~900条 |
| 政治 | 7-9 | 10×3 | ~900条 |

**总计**: ~9450条答题数据

## 验证

### 检查数据积累
```bash
tcb fn invoke multiSubjectMockAssessments --params '{"action":"checkCoverage"}'
```

### 检查 IRT 参数覆盖
```bash
tcb fn invoke updateIRTParams --params '{"action":"status"}'
```

## 后续

1. 真实用户答题数据积累后，使用 `irtParameterUpdate` 更新参数
2. 定期检查参数精度和置信度
3. 根据实际数据调整算法

## 优先级

**HIGH**: 数学、物理、化学（中考主科）
**MEDIUM**: 语文、英语、生物
**LOW**: 地理、历史、政治
