# AI题目异步预生成系统 - 实施计划

**日期：** 2026-05-27
**设计文档：** `docs/superpowers/specs/2026-05-27-ai-question-async-generation-design.md`

---

## Phase 1：基础设施（数据库+索引）

### Step 1.1：创建 question_queue 集合索引脚本

**文件：** `/Users/seanxx/score-boost-mini/cloudfunctions/migrations/create_question_queue_indexes.js`

**Action：** 创建索引创建脚本

**验收命令：**
```bash
# 在微信云开发控制台 → 数据库 → question_queue → 索引管理 执行
# 索引1：student_id_1_status_1_created_at_-1
# 索引定义：{student_id: 1, status: 1, created_at: -1}
# 预期输出：创建成功，无错误

# 索引2：priority_-1_created_at_1
# 索引定义：{priority: -1, created_at: 1}
# 预期输出：创建成功，无错误
```

**验证命令（云开发控制台）：**
```javascript
// 验证索引存在
db.collection('question_queue').getIndexes().then(res => {
  console.log('索引列表:', res.indexes)
  const hasStudentIndex = res.indexes.some(i => i.name === 'student_id_1_status_1_created_at_-1')
  const hasPriorityIndex = res.indexes.some(i => i.name === 'priority_-1_created_at_1')
  console.assert(hasStudentIndex, 'student_id索引缺失')
  console.assert(hasPriorityIndex, 'priority索引缺失')
})
```

**回滚方案：**
```javascript
db.collection('question_queue').dropIndex('student_id_1_status_1_created_at_-1')
db.collection('question_queue').dropIndex('priority_-1_created_at_1')
```

---

### Step 1.2：验证 question_queue 集合权限配置

**文件：** `/Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/config.json`

**Action：** 创建云函数配置文件，声明数据库权限

**config.json内容：**
```json
{
  "permissions": {
    "cloudDb": {
      "question_queue": "read_write",
      "assessments": "read_write",
      "ai_question_pool": "read_write"
    }
  }
}
```

**验收命令（云开发控制台）：**
```javascript
// 1. 创建集合（如果不存在）
db.createCollection('question_queue').then(() => {
  console.log('✅ 集合创建成功')
}).catch(e => {
  if(e.errCode === -1) console.log('集合已存在')
})

// 2. 验证读写权限
async function verifyPermissions() {
  try {
    // 写测试
    const testId = await db.collection('question_queue').add({
      student_id: 'test',
      status: 'pending',
      created_at: new Date()
    })
    console.log('✅ 写权限通过')

    // 读测试
    const doc = await db.collection('question_queue').doc(testId).get()
    console.log('✅ 读权限通过')

    // 清理测试数据
    await db.collection('question_queue').doc(testId).remove()
    console.log('✅ 权限验证完成')
  } catch(e) {
    console.log('❌ 权限不足:', e)
  }
}
verifyPermissions()
```

---

### Step 1.3：创建回滚脚本（前置）

**文件：** `/Users/seanxx/score-boost-mini/cloudfunctions/migrations/rollback_queue_system.js`

**Action：** 创建回滚脚本，确保随时可恢复

**脚本内容：**
```javascript
// 回滚脚本：将系统恢复到同步模式
exports.main = async (event) => {
  const db = wx.cloud.database()

  // 1. 将所有processing状态重置为pending
  const processing = await db.collection('question_queue')
    .where({status: 'processing'})
    .get()

  for (const task of processing.data) {
    await db.collection('question_queue').doc(task._id).update({
      status: 'pending',
      updated_at: new Date()
    })
  }

  // 2. 记录回滚日志
  console.log(`回滚完成：重置${processing.data.length}个processing任务`)

  return {
    success: true,
    reset_count: processing.data.length
  }
}
```

**验收命令：**
```javascript
// 在云开发控制台测试回滚脚本
wx.cloud.callFunction({
  name: 'rollback_queue_system'
}).then(res => {
  console.assert(res.result.success === true, '回滚应成功')
  console.log('重置任务数:', res.result.reset_count)
})
```

---

## Phase 2：核心云函数（questionGenerator）

### Step 2.1：创建 questionGenerator 云函数

