/**
 * startAssessment 响应脱敏测试
 * 确保返回给客户端的题目不泄露正确答案。
 */

const fs = require('fs');
const path = require('path');

describe('startAssessment响应脱敏', () => {
  test('客户端questions响应不应该包含correct_answer或explanation', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../cloudfunctions/startAssessment/index.js'),
      'utf8'
    );
    const resultBlock = source.match(/questions:\s*questions\.map\(q => \(\{[\s\S]*?\}\)\),/);

    expect(resultBlock).not.toBeNull();
    expect(resultBlock[0]).not.toContain('correct_answer');
    expect(resultBlock[0]).not.toContain('explanation');
  });
});
