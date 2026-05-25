# 练习难度自适应体系设计

## 核心目标

根据学生测评结果和答题历史，动态调整练习难度，高效帮助学生攻克薄弱点。

---

## 一、测评与练习的关系

### 测评模式

- **直接从中级题开始测试**
- **<60分** → 降级 easy 重新测试该知识点
- **>90分** → 升级 hard 继续测试
- **目的**：快速定位学生在各知识点的能力区间

### 练习模式

- **基于测评识别的薄弱点**
- **初始难度始终从 easy 开始**（薄弱点需要打基础）
- **练习目标由测评分数决定**：

| 测评分数 | 状态 | 练习目标 | 复测难度 |
|----------|------|----------|----------|
| <60 | 知识薄弱 | 薄弱点 KP 的 **easy** 全通过 | 复测 easy |
| 60-80 | 初级 | 薄弱点 KP 的 **medium** 全通过 | 复测 medium |
| 80-90 | 中级 | 薄弱点 KP 的 **hard** 全通过 | 复测 hard |
| >90 | 高级 | **不进入练习** | 直接复测（初级90测medium，中级90测hard） |

---

## 二、数据模型

### kp_progress 表

记录每个学生在每个知识点各难度级别的进度：

```javascript
{
  _id: ObjectId,
  student_id: String,           // 学生标识
  kp_id: String,                // 知识点ID
  assessment_id: String,        // 来自哪个测评识别为薄弱点

  // 各难度级别状态
  easy: { consecutive_correct: 0, completed: false },
  medium: { consecutive_correct: 0, completed: false },
  hard: { consecutive_correct: 0, completed: false },

  // 当前在练哪个难度
  current_difficulty: 'easy',

  // 元数据
  created_at: Date,
  updated_at: Date,
}
```

**说明**：
- 只存储进度，不存储详细答题记录（简化设计）
- `consecutive_correct` 记录当前难度的连续答对数
- `completed: true` 表示该难度已通过

---

## 三、升级规则

### 单题反馈

- **答对**：该 KP 该难度的 `consecutive_correct++`
- **答错**：`consecutive_correct` 归零，难度不变

### 难度升级

- **连续答对 4 题** → 该难度 `completed = true`，**`current_difficulty` 更新为下一难度**，`consecutive_correct` 归零
- **hard 完成**后不再升级

### 完成标准

每个难度级别的"通过"标准：**连续答对4题**

### 升级流程（明确）

```
答对 → consecutive_correct++
如果 consecutive_correct >= 4:
    → completed = true
    → current_difficulty = 下一难度（如 easy → medium）
    → consecutive_correct = 0
    → 如果当前是 hard，不再升级，current_difficulty 保持 hard
```

---

## 四、复测条件判断

### 逻辑

```
输入: assessment_id (本次测评ID)

1. 查询所有 kp_progress where assessment_id = 输入
2. 根据测评分数确定目标难度：
   - <60 → 目标 = 'easy'
   - 60-80 → 目标 = 'medium'
   - 80-90 → 目标 = 'hard'
3. 检查每个 kp_progress 的目标难度.completed 是否都为 true
4. 全为 true → 可以复测
```

### >90 分的特殊处理

**测评分数 >90 的学生不进入练习环节**，直接显示复测入口：
- 初级（测评分数在 60-80 区间的学生，90分复测 medium 难度）
- 中级（测评分数在 80-90 区间的学生，90分复测 hard 难度）

**复测条件判断时**：
- 如果有 kp_progress → 检查目标难度.completed 是否全为 true
- 如果没有 kp_progress（>90分或首次测评）→ 直接允许复测

### 示例

```
初测 → 测评分数 80-90 → 薄弱点: [kp2_1, kp2_3]

kp_progress[kp2_1].hard.completed = true ✓
kp_progress[kp2_3].hard.completed = true ✓

→ 所有薄弱点 hard 通过 → 可以复测（hard 难度）
```

---

## 五、初始难度确定

### 练习开始时的逻辑