**文件：** `/Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js`

**核心逻辑：**
```javascript
exports.main = async (event) => {
  const db = wx.cloud.database()
  const _ = db.command

  // 1. 扫描pending任务（按priority DESC, created_at ASC）
  const pending = await db.collection('question_queue')
    .where({
      status: 'pending',
      expires_at: _.gt(new Date())
    })
    .orderBy('priority', 'desc')
    .orderBy('created_at', 'asc')
    .limit(3)
    .get()

  console.log(`[questionGenerator] 找到${pending.data.length}个待处理任务`)

  const results = []
  for (const task of pending.data) {
    try {
      // 2. 更新为processing
      await db.collection('question_queue').doc(task._id).update({
        status: 'processing',
        updated_at: new Date()
      })

      // 3. 生成题目
      const questions = await generateQuestions(task)

      // 4. 创建assessment
      const asmRes = await wx.cloud.callFunction({
        name: 'createAssessment',
        data: { questions, student_id: task.student_id }
      })

      // 5. 更新为completed
      await db.collection('question_queue').doc(task._id).update({
        status: 'completed',
        generated_assessment_id: asmRes.result.assessment_id,
        updated_at: new Date()
      })

      results.push({task_id: task._id, status: 'completed'})
    } catch (e) {
      // 失败重试
      const retry_count = task.retry_count || 0
      if (retry_count < 3) {
        await db.collection('question_queue').doc(task._id).update({
          status: 'pending',
          retry_count: retry_count + 1,
          next_retry_at: new Date(Date.now() + Math.pow(2, retry_count) * 60000)
        })
      } else {
        await db.collection('question_queue').doc(task._id).update({
          status: 'failed',
          error: e.message,
          updated_at: new Date()
        })
      }
      results.push({task_id: task._id, status: 'failed', error: e.message})
    }
  }

  // 6. 清理过期任务
  const expired = await db.collection('question_queue')
    .where({
      status: _.in(['completed', 'failed']),
      expires_at: _.lte(new Date())
    })
    .get()

  for (const task of expired.data) {
    await db.collection('question_queue').doc(task._id).remove()
  }

  return {
    processed: results.length,
    success: results.filter(r => r.status === 'completed').length,
    cleaned: expired.data.length
  }
}
```

**验收命令（云开发控制台手动触发）：**
```javascript
// 1. 创建测试队列
const testQueue = await db.collection('question_queue').add({
  student_id: 'test_student',
  subject: 'math',
  grade: '8',
  num_questions: 5,
  status: 'pending',
  priority: 1,
  created_at: new Date(),
  expires_at: new Date(Date.now() + 24*3600*1000)
})

// 2. 手动触发questionGenerator
const result = await wx.cloud.callFunction({
  name: 'questionGenerator'
})
console.log('处理结果:', result.result)

// 3. 验证状态变更
const updated = await db.collection('question_queue').doc(testQueue).get()
console.assert(['completed', 'processing'].includes(updated.data.status), '状态应更新')
console.log('队列状态:', updated.data.status)
```

---

### Step 2.2：实现中断检测机制

**文件：** `/Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js`

**中断检测逻辑：**
```javascript
async function generateQuestions(task) {
  const db = wx.cloud.database()
  const questions = []

  for (let i = 0; i < task.num_questions; i++) {
    // 每题后检查状态
    const current = await db.collection('question_queue').doc(task._id).get()

    if (current.data.status === 'cancelled') {
      // 清理已生成的题目
      for (const q of questions) {
        await db.collection('ai_question_pool').doc(q._id).remove()
      }
      throw new Error('TASK_CANCELLED')
    }

    const q = await callAIAPI(task)
    questions.push(q)
  }

  return questions
}
```

