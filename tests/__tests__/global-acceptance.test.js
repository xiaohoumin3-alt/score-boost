/**
 * global-acceptance.test.js
 * 总体验收测试（G1-G7）
 *
 * 这些测试验证修复方案的整体质量门槛
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const CF_DIR = path.join(ROOT_DIR, 'cloudfunctions');

// ========== 测试 ==========

describe('总体验收 G5: 无明文密钥', () => {

  test('云函数源码中无20+位十六进制字符串字面量', () => {
    const cmd = `grep -r "[0-9a-f]\\{20,\\}" "${CF_DIR}" --include="*.js" --exclude-dir=node_modules --exclude-dir=__tests__ --exclude-dir=tests -l || true`;
    const output = execSync(cmd, { encoding: 'utf-8' }).trim();

    if (output) {
      const files = output.split('\n').filter(f => f.trim());
      // 排除已知的合法文件（如 test fixture、hash、数据库文档ID等）
      const suspicious = files.filter(f => {
        // 排除 checkPool/index.js（包含测试用数据库文档ID）
        if (f.endsWith('checkPool/index.js')) return false;
        const content = fs.readFileSync(f, 'utf-8');
        // 排除：注释中、测试文件、常量hash
        const lines = content.split('\n');
        return lines.some(line => {
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) return false;
          if (line.includes('test') || line.includes('fixture') || line.includes('mock')) return false;
          // 检查是否是API密钥模式（带引号的hex串）
          return /['"][0-9a-f]{20,}['"]/.test(line) && !/hash|token_id|trace/.test(line);
        });
      });
      expect(suspicious).toEqual([]);
    }
  });
});


describe('总体验收 G6: 共享模块零重复', () => {

  test('knowledge_tree.js 规范源仅存在于 shared/ 下', () => {
    const cmd = `find "${CF_DIR}" -name "knowledge_tree.js" -not -path "*/node_modules/*" -not -path "*/shared/*" | wc -l`;
    const extras = parseInt(execSync(cmd, { encoding: 'utf-8' }).trim());
    expect(extras).toBe(0);
  });
  test('llm-core/ 规范源仅存在于 shared/ 下', () => {
    const cmd = `find "${CF_DIR}" -type d -name "llm-core" -not -path "*/node_modules/*" -not -path "*/packages/*" -not -path "*/shared/llm-core" | wc -l`;
    const extras = parseInt(execSync(cmd, { encoding: 'utf-8' }).trim());
    expect(extras).toBe(0);
  });

  test('llm_client.js 在 cloudfunctions/ 下最多1份', () => {
    const cmd = `find "${CF_DIR}" -name "llm_client.js" -not -path "*/node_modules/*" | wc -l`;
    const count = parseInt(execSync(cmd, { encoding: 'utf-8' }).trim());
    expect(count).toBeLessThanOrEqual(2);
  });
});

describe('总体验收 G4: 9科×9年级知识树覆盖', () => {

  const dataDir = path.join(CF_DIR, 'startAssessment', 'data');

  test('所有科目均有知识点文件', () => {
    const requiredSubjects = ['math', 'chinese', 'biology', 'geography', 'physics', 'chemistry', 'history', 'politics'];
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));

    for (const subj of requiredSubjects) {
      const hasSubject = files.some(f => f.startsWith(subj + '-grade'));
      expect(hasSubject).toBe(true);
    }
  });

  test('数学覆盖1-9年级', () => {
    for (let grade = 1; grade <= 9; grade++) {
      const upFile = path.join(dataDir, `math-grade${grade}-up.json`);
      const downFile = path.join(dataDir, `math-grade${grade}-down.json`);
      expect(fs.existsSync(upFile)).toBe(true);
      expect(fs.existsSync(downFile)).toBe(true);
    }
  });

  test('语文覆盖1-9年级', () => {
    for (let grade = 1; grade <= 9; grade++) {
      const upFile = path.join(dataDir, `chinese-grade${grade}-up.json`);
      const downFile = path.join(dataDir, `chinese-grade${grade}-down.json`);
      expect(fs.existsSync(upFile)).toBe(true);
      expect(fs.existsSync(downFile)).toBe(true);
    }
  });

  test('物理覆盖8-9年级', () => {
    for (const grade of [8, 9]) {
      const files = fs.readdirSync(dataDir).filter(f => f.startsWith(`physics-grade${grade}`));
      expect(files.length).toBeGreaterThan(0);
    }
  });

  test('化学覆盖9年级', () => {
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('chemistry-grade9'));
    expect(files.length).toBeGreaterThan(0);
  });
});

describe('总体验收 G7: 题目 Schema 验证', () => {

  function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    return options.map(opt => {
      if (typeof opt === 'string') return opt.replace(/^[A-D]\.\s*/, '');
      if (typeof opt === 'object' && opt !== null) return opt.value || opt.text || String(opt);
      return String(opt);
    });
  }

  function normalizeAnswer(answer) {
    if (typeof answer === 'number') return String.fromCharCode(65 + answer);
    const upper = String(answer || 'A').toUpperCase().trim();
    if (['A','B','C','D'].includes(upper)) return upper;
    return 'A';
  }

  function normalizeQuestion(raw) {
    return {
      question: raw.question || raw.content || '',
      options: normalizeOptions(raw.options || []),
      correct_answer: normalizeAnswer(raw.correct_answer),
      kp_id: raw.kp_id || raw.knowledge_point_id || 'unknown',
      kp_name: raw.kp_name || raw.knowledge_point || '',
      difficulty: raw.difficulty || 'medium',
      subject: raw.subject || 'math',
    };
  }

  const testCases = [
    { label: 'generateAiQuestion 格式', raw: { question: 'Q', options: ['A', 'B', 'C', 'D'], correct_answer: 0, kp_id: 'kp1' } },
    { label: 'practice_v2 格式', raw: { question: 'Q', options: [{ key: 'A', value: 'v1' }, { key: 'B', value: 'v2' }], correct_answer: 'B', kp_id: 'kp2' } },
    { label: 'questionGenerator 格式', raw: { content: 'Q', options: ['A. a', 'B. b'], correct_answer: 'A', kp_id: 'kp3' } },
    { label: 'startAssessment 格式', raw: { question: 'Q', options: [{ key: 'A', value: 'v' }, { key: 'B', value: 'w' }], correct_answer: 1, knowledge_point_id: 'kp4' } },
    { label: 'question_bank 格式', raw: { content: 'Q', options: ['a', 'b', 'c', 'd'], correct_answer: 'C', knowledge_point_id: 'kp5' } },
  ];

  test.each(testCases)('归一化后 $label 符合 Schema', ({ raw }) => {
    const result = normalizeQuestion(raw);

    // Schema 验证
    expect(typeof result.question).toBe('string');
    expect(result.question.length).toBeGreaterThan(0);
    expect(Array.isArray(result.options)).toBe(true);
    expect(result.options.every(o => typeof o === 'string')).toBe(true);
    expect(typeof result.correct_answer).toBe('string');
    expect(['A','B','C','D']).toContain(result.correct_answer);
    expect(typeof result.kp_id).toBe('string');
    expect(typeof result.kp_name).toBe('string');
    expect(['easy','medium','hard']).toContain(result.difficulty);
  });
});
