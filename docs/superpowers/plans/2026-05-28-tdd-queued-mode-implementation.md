# TDD开发计划：队列模式完整实现

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 完成4个未完成功能的TDD开发，实现完整的异步队列模式

**架构：** 在现有startAssessment基础上，实现queued状态返回、前端轮询、定时触发器和E2E测试

**技术栈：** 微信小程序云开发、Jest测试、云函数定时触发器

---

## 任务概览

| # | 功能 | 状态 | 优先级 |
|---|------|------|--------|
| 1 | startAssessment返回queued状态 | 部分实现 | P0 |
| 2 | 前端队列等待UI和轮询逻辑 | 未实现 | P0 |
| 3 | 定时触发器配置 | 未配置 | P1 |
| 4 | 完整E2E测试 | 部分实现 | P1 |

---

## Task 1: startAssessment返回queued状态

**当前状态：** 代码256-320行有部分逻辑，但未完整集成

**文件：**
- Modify: `cloudfunctions/startAssessment/index.js`
- Test: `cloudfunctions/startAssessment/__tests__/queued-mode-integration.test.js`

### Step 1.1: 编写失败的集成测试

创建测试文件验证queued状态返回逻辑：

```javascript
// __tests__/queued-mode-integration.test.js

describe('startAssessment - Queued Mode Integration', () => {
  describe('题池为空且无预生成时', () => {
    test('应返回queued状态和queue_id', async () => {
      const mockEvent = {
        data: {
          student_id: 'student_123',
          subject: 'biology',
          grade: '7',
          semester: 'down',
          mode: 'quick',
          num_questions: 20
        }
      };

      // Mock题池返回空
      const mockDb = {
        collection: jest.fn()
          .mockReturnValue({
            where: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue({ total: 0 })
            })
          })
          .mockReturnValue({
            add: jest.fn().mockResolvedValue({ _id: 'queue_123' })
          })
      };

      const result = await exports.main(mockEvent, {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('queued');
      expect(result.data.queue_id).toBeDefined();
      expect(result.data.message).toContain('生成中');
    });
  });

  describe('已有完成队列任务时', () => {
    test('应返回ready状态和assessment_id', async () => {
      const mockEvent = {
        data: {
          student_id: 'student_123',
          subject: 'biology',
          grade: '7',
          num_questions: 20
        }
      };

      // Mock队列检查返回已完成任务
      const result = await exports.main(mockEvent, {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ready');
      expect(result.data.assessment_id).toBeDefined();
      expect(result.data.from_cache).toBe(true);
    });
  });
});
```

**验证命令：**
```bash
cd /Users/seanxx/score-boost-mini/cloudfunctions/startAssessment
npm test queued-mode-integration.test.js
```

**预期结果：** FAIL (测试文件不存在或逻辑未实现)

### Step 1.2: 实现queued状态判断逻辑

在`startAssessment/index.js`中集成队列管理：

```javascript
// 在题目生成逻辑前添加队列检查
const { checkQueueForStudent, createQueueTask } = require('./queue_manager');

// 检查学生是否有活跃队列任务
const queueCheck = await checkQueueForStudent(db, studentId);

if (queueCheck.found) {
  if (queueCheck.status === 'completed' && queueCheck.assessment_id) {
    // 返回已完成的assessment
    return {
      success: true,
      data: {
        assessment_id: queueCheck.assessment_id,
        status: 'ready',
        from_cache: true,
        questions: [] // 从assessment获取
      }
    };
  } else {
    // 返回排队状态
    return {
      success: true,
      data: {
        status: 'queued',
        queue_id: queueCheck.queue_id,
        message: queueCheck.status === 'pending'
          ? '题目正在排队生成中...'
          : '题目正在生成中...'
      }
    };
  }
}

// 题池不足且无队列时，创建新队列任务
if (questions.length < finalNumQuestions) {
  const queueResult = await createQueueTask(db, {
    student_id: studentId,
    subject,
    grade,
    semester,
    mode,
    num_questions: finalNumQuestions,
    difficulty_distribution: difficultyDistribution
  });

  if (queueResult.success) {
    return {
      success: true,
      data: {
        status: 'queued',
        queue_id: queueResult.queue_id,
        message: '题目已加入生成队列，请稍候...'
      }
    };
  }
}
```

**验证命令：**
```bash
npm test queued-mode-integration.test.js
```

**预期结果：** PASS

### Step 1.3: 提交

```bash
git add cloudfunctions/startAssessment/index.js
git add cloudfunctions/startAssessment/__tests__/queued-mode-integration.test.js
git commit -m "feat(startAssessment): implement queued status return"
```

