# ScoreBoost 学习闭环增强 - 实施计划

*版本: v1.2 | 日期: 2026-05-25 | 设计文档: learning-loop-design.md v1.4*

## v1.2 更新
- 补充 app.json 页面注册 (N1) → Task 2.5
- 补充 result.js data 初始化 perfectShown (H10) → Task 4.4

## v1.1 更新
- 补充 app.json 页面注册 (N1)
- 补充 progress.json 验证
- 补充 perfectShown 初始化验证
- 补充排序 NaN 防护验证
- 补充 cloudApi.js 依赖验证

---

## 阶段1: M1 深度反馈系统 (2小时)

### Task 1.1: 修改 practice_v2 返回 typical_mistakes

**文件**: `cloudfunctions/practice_v2/index.js`

**操作**:
1. 在 `generateQuestionWithAI` 返回的 `result` 对象中添加 `typical_mistakes` 和 `knowledge_context`
2. 在最终返回的 questions 数组中传递这些字段

**验证命令**:
```bash
grep -n "typical_mistakes" cloudfunctions/practice_v2/index.js
```
预期: 找到至少 2 处 `typical_mistakes`

---

### Task 1.2: 为题库题目添加 typical_mistakes

**文件**: `cloudfunctions/practice_v2/question_bank.js`

**操作**: 为 kp2_3 (勾股定理应用) 的题目添加 `typical_mistakes` 字段

**验证命令**:
```bash
grep -n "typical_mistakes" cloudfunctions/practice_v2/question_bank.js
```
预期: 找到至少 1 处 `typical_mistakes`

---

### Task 1.3: 前端显示典型错误弹窗

**文件**: `pages/practice/practice.js`

**操作**: 在 `selectOption` 函数中，答错时显示 typical_mistakes 弹窗

**验证命令**:
```bash
grep -n "typical_mistakes" pages/practice/practice.js
```
预期: 找到 `typical_mistakes` 相关逻辑

---

### Task 1.4: 部署云函数并测试

**操作**:
```bash
# 更新 practice_v2 云函数
cd /Users/seanxx/score-boost-mini
tcb fn code update --name practice_v2 --projectPath ./cloudfunctions/practice_v2
```

**验证命令**:
```bash
# 检查云函数更新状态
tcb fn list | grep practice_v2
```
预期: 显示 practice_v2 的最新更新时间

---

## 阶段2: M2 进度可视化 (3小时)

### Task 2.1: 创建 progress 页面文件

**操作**: 创建以下文件
- `pages/progress/progress.js`
- `pages/progress/progress.wxml`
- `pages/progress/progress.wxss`
- `pages/progress/progress.json`

**验证命令**:
```bash
ls -la pages/progress/
```
预期: 显示 4 个文件

---

### Task 2.2: 实现 progress.js 逻辑

**文件**: `pages/progress/progress.js`

**操作**: 实现 `loadProgress` 函数调用 `getKpProgress` API

**验证命令**:
```bash
grep -n "getKpProgress" pages/progress/progress.js
```
预期: 找到 API 调用

---

### Task 2.3: 实现 progress.wxml 展示

**文件**: `pages/progress/progress.wxml`

**操作**: 实现知识点列表展示，包含状态图标 (✅/🔄/❌)

**验证命令**:
```bash
grep -n "current_difficulty" pages/progress/progress.wxml
```
预期: 找到状态判断逻辑

---

### Task 2.4: 首页添加进度入口

**文件**: `pages/home/home.js` + `pages/home/home.wxml`

**操作**: 添加 `viewProgress` 函数和入口按钮

**验证命令**:
```bash
grep -n "viewProgress" pages/home/home.js pages/home/home.wxml
```
预期: 找到 2 处 (js 定义 + wxml 绑定)

---

### Task 2.5: app.json 注册 progress 页面

**文件**: `app.json`

**操作**: 在 `pages` 数组中添加 `"pages/progress/progress"`

**验证命令**:
```bash
grep -n "pages/progress/progress" app.json
```
预期: 找到 progress 页面注册

---

## 阶段3: M3 复习触发机制 (2小时)

### Task 3.1: 修改 submitPracticeResult 计算复习时间

**文件**: `cloudfunctions/submitPracticeResult/index.js`

**操作**: 在更新进度后添加 `next_review_at` 和 `last_reviewed_at` 计算

