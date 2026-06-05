const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

describe('Phase 2: 新增"我的"页面 + TabBar 升级', () => {

  describe('Task 2.1: pages/mine/ 四件套', () => {
    const mineDir = path.join(ROOT, 'pages', 'mine');

    test('pages/mine/ 目录存在', () => {
      expect(fs.existsSync(mineDir)).toBe(true);
    });

    test('pages/mine/mine.js 存在', () => {
      expect(fs.existsSync(path.join(mineDir, 'mine.js'))).toBe(true);
    });

    test('pages/mine/mine.json 存在', () => {
      expect(fs.existsSync(path.join(mineDir, 'mine.json'))).toBe(true);
    });

    test('pages/mine/mine.wxml 存在', () => {
      expect(fs.existsSync(path.join(mineDir, 'mine.wxml'))).toBe(true);
    });

    test('pages/mine/mine.wxss 存在', () => {
      expect(fs.existsSync(path.join(mineDir, 'mine.wxss'))).toBe(true);
    });

    test('mine.wxml 包含统计总览行', () => {
      const content = fs.readFileSync(path.join(mineDir, 'mine.wxml'), 'utf8');
      expect(content).toMatch(/积分|连续|成就/);
    });

    test('mine.wxml 包含签到功能', () => {
      const content = fs.readFileSync(path.join(mineDir, 'mine.wxml'), 'utf8');
      expect(content).toMatch(/签到|signin/);
    });

    test('mine.wxml 包含家长测评入口', () => {
      const content = fs.readFileSync(path.join(mineDir, 'mine.wxml'), 'utf8');
      expect(content).toMatch(/家长测评|parentAssessment/);
    });

    test('mine.wxml 包含邀请好友入口', () => {
      const content = fs.readFileSync(path.join(mineDir, 'mine.wxml'), 'utf8');
      expect(content).toMatch(/邀请|invite/);
    });

    test('mine.wxml 包含成就展示', () => {
      const content = fs.readFileSync(path.join(mineDir, 'mine.wxml'), 'utf8');
      expect(content).toMatch(/成就|achievement/);
    });

    test('mine.js 引入 cloudApi', () => {
      const content = fs.readFileSync(path.join(mineDir, 'mine.js'), 'utf8');
      expect(content).toMatch(/cloudApi|require.*utils/);
    });

    test('mine.wxss 使用 CSS 变量', () => {
      const content = fs.readFileSync(path.join(mineDir, 'mine.wxss'), 'utf8');
      expect(content).toMatch(/var\(--/);
    });
  });

  describe('Task 2.2: TabBar 图标', () => {
    test('components/icons/mine.png 存在', () => {
      expect(fs.existsSync(path.join(ROOT, 'components', 'icons', 'mine.png'))).toBe(true);
    });

    test('components/icons/mine-active.png 存在', () => {
      expect(fs.existsSync(path.join(ROOT, 'components', 'icons', 'mine-active.png'))).toBe(true);
    });
  });

  describe('Task 2.3: app.json TabBar 3→4', () => {
    let appJson;

    beforeAll(() => {
      appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
    });

    test('pages 数组包含 pages/mine/mine', () => {
      expect(appJson.pages).toContain('pages/mine/mine');
    });

    test('tabBar.list 有 4 项', () => {
      expect(appJson.tabBar.list).toHaveLength(4);
    });

    test('第 4 个 tab 是"我的"', () => {
      const lastTab = appJson.tabBar.list[3];
      expect(lastTab.text).toBe('我的');
      expect(lastTab.pagePath).toBe('pages/mine/mine');
    });

    test('第 4 个 tab 有 iconPath 和 selectedIconPath', () => {
      const lastTab = appJson.tabBar.list[3];
      expect(lastTab.iconPath).toBeDefined();
      expect(lastTab.selectedIconPath).toBeDefined();
    });
  });

  describe('Task 2.4: 从首页移除迁移到"我的"的功能', () => {
    let homeWxml;
    let homeJs;

    beforeAll(() => {
      homeWxml = fs.readFileSync(path.join(ROOT, 'pages', 'home', 'home.wxml'), 'utf8');
      homeJs = fs.readFileSync(path.join(ROOT, 'pages', 'home', 'home.js'), 'utf8');
    });

    test('首页 wxml 无 goToPoints 绑定', () => {
      expect(homeWxml).not.toMatch(/goToPoints/);
    });

    test('首页 wxml 无 viewProgress 绑定', () => {
      expect(homeWxml).not.toMatch(/viewProgress/);
    });

    test('首页 wxml 无 goToFeedback 绑定', () => {
      expect(homeWxml).not.toMatch(/goToFeedback/);
    });

    test('首页 wxml 无 goToParentAssessment 绑定', () => {
      expect(homeWxml).not.toMatch(/goToParentAssessment/);
    });

    test('首页 wxml 无 achievements 展示区', () => {
      expect(homeWxml).not.toMatch(/achievements/);
    });

    test('首页 wxml 无 streak 展示区', () => {
      expect(homeWxml).not.toMatch(/streak/);
    });

    test('首页 js 无 goToPoints 函数', () => {
      expect(homeJs).not.toMatch(/goToPoints\s*\(/);
    });

    test('首页 js 无 viewProgress 函数', () => {
      expect(homeJs).not.toMatch(/viewProgress\s*\(/);
    });

    test('首页 js 无 goToFeedback 函数', () => {
      expect(homeJs).not.toMatch(/goToFeedback\s*\(/);
    });

    test('首页 js 无 goToParentAssessment 函数', () => {
      expect(homeJs).not.toMatch(/goToParentAssessment\s*\(/);
    });
  });
});
