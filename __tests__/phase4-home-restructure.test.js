const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

describe('Phase 4: 首页重构', () => {

  describe('Task 4.1: 首页信息架构重组', () => {
    let homeWxml;
    let homeJs;

    beforeAll(() => {
      homeWxml = fs.readFileSync(path.join(ROOT, 'pages', 'home', 'home.wxml'), 'utf8');
      homeJs = fs.readFileSync(path.join(ROOT, 'pages', 'home', 'home.js'), 'utf8');
    });

    test('首页包含 AI 今日任务', () => {
      expect(homeWxml).toMatch(/todayTask/);
    });

    test('首页包含重新测评入口', () => {
      expect(homeWxml).toMatch(/startAssessment/);
    });

    test('首页包含待复习列表', () => {
      expect(homeWxml).toMatch(/pendingReviews|hasPendingReviews/);
    });

    test('首页包含"自己选知识点"', () => {
      expect(homeWxml).toMatch(/showAllTopics|自己选知识点/);
    });

    test('首页包含最近记录', () => {
      expect(homeWxml).toMatch(/recentAssessments/);
    });

    test('showAllTopics 无死代码 setData', () => {
      expect(homeJs).not.toMatch(/showAllTopics[\s\S]*setData[\s\S]*showTopics/);
    });

    test('首页无 goToPoints/viewProgress/goToFeedback/goToParentAssessment', () => {
      expect(homeWxml).not.toMatch(/goToPoints|viewProgress|goToFeedback|goToParentAssessment/);
    });

    test('首页无 goToUpload/goToExclusiveExam/viewPath', () => {
      expect(homeWxml).not.toMatch(/goToUpload|goToExclusiveExam|viewPath/);
    });

    test('首页无 achievements 展示', () => {
      expect(homeWxml).not.toMatch(/achievements/);
    });

    test('首页无 streak 展示', () => {
      expect(homeWxml).not.toMatch(/streak/);
    });
  });

  describe('Task 4.2: 首页样式升级', () => {
    let homeWxss;

    beforeAll(() => {
      homeWxss = fs.readFileSync(path.join(ROOT, 'pages', 'home', 'home.wxss'), 'utf8');
    });

    test('首页 wxss 使用 CSS 变量', () => {
      expect(homeWxss).toMatch(/var\(--/);
    });

    test('首页 wxss 无硬编码 #0f0f23', () => {
      expect(homeWxss).not.toMatch(/#0f0f23/);
    });

    test('首页 wxss 无硬编码 #1a1a35', () => {
      expect(homeWxss).not.toMatch(/#1a1a35/);
    });

    test('首页 wxss 无硬编码 #00D9A5', () => {
      expect(homeWxss).not.toMatch(/#00D9A5/);
    });
  });

  describe('Task 4.3: 首页快捷入口精简', () => {
    let homeWxml;

    beforeAll(() => {
      homeWxml = fs.readFileSync(path.join(ROOT, 'pages', 'home', 'home.wxml'), 'utf8');
    });

    test('首页无 quick-actions 区块', () => {
      expect(homeWxml).not.toMatch(/quick-actions/);
    });

    test('首页无 quick-btn 按钮', () => {
      expect(homeWxml).not.toMatch(/quick-btn/);
    });
  });
});
