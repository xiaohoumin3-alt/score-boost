# 答题历史浏览模式实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复答题流程中翻看历史题目后自动跳转导致答案丢失的问题。

**Architecture:** 引入 `isBrowsingHistory` 状态标志，通过翻看距离判断是否进入浏览模式。在浏览模式下选择答案不触发自动跳转。

**Tech Stack:** 微信小程序 WXML/WXSS/JS

---

## 修改文件清单

| 文件 | 职责 |
|------|------|
| `pages/assessment/assessment.js` | 测评页：添加浏览模式逻辑 |
| `pages/practice/practice.js` | 练习页：添加浏览模式逻辑 |

---

## Task 1: 修改测评页 (assessment.js)

**Files:**
- Modify: `pages/assessment/assessment.js:1-210`

- [ ] **Step 1: 添加 isBrowsingHistory 状态**

在 `data` 对象中添加新字段：
```javascript
data: {
  // ... 现有字段 ...
  isBrowsingHistory: false,  // 新增：历史浏览模式标志
},
```

- [ ] **Step 2: 修改 goPrevQuestion 函数**

在 `goPrevQuestion` 函数中设置浏览模式标志：
```javascript
goPrevQuestion() {
  var currentIndex = this.data.currentIndex;
  if (currentIndex > 0) {
    var prevIndex = currentIndex - 1;
    var prevQuestion = this.data.questions[prevIndex];
    var savedAnswer = this.data.answers[prevQuestion.id];

    // 点击导航按钮时进入浏览模式
    this.setData({
      currentIndex: prevIndex,
      currentQuestion: prevQuestion,
      selectedOption: savedAnswer ? savedAnswer.answer : null,
      questionStartTime: Date.now(),
      isBrowsingHistory: true  // 进入历史浏览模式
    });
  }
},
```

- [ ] **Step 3: 修改 goNextQuestion 函数**

在 `goNextQuestion` 函数中设置浏览模式标志：
```javascript
goNextQuestion() {
  var currentIndex = this.data.currentIndex;
  var nextIndex = currentIndex + 1;
  if (nextIndex < this.data.totalQuestions) {
    var nextQuestion = this.data.questions[nextIndex];
    var savedAnswer = this.data.answers[nextQuestion.id];

    // 点击导航按钮时进入浏览模式
    this.setData({
      currentIndex: nextIndex,
      currentQuestion: nextQuestion,
      selectedOption: savedAnswer ? savedAnswer.answer : null,
      questionStartTime: Date.now(),
      isBrowsingHistory: true  // 进入历史浏览模式
    });
  }
},
```

- [ ] **Step 4: 修改 selectOption 函数**

在 `selectOption` 函数中添加浏览模式判断，修改自动跳转逻辑：
```javascript
selectOption(e) {
  var option = e.currentTarget.dataset.option;
  var currentQuestion = this.data.currentQuestion;
  var currentIndex = this.data.currentIndex;
  var answers = Object.assign({}, this.data.answers);

  // 记录答案
  answers[currentQuestion.id] = {
    question_id: currentQuestion.id,
    answer: option,
    time_spent_seconds: Math.round((Date.now() - this.data.questionStartTime) / 1000)
  };

  this.setData({ selectedOption: option, answers: answers });

  // 如果处于历史浏览模式，不自动跳转
  if (this.data.isBrowsingHistory) {
    return;
  }

  // 自动跳转下一题，同时清除浏览模式标志
  var nextIndex = currentIndex + 1;
  if (nextIndex < this.data.totalQuestions) {
    setTimeout(() => {
      this.setData({
        currentIndex: nextIndex,
        currentQuestion: this.data.questions[nextIndex],
        selectedOption: null,
        questionStartTime: Date.now(),
        isBrowsingHistory: false  // 正常答题时清除浏览模式
      });
    }, 300);
  }
},
```

- [ ] **Step 5: 提交 Task 1**

```bash
git add pages/assessment/assessment.js
git commit -m "feat(assessment): add history browse mode to prevent auto-advance on review"
```

---

## Task 2: 修改练习页 (practice.js)

**Files:**
- Modify: `pages/practice/practice.js:1-290`

- [ ] **Step 1: 添加 isBrowsingHistory 状态**

在 `data` 对象中添加新字段：
```javascript
data: {
  // ... 现有字段 ...
  isBrowsingHistory: false,  // 新增：历史浏览模式标志
},
```