**验收命令：**
```javascript
// 测试中断处理
async function testCancellation() {
  // 1. 创建队列
  const queue = await db.collection('question_queue').add({
    student_id: 'test_cancel',
    num_questions: 10,
    status: 'pending'
  })

  // 2. 模拟开始处理
  await db.collection('question_queue').doc(queue).update({status: 'processing'})

  // 3. 标记取消
  await db.collection('question_queue').doc(queue).update({status: 'cancelled'})

  // 4. 触发生成器
  const result = await wx.cloud.callFunction({
    name: 'questionGenerator'
  })

  // 5. 验证：状态应为cancelled，无部分题目残留
  const updated = await db.collection('question_queue').doc(queue).get()
  console.assert(updated.data.status === 'cancelled', '应为cancelled状态')

  const partial = await db.collection('ai_question_pool')
    .where({queue_id: queue})
    .get()
  console.assert(partial.data.length === 0, '应无部分题目残留')
}
```

---

## Phase 3：startAssessment 改造

### Step 3.1：改造 startAssessment 支持队列模式

**文件：** `/Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/index.js`

**流程变更：**
```javascript
exports.main = async (event) => {
  const {subject, grade, semester, mode, num_questions} = event
  const db = wx.cloud.database()
  const _ = db.command

  // 1. 尝试从题池获取（小数量直接返回）
  if (num_questions <= 10) {
    const questions = await fetchFromPool(subject, grade, num_questions)
    if (questions.length === num_questions) {
      return {status: 'ready', questions}
    }
  }

  // 2. 检查是否有已完成队列
  const existingQueue = await db.collection('question_queue')
    .where({
      student_id: event.student_id,
      status: 'completed',
      subject: subject
    })
    .orderBy('created_at', 'desc')
    .limit(1)
    .get()

  if (existingQueue.data.length > 0) {
    const queue = existingQueue.data[0]
    // 验证未过期
    if (new Date(queue.expires_at) > new Date()) {
      const assessment = await db.collection('assessments')
        .doc(queue.generated_assessment_id)
        .get()
      return {
        status: 'ready',
        assessment_id: assessment.data._id,
        questions: assessment.data.questions
      }
    }
  }

  // 3. 检查是否有pending/processing队列
  const activeQueue = await db.collection('question_queue')
    .where({
      student_id: event.student_id,
      status: _.in(['pending', 'processing'])
    })
    .get()

  if (activeQueue.data.length > 0) {
    // 取消旧队列
    for (const q of activeQueue.data) {
      await db.collection('question_queue').doc(q._id).update({status: 'cancelled'})
    }
  }

  // 4. 创建新队列
  const queue = await db.collection('question_queue').add({
    student_id: event.student_id,
    openid: event.openid,
    subject, grade, semester, mode,
    num_questions,
    status: 'pending',
    priority: 1,
    created_at: new Date(),
    updated_at: new Date(),
    expires_at: new Date(Date.now() + 24*3600*1000)
  })

  return {
    status: 'queued',
    queue_id: queue._id
  }
}
```

**验收命令（小程序端）：**
```javascript
// 场景1：小数量直接返回
const res1 = await wx.cloud.callFunction({
  name: 'startAssessment',
  data: {subject: 'math', grade: '8', num_questions: 5}
})
console.assert(res1.result.data.status === 'ready', '小数量应ready')
console.assert(res1.result.data.questions.length === 5, '应返回5题')

// 场景2：大数量创建队列
const res2 = await wx.cloud.callFunction({
  name: 'startAssessment',
  data: {subject: 'math', grade: '8', num_questions: 50}
})
console.assert(res2.result.data.status === 'queued', '大数量应queued')
console.assert(res2.result.data.queue_id, '应返回queue_id')
```

**回滚方案：** 通过环境变量 `USE_QUEUE_MODE=false` 切换回原逻辑

---

### Step 3.2：实现 checkQueueStatus 云函数

**文件：** `/Users/seanxx/score-boost-mini/cloudfunctions/checkQueueStatus/index.js`

```javascript
exports.main = async (event) => {
  const {queue_id} = event
  const db = wx.cloud.database()

  const queue = await db.collection('question_queue').doc(queue_id).get()

  if (!queue.data) {
    return {errCode: 404, errMsg: '队列不存在'}
  }

  const result = {
    success: true,
    data: {
      status: queue.data.status,
      queue_id: queue_id
    }
  }

  if (queue.data.status === 'completed') {
    result.data.assessment_id = queue.data.generated_assessment_id
  } else if (queue.data.status === 'failed') {
    result.data.error = queue.data.error || '题目生成失败'
  }

  return result
}
```

