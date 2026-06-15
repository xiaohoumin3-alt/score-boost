/**
 * IRT Flow E2E Tests
 * 验证 IRT 模型集成流程：测评 → 答题 → 提交 → 分数预估
 */

const { test, expect } = require('@playwright/test');

test.describe('IRT流程E2E测试', () => {
  test('完整流程：测评 → 答题 → 提交 → 查看分数预估', async ({ page }) => {
    // 1. 进入首页
    await page.goto('/pages/home/home');
    await page.waitForLoadState('networkidle');

    // 2. 发起测评
    await page.click('[data-test="subject-select"]');
    await page.selectOption('math', 'math');
    await page.click('[data-test="grade-select"]');
    await page.selectOption('8', '8');
    await page.click('[data-test="start-assessment-btn"]');

    // 3. 等待测评加载
    await page.waitForURL(/assessment\?assessment_id=/);
    const assessmentId = new URL(page.url()).searchParams.get('assessment_id');
    expect(assessmentId).toBeTruthy();

    // 4. 验证题目已加载
    await expect(page.locator('[data-test="question-item"]').first()).toBeVisible();

    // 5. 答题（模拟前5题）
    for (let i = 0; i < 5; i++) {
      await page.click('[data-test="option-a"]'); // 选择A选项
      await page.click('[data-test="next-btn"]');
    }

    // 6. 提交答案
    await page.click('[data-test="submit-btn"]');
    await page.waitForURL(/result\?assessmentId=/);

    // 7. 验证结果页面显示分数预估
    await expect(page.locator('.estimated-score-card')).toBeVisible();

    // 8. 验证分数预估数据
    const estimatedScore = await page.locator('.estimated-score-number').first().textContent();
    const examScore = await page.locator('.estimated-score-number').nth(1).textContent();
    const scoreLevel = await page.locator('.estimated-score-level').textContent();
    const scoreConfidence = await page.locator('.estimated-confidence').textContent();

    console.log('分数预估结果:', { estimatedScore, examScore, scoreLevel, scoreConfidence });

    expect(parseInt(estimatedScore)).toBeGreaterThanOrEqual(0);
    expect(parseInt(estimatedScore)).toBeLessThanOrEqual(150);
    expect(parseInt(examScore)).toBeGreaterThanOrEqual(0);
    expect(parseInt(examScore)).toBeLessThanOrEqual(150);
    expect(scoreLevel).toBeTruthy();
    expect(scoreConfidence).toContain('%');
  });

  test('提交答案后验证数据库中的 score_estimation', async ({ page }) => {
    // 1. 模拟创建测评
    let assessmentId;
    await page.goto('/pages/home/home');

    assessmentId = await page.evaluate(async () => {
      const result = await wx.cloud.callFunction({
        name: 'startAssessment',
        data: {
          subject: 'math',
          grade: '8',
          num_questions: 5,
        }
      });
      return result.result?.data?.assessment_id || null;
    });

    expect(assessmentId).toBeTruthy();

    // 2. 模拟答题和提交
    const answers = [
      { question_id: 'q1', answer: 'A' },
      { question_id: 'q2', answer: 'B' },
      { question_id: 'q3', answer: 'C' },
      { question_id: 'q4', answer: 'A' },
      { question_id: 'q5', answer: 'B' },
    ];

    await page.evaluate(async ({ assessmentId, answers }) => {
      const result = await wx.cloud.callFunction({
        name: 'submitAnswer',
        data: {
          assessment_id: assessmentId,
          answers: answers,
        }
      });
      return result.result;
    }, { assessmentId, answers });

    // 3. 验证 assessment 记录包含 score_estimation
    const scoreEstimation = await page.evaluate(async (assessmentId) => {
      const db = wx.cloud.database();
      const result = await db.collection('assessments')
        .where({ assessment_id: assessmentId })
        .field({ score_estimation: true })
        .get();
      return result.data[0]?.score_estimation || null;
    }, assessmentId);

    console.log('数据库中的 score_estimation:', scoreEstimation);

    expect(scoreEstimation).toBeTruthy();
    expect(scoreEstimation.estimatedScore).toBeGreaterThanOrEqual(0);
    expect(scoreEstimation.examScore).toBeGreaterThanOrEqual(0);
    expect(scoreEstimation.theta).not.toBeNull();
    expect(scoreEstimation.level).toBeTruthy();
  });

  test('降级场景：无 IRT 参数时使用本地估算', async ({ page }) => {
    // 1. 创建没有 IRT 参数的测评
    const assessmentId = await page.evaluate(async () => {
      // 创建一个简单的测评，题目没有 IRT 参数
      const result = await wx.cloud.callFunction({
        name: 'startAssessment',
        data: {
          subject: 'math',
          grade: '8',
          num_questions: 3,
        }
      });
      return result.result?.data?.assessment_id || null;
    });

    // 2. 提交答案
    await page.evaluate(async (assessmentId) => {
      const answers = [
        { question_id: 'q1', answer: 'A' },
        { question_id: 'q2', answer: 'B' },
        { question_id: 'q3', answer: 'C' },
      ];
      await wx.cloud.callFunction({
        name: 'submitAnswer',
        data: {
          assessment_id: assessmentId,
          answers: answers,
        }
      });
    }, assessmentId);

    // 3. 访问结果页面
    await page.goto(`/pages/result/result?assessmentId=${assessmentId}&mode=assessment&score=2&total=3&accuracy=67`);

    // 4. 验证至少显示本地估算结果
    const estimatedScore = await page.locator('.estimated-score-number').first().textContent();
    expect(estimatedScore).toBeTruthy();
  });

  test('IRT 参数准确性：验证 theta 值在合理范围', async ({ page }) => {
    // 1. 创建测评
    const assessmentId = await page.evaluate(async () => {
      const result = await wx.cloud.callFunction({
        name: 'startAssessment',
        data: {
          subject: 'math',
          grade: '8',
          num_questions: 10,
        }
      });
      return result.result?.data?.assessment_id || null;
    });

    // 2. 模拟高分答题（8/10正确）
    await page.evaluate(async (assessmentId) => {
      const answers = [];
      for (let i = 1; i <= 8; i++) {
        answers.push({ question_id: `q${i}`, answer: 'A' }); // 假设A正确
      }
      for (let i = 9; i <= 10; i++) {
        answers.push({ question_id: `q${i}`, answer: 'B' }); // 假设B错误
      }
      await wx.cloud.callFunction({
        name: 'submitAnswer',
        data: {
          assessment_id: assessmentId,
          answers: answers,
        }
      });
    }, assessmentId);

    // 3. 验证 theta 值为正数（高分学生应该有正 theta）
    const scoreEstimation = await page.evaluate(async (assessmentId) => {
      const db = wx.cloud.database();
      const result = await db.collection('assessments')
        .where({ assessment_id: assessmentId })
        .field({ score_estimation: true })
        .get();
      return result.data[0]?.score_estimation || null;
    }, assessmentId);

    console.log('高分学生的 theta 值:', scoreEstimation?.theta);

    expect(scoreEstimation).toBeTruthy();
    expect(scoreEstimation.theta).toBeGreaterThan(0);
    expect(scoreEstimation.theta).toBeLessThan(3); // theta 通常在 [-3, 3] 范围
  });
});
