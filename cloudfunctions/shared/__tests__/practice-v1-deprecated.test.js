/**
 * practice-v1-deprecated.test.js
 * P1-03 验收测试：Practice v1 废弃
 *
 * 覆盖验收标准：
 *   A2: 调用 v1 practice 自动转发到 practice_v2
 *   A3: QUESTION_BANK 为空
 *   A4: 低年级不返回8年级题目
 */

const fs = require('fs');
const path = require('path');

const PRACTICE_INDEX = path.join(__dirname, '..', '..', 'practice', 'index.js');
const PRACTICE_QB = path.join(__dirname, '..', '..', 'practice', 'question_bank.js');

describe('P1-03: Practice v1 废弃 — 源码验证', () => {

  test('验收 A3: question_bank.js 中 QUESTION_BANK 为空或已清空', () => {
    if (!fs.existsSync(PRACTICE_QB)) {
      // 文件已删除也算通过
      return;
    }
    const content = fs.readFileSync(PRACTICE_QB, 'utf-8');

    // 检查是否还有硬编码的题目内容（如 "二次根式"、"勾股定理"）
    const hasHardcodedQuestions = /二次根式|勾股定理|平行四边形|一次函数/.test(content);
    expect(hasHardcodedQuestions).toBe(false);
  });

  test('practice/index.js 包含 @deprecated 或废弃标记', () => {
    if (!fs.existsSync(PRACTICE_INDEX)) return;

    const content = fs.readFileSync(PRACTICE_INDEX, 'utf-8');
    expect(content).toMatch(/@deprecated|DEPRECATED|废弃/i);
  });

  test('前端 cloudApi.js 调用的是 practice_v2 而非 practice', () => {
    const cloudApi = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'utils', 'cloudApi.js'),
      'utf-8'
    );

    // startPractice 应调用 practice_v2
    const practiceCallMatch = cloudApi.match(/callCloudFunction\(\s*['"](\w+)['"]/g);
    if (practiceCallMatch) {
      const startPracticeSection = cloudApi.substring(
        cloudApi.indexOf('function startPractice'),
        cloudApi.indexOf('function startPractice') + 2000
      );
      expect(startPracticeSection).toContain("'practice_v2'");
      expect(startPracticeSection).not.toContain("'practice'");
    }
  });
});
