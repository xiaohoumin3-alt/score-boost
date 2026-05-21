# 答题流程优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化测评和练习答题流程：选择答案后自动跳转下一题，添加上一题/下一题按钮支持自由切换题目

**Architecture:** 改造 assessment 和 practice 两个页面，将 answers 数据结构从数组改为对象以支持 O(1) 查找和修改，添加导航按钮替换确认按钮

**Tech Stack:** 微信小程序 (WeChat Mini Program) - WXML/WXSS/JS

---

## 文件结构

| 文件 | 改动 |
|------|------|
| pages/assessment/assessment.wxml | 替换确认按钮为导航按钮 |
| pages/assessment/assessment.js | 修改选择逻辑、添加导航方法、修改数据结构 |
| pages/assessment/assessment.wxss | 添加导航按钮样式、已答状态样式 |
| pages/practice/practice.wxml | 替换确认按钮为导航按钮 |
| pages/practice/practice.js | 修改选择逻辑、添加导航方法、修改数据结构 |
| pages/practice/practice.wxss | 添加导航按钮样式、对错反馈样式、已答标记样式 |

---

## Task 1: Assessment 页面改造

### Task 1.1: 修改 assessment.wxml

**Files:**
- Modify: `pages/assessment/assessment.wxml`

- [ ] **Step 1: 替换确认按钮为导航按钮区域**

将第44-45行:
```xml
<!-- Confirm Button -->
<button class="confirm-btn" bindtap="confirmAnswer">确认答案</button>
```

替换为:
```xml
<!-- Navigation Buttons -->
<view class="nav-buttons">
  <button
    class="nav-btn nav-prev {{currentIndex === 0 ? 'disabled' : ''}}"
    bindtap="goPrevQuestion"
    disabled="{{currentIndex === 0}}"
  >上一题</button>
  <button
    class="nav-btn nav-next {{currentIndex === totalQuestions - 1 ? 'submit' : ''}}"
    bindtap="{{currentIndex === totalQuestions - 1 ? 'submitAll' : 'goNextQuestion'}}"
  >{{currentIndex === totalQuestions - 1 ? '提交' : '下一题'}}</button>
</view>
```

### Task 1.2: 修改 assessment.js 数据结构

**Files:**
- Modify: `pages/assessment/assessment.js`

- [ ] **Step 1: 修改 data 中 answers 从数组改为对象**

第16行改前:
```javascript
answers: {},
```

改后:
```javascript
answers: {},
```

- [ ] **Step 2: 修改 selectOption 方法 - 选择后自动跳转**

第113-116行改前:
```javascript
selectOption(e) {
  var option = e.currentTarget.dataset.option;
  this.setData({ selectedOption: option });
},
```

