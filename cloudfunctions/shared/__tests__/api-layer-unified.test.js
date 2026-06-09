/**
 * api-layer-unified.test.js
 * P0-02 验收测试：API 层统一为 cloudApi.js
 *
 * 覆盖验收标准：
 *   A1: 前端无页面引用 api.js
 *   A4: 科目映射完整（9科）
 */

const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, '..', '..', '..', 'pages');
const API_JS = path.join(__dirname, '..', '..', '..', 'utils', 'api.js');
const CLOUD_API_JS = path.join(__dirname, '..', '..', '..', 'utils', 'cloudApi.js');

// ========== 测试 ==========

describe('P0-02: API层统一 — 前端引用检查 (A1)', () => {

  test('验收 A1: 无页面直接 require api.js', () => {
    const pagesWithApiJs = [];

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.js') && !entry.name.includes('.test.')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // 匹配 require('...api.js') 但不匹配 cloudApi.js
          if (/require\([^)]*['"]\.\.\/[^'"]*\/api\.js['"]\)/.test(content) ||
              /require\([^)]*['"]\.\/api\.js['"]\)/.test(content) ||
              /require\([^)]*['"]\.\.\/utils\/api\.js['"]\)/.test(content)) {
            pagesWithApiJs.push(fullPath);
          }
        }
      }
    }

    if (fs.existsSync(PAGES_DIR)) {
      scanDir(PAGES_DIR);
    }

    expect(pagesWithApiJs).toEqual([]);
  });

  test('api.js 文件顶部有 @deprecated 注释', () => {
    if (!fs.existsSync(API_JS)) return; // 文件已删除也算通过

    const content = fs.readFileSync(API_JS, 'utf-8');
    expect(content).toMatch(/@deprecated/);
  });
});

describe('P0-02: API层统一 — cloudApi.js 科目映射 (A4)', () => {

  test('验收 A4: cloudApi.js 包含完整9科映射', () => {
    const content = fs.readFileSync(CLOUD_API_JS, 'utf-8');

    const requiredSubjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
    for (const subj of requiredSubjects) {
      expect(content).toContain(subj);
    }

    const requiredDbNames = ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology', 'history', 'geography', 'politics'];
    for (const name of requiredDbNames) {
      expect(content).toContain(name);
    }
  });

  test('cloudApi.js startAssessment 默认题目数量合理', () => {
    const content = fs.readFileSync(CLOUD_API_JS, 'utf-8');
    // 默认应为 20 题（非5题）
    const match = content.match(/num_questions:\s*(?:isHuikao\s*\?\s*\d+\s*:\s*)?(\d+)/);
    if (match) {
      const numQuestions = parseInt(match[1]);
      expect(numQuestions).toBeGreaterThanOrEqual(10);
    }
  });
});
