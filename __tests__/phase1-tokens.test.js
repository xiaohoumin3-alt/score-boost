const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

describe('Phase 1: Design Token 基础层', () => {

  describe('Task 1.1: styles/tokens.wxss', () => {
    const tokensPath = path.join(ROOT, 'styles', 'tokens.wxss');
    let content;

    beforeAll(() => {
      content = fs.readFileSync(tokensPath, 'utf8');
    });

    test('文件存在', () => {
      expect(fs.existsSync(tokensPath)).toBe(true);
    });

    test('包含 page 选择器', () => {
      expect(content).toMatch(/page\s*\{/);
    });

    test('定义 --bg-base 为 #0A0F14', () => {
      expect(content).toMatch(/--bg-base:\s*#0A0F14/);
    });

    test('定义 --bg-surface 为 rgba 透明度', () => {
      expect(content).toMatch(/--bg-surface:\s*rgba\(255,\s*255,\s*255,\s*0\.04\)/);
    });

    test('定义 --accent 为 #00E5A0', () => {
      expect(content).toMatch(/--accent:\s*#00E5A0/);
    });

    test('定义 --accent-dim', () => {
      expect(content).toMatch(/--accent-dim/);
    });

    test('定义 --text-primary', () => {
      expect(content).toMatch(/--text-primary/);
    });

    test('定义 --text-secondary', () => {
      expect(content).toMatch(/--text-secondary/);
    });

    test('定义 --text-tertiary', () => {
      expect(content).toMatch(/--text-tertiary/);
    });

    test('定义 --danger', () => {
      expect(content).toMatch(/--danger:\s*#FF6B6B/);
    });

    test('定义 --warning', () => {
      expect(content).toMatch(/--warning:\s*#FFB84D/);
    });

    test('定义 --purple', () => {
      expect(content).toMatch(/--purple:\s*#8B5CF6/);
    });

    test('定义 --border-subtle', () => {
      expect(content).toMatch(/--border-subtle/);
    });

    test('定义 --border-accent', () => {
      expect(content).toMatch(/--border-accent/);
    });

    test('定义圆角 token (--radius-sm/md/lg/full)', () => {
      expect(content).toMatch(/--radius-sm/);
      expect(content).toMatch(/--radius-md/);
      expect(content).toMatch(/--radius-lg/);
      expect(content).toMatch(/--radius-full/);
    });

    test('定义间距 token (--space-xs/sm/md/lg/xl)', () => {
      expect(content).toMatch(/--space-xs/);
      expect(content).toMatch(/--space-sm/);
      expect(content).toMatch(/--space-md/);
      expect(content).toMatch(/--space-lg/);
      expect(content).toMatch(/--space-xl/);
    });
  });

  describe('Task 1.2: app.wxss', () => {
    const appWxssPath = path.join(ROOT, 'app.wxss');
    let content;

    beforeAll(() => {
      content = fs.readFileSync(appWxssPath, 'utf8');
    });

    test('文件存在', () => {
      expect(fs.existsSync(appWxssPath)).toBe(true);
    });

    test('引入 tokens.wxss', () => {
      expect(content).toMatch(/@import\s+['"].*tokens\.wxss['"]/);
    });
  });

  describe('Task 1.3: app.json 全局窗口配置', () => {
    let appJson;

    beforeAll(() => {
      appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
    });

    test('window.backgroundColor 为 #0A0F14', () => {
      expect(appJson.window.backgroundColor).toBe('#0A0F14');
    });
  });
});