**验证命令**:
```bash
grep -n "next_review_at" cloudfunctions/submitPracticeResult/index.js
```
预期: 找到 `next_review_at` 相关逻辑

---

### Task 3.2: 首页显示复习卡片

**文件**: `pages/home/home.js` + `pages/home/home.wxml`

**操作**: 添加 `loadPendingReviews` 函数和复习卡片展示

**验证命令**:
```bash
grep -n "pendingReviews\|loadPendingReviews" pages/home/home.js
```
预期: 找到复习加载和展示逻辑

---

### Task 3.3: 部署并测试

**操作**:
```bash
# 更新 submitPracticeResult 云函数
tcb fn code update --name submitPracticeResult --projectPath ./cloudfunctions/submitPracticeResult
```

---

## 阶段4: M4 成就系统 (2小时)

### Task 4.1: 首页加载成就数据

**文件**: `pages/home/home.js`

**操作**: 添加 `loadAchievements` 函数，计算最大连续正确数并识别成就

**验证命令**:
```bash
grep -n "loadAchievements\|achievements" pages/home/home.js
```
预期: 找到成就加载逻辑

---

### Task 4.2: 首页展示成就徽章

**文件**: `pages/home/home.wxml`

**操作**: 添加成就展示区域，显示 🔥💎👑 徽章

**验证命令**:
```bash
grep -n "achievement\|streak" pages/home/home.wxml
```
预期: 找到成就展示逻辑

---

### Task 4.3: 满分成就提示

**文件**: `pages/result/result.js`

**操作**: 在 `triggerConfetti` 中显示满分成就提示

**验证命令**:
```bash
grep -n "满分成就\|perfect" pages/result/result.js
```
预期: 找到满分成就提示

---

### Task 4.4: result.js data 初始化 perfectShown

**文件**: `pages/result/result.js`

**操作**: 在 Page({ data: { ... } }) 中添加 `perfectShown: false`

**验证命令**:
```bash
grep -n "perfectShown" pages/result/result.js
```
预期: 找到 perfectShown 初始化

---

## 阶段5: 集成测试

### Task 5.1: 小程序上传

**操作**:
```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" upload \
  --project /Users/seanxx/score-boost-mini \
  --appid wx1bdd9ea6620c4ae1 \
  --version 1.2.0 \
  --desc "学习闭环增强: 深度反馈+进度可视化+复习触发+成就系统"
```

**验证命令**:
```bash
# 检查上传是否成功
echo $?
```
预期: exit code 0

---

## 依赖关系

```
M1 (深度反馈)
    ↓
M2 (进度可视化) ← 依赖 M1 云函数返回 typical_mistakes
    ↓
M3 (复习触发) ← 依赖 M1 云函数提交结果
    ↓
M4 (成就系统) ← 依赖 M3 复习数据
    ↓
M5 (集成测试)
```

---

## 验收清单

| 任务 | 状态 | 验证命令 |
|------|------|----------|
| M1.1 typical_mistakes 返回 | ⬜ | `grep -n "typical_mistakes" practice_v2/index.js` |
| M1.2 题库添加 typical_mistakes | ⬜ | `grep -n "typical_mistakes" question_bank.js` |
| M1.3 前端弹窗显示 | ⬜ | `grep -n "typical_mistakes" practice.js` |
| M2.1 progress 页面创建 | ⬜ | `ls pages/progress/` |
| M2.2 getKpProgress 调用 | ⬜ | `grep -n "getKpProgress" progress.js` |
| M2.4 首页入口 | ⬜ | `grep -n "viewProgress" home.js` |
| M2.5 app.json 注册 | ⬜ | `grep -n "pages/progress" app.json` |
| M3.1 next_review_at 计算 | ⬜ | `grep -n "next_review_at" submitPracticeResult.js` |
| M3.2 复习卡片展示 | ⬜ | `grep -n "pendingReviews" home.js` |
| M4.1 成就加载 | ⬜ | `grep -n "loadAchievements" home.js` |
| M4.2 成就展示 | ⬜ | `grep -n "achievement" home.wxml` |
| M4.3 满分成就提示 | ⬜ | `grep -n "perfect" result.js` |
| M4.4 perfectShown 初始化 | ⬜ | `grep -n "perfectShown" result.js` |
| M5.1 小程序上传 | ⬜ | 上传成功 |