**验收命令：**
```javascript
// 创建测试队列
const queue = await db.collection('question_queue').add({
  student_id: 'test',
  status: 'pending'
})

// 测试pending状态
const res1 = await wx.cloud.callFunction({
  name: 'checkQueueStatus',
  data: {queue_id: queue}
})
console.assert(res1.result.data.status === 'pending', '应为pending')

// 测试completed状态
await db.collection('question_queue').doc(queue).update({
  status: 'completed',
  generated_assessment_id: 'asm_test'
})

const res2 = await wx.cloud.callFunction({
  name: 'checkQueueStatus',
  data: {queue_id: queue}
})
console.assert(res2.result.data.status === 'completed', '应为completed')
console.assert(res2.result.data.assessment_id === 'asm_test', '应返回assessment_id')
```

---

## Phase 4：前端适配

### Step 4.1：修改 assessment.js 支持 queued 状态

**文件：** `/Users/seanxx/score-boost-mini/pages/assessment/assessment.js`

**修改位置：** 第96-102行（initAssessment函数中）

```javascript
// 原代码
const res = await api.startAssessment(this.data.subject)
this.setData({questions: res.questions})

// 修改为
const res = await api.startAssessment(this.data.subject)

if (res.status === 'ready') {
  // 原有流程
  this.setData({questions: res.questions})
} else if (res.status === 'queued') {
  // 新增：队列模式
  this.setData({
    queueStatus: 'queued',
    queueId: res.queue_id,
    loadingMessage: '题目生成中，请稍候...'
  })
  this.pollQueueStatus(res.queue_id)
}
```

**验收步骤（小程序开发者工具）：**
```javascript
// 1. 在app.js中临时模拟返回
const originalStartAssessment = api.startAssessment
api.startAssessment = async function() {
  return {status: 'queued', queue_id: 'mock_queue_123'}
}

// 2. 打开pages/assessment/assessment页面
// 3. 打开调试器Console，应看到：
//    - "进入队列模式"
//    - 无红色错误信息
// 4. 页面应显示"题目生成中"提示

// 5. 恢复原函数
api.startAssessment = originalStartAssessment
```

---

### Step 4.2：实现轮询逻辑

**文件：** `/Users/seanxx/score-boost-mini/pages/assessment/assessment.js`

```javascript
pollQueueStatus(queueId) {
  const pollInterval = setInterval(async () => {
    try {
      const res = await api.checkQueueStatus(queueId)

      if (res.data.status === 'completed') {
        clearInterval(pollInterval)
        const assessment = await api.getAssessment(res.data.assessment_id)
        this.setData({
          questions: assessment.questions,
          queueStatus: 'ready'
        })
      } else if (res.data.status === 'failed') {
        clearInterval(pollInterval)
        wx.showToast({
          title: res.data.error || '题目生成失败',
          icon: 'none'
        })
        this.setData({queueStatus: 'failed'})
      }
      // pending/processing：继续轮询
    } catch(e) {
      console.error('轮询错误:', e)
    }
  }, 3000) // 每3秒

  // 保存定时器以便清理
  this.pollTimer = pollInterval
},

onUnload() {
  // 页面卸载时清理定时器
  if (this.pollTimer) {
    clearInterval(this.pollTimer)
  }
}
```

**验收命令：**
```javascript
// 测试完成场景
async function testPollComplete() {
  // 1. 创建completed状态的队列
  const queue = await db.collection('question_queue').add({
    student_id: 'test',
    status: 'completed',
    generated_assessment_id: 'asm_test'
  })

  // 2. Mock api.checkQueueStatus返回completed
  const page = getPage('pages/assessment/assessment')
  page.setData({queueId: queue})

  // 3. 执行轮询
  await page.pollQueueStatus(queue)

  // 4. 验证：questions应被设置
  console.assert(page.data.questions.length > 0, '应获取题目')
  console.assert(page.data.queueStatus === 'ready', '状态应为ready')
}

// 测试失败场景
async function testPollFailed() {
  const queue = await db.collection('question_queue').add({
    student_id: 'test',
    status: 'failed',
    error: 'AI服务不可用'
  })

  const page = getPage('pages/assessment/assessment')
  await page.pollQueueStatus(queue)

  console.assert(page.data.queueStatus === 'failed', '状态应为failed')
}
```

