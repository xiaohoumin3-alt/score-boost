# 答题流程优化设计方案

## 目标

优化测评和练习的答题交互体验：选择答案后立即跳转下一题，支持自由切换题目修改答案。

## 当前状态

- **practice.js / assessment.js**：选择答案 → 点击"确认答案" → 跳转下一题
- **answers 数据结构**：数组格式，每次 push 新答案

## 核心变更

### 1. 交互流程变化

| 操作 | 当前 | 改后 |
|------|------|------|
| 选择答案后 | 需点击"确认答案" | **自动跳转下一题** |
| 切换题目 | 不支持 | **支持** |
| 修改已答答案 | 不支持 | **支持** |

### 2. 底部按钮变化

```
当前: [确认答案]
改后: [上一题] [下一题/提交]
```

### 3. 数据结构变化

```javascript
// 改前：数组
answers: [{ question_id: "q1", answer: "A", is_correct: true }, ...]

// 改后：对象，key 为 questionId
answers: {
  "q1": { answer: "A", is_correct: true },
  "q2": { answer: "B", is_correct: false },
}
```

## 测评页 (assessment) 设计

### 交互逻辑

1. 用户点击选项
2. **自动记录答案**（answers[questionId] = { answer })
3. **立即跳转下一题**（currentIndex++）
4. Toast 提示"已作答"

### 视觉反馈

- **已答题目**：选项边框变**蓝色**
- **未答题目**：正常样式
- **切换题目时**：蓝色边框表示已答，不显示对错

### 按钮逻辑

| 状态 | 上一题 | 下一题 |
|------|--------|--------|
| 第一题 | 禁用 | 跳转下一题 |
| 中间题 | 跳转上一题 | 跳转下一题 |
| 最后一题 | 跳转上一题 | **提交** |

### 边界情况

- 第一题"上一题"按钮禁用（灰色）
- 最后一题"下一题"变为"提交"按钮

## 练习页 (practice) 设计

### 交互逻辑

1. 用户点击选项
2. **自动记录答案** + 判断对错
3. **选项立即变绿/红**（500ms）
4. **Toast 显示对错**（"正确!" / "错误，正确答案是 X"）
5. **1秒后跳转下一题**

### 视觉反馈

- **正确**：选中项变**绿色背景**
- **错误**：选中项变**红色背景**，正确项变**绿色**
- **已答题目**：左上角显示 ✓/✗ 标记

### 按钮逻辑

同测评页，但练习需要额外的答题记录功能。

### 提交逻辑

1. 用户点击"提交"
2. 批量提交 answers 对象中的所有答案
3. 跳转到结果页

## 页面修改清单

### assessment.wxml

1. 删除 `<button class="confirm-btn">确认答案</button>`
2. 添加导航按钮区域：`<view class="nav-buttons">`
3. 添加上一题/下一题按钮
4. 添加提交按钮（条件显示）

### assessment.js

1. 修改 `selectOption()`：
   - 选择后自动记录答案
   - 自动跳转下一题
2. 添加 `goPrevQuestion()` - 跳转上一题
3. 添加 `goNextQuestion()` - 跳转下一题
4. 修改 `answers` 数据结构为对象
5. 修改 `submitAll()` 适配新数据结构

### assessment.wxss

1. 添加 `.nav-buttons` 样式
2. 添加 `.btn-prev` / `.btn-next` / `.btn-submit` 样式
3. 添加 `.option.answered` 已答状态样式（蓝色边框）
4. 添加按钮禁用状态样式

### practice.wxml / practice.js / practice.wxss

同 assessment 改造，增加：
- 答对/答错视觉反馈
- 已答标记显示
- 答题记录展示

## 数据流变化

### 答案记录

```
selectOption(option)
  → answers[questionId] = { answer: option, isCorrect: check }
  → setData({ selectedOption: null })
  → setTimeout(goNextQuestion, 1000) // 练习1秒后跳转
```

### 提交数据

```javascript
// 提交时转换为数组格式
submitAll() {
  const answersArray = Object.values(this.data.answers).map(a => ({
    question_id: a.question_id,
    answer: a.answer,
    time_spent_seconds: a.time_spent_seconds || 0
  }));
  api.submitAssessmentAnswer(assessmentId, answersArray);
}
```

## 验收标准

1. ✅ 选择答案后立即跳转下一题（无点击确认）
2. ✅ 可以点击"上一题"/"下一题"自由切换题目
3. ✅ 切换到已答题目可以修改答案
4. ✅ 测评页已答题目显示蓝色边框，不显示对错
5. ✅ 练习页选择后显示对错反馈，然后跳转
6. ✅ 最后一题"下一题"变为"提交"按钮
7. ✅ 测评和练习行为符合各自设计要求