---

## Task 2: 前端队列等待UI和轮询逻辑

**文件：**
- Create: `miniprogram/pages/assessment/assessment-queue.js`
- Create: `miniprogram/pages/assessment/assessment-queue.wxml`
- Create: `miniprogram/pages/assessment/assessment-queue.wxss`
- Modify: `miniprogram/pages/assessment/assessment.js`

### Step 2.1: 编写API层测试

创建测试验证轮询API调用：

```javascript
// miniprogram/__tests__/queue-polling.test.js

describe('Queue Polling API', () => {
  describe('checkQueueStatus', () => {
    test('应调用checkQueueStatus云函数', async () => {
      const mockCloud = {
        callFunction: jest.fn().mockResolvedValue({
          result: { success: true, data: { status: 'completed', assessment_id: 'ass_123' } }
        })
      };

      const api = new QueueApi(mockCloud);
      const result = await api.checkQueueStatus('queue_123');

      expect(mockCloud.callFunction).toHaveBeenCalledWith({
        name: 'checkQueueStatus',
        data: { queue_id: 'queue_123' }
      });
      expect(result.status).toBe('completed');
    });
  });

  describe('pollQueueStatus', () => {
    test('应轮询直到completed状态', async () => {
      const mockCloud = {
        callFunction: jest.fn()
          .mockResolvedValueOnce({ result: { success: true, data: { status: 'pending' } } })
          .mockResolvedValueOnce({ result: { success: true, data: { status: 'processing' } } })
          .mockResolvedValueOnce({ result: { success: true, data: { status: 'completed', assessment_id: 'ass_123' } } })
      };

      const api = new QueueApi(mockCloud);
      const onPoll = jest.fn();
      const result = await api.pollQueueStatus('queue_123', { onPoll, maxPolls: 3, interval: 100 });

      expect(result.status).toBe('completed');
      expect(result.assessment_id).toBe('ass_123');
      expect(onPoll).toHaveBeenCalledTimes(3);
    });

    test('超时应返回timeout状态', async () => {
      const mockCloud = {
        callFunction: jest.fn().mockResolvedValue({
          result: { success: true, data: { status: 'pending' } }
        })
      };

      const api = new QueueApi(mockCloud);
      const result = await api.pollQueueStatus('queue_123', { maxPolls: 2, interval: 100 });

      expect(result.status).toBe('timeout');
    });
  });
});
```

**验证命令：**
```bash
cd /Users/seanxx/score-boost-mini
npm test queue-polling.test.js
```

**预期结果：** FAIL (文件不存在)

### Step 2.2: 实现队列API模块

```javascript
// miniprogram/utils/queue-api.js

class QueueApi {
  constructor(cloud) {
    this.cloud = cloud;
  }

  /**
   * 检查队列状态
   */
  async checkQueueStatus(queueId) {
    try {
      const result = await this.cloud.callFunction({
        name: 'checkQueueStatus',
        data: { queue_id: queueId }
      });
      return result.result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 轮询队列状态直到完成或超时
   */
  async pollQueueStatus(queueId, options = {}) {
    const {
      maxPolls = 60,      // 最大轮询次数（30秒 @ 500ms）
      interval = 500,     // 轮询间隔
      onPoll = null       // 轮询回调
    } = options;

    for (let i = 0; i < maxPolls; i++) {
      const status = await this.checkQueueStatus(queueId);

      if (onPoll) {
        onPoll(status, i + 1);
      }

      if (status.success && status.data?.status === 'completed') {
        return { status: 'completed', ...status.data };
      }

      if (status.success && status.data?.status === 'failed') {
        return { status: 'failed', error: status.data?.error };
      }

      await this.delay(interval);
    }

    return { status: 'timeout' };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = QueueApi;
```

**验证命令：**
```bash
npm test queue-polling.test.js
```

**预期结果：** PASS

### Step 2.3: 实现队列等待页面