---

### Step 4.3：新增等待页面UI

**文件：**
- `/Users/seanxx/score-boost-mini/pages/assessment/assessment.wxml`
- `/Users/seanxx/score-boost-mini/pages/assessment/assessment.wxss`

**assessment.wxml（新增）：**
```xml
<!-- 队列等待状态 -->
<view wx:if="{{queueStatus === 'queued'}}">
  <view class="queue-loading">
    <loading></loading>
    <text>题目生成中，请稍候...</text>
    <text class="queue-tip">预计等待 {{estimatedTime}} 秒</text>
  </view>
  <button bindtap="cancelQueue">取消</button>
</view>

<!-- 失败状态 -->
<view wx:if="{{queueStatus === 'failed'}}">
  <text class="error-message">{{errorMessage}}</text>
  <button bindtap="retryAssessment">重试</button>
</view>

<!-- 原有答题界面 -->
<view wx:if="{{queueStatus === 'ready'}}">
  <!-- 原有内容 -->
</view>
```

**验收步骤：**
```javascript
// 1. 在assessment.js中设置状态
this.setData({queueStatus: 'queued', estimatedTime: 30})

// 2. 小程序开发者工具中检查渲染
//    - 应看到loading动画
//    - 应显示"题目生成中，请稍候..."
//    - 应显示"取消"按钮

// 3. 使用wxml.evaluate验证
const loadingText = await page.$('.queue-loading text').text()
console.assert(loadingText.includes('题目生成中'), '应显示加载文本')

// 4. 测试failed状态
this.setData({queueStatus: 'failed', errorMessage: 'AI服务不可用'})
const errorText = await page.$('.error-message').text()
console.assert(errorText === 'AI服务不可用', '应显示错误信息')
```

---

### Step 4.4：扩展 cloudApi.js 添加队列接口

**文件：** `/Users/seanxx/score-boost-mini/utils/cloudApi.js`

**修改位置：** 第375行（module.exports前）

```javascript
// 新增checkQueueStatus方法
checkQueueStatus: function(queueId) {
  return wx.cloud.callFunction({
    name: 'checkQueueStatus',
    data: {queue_id: queueId}
  }).then(res => {
    return res.result
  })
}
```

**验收命令（小程序Console）：**
```javascript
// 1. 创建测试队列
const queue = await db.collection('question_queue').add({
  student_id: 'test',
  status: 'pending'
})

// 2. 调用api
const res = await api.checkQueueStatus(queue)

// 3. 验证返回
console.assert(res.success === true, '应返回success=true')
console.assert(res.data.status === 'pending', 'status应为pending')
console.assert(res.data.queue_id === queue, '应返回正确queue_id')

console.log('✅ api.checkQueueStatus验证通过')
```

---

## Phase 5：定时触发配置

### Step 5.1：配置定时触发器

**文件：** `/Users/seanxx/score-boost-mini/cloudbaserc.json`

**修改：**
```json
{
  "functions": [{
    "name": "questionGenerator",
    "runtime": "Nodejs16.13",
    "handler": "index.main",
    "timeout": 60,
    "memorySize": 256,
    "triggers": [{
      "name": "questionGeneratorTimer",
      "type": "timer",
      "config": "0 * * * * * *"
    }]
  }]
}
```

**验收命令：**
```bash
# 部署后检查触发器
# 云开发控制台 → 云函数 → questionGenerator → 触发器
# 应看到：
# - 名称：questionGeneratorTimer
# - 类型：定时触发
# - Cron表达式：0 * * * * * *（每分钟）
```

**验证实际执行：**
```javascript
// 在questionGenerator中添加日志
console.log('[questionGenerator] 执行时间:', new Date().toISOString())

// 等待2分钟后，在云开发控制台 → 云日志 查看
// 应看到至少2条执行日志，间隔约60秒
```

