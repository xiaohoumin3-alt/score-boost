# Picker选择器Bug诊断报告

## 问题描述
年级和科目选择器在某些情况下无法正确选择或显示

## 当前实现分析

### 数据初始化
```javascript
data: {
  grade: '',
  gradeIndex: null,  // null表示未选择
  subject: 'math',
  subjectIndex: 0,   // 默认选中数学
}
```

### Picker配置
```xml
<!-- 年级选择器 -->
<picker mode="selector" range="{{grades}}" range-key="label" 
        value="{{gradeIndex !== null ? gradeIndex : 0}}" 
        bindchange="onGradeChange">
  <view class="grade-picker">
    <text class="grade-value">
      {{gradeIndex !== null ? grades[gradeIndex].label : '请选择年级'}}
    </text>
  </view>
</picker>

<!-- 科目选择器 -->
<picker mode="selector" range="{{subjects}}" range-key="label" 
        value="{{subjectIndex !== null ? subjectIndex : 0}}" 
        bindchange="onSubjectChange">
  <view class="subject-picker">
    <text class="subject-value">
      {{subjectIndex !== null ? subjects[subjectIndex].label : '请选择科目'}}
    </text>
  </view>
</picker>
```

### 按钮禁用条件
```xml
<button disabled="{{!grade || !subject}}">
```

## 已识别的问题

### 问题1: Picker状态与显示不一致
当 `gradeIndex = null` 时:
- Picker内部状态: `value="0"` (默认选中第一个)
- 显示文本: "请选择年级"
- **结果**: 用户看到的是"请选择年级"，但打开picker时第一个选项已被选中

### 问题2: setData异步性导致日志不可靠
```javascript
onGradeChange(e) {
  this.setData({...});
  console.log('[onGradeChange] after setData, gradeIndex:', this.data.gradeIndex);
  // ⚠️ 此时 gradeIndex 可能还未更新！
}
```

### 问题3: 科目选择器冗余的条件判断
```javascript
subjectIndex: 0  // 永远不会是null
```
条件 `subjectIndex !== null` 永远为true，可以简化。

## 需要确认的问题

1. **用户报告的具体行为是什么？**
   - [ ] Picker无法打开？
   - [ ] 选择了选项但显示没有更新？
   - [ ] 按钮仍然禁用？
   - [ ] 其他？

2. **是否在真机上复现？**
   - [ ] iOS
   - [ ] Android
   - [ ] 开发者工具

3. **控制台是否有错误日志？**

## 推荐的修复方案

### 方案A: 使用默认选择（推荐）
```javascript
data: {
  grade: '1',
  gradeIndex: 0,
  subject: 'math',
  subjectIndex: 0,
}
```
优点: 简单，无边缘情况
缺点: 强制默认选择

### 方案B: 修复Picker值逻辑
```xml
<picker value="{{gradeIndex || -1}}">
  <!-- 需要测试 -1 是否有效 -->
</picker>
```

### 方案C: 状态机重构
使用明确的状态（unselected/selected）而非null判断

## 下一步
需要用户提供:
1. 具体的问题行为描述
2. 真机测试结果
3. 控制台日志
