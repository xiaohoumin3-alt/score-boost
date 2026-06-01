/**
 * 重复题问题E2E测试
 * 验证：地理测评重复题、科目混入、去重逻辑
 */

const { test, expect } = require('@playwright/test');

test.describe('重复题问题E2E测试', () => {

  test('地理7年测评：无重复题', async ({ page }) => {
    // 1. 发起地理7年级测评（20题）
    const assessmentId = await page.evaluate(async () => {
      const result = await wx.cloud.callFunction({
        name: 'startAssessment',
        data: {
          student_id: 'e2e_test_geo_' + Date.now(),
          subject: 'geography',
          grade: '7',
          num_questions: 20
        }
      });
      return result.result?.data?.assessment_id || null;
    });

    expect(assessmentId).toBeTruthy();

    // 2. 获取题目列表
    const questions = await page.evaluate(async (aid) => {
      const db = wx.cloud.database();
      const { data } = await db.collection('questions')
        .where({ assessment_id: aid })
        .field({ question: true, subject: true })
        .get();
      return data;
    }, assessmentId);

    expect(questions.length).toBeGreaterThan(0);

    // 3. 验证无重复题
    const seen = new Set();
    const duplicates = [];
    for (const q of questions) {
      const key = q.question || q.content || '';
      if (key && seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    if (duplicates.length > 0) {
      console.error('发现重复题：', duplicates);
    }

    expect(duplicates.length).toBe(0);

    // 4. 验证科目正确（无混入）
    const wrongSubjects = questions.filter(q => q.subject !== 'geography');
    if (wrongSubjects.length > 0) {
      console.error('发现错误科目：', wrongSubjects);
    }

    expect(wrongSubjects.length).toBe(0);

    console.log(`✅ 地理7年测评验证通过：${questions.length}题，无重复，科目正确`);
  });

  test('数学7年测评：无biology/geography混入', async ({ page }) => {
    const assessmentId = await page.evaluate(async () => {
      const result = await wx.cloud.callFunction({
        name: 'startAssessment',
        data: {
          student_id: 'e2e_test_math_' + Date.now(),
          subject: 'math',
          grade: '7',
          num_questions: 20
        }
      });
      return result.result?.data?.assessment_id || null;
    });

    expect(assessmentId).toBeTruthy();

    const questions = await page.evaluate(async (aid) => {
      const db = wx.cloud.database();
      const { data } = await db.collection('questions')
        .where({ assessment_id: aid })
        .field({ question: true, subject: true })
        .get();
      return data;
    }, assessmentId);

    // 验证无biology/geography混入
    const wrongSubjects = questions.filter(q =>
      q.subject === 'biology' || q.subject === 'geography'
    );

    if (wrongSubjects.length > 0) {
      console.error('发现科目混入：', wrongSubjects);
    }

    expect(wrongSubjects.length).toBe(0);
    console.log(`✅ 数学7年测评验证通过：${questions.length}题，无科目混入`);
  });

  test('题池检查：geography题池无重复', async ({ page }) => {
    const poolQuestions = await page.evaluate(async () => {
      const db = wx.cloud.database();
      const { data } = await db.collection('ai_question_pool')
        .where({
          subject: 'geography',
          question: db.command.exists(true)
        })
        .field({ question: true })
        .limit(100)
        .get();
      return data;
    });

    // 统计重复
    const seen = new Map();
    const duplicates = [];
    for (const q of poolQuestions) {
      const key = q.question;
      if (!key) continue;

      if (seen.has(key)) {
        duplicates.push({ question: key, count: seen.get(key) + 1 });
        seen.set(key, seen.get(key) + 1);
      } else {
        seen.set(key, 1);
      }
    }

    if (duplicates.length > 0) {
      console.error('geography题池发现重复：', duplicates);
    }

    expect(duplicates.length).toBe(0);
    console.log(`✅ geography题池验证通过：${poolQuestions.length}题，无重复`);
  });

  test('题池检查：biology题池无math/geography混入', async ({ page }) => {
    const wrongSubjects = await page.evaluate(async () => {
      const db = wx.cloud.database();

      // 检查是否有math/geography关键词但标记为biology的题目
      const mathKeywords = ['方程', '不等式', '函数', '几何', '代数', '分数', '小数'];
      const geoKeywords = ['中国的人口', '经纬度', '气候', '地形', '省份'];

      let wrong = [];

      for (const keyword of [...mathKeywords, ...geoKeywords]) {
        const { data } = await db.collection('ai_question_pool')
          .where({
            subject: 'biology',
            question: db.command.regex(keyword)
          })
          .field({ question: true })
          .limit(10)
          .get();

        wrong.push(...data.map(q => ({ question: q.question, keyword })));
      }

      return wrong;
    });

    if (wrongSubjects.length > 0) {
      console.error('biology题池发现错误科目：', wrongSubjects);
    }

    expect(wrongSubjects.length).toBe(0);
    console.log(`✅ biology题池验证通过：无math/geography混入`);
  });

});