**回滚方案：**
```json
// 删除triggers配置，保留云函数
{
  "functions": [{
    "name": "questionGenerator",
    "runtime": "Nodejs16.13",
    "handler": "index.main",
    "timeout": 60,
    "memorySize": 256
    // 移除triggers
  }]
}
```

---

## Phase 6：测试与验证

### Step 6.1：端到端流程测试

**E2E测试脚本：**
```javascript
async function testE2E() {
  console.log('=== E2E测试开始 ===')

  // 1. 清理旧数据
  await db.collection('question_queue').where({student_id: 'e2e_test'}).remove()

  // 2. 发起测评（应创建队列）
  const startRes = await wx.cloud.callFunction({
    name: 'startAssessment',
    data: {
      student_id: 'e2e_test',
      subject: 'math',
      grade: '8',
      num_questions: 50
    }
  })

  console.assert(startRes.result.data.status === 'queued', '应返回queued')
  const queueId = startRes.result.data.queue_id
  console.log('✅ 队列创建成功:', queueId)

  // 3. 检查队列状态
  const checkRes = await wx.cloud.callFunction({
    name: 'checkQueueStatus',
    data: {queue_id: queueId}
  })
  console.assert(checkRes.result.data.status === 'pending', '应为pending')
  console.log('✅ 队列状态正确')

  // 4. 手动触发questionGenerator（或等待1分钟）
  await wx.cloud.callFunction({name: 'questionGenerator'})

  // 5. 检查状态变化
  await new Promise(r => setTimeout(r, 2000))
  const updated = await db.collection('question_queue').doc(queueId).get()
  console.assert(['processing', 'completed'].includes(updated.data.status), '应已处理')
  console.log('✅ 队列已处理:', updated.data.status)

  // 6. 如果completed，获取题目
  if (updated.data.status === 'completed') {
    const asm = await db.collection('assessments')
      .doc(updated.data.generated_assessment_id)
      .get()
    console.assert(asm.data.questions.length === 50, '应有50题')
    console.log('✅ 题目生成完成')
  }

  console.log('=== E2E测试通过 ===')
}
```

---

### Step 6.2：边界测试脚本

**边界测试套件：**
```javascript
// 边界测试1：同一学生连续发起测评
async function testConcurrentRequests() {
  const student_id = 'boundary_test_1'

  // 第一次请求
  const r1 = await wx.cloud.callFunction({
    name: 'startAssessment',
    data: {student_id, subject: 'math', grade: '8', num_questions: 50}
  })
  const queue1 = r1.result.data.queue_id

  // 第二次请求（应取消第一次）
  const r2 = await wx.cloud.callFunction({
    name: 'startAssessment',
    data: {student_id, subject: 'math', grade: '8', num_questions: 50}
  })
  const queue2 = r2.result.data.queue_id

  // 验证：queue1应为cancelled
  const q1 = await db.collection('question_queue').doc(queue1).get()
  console.assert(q1.data.status === 'cancelled', '旧队列应取消')

  // 验证：queue2应为pending
  const q2 = await db.collection('question_queue').doc(queue2).get()
  console.assert(q2.data.status === 'pending', '新队列应创建')

  console.log('✅ 并发请求测试通过')
}

// 边界测试2：队列过期
async function testQueueExpiration() {
  // 创建过期队列
  const expired = await db.collection('question_queue').add({
    student_id: 'boundary_test_2',
    status: 'completed',
    expires_at: new Date(Date.now() - 1000), // 1秒前过期
    created_at: new Date(Date.now() - 25*3600*1000)
  })

  // 触发questionGenerator清理
  await wx.cloud.callFunction({name: 'questionGenerator'})

  // 验证：过期队列应被删除
  const check = await db.collection('question_queue').doc(expired).get()
  console.assert(!check.data, '过期队列应删除')

  console.log('✅ 过期清理测试通过')
}

// 边界测试3：失败重试
async function testRetryLogic() {
  // Mock AI失败
  mockAIAPIFailure = true

  const queue = await db.collection('question_queue').add({
    student_id: 'boundary_test_3',
    num_questions: 10,
    status: 'pending',
    retry_count: 0
  })

  // 触发处理（应失败）
  await wx.cloud.callFunction({name: 'questionGenerator'})

  // 检查重试计数
  const updated = await db.collection('question_queue').doc(queue).get()
  console.assert(updated.data.retry_count === 1, '应增加重试计数')
  console.assert(updated.data.status === 'pending', '应仍为pending')

  // 3次后应标记failed
  for (let i = 0; i < 3; i++) {
    await wx.cloud.callFunction({name: 'questionGenerator'})
  }

  const final = await db.collection('question_queue').doc(queue).get()
  console.assert(final.data.status === 'failed', '3次后应失败')

  mockAIAPIFailure = false
  console.log('✅ 重试逻辑测试通过')
}

// 运行所有边界测试
async function runBoundaryTests() {
  await testConcurrentRequests()
  await testQueueExpiration()
  await testRetryLogic()
  console.log('=== 所有边界测试通过 ===')
}
```

