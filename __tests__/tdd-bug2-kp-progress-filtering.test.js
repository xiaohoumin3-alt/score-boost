/**
 * TDD 测试 - Bug 2: 待复习科目年级过滤
 * 验证 getKpProgress 正确过滤当前科目年级的知识点
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

describe('TDD: Bug 2 修复 - getKpProgress 科目年级过滤', () => {

  describe('Step 1: API 层 - getKpProgress 函数签名', () => {
    let cloudApiContent;

    beforeAll(() => {
      cloudApiContent = fs.readFileSync(
        path.join(ROOT, 'utils', 'cloudApi.js'),
        'utf8'
      );
    });

    test('getKpProgress 应该接受 subject 和 grade 参数', () => {
      // 验证函数定义包含参数
      expect(cloudApiContent).toMatch(
        /function getKpProgress\s*\([^)]*subject[^)]*\ grade[^)]*\)|getKpProgress:\s*function\s*\([^)]*subject[^)]*\ grade[^)]*\)/
      );
    });

    test('getKpProgress 应该在数据库查询中过滤 grade', () => {
      // 验证查询条件包含 grade 字段
      expect(cloudApiContent).toMatch(/grade.*dbGrade|grade:\s*dbGrade/);
    });

    test('getKpProgress 应该在数据库查询中过滤 subject', () => {
      // 验证查询条件包含 subject 字段
      expect(cloudApiContent).toMatch(/subject.*dbSubject|subject:\s*dbSubject/);
    });
  });

  describe('Step 2: 页面层 - home.js 调用传递参数', () => {
    let homeJsContent;

    beforeAll(() => {
      homeJsContent = fs.readFileSync(
        path.join(ROOT, 'pages', 'home', 'home.js'),
        'utf8'
      );
    });

    test('loadPendingReviews 应该调用 getKpProgress 时传递参数', () => {
      // 验证调用时传递了 currentSubject 和 currentGrade 变量
      // 或者至少传递了包含 subject 和 grade 的参数
      expect(homeJsContent).toMatch(
        /getKpProgress\s*\([^)]*currentSubject[^)]*currentGrade|getKpProgress\s*\([^)]*currentGrade[^)]*currentSubject/
      );
    });

    test('home.js 应该从 app.globalData 获取当前科目年级', () => {
      // 验证获取了 globalData.subject 和 globalData.grade
      expect(homeJsContent).toMatch(/globalData\.subject|globalData\.grade/);
    });
  });

  describe('Step 3: 数据层 - 数据库查询验证', () => {
    let cloudApiContent;

    beforeAll(() => {
      cloudApiContent = fs.readFileSync(
        path.join(ROOT, 'utils', 'cloudApi.js'),
        'utf8'
      );
    });

    test('数据库查询应构建包含 grade/subject 的 query 对象', () => {
      // 验证代码构建了 query 对象，包含 grade 和 subject 字段
      expect(cloudApiContent).toMatch(/query\.grade\s*=/);
      expect(cloudApiContent).toMatch(/query\.subject\s*=/);
    });

    test('getKpProgress 应该有科目和年级映射逻辑', () => {
      // 验证有 subjectMapDb 和 gradeMapDb 映射
      expect(cloudApiContent).toMatch(/subjectMapDb/);
      expect(cloudApiContent).toMatch(/gradeMapDb/);
    });
  });
});

describe('TDD: Bug 1 修复 - AI 今日任务科目年级过滤', () => {

  describe('Step 1: home.js 调用 generateDailyTask 时传递参数', () => {
    let homeJsContent;

    beforeAll(() => {
      homeJsContent = fs.readFileSync(
        path.join(ROOT, 'pages', 'home', 'home.js'),
        'utf8'
      );
    });

    test('loadTodayTask 调用云函数时应传递 subject 和 grade', () => {
      // 验证调用时传递了 subject 和 grade
      expect(homeJsContent).toMatch(
        /generateDailyTask[\s\S]*?subject[\s\S]*?grade|generateDailyTask[\s\S]*?grade[\s\S]*?subject/
      );
    });
  });

  describe('Step 2: generateDailyTask 云函数接收参数', () => {
    let generateDailyTaskContent;

    beforeAll(() => {
      const filePath = path.join(ROOT, 'cloudfunctions', 'generateDailyTask', 'index.js');
      if (fs.existsSync(filePath)) {
        generateDailyTaskContent = fs.readFileSync(filePath, 'utf8');
      }
    });

    test('云函数应接收 subject 和 grade 参数', () => {
      if (!generateDailyTaskContent) {
        console.warn('generateDailyTask 云函数不存在，跳过测试');
        return;
      }
      // 验证函数解构了 subject 和 grade
      expect(generateDailyTaskContent).toMatch(
        /subject.*grade|grade.*subject/
      );
    });

    test('云函数调用 studentMemory 时应传递 subject 和 grade', () => {
      if (!generateDailyTaskContent) {
        return;
      }
      // 验证调用 studentMemory 时传递了参数
      expect(generateDailyTaskContent).toMatch(
        /studentMemory[\s\S]*?subject[\s\S]*?grade|studentMemory[\s\S]*?grade[\s\S]*?subject/
      );
    });
  });
});