```javascript
// pages/assessment/assessment-queue.js

const QueueApi = require('../../utils/queue-api');

Page({
  data: {
    queueId: '',
    status: 'pending',
    message: '题目正在生成中...',
    progress: 0,
    pollCount: 0
  },

  onLoad(options) {
    const { queue_id } = options;
    if (!queue_id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ queueId: queue_id });
    this.startPolling();
  },

  startPolling() {
    const api = new QueueApi(wx.cloud);

    api.pollQueueStatus(this.data.queueId, {
      maxPolls: 60,
      interval: 3000,
      onPoll: (status, count) => {
        this.setData({
          status: status.data?.status || 'pending',
          message: status.data?.message || '生成中...',
          pollCount: count
        });
      }
    }).then(result => {
      if (result.status === 'completed') {
        this.navigateToAssessment(result.assessment_id);
      } else if (result.status === 'failed') {
        this.showError('题目生成失败，请重试');
      } else {
        this.showError('生成超时，请稍后重试');
      }
    });
  },

  navigateToAssessment(assessmentId) {
    wx.navigateTo({
      url: `/pages/assessment/assessment?assessment_id=${assessmentId}`
    });
  },

  showError(message) {
    wx.showModal({
      title: '提示',
      content: message,
      showCancel: false,
      success: () => wx.navigateBack()
    });
  }
});
```

**验证命令：**
```bash
npm test queue-polling.test.js
```

**预期结果：** PASS

### Step 2.4: 修改assessment.js处理queued状态

```javascript
// pages/assessment/assessment.js

// 在startAssessment成功回调中添加
if (result.data.status === 'queued') {
  // 跳转到队列等待页面
  wx.navigateTo({
    url: `/pages/assessment/assessment-queue?queue_id=${result.data.queue_id}`
  });
  return;
}
```

### Step 2.5: 提交

```bash
git add miniprogram/
git commit -m "feat(frontend): implement queue waiting UI and polling"
```

---

## Task 3: 定时触发器配置

**文件：**
- Create: `cloudfunctions/questionGenerator/config.json`

### Step 3.1: 编写配置验证测试

```javascript
// cloudfunctions/questionGenerator/__tests__/timer-config.test.js

const fs = require('fs');
const path = require('path');

describe('Timer Trigger Configuration', () => {
  test('config.json应存在且包含定时触发器配置', () => {
    const configPath = path.join(__dirname, '../config.json');
    const configExists = fs.existsSync(configPath);

    expect(configExists).toBe(true);

    if (configExists) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.triggers).toBeDefined();
      expect(config.triggers.length).toBeGreaterThan(0);

      const timerTrigger = config.triggers.find(t => t.type === 'timer');
      expect(timerTrigger).toBeDefined();
      expect(timerTrigger.name).toBe('queueProcessor');
    }
  });

  test('定时触发器应配置为每分钟执行', () => {
    const configPath = path.join(__dirname, '../config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const timerTrigger = config.triggers.find(t => t.type === 'timer');
    expect(timerTrigger.config).toBe('0 * * * * * *'); // 每分钟的第0秒
  });
});
```

**验证命令：**
```bash
cd /Users/seanxx/score-boost-mini/cloudfunctions/questionGenerator
npm test timer-config.test.js
```

**预期结果：** FAIL (config.json不存在)

### Step 3.2: 创建定时触发器配置

```json
{
  "triggers": [
    {
      "name": "queueProcessor",
      "type": "timer",
      "config": "0 * * * * * *"
    }
  ]
}
```

**验证命令：**
```bash
npm test timer-config.test.js
```

**预期结果：** PASS

### Step 3.3: 部署并验证

在微信开发者工具中：
1. 右键questionGenerator文件夹
2. 选择"上传并部署：云端安装依赖"
3. 在云开发控制台验证定时触发器已创建

**验证命令：** 在云开发控制台 → 云函数 → questionGenerator → 触发方式，确认定时触发器存在

### Step 3.4: 提交

```bash
git add cloudfunctions/questionGenerator/config.json
git add cloudfunctions/questionGenerator/__tests__/timer-config.test.js
git commit -m "feat(questionGenerator): add timer trigger config"
```

---

## Task 4: 完整E2E测试

**文件：**
- Create: `e2e/queue-mode.e2e.test.js`

### Step 4.1: 编写E2E测试场景