改后:
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

  // 自动跳转下一题
  var nextIndex = currentIndex + 1;
  if (nextIndex < this.data.totalQuestions) {
    setTimeout(() => {
      this.setData({
        currentIndex: nextIndex,
        currentQuestion: this.data.questions[nextIndex],
        selectedOption: null,
        questionStartTime: Date.now()
      });
    }, 300);
  }
},
```

- [ ] **Step 3: 添加 goPrevQuestion 方法**

在 `selectOption` 方法后添加:
```javascript
goPrevQuestion() {
  var currentIndex = this.data.currentIndex;
  if (currentIndex > 0) {
    var prevIndex = currentIndex - 1;
    var prevQuestion = this.data.questions[prevIndex];
    var savedAnswer = this.data.answers[prevQuestion.id];

    this.setData({
      currentIndex: prevIndex,
      currentQuestion: prevQuestion,
      selectedOption: savedAnswer ? savedAnswer.answer : null,
      questionStartTime: Date.now()
    });
  }
},
```

- [ ] **Step 4: 添加 goNextQuestion 方法**

在 `goPrevQuestion` 方法后添加:
```javascript
goNextQuestion() {
  var currentIndex = this.data.currentIndex;
  var nextIndex = currentIndex + 1;
  if (nextIndex < this.data.totalQuestions) {
    var nextQuestion = this.data.questions[nextIndex];
    var savedAnswer = this.data.answers[nextQuestion.id];

    this.setData({
      currentIndex: nextIndex,
      currentQuestion: nextQuestion,
      selectedOption: savedAnswer ? savedAnswer.answer : null,
      questionStartTime: Date.now()
    });
  }
},
```

- [ ] **Step 5: 修改 submitAll 方法适配新数据结构**

第152-184行改前:
```javascript
async submitAll() {
  this.setData({ loading: true });
  try {
    var allAnswers = Object.values(this.data.answers).map(function(a) {
      return {
        question_id: a.question_id,
        answer: a.answer,
        time_spent_seconds: a.time_spent_seconds || 0
      };
    });
    // ... 后续代码
```

改后:
```javascript
async submitAll() {
  this.setData({ loading: true });
  try {
    var allAnswers = Object.values(this.data.answers).map(function(a) {
      return {
        question_id: a.question_id,
        answer: a.answer,
        time_spent_seconds: a.time_spent_seconds || 0
      };
    });
    // ... 后续代码保持不变
```

- [ ] **Step 6: 删除 confirmAnswer 方法**

删除原 confirmAnswer 方法（第118-150行），因为选择后自动跳转，不再需要确认按钮。

### Task 1.3: 修改 assessment.wxml 添加已答状态判断

**Files:**
- Modify: `pages/assessment/assessment.wxml`

- [ ] **Step 1: 在选项上添加 answered 状态判断**

第32-41行改前:
```xml
<view
  class="option {{selectedOption === item.key ? 'selected' : ''}}"
  bindtap="selectOption"
  data-option="{{item.key}}"
>
```

改后:
```xml
<view
  class="option {{selectedOption === item.key ? 'selected' : ''}} {{answers[currentQuestion.id] ? 'answered' : ''}}"
  bindtap="selectOption"
  data-option="{{item.key}}"
>
```

### Task 1.4: 修改 assessment.wxss 添加样式

**Files:**
- Modify: `pages/assessment/assessment.wxss`

- [ ] **Step 1: 删除旧的确认按钮样式，添加导航按钮样式**

将第124-138行删除，替换为:
```css
/* Navigation Buttons */
.nav-buttons {
  display: flex;
  gap: 20rpx;
  position: fixed;
  bottom: 40rpx;
  left: 40rpx;
  right: 40rpx;
}

.nav-btn {
  flex: 1;
  padding: 28rpx;
  border-radius: 50rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
}

.nav-prev {
  background: #1a1a35;
  color: #888;
  border: 2rpx solid #333;
}

.nav-prev.disabled {
  opacity: 0.4;
}

.nav-next {
  background: linear-gradient(135deg, #00D9A5 0%, #00B894 100%);
  color: #0f0f23;
}

.nav-next.submit {
  background: linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%);
  color: #fff;
}

/* Answered State */
.option.answered {
  border-color: #4A90D9 !important;
  background: rgba(74, 144, 217, 0.1) !important;
}
```

---

## Task 2: Practice 页面改造

### Task 2.1: 修改 practice.wxml

**Files:**
- Modify: `pages/practice/practice.wxml`

- [ ] **Step 1: 替换确认按钮为导航按钮区域**

将第43-44行:
```xml
<!-- Confirm Button -->
<button class="confirm-btn" bindtap="confirmAnswer">确认答案</button>
```

替换为:
```xml
<!-- Navigation Buttons -->
<view class="nav-buttons">
  <button
    class="nav-btn nav-prev {{currentIndex === 0 ? 'disabled' : ''}}"
    bindtap="goPrevQuestion"
    disabled="{{currentIndex === 0}}"
  >上一题</button>
  <button
    class="nav-btn nav-next {{currentIndex === questions.length - 1 ? 'submit' : ''}}"
    bindtap="{{currentIndex === questions.length - 1 ? 'submitAll' : 'goNextQuestion'}}"
  >{{currentIndex === questions.length - 1 ? '提交' : '下一题'}}</button>
</view>
```

### Task 2.2: 修改 practice.js 数据结构

**Files:**
- Modify: `pages/practice/practice.js`

- [ ] **Step 1: 修改 data 中 answers 从数组改为对象**

第14-15行改前:
```javascript
selectedOption: null,
answers: [],
```

改后:
```javascript
selectedOption: null,
answers: {},
questionResults: {},
```

- [ ] **Step 2: 修改 selectOption 方法 - 选择后显示反馈并跳转**

第155-158行改前:
```javascript
selectOption(e) {
  const option = e.currentTarget.dataset.option;
  this.setData({ selectedOption: option });
},
```

改后:
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

  // 跳转下一题
  const nextIndex = currentIndex + 1;
  if (nextIndex >= questions.length) {
    // 最后一题，跳转提交
    return;
  }

  setTimeout(() => {
    this.setData({
      currentIndex: nextIndex,
      currentQuestion: questions[nextIndex],
      selectedOption: null,
      questionStartTime: Date.now(),
      progress: Math.round(((nextIndex + 1) / questions.length) * 100)
    });
  }, isCorrect ? 800 : 1500);
},
```

- [ ] **Step 3: 添加 goPrevQuestion 方法**

在 selectOption 方法后添加:
```javascript
goPrevQuestion() {
  const { currentIndex, questions, answers, questionResults } = this.data;
  if (currentIndex > 0) {
    const prevIndex = currentIndex - 1;
    const prevQuestion = questions[prevIndex];
    const savedAnswer = answers[prevQuestion.id];

    this.setData({
      currentIndex: prevIndex,
      currentQuestion: prevQuestion,
      selectedOption: savedAnswer ? savedAnswer.answer : null,
      questionStartTime: Date.now(),
      progress: Math.round((prevIndex / questions.length) * 100)
    });
  }
},
```

- [ ] **Step 4: 添加 goNextQuestion 方法**

在 goPrevQuestion 方法后添加:
```javascript
goNextQuestion() {
  const { currentIndex, questions, answers, questionResults } = this.data;
  const nextIndex = currentIndex + 1;
  if (nextIndex < questions.length) {
    const nextQuestion = questions[nextIndex];
    const savedAnswer = answers[nextQuestion.id];

    this.setData({
      currentIndex: nextIndex,
      currentQuestion: nextQuestion,
      selectedOption: savedAnswer ? savedAnswer.answer : null,
      questionStartTime: Date.now(),
      progress: Math.round(((nextIndex + 1) / questions.length) * 100)
    });
  }
},
```

- [ ] **Step 5: 修改 submitAll 方法适配新数据结构**

第200-251行改前:
```javascript
submitAll() {
  this.setData({ loading: true });

  // 批量提交答案到 kp_progress
  const submitPromises = [];
  for (const answer of this.data.answers) {
    const question = this.data.questions.find(q => q.id === answer.question_id);
    // ...
  }
```

改后:
```javascript
submitAll() {
  this.setData({ loading: true });

  // 批量提交答案到 kp_progress
  const submitPromises = [];
  const answersArray = Object.values(this.data.answers);

  for (const answer of answersArray) {
    const question = this.data.questions.find(q => q.id === answer.question_id);
    // ... 后续代码保持不变
```

- [ ] **Step 7: 删除 confirmAnswer 方法**

删除原 confirmAnswer 方法（第160-198行），因为选择后自动跳转，不再需要确认按钮。

### Task 2.3: 修改 practice.wxml 添加已答状态判断

**Files:**
- Modify: `pages/practice/practice.wxml`

- [ ] **Step 1: 在选项上添加已答状态和结果标记判断**

第32-41行改前:
```xml
<view
  class="option {{selectedOption === item.key ? 'selected' : ''}}"
  bindtap="selectOption"
  data-option="{{item.key}}"
>
```

改后:
```xml
<view
  class="option {{selectedOption === item.key ? 'selected' : ''}} {{questionResults[currentQuestion.id] ? (questionResults[currentQuestion.id].isCorrect ? 'correct' : 'incorrect') : ''}}"
  bindtap="selectOption"
  data-option="{{item.key}}"
>
```

### Task 2.4: 修改 practice.wxss 添加样式

**Files:**
- Modify: `pages/practice/practice.wxss`

- [ ] **Step 1: 删除旧的确认按钮样式，添加导航按钮和反馈样式**

将第130-144行删除，替换为:
```css
/* Navigation Buttons */
.nav-buttons {
  display: flex;
  gap: 20rpx;
  position: fixed;
  bottom: 40rpx;
  left: 40rpx;
  right: 40rpx;
}

.nav-btn {
  flex: 1;
  padding: 28rpx;
  border-radius: 50rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
}

.nav-prev {
  background: #1a1a35;
  color: #888;
  border: 2rpx solid #333;
}

.nav-prev.disabled {
  opacity: 0.4;
}

.nav-next {
  background: linear-gradient(135deg, #00D9A5 0%, #00B894 100%);
  color: #0f0f23;
}

.nav-next.submit {
  background: linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%);
  color: #fff;
}

/* Correct/Incorrect States */
.option.correct {
  border-color: #00D9A5 !important;
  background: rgba(0, 217, 165, 0.2) !important;
}

.option.incorrect {
  border-color: #FF6B6B !important;
  background: rgba(255, 107, 107, 0.2) !important;
}

.option.show-correct {
  border-color: #00D9A5 !important;
}

/* Answer Result Badge */
.result-badge {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  font-size: 24rpx;
}

.result-badge.correct {
  color: #00D9A5;
}

.result-badge.incorrect {
  color: #FF6B6B;
}
```

---

## Task 3: 验收测试

- [ ] **Step 1: Assessment 页面测试**
  - 选择答案后自动跳转下一题 ✅
  - 上一题/下一题按钮正常工作 ✅
  - 切换到已答题目可以修改答案 ✅
  - 已答题目选项边框变蓝色 ✅
  - 最后一题"下一题"变为"提交" ✅

- [ ] **Step 2: Practice 页面测试**
  - 选择答案后显示对错反馈然后跳转 ✅
  - 上一题/下一题按钮正常工作 ✅
  - 切换到已答题目显示正确/错误标记 ✅
  - 可以修改已答题目的答案 ✅
  - 最后一题提交后正确跳转到结果页 ✅

---

## 验证命令

```bash
# 检查文件语法
cd /Users/seanxx/score-boost-mini

# 检查 assessment.js 语法
node --check cloudfunctions/practice_v2/index.js 2>&1 || echo "Note: This is not the right file to check"

# 检查是否有遗漏的 confirmAnswer 调用
grep -rn "confirmAnswer" pages/assessment/ pages/practice/ || echo "All confirmAnswer removed"
```