```
输入: student_id, kp_id

1. 查询 kp_progress where (student_id, kp_id)
2. 如果有记录 → 使用记录的 current_difficulty
3. 如果没有记录 → 初始难度 = 'easy'（薄弱点从 easy 开始）
```

### 注意

- 不再根据测评分数决定初始难度
- 初始难度始终为 easy（因为是薄弱点）
- 测评分数只决定"练习目标"和"复测难度"

---

## 六、测评与练习的数据关联

```
测评
  ↓
kp_stats: [{kp_id, correct, total}]
  ↓
识别薄弱点（正确率低的 KP）
  ↓
创建 kp_progress 记录，关联 assessment_id
  ↓
开始练习
  ↓
每次答题更新 kp_progress
  ↓
复测条件判断时，按 assessment_id 查询所有关联的 kp_progress
```

---

## 七、验收标准

1. **练习初始难度正确**：新开始的 KP 初始难度为 easy
2. **连续答对4题升级**：easy → medium → hard，`completed = true`
3. **答错不降级**：`consecutive_correct` 归零但难度不变
4. **进度正确持久化**：kp_progress 表数据准确
5. **复测条件正确**：所有薄弱点对应难度通过后可复测
6. **测评分数 >90 的处理**：不进入练习，直接显示复测入口

---

## 八、实现计划

### Phase 1: 数据库与云函数

**Task 1: 创建 kp_progress 集合**
- 在微信开发者工具中创建集合
- 添加索引：`(student_id, kp_id)`, `(assessment_id)`

**Task 2: 创建 getKpProgress 云函数**
- 查询学生指定 KP 的进度
- 无记录时返回默认值 `{ current_difficulty: 'easy', easy: {consecutive_correct:0, completed:false}, ... }`

**Task 3: 创建 submitPracticeResult 云函数**
- 接收：`student_id, kp_id, difficulty, is_correct, assessment_id`
- 更新 kp_progress：
  - 答对 → `consecutive_correct++`
  - 答错 → `consecutive_correct` 归零
  - 连续4题 → `completed=true`，升级，`consecutive_correct` 归零
- 返回：当前进度状态

### Phase 2: 修改现有代码

**Task 4: 修改 practice_v2 云函数**
- 调用 getKpProgress 获取当前难度
- 使用 session 跟踪已答题（避免重复）
- 返回题目时包含 difficulty

**Task 5: 修改前端**
- cloudApi.js: startPractice 传递 student_id, assessment_id
- cloudApi.js: 添加 submitPracticeResult 调用
- practice.js: 答题后调用 submitPracticeResult

### Phase 3: 补充与验证

**Task 6: 题库检查**
- 确保每个 KP 有 easy/medium/hard 题目
- 补充缺失题目（特别是 hard）

**Task 7: 端到端测试**
- 新用户初始难度为 easy
- 连续答对4题升级，completed=true
- 答错保持难度，consecutive_correct归零
- 复测条件正确判断

---

## 九、边界情况

| 场景 | 处理方式 |
|------|----------|
| 某难度题目用尽 | 从相邻难度补充 |
| 学生中途退出 | 进度已保存，下次继续 |
| 测评分数边界（60/80/90） | 按区间判断，60属于60-80区间 |
| 同一 KP 跨多次测评 | 每次测评创建新的 kp_progress 记录 |
| >90 分学生 | 不进入练习，直接显示复测入口 |

---

## 十、测试用例

| 用例编号 | 描述 | 预期结果 |
|----------|------|----------|
| TC1 | 新用户首次进入练习 | 初始难度为 easy |
| TC2 | 连续答对 4 题 | 升级到 medium，easy.completed=true |
| TC3 | 答错 1 题 | consecutive_correct 归零，难度不变 |
| TC4 | hard 完成后再答对 | 不再升级，保持 hard |
| TC5 | 所有薄弱点目标难度通过 | 可以复测 |
| TC6 | 测评分数 >90 | 不进入练习，显示复测入口按钮 |