- [ ] **Step 2: 修改 goPrevQuestion 函数**

```javascript
goPrevQuestion() {
  const { currentIndex, questions, answers, questionResults } = this.data;
  if (currentIndex > 0) {
    const prevIndex = currentIndex - 1;
    const prevQuestion = questions[prevIndex];
    const savedAnswer = answers[prevQuestion.id];

    // 点击导航按钮时进入浏览模式
    this.setData({
      currentIndex: prevIndex,
      currentQuestion: prevQuestion,
      selectedOption: savedAnswer ? savedAnswer.answer : null,
      questionStartTime: Date.now(),
      progress: Math.round((prevIndex / questions.length) * 100),
      isBrowsingHistory: true  // 进入历史浏览模式
    });
  }
},
```

- [ ] **Step 3: 修改 goNextQuestion 函数**

```javascript
goNextQuestion() {
  const { currentIndex, questions, answers, questionResults } = this.data;
  const nextIndex = currentIndex + 1;
  if (nextIndex < questions.length) {
    const nextQuestion = questions[nextIndex];
    const savedAnswer = answers[nextQuestion.id];

    // 点击导航按钮时进入浏览模式
    this.setData({
      currentIndex: nextIndex,
      currentQuestion: nextQuestion,
      selectedOption: savedAnswer ? savedAnswer.answer : null,
      questionStartTime: Date.now(),
      progress: Math.round(((nextIndex + 1) / questions.length) * 100),
      isBrowsingHistory: true  // 进入历史浏览模式
    });
  }
},
```

- [ ] **Step 4: 修改 selectOption 函数**

```javascript
selectOption(e) {
  const option = e.currentTarget.dataset.option;
  const { currentQuestion, currentIndex, questions, answers, questionResults } = this.data;
  const isCorrect = option === currentQuestion.correct_answer;

  // 记录答案
  answers[currentQuestion.id] = {
    question_id: currentQuestion.id,
    answer: option,
    is_correct: isCorrect
  };

  // 记录结果用于显示标记
  questionResults[currentQuestion.id] = {
    isCorrect: isCorrect,
    correctAnswer: currentQuestion.correct_answer
  };

  this.setData({ selectedOption: option, answers, questionResults });

  // 显示反馈
  if (isCorrect) {
    wx.showToast({ title: '正确!', icon: 'success', duration: 800 });
  } else {
    wx.showToast({ title: '错误: ' + currentQuestion.correct_answer, icon: 'none', duration: 1500 });
  }

  // 如果处于历史浏览模式，不自动跳转
  if (this.data.isBrowsingHistory) {
    return;
  }

  // 跳转下一题，同时清除浏览模式标志
  const nextIndex = currentIndex + 1;
  if (nextIndex >= questions.length) {
    // 最后一题，等待反馈后留在当前页面
    return;
  }

  setTimeout(() => {
    this.setData({
      currentIndex: nextIndex,
      currentQuestion: questions[nextIndex],
      selectedOption: null,
      questionStartTime: Date.now(),
      progress: Math.round(((nextIndex + 1) / questions.length) * 100),
      isBrowsingHistory: false  // 正常答题时清除浏览模式
    });
  }, isCorrect ? 800 : 1500);
},
```

- [ ] **Step 5: 提交 Task 2**

```bash
git add pages/practice/practice.js
git commit -m "feat(practice): add history browse mode to prevent auto-advance on review"
```

---

## Task 3: 验证

- [ ] **Step 1: 检查提交记录**

```bash
git log --oneline -3
```

预期输出：
```
feat(practice): add history browse mode...
feat(assessment): add history browse mode...
[之前的提交]
```

- [ ] **Step 2: 确认代码修改**

```bash
grep -n "isBrowsingHistory" pages/assessment/assessment.js pages/practice/practice.js
```

预期：两个文件都包含 `isBrowsingHistory` 的设置和检查逻辑。

---

## 验收标准

| 场景 | 预期行为 | 验证 |
|------|----------|------|
| 正常顺序答题 | 选择后自动跳转 | 连续答题测试 |
| 上一题 → 上一题 → 改答案 | 停留在当前题，不跳转 | 翻看2题后改答案 |
| 翻看后回到当前题 | 选择后恢复自动跳转 | 手动导航回到原位置后答题 |
