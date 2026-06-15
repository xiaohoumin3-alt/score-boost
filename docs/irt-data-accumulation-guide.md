# IRT 数据积累执行指南

## 目标
踏平"等待时间"，为 IRT 模型积累足够的答题数据，达到"高精度"标准。

## 当前状态
- ✅ IRT 系统完整（5个云函数已部署）
- ✅ 核心模型完整（IRT + 分数映射）
- ⚠️ 数据积累不足（仅数学8年级，297道题）
- 🆕 bulkImportMockData 云函数已创建（待部署）

## 部署步骤

### 方式一：微信开发者工具（推荐）

1. 打开微信开发者工具
2. 打开项目：score-boost-mini
3. 进入云开发控制台
4. 云函数 → 点击"新建" → 选择"导入"
5. 选择 `cloudfunctions/bulkImportMockData` 目录
6. 确认配置：
   - 运行时：Nodejs 18.15
   - 超时：300秒
   - 内存：512MB
7. 点击"部署"

### 方式二：云开发控制台网页版

1. 登录 [腾讯云云开发控制台](https://console.cloud.tencent.com/tcb)
2. 选择环境：cloud1-7gg9y9tjb2b867b6
3. 云函数 → 函数管理 → 新建
4. 上传 `cloudfunctions/bulkImportMockData` 目录
5. 配置运行时和超时
6. 部署

## 执行数据积累

### 步骤1：检查当前状态
```bash
tcb fn invoke bulkImportMockData --params '{"action":"status"}'
```
或在小程序端调用：
```javascript
wx.cloud.callFunction({
  name: 'bulkImportMockData',
  data: { action: 'status' }
}).then(res => {
  console.log('当前状态:', res.result.data);
});
```

### 步骤2：更新题目统计（模拟答题数据）
```bash
tcb fn invoke bulkImportMockData --params '{"action":"updateQuestionStats"}'
```

### 步骤3：批量导入测评记录
```bash
tcb fn invoke bulkImportMockData --params '{"action":"importAssessments"}'
```

### 步骤4：完整导入（推荐）
一次性完成所有步骤：
```bash
tcb fn invoke bulkImportMockData --params '{"action":"fullImport"}'
```

## 预期结果

完整导入后，将生成：
- **测评记录**：315 条（覆盖9个科目，不同年级和年级）
- **题目统计更新**：约 1000 道题的答题数据

## 验证

### 检查测评记录数
```javascript
wx.cloud.database().collection('assessments')
  .where({ source: 'mock' })
  .count()
  .then(res => {
    console.log('模拟测评记录数:', res.total);
  });
```

### 检查题目统计
```javascript
wx.cloud.database().collection('ai_question_pool')
  .where({ usage_count: _.gt(0) })
  .count()
  .then(res => {
    console.log('有答题数据的题目数:', res.total);
  });
```

### 测试 IRT 分数预估
```bash
tcb fn invoke testIRTSystem --params '{"action":"test"}'
```

## 后续优化

1. **真实用户数据积累**：随着真实用户答题，使用 `irtParameterUpdate` 更新参数
2. **参数精度验证**：定期检查预估分数与实际分数的偏差
3. **科目扩展**：根据实际需要，调整 `SUBJECTS_GRADES` 配置

## 验收标准

- [ ] 315条模拟测评记录已导入
- [ ] 题目统计已更新（1000+道题有答题数据）
- [ ] testIRTSystem 测试通过
- [ ] IRT 能力值估计置信度 > 80%

## 故障排除

**问题**：云函数调用超时
**解决**：增加 `--timeout` 参数或使用 `fullImport` 分批处理

**问题**：数据导入失败
**解决**：检查云数据库连接和权限

**问题**：预估分数不准确
**解决**：增加数据量或调整 IRT 参数

---

*本指南旨在踏平"等待时间"门槛，让 IRT 模型直接达到成熟的程度。*
