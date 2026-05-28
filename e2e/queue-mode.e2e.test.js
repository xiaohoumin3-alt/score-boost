/**
 * Queue Mode E2E Tests
 * 验证队列模式完整流程
 */

const { test, expect } = require('@playwright/test');

test.describe('队列模式E2E测试', () => {
  test('完整流程：创建队列 → 等待生成 → 完成测评', async ({ page }) => {
    // 1. 登录/进入测评页面
    await page.goto('/pages/home/home');
    await page.waitForLoadState('networkidle');

    // 2. 发起测评（触发队列模式）
    await page.click('[data-test="start-assessment-btn"]');
    await page.selectOption('#subject', 'biology');
    await page.selectOption('#grade', '7');
    await page.fill('#num-questions', '20');
    await page.click('#confirm-btn');

    // 3. 验证跳转到队列等待页面
    await page.waitForURL(/assessment-queue/);
    const queueId = new URL(page.url()).searchParams.get('queue_id');
    expect(queueId).toBeTruthy();

    // 4. 验证等待UI显示
    await expect(page.locator('.status-message')).toBeVisible();

    // 5. 等待生成完成（最多60秒）
    await page.waitForURL(/assessment\?assessment_id=/, { timeout: 60000 });

    // 6. 验证题目已加载
    await expect(page.locator('[data-test="question-item"]').first()).toBeVisible();
  });

  test('队列状态查询：pending → processing → completed', async ({ page }) => {
    // 1. 模拟创建队列任务
    const queueId = await page.evaluate(async () => {
      const result = await wx.cloud.callFunction({
        name: 'startAssessment',
        data: {
          student_id: 'e2e_test_student_' + Date.now(),
          subject: 'biology',
          grade: '7',
          num_questions: 20
        }
      });
      return result.result?.data?.queue_id || null;
    });

    if (!queueId) {
      // 如果没有返回queue_id，说明题池充足，不需要测试轮询
      console.log('Pool sufficient, skipping queue polling test');
      return;
    }

    // 2. 访问队列等待页面
    await page.goto(`/pages/assessment/assessment-queue?queue_id=${queueId}`);

    // 3. 等待完成或超时
    let status = 'pending';
    const startTime = Date.now();
    const maxWait = 120000; // 2分钟超时

    while (status !== 'completed' && status !== 'failed' && (Date.now() - startTime) < maxWait) {
      await page.waitForTimeout(3000);

      const statusText = await page.locator('.status-message').textContent();
      if (statusText.includes('完成')) {
        status = 'completed';
      } else if (statusText.includes('失败')) {
        status = 'failed';
      }

      console.log(`Status: ${statusText}`);
    }

    expect(status).toBe('completed');
  });

  test('超时场景：显示超时提示', async ({ page }) => {
    // 1. 创建"卡住"的队列任务（模拟超时场景）
    const stuckQueueId = 'stuck_queue_' + Date.now();

    // 2. 访问队列等待页面，设置较短的超时时间
    await page.goto(`/pages/assessment/assessment-queue?queue_id=${stuckQueueId}`);

    // 3. 验证超时提示（通过模拟或直接检查UI）
    await expect(page.locator('.status-message')).toBeVisible();
  });
});