---

## Phase 7：监控与回滚

### Step 7.1：添加日志监控

**文件：** `/Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator/index.js`

**日志点：**
```javascript
console.log(`[questionGenerator] 开始处理，找到${pending.data.length}个任务`)
console.log(`[questionGenerator] 处理任务 ${task._id}，生成${task.num_questions}题`)
console.log(`[questionGenerator] 任务 ${task._id} 完成，assessment_id=${asmId}`)
console.log(`[questionGenerator] 任务 ${task._id} 失败: ${e.message}`)
console.log(`[questionGenerator] 清理${expired.data.length}个过期队列`)
```

**验收命令：**
```javascript
// 云开发控制台 → 云日志 → questionGenerator
// 筛选最近1小时，搜索"[questionGenerator]"
// 应看到：
// - 开始处理日志
// - 任务处理日志
// - 清理日志（如果有过期队列）
```

---

## 成功标准检查清单

- [ ] Phase 1.1: question_queue索引创建成功，`getIndexes()`返回包含两个索引
- [ ] Phase 1.2: 权限验证通过，读写测试无错误
- [ ] Phase 1.3: 回滚脚本执行成功，`reset_count`≥0
- [ ] Phase 2.1: questionGenerator能处理pending任务，状态变为completed/processing
- [ ] Phase 2.2: 中断检测生效，cancelled任务无部分题目残留
- [ ] Phase 3.1: startAssessment返回queued状态，queue_id存在
- [ ] Phase 3.2: checkQueueStatus正确返回状态和assessment_id
- [ ] Phase 4.1: assessment.js显示"题目生成中"无报错
- [ ] Phase 4.2: 轮询逻辑在completed时自动跳转答题
- [ ] Phase 4.3: 等待UI渲染正确，loading动画显示
- [ ] Phase 4.4: api.checkQueueStatus返回正确格式
- [ ] Phase 5.1: 定时触发每分钟执行，日志间隔约60秒
- [ ] Phase 6.1: E2E测试通过，50题能完成异步生成
- [ ] Phase 6.2: 边界测试全部通过（并发/过期/重试）
- [ ] Phase 7.1: 云日志包含完整的处理日志

---

## 文件清单

| 文件路径 | 操作 | Phase |
|---------|------|-------|
| `/cloudfunctions/migrations/create_question_queue_indexes.js` | 新建 | 1.1 |
| `/cloudfunctions/questionGenerator/config.json` | 新建 | 1.2 |
| `/cloudfunctions/migrations/rollback_queue_system.js` | 新建 | 1.3 |
| `/cloudfunctions/questionGenerator/index.js` | 新建 | 2.1, 2.2 |
| `/cloudfunctions/startAssessment/index.js` | 修改 | 3.1 |
| `/cloudfunctions/checkQueueStatus/index.js` | 新建 | 3.2 |
| `/cloudfunctions/checkQueueStatus/config.json` | 新建 | 3.2 |
| `/pages/assessment/assessment.js` | 修改 | 4.1, 4.2 |
| `/pages/assessment/assessment.wxml` | 修改 | 4.3 |
| `/pages/assessment/assessment.wxss` | 修改 | 4.3 |
| `/utils/cloudApi.js` | 修改 | 4.4 |
| `/cloudbaserc.json` | 修改 | 5.1 |