```javascript
// e2e/queue-mode.e2e.test.js

const { test, expect } = require('@playwright/test');

test.describe('队列模式E2E测试', () => {
  test('完整流程：创建队列 → 等待生成 → 完成测评', async ({ page }) => {
    // 1. 登录
    await page.goto('/pages/login/login');
    await page.fill('#username', 'test_user');
    await page.click('#login-btn');
    await page.waitForURL('/pages/home/home');

    // 2. 发起测评（触发队列模式）
    await page.click('[data-test="start-assessment-btn"]');
    await page.selectOption('#subject', 'biology');
    await page.selectOption('#grade', '7');
    await page.fill('#num-questions', '20');
    await page.click('#confirm-btn');

    // 3. 验证跳转到队列等待页面
    await page.waitForURL('/pages/assessment/assessment-queue*');
    const queueId = new URL(page.url()).searchParams.get('queue_id');
    expect(queueId).toBeTruthy();

    // 4. 验证等待UI显示
    await expect(page.locator('[data-test="queue-status"]')).toHaveText(/生成中/);
    await expect(page.locator('[data-test="queue-message"]')).toBeVisible();

    // 5. 等待生成完成（最多60秒）
    await page.waitForURL('/pages/assessment/assessment*', { timeout: 60000 });

    // 6. 验证题目已加载
    await expect(page.locator('[data-test="question-item"]').first()).toBeVisible();
    const questionCount = await page.locator('[data-test="question-item"]').count();
    expect(questionCount).toBeGreaterThan(0);
  });

  test('队列状态查询：pending → processing → completed', async ({ page }) => {
    // 1. 创建队列任务
    const queueId = await page.evaluate(async () => {
      const result = await wx.cloud.callFunction({
        name: 'startAssessment',
        data: {
          student_id: 'e2e_test_student',
          subject: 'biology',
          grade: '7',
          num_questions: 20
        }
      });
      return result.result.data.queue_id;
    });

    // 2. 轮询检查状态变化
    let status = 'pending';
    let pollCount = 0;

    while (status !== 'completed' && pollCount < 60) {
      await page.waitForTimeout(3000);

      status = await page.evaluate(async (id) => {
        const result = await wx.cloud.callFunction({
          name: 'checkQueueStatus',
          data: { queue_id: id }
        });
        return result.result.data.status;
      }, queueId);

      pollCount++;
      console.log(`Poll ${pollCount}: status = ${status}`);
    }

    expect(status).toBe('completed');
    expect(pollCount).toBeLessThan(60);
  });

  test('超时场景：长时间pending应显示超时提示', async ({ page }) => {
    // Mock一个永远不会完成的队列任务
    const stuckQueueId = await page.evaluate(async () => {
      const db = wx.cloud.database();
      const result = await db.collection('question_queue').add({
        data: {
          student_id: 'e2e_timeout_test',
          status: 'pending',
          subject: 'biology',
          num_questions: 20,
          created_at: new Date().toISOString()
        }
      });
      return result._id;
    });

    // 访问队列等待页面
    await page.goto(`/pages/assessment/assessment-queue?queue_id=${stuckQueueId}`);

    // 等待超时（使用较短的超时时间测试）
    await page.waitForTimeout(10000);

    // 验证超时提示
    await expect(page.locator('[data-test="timeout-message"]')).toBeVisible();
  });
});
```

**验证命令：**
```bash
cd /Users/seanxx/score-boost-mini
npm run e2e queue-mode.e2e.test.js
```

**预期结果：** FAIL (E2E环境未配置)

### Step 4.2: 配置E2E测试环境

```javascript
// playwright.config.js

module.exports = {
  testDir: './e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000', // 微信小程序开发工具预览地址
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    }
  ],
};
```

### Step 4.3: 添加E2E测试脚本

```json
// package.json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:headed": "playwright test --headed"
  }
}
```

### Step 4.4: 提交

```bash
git add e2e/
git add playwright.config.js
git commit -m "test(e2e): add queue mode end-to-end tests"
```

---

## 验收标准

### 功能验收

- [ ] startAssessment在题池不足时返回queued状态
- [ ] checkQueueStatus正确返回队列状态
- [ ] 前端正确处理queued状态跳转等待页
- [ ] 等待页显示正确的状态消息
- [ ] 轮询逻辑在完成时自动跳转
- [ ] 定时触发器每分钟执行questionGenerator
- [ ] E2E测试覆盖完整流程

### 性能验收

- [ ] 题池命中响应时间 < 100ms
- [ ] queued状态返回 < 50ms
- [ ] 轮询间隔 3秒，最多60次
- [ ] 定时触发器处理 < 3个任务避免超时

### 测试验收

```bash
# 运行所有测试
npm test

# 预期结果
PASS: queued-mode-integration.test.js
PASS: queue-polling.test.js
PASS: timer-config.test.js
PASS: queue-mode.e2e.test.js
```

---

## 风险和依赖

| 风险 | 缓解措施 |
|------|----------|
| 定时触发器冷启动延迟 | 配置预留实例（如云开发支持） |
| 轮询次数过多消耗资源 | 设置合理上限和退避策略 |
| E2E测试环境不稳定 | 使用Mock数据隔离外部依赖 |

---

## 执行顺序

1. Task 1: startAssessment queued状态 (后端核心)
2. Task 2: 前端队列等待UI (用户可见)
3. Task 3: 定时触发器配置 (后台运行)
4. Task 4: 完整E2E测试 (验证闭环)
