# 答题历史浏览模式设计方案

## 问题描述

### 现状问题

用户在使用导航按钮（上一题/下一题）翻看历史题目并修改答案后，系统仍然执行自动跳转逻辑，导致：
1. 下一题的答案被清空
2. 用户体验割裂

### 场景示例

1. 用户做了3道题，到达第4题
2. 点击"上一题"2次，回到第2题
3. 修改第2题答案
4. **Bug**: 系统自动跳转到第3题，且第3题答案被清空

### 练习模式 vs 测评模式

| 模式 | 问题表现 | 严重程度 |
|------|----------|----------|
| 测评模式 | 第3题答案被清空 | 高 |
| 练习模式 | 同上 + 第3题的对错反馈状态丢失 | 高 |

---

## 目标

**核心目标**: 在历史浏览模式下修改答案时不触发自动跳转，恢复正常答题流时自动跳转功能自动恢复。

---

## 设计方案

### 核心概念：历史浏览模式（History Browse Mode）

引入一个状态标志 `isBrowsingHistory`，用于区分：
- **正常答题模式**: 用户按顺序答题，自动跳转启用
- **历史浏览模式**: 用户通过导航按钮翻看历史，自动跳转禁用

### 状态转换逻辑

```
初始状态: isBrowsingHistory = false

触发历史浏览模式:
  - 点击"上一题" → isBrowsingHistory = true
  - 点击"下一题" → isBrowsingHistory = true

退出历史浏览模式:
  - 在当前题选择答案后，等待 3 秒无操作 → isBrowsingHistory = false
  - 点击"提交" → 退出浏览模式

自动跳转规则:
  - isBrowsingHistory = false → 选择答案后自动跳转
  - isBrowsingHistory = true → 选择答案后不跳转
```

### 数据结构

```javascript
Page({
  data: {
    // ... 现有字段 ...
    isBrowsingHistory: false,  // 新增：历史浏览模式标志
    browseTimestamp: 0,        // 新增：记录进入浏览模式的时间戳
  }
})
```

### 函数逻辑修改

#### selectOption 函数

```javascript
selectOption(e) {
  const option = e.currentTarget.dataset.option;
  const { currentQuestion, currentIndex, questions, answers } = this.data;
  const isCorrect = option === currentQuestion.correct_answer;

  // 记录答案（始终执行）
  answers[currentQuestion.id] = {
    question_id: currentQuestion.id,
    answer: option,
    // ... 其他字段
  };

  this.setData({
    selectedOption: option,
    answers: answers,
    // 记录最后一次作答时间，用于退出浏览模式
    browseTimestamp: Date.now()
  });

  // 如果处于历史浏览模式，不自动跳转
  if (this.data.isBrowsingHistory) {
    // 保持当前状态，用户需要手动导航
    return;
  }

  // 正常答题模式：自动跳转
  // ... 原有自动跳转逻辑 ...
}
```

#### goPrevQuestion / goNextQuestion 函数

```javascript
goPrevQuestion() {
  const { currentIndex, questions, answers } = this.data;
  if (currentIndex > 0) {
    const prevIndex = currentIndex - 1;
    const prevQuestion = questions[prevIndex];
    const savedAnswer = answers[prevQuestion.id];

    this.setData({
      currentIndex: prevIndex,
      currentQuestion: prevQuestion,
      selectedOption: savedAnswer ? savedAnswer.answer : null,
      questionStartTime: Date.now(),
      isBrowsingHistory: true  // 进入历史浏览模式
    });
  }
}

goNextQuestion() {
  // 同理，进入历史浏览模式
}
```

#### 退出历史浏览模式检查（可选用）

在页面生命周期函数或定时检查中：

```javascript
// 每秒检查一次：如果用户在某题停留超过3秒，自动退出浏览模式
checkBrowseMode() {
  const now = Date.now();
  if (this.data.isBrowsingHistory &&
      now - this.data.browseTimestamp > 3000) {
    this.setData({ isBrowsingHistory: false });
  }
}
```

---

## 影响范围

### 需要修改的文件

| 文件 | 修改内容 |
|------|----------|
| `pages/assessment/assessment.js` | 添加 `isBrowsingHistory` 状态，修改 `selectOption`、`goPrevQuestion`、`goNextQuestion` |
| `pages/practice/practice.js` | 同上 |

### 两个页面的差异

| 页面 | selectOption 行为 |
|------|-------------------|
| 测评模式 | 选择后无反馈，直接跳转或停留 |
| 练习模式 | 选择后显示对错反馈，然后跳转或停留 |

---

## 验收标准

1. **场景1**: 用户正常顺序答题 → 选择答案后自动跳转下一题 ✅
2. **场景2**: 用户点击"上一题"回到第2题，修改答案 → 停留在第2题，不跳转 ✅
3. **场景3**: 用户在历史浏览模式下，手动点"下一题"3次回到第4题 → 选择答案后恢复自动跳转 ✅
4. **场景4**: 测评模式和练习模式表现一致（除反馈机制外） ✅

---

## 备选方案

### 方案B: 取消按钮

在导航按钮旁边添加"完成浏览"按钮，用户主动退出浏览模式。

**优点**: 用户意图明确
**缺点**: 增加 UI 复杂度

### 方案C: 仅在翻看超过1题时触发

```javascript
// 只有翻看超过1题时才禁用自动跳转
const skipCount = Math.abs(this.data.currentIndex - targetIndex);
if (skipCount > 1) {
  this.setData({ isBrowsingHistory: true });
}
```

**优点**: 轻微翻看（如确认上一题）不影响正常流程
**缺点**: 逻辑稍复杂

---

## 推荐方案

**采用方案C（翻看距离判断）**：
- 跳过超过1题时进入历史浏览模式
- 浏览模式下选择答案不触发自动跳转
- 恢复正常答题流后自动跳转恢复
