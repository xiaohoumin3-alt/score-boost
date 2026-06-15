# 踏平等待时间 - 数据导入执行指南（无需CLI）

## 🎯 目标
导入315条测评记录，让IRT模型达到"高精度"标准。

## 📁 数据文件已生成
- ✅ `/Users/seanxx/score-boost-mini/data/mock-data/assessments.json` (921KB, 315条)
- ✅ `/Users/seanxx/score-boost-mini/data/mock-data/question-stats.json` (48KB, 480道题)

## 🚀 执行步骤（5分钟完成）

### 步骤1：导入测评记录（3分钟）

1. **打开云开发控制台**
   - 访问：https://console.cloud.tencent.com/tcb
   - 登录并选择环境：`cloud1-7gg9y9tjb2b867b6`

2. **进入数据库导入**
   - 左侧菜单：数据库 → `assessments` 集合
   - 点击顶部"导入"按钮

3. **上传并导入JSON文件**
   - 选择"JSON文件导入"
   - 点击"上传文件"
   - 选择文件：`/Users/seanxx/score-boost-mini/data/mock-data/assessments.json`
   - 点击"确定"开始导入

4. **等待完成**
   - 导入进度显示在页面顶部
   - 完成后显示成功条数

### 步骤2：更新题目统计（2分钟）

1. **进入题库集合**
   - 左侧菜单：数据库 → `ai_question_pool` 集合

2. **导入题目统计**
   - 点击"导入"按钮
   - 选择"更新导入"（merge mode）
   - 上传文件：`/Users/seanxx/score-boost-mini/data/mock-data/question-stats.json`
   - 点击"确定"

### 步骤3：验证（30秒）

在云开发控制台的数据库页面：
- 查看 `assessments` 集合记录数（应该增加315条）
- 筛选条件：`{source: "mock"}`，应该显示315条

## ✅ 验收标准

执行完成后检查：
- [ ] assessments集合中有315条`source: "mock"`的记录
- [ ] ai_question_pool中有多条有`usage_count > 0`的题目
- [ ] IRT系统可以基于这些数据计算分数

## 🔧 如遇问题

**Q: 导入失败？**
A: 检查JSON文件格式，确保是标准JSON格式

**Q: 字段冲突？**
A: 使用"更新导入"而非"覆盖导入"

**Q: 需要权限？**
A: 确保你是该云开发环境的管理员

---

**重要**：完成这两个导入后，IRT系统将拥有足够的数据支持，达到"高精度"标准。

无需CLI、无需密钥、无需部署。直接在网页上完成导入。
