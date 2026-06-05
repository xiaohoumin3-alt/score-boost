const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

describe('Phase 3: 路径 Tab 增强', () => {

  describe('Task 3.1: 路径页面添加"个性化学习"区块', () => {
    let pathWxml;
    let pathJs;
    let pathWxss;

    beforeAll(() => {
      pathWxml = fs.readFileSync(path.join(ROOT, 'pages', 'path', 'path.wxml'), 'utf8');
      pathJs = fs.readFileSync(path.join(ROOT, 'pages', 'path', 'path.js'), 'utf8');
      pathWxss = fs.readFileSync(path.join(ROOT, 'pages', 'path', 'path.wxss'), 'utf8');
    });

    test('path.wxml 包含"个性化学习"区块', () => {
      expect(pathWxml).toMatch(/个性化学习/);
    });

    test('path.wxml 包含"上传资料"入口', () => {
      expect(pathWxml).toMatch(/上传资料|goToUpload/);
    });

    test('path.wxml 包含"专属测评"入口', () => {
      expect(pathWxml).toMatch(/专属测评|goToExclusiveExam/);
    });

    test('path.js 包含 goToUpload 方法', () => {
      expect(pathJs).toMatch(/goToUpload\s*[:(]/);
    });

    test('path.js 包含 goToExclusiveExam 方法', () => {
      expect(pathJs).toMatch(/goToExclusiveExam\s*[:(]/);
    });

    test('path.js goToUpload 跳转 material-upload', () => {
      expect(pathJs).toMatch(/material-upload/);
    });

    test('path.js goToExclusiveExam 跳转 exclusive-exam-start', () => {
      expect(pathJs).toMatch(/exclusive-exam-start/);
    });

    test('path.wxss 使用 CSS 变量', () => {
      expect(pathWxss).toMatch(/var\(--/);
    });
  });

  describe('Task 3.2: 从首页移除已迁移到路径的功能', () => {
    let homeWxml;
    let homeJs;

    beforeAll(() => {
      homeWxml = fs.readFileSync(path.join(ROOT, 'pages', 'home', 'home.wxml'), 'utf8');
      homeJs = fs.readFileSync(path.join(ROOT, 'pages', 'home', 'home.js'), 'utf8');
    });

    test('首页 wxml 无 goToUpload 绑定', () => {
      expect(homeWxml).not.toMatch(/goToUpload/);
    });

    test('首页 wxml 无 goToExclusiveExam 绑定', () => {
      expect(homeWxml).not.toMatch(/goToExclusiveExam/);
    });

    test('首页 wxml 无 viewPath 绑定', () => {
      expect(homeWxml).not.toMatch(/viewPath/);
    });

    test('首页 js 无 goToUpload 函数', () => {
      expect(homeJs).not.toMatch(/goToUpload\s*\(/);
    });

    test('首页 js 无 goToExclusiveExam 函数', () => {
      expect(homeJs).not.toMatch(/goToExclusiveExam\s*\(/);
    });

    test('首页 js 无 viewPath 函数', () => {
      expect(homeJs).not.toMatch(/viewPath\s*\(/);
    });
  });
});
