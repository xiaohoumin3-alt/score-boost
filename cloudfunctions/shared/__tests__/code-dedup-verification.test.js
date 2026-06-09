/**
 * code-dedup-verification.test.js
 * 验证 LLM 相关共享模块去重后的结构
 *
 * 架构说明：
 *   - cloudfunctions/shared/ 是 LLM 相关模块的规范源
 *   - 各云函数不再保留 shared/llm-core 与 shared/llm-client.js 副本
 *   - 云函数入口从 ../shared/ 引用规范源
 *   - 云函数目录内保留的 shared/*.js 如仍存在，应从 ../../shared/ 引用 LLM 规范源
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CF_DIR = path.join(__dirname, '..', '..');
const SHARED_DIR = path.join(__dirname, '..');

function findFiles(name, type = 'file') {
  try {
    const cmd = type === 'dir'
      ? `find "${CF_DIR}" -type d -name "${name}" -not -path "*/node_modules/*"`
      : `find "${CF_DIR}" -type f -name "${name}" -not -path "*/node_modules/*"`;
    const result = execSync(cmd, { encoding: 'utf-8' }).trim();
    return result ? result.split('\n') : [];
  } catch {
    return [];
  }
}

function jsFiles() {
  const cmd = `find "${CF_DIR}" -type f -name "*.js" -not -path "*/node_modules/*"`;
  return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
}

function linesMatching(regex) {
  const matches = [];
  for (const file of jsFiles()) {
    const rel = path.relative(CF_DIR, file);
    const content = fs.readFileSync(file, 'utf-8');
    content.split('\n').forEach((line, idx) => {
      if (regex.test(line)) {
        matches.push(`${rel}:${idx + 1}:${line.trim()}`);
      }
    });
  }
  return matches.sort();
}

function normalizePaths(paths) {
  return paths.map(p => path.relative(CF_DIR, p)).sort();
}

// ========== 测试 ==========

describe('LLM共享模块去重验证', () => {
  test('规范源 shared/llm-core 目录存在', () => {
    const llmCorePath = path.join(SHARED_DIR, 'llm-core');
    expect(fs.existsSync(llmCorePath)).toBe(true);
  });

  test('规范源 shared/llm-client.js 存在', () => {
    const llmClientPath = path.join(SHARED_DIR, 'llm-client.js');
    expect(fs.existsSync(llmClientPath)).toBe(true);
  });

  test('不存在云函数本地 shared/llm-core 副本', () => {
    const dirs = findFiles('llm-core', 'dir')
      .filter(p => path.relative(CF_DIR, p) !== 'shared/llm-core');

    expect(normalizePaths(dirs)).toEqual([]);
  });

  test('不存在云函数本地 shared/llm-client.js 副本', () => {
    const files = findFiles('llm-client.js', 'file')
      .filter(p => path.relative(CF_DIR, p) !== 'shared/llm-client.js')
      // 保留云函数根目录中的定制版本，例如 uploadMaterial/llm-client.js
      .filter(p => path.basename(path.dirname(p)) === 'shared');

    expect(normalizePaths(files)).toEqual([]);
  });

  test('云函数入口不再通过 ./shared/ 引用 LLM 规范模块', () => {
    const offenders = linesMatching(/require\(['"]\.\/shared\/llm-/)
      .filter(l => !l.startsWith('shared/'))
      .filter(l => !l.includes('__tests__/'));

    expect(offenders).toEqual([]);
  });

  test('保留的云函数 shared/*.js 不再引用本地 ./llm-core 或 ./llm-client', () => {
    const offenders = linesMatching(/require\(['"]\.\/llm-/)
      .filter(l => !l.startsWith('shared/'))
      // 例外：uploadMaterial 使用根目录定制版本 llm-client.js
      .filter(l => !l.startsWith('uploadMaterial/'));

    expect(offenders).toEqual([]);
  });
});
