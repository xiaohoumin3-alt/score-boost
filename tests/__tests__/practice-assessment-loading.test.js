/**
 * 回归测试：练习页从队列完成后的 assessment 读取题目
 *
 * 根因：练习页曾误用 finishAssessment，它只返回 completed+score 的结果，
 * 队列生成完成后的练习 assessment 是 ready/in_progress + questions，导致加载失败。
 */
const fs = require('fs');
const path = require('path');

describe('练习页 assessment 取题逻辑', () => {
  test('队列完成后通过 getAssessment 读取题目，而不是 finishAssessment 读取结果', () => {
    const practicePath = path.join(__dirname, '../../pages/practice/practice.js');
    const source = fs.readFileSync(practicePath, 'utf8');

    expect(source).toContain("name: 'getAssessment'");
    expect(source).not.toContain('api.finishAssessment');
  });
});
