/**
 * scheduled-task-generator.test.js (updated for dynamic knowledge loading)
 * P0-03 验收测试
 *
 * 覆盖验收标准：
 *   A1: 源码中无明文API密钥
 *   A3: 知识点覆盖全部科目和年级（通过知识树动态加载）
 *   A4: 写入 ai_question_pool
 */

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', '..', 'scheduledTaskGenerator', 'index.js');

// ========== 测试 ==========

describe('P0-03: scheduledTaskGenerator — 安全验证 (A1)', () => {

  test('验收 A1: 源码中无32位以上十六进制明文密钥', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');

    // 匹配类似 '4f353f881ce04ea0be6e2abceb20e59d' 的密钥模式
    const hexKeyPattern = /['"][0-9a-f]{20,}['"]/gi;
    const matches = source.match(hexKeyPattern);

    expect(matches).toBeNull();
  });
});

describe('P0-03: scheduledTaskGenerator — 配置加载', () => {

  test('使用 loadConfig 从数据库加载配置', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');

    // scheduledTaskGenerator 使用数据库配置（支持动态配置切换）
    expect(source).toMatch(/loadConfig/);
  });

  test('通过 shared/llm-core/config 间接使用环境变量', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');

    // 配置模块从 shared/llm-core/config 引入
    expect(source).toMatch(/require\(['"]\.\.\/shared\/llm-core\/config['"]\)/);
  });
});

describe('P0-03: scheduledTaskGenerator — 知识点动态加载 (A3)', () => {

  test('使用 loadAllKnowledgePoints 函数代替硬编码', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');

    // 应包含动态加载函数
    expect(source).toMatch(/function loadAllKnowledgePoints/);
    // 不应有硬编码知识点数组（超过 10 个）
    const hardcodedCount = (source.match(/{ id: '/g) || []).length;
    expect(hardcodedCount).toBeLessThan(10);
  });

  test('应覆盖 9 个科目', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');

    // 应包含所有 9 个科目
    const requiredSubjects = ['math', 'biology', 'geography', 'chinese', 'english',
      'physics', 'chemistry', 'history', 'politics'];
    for (const subj of requiredSubjects) {
      expect(source).toMatch(new RegExp(`['"]${subj}['"]`));
    }
  });

  test('应覆盖年级 1-9', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');

    // 应包含 1-9 年级
    for (let g = 1; g <= 9; g++) {
      expect(source).toMatch(new RegExp(`['"]${g}['"]`));
    }
  });
});

describe('P0-03: scheduledTaskGenerator — 集合写入目标 (A4)', () => {

  test('写入集合应为 ai_question_pool', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');

    // 写入 ai_question_pool
    expect(source).toMatch(/collection\(['"]ai_question_pool['"]\)/);
  });
});
