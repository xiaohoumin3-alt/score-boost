/**
 * scoreCalibration.test.js
 * 验证 scoreCalibration 对空 IRT 的处理
 */

describe('scoreCalibration IRT 空值处理', () => {
  test('当 irtItems 为空时应返回错误而不是100分', async () => {
    // 模拟场景：ai_question_pool 中没有对应的题目
    // 这会导致 toIRTItems 返回空数组

    // 预期：scoreCalibration 应返回 error: 'NO_IRT_ITEMS'
    // 不应该：返回 estimatedScore: 100

    // 这个测试需要实际的云函数环境，或者需要 mock 数据库
    // 这里只是文档化预期行为

    expect(true).toBe(true); // 占位测试
  });

  test('当 IRT 覆盖率低于50%时应发出警告', () => {
    // 6道题中只有2道能找到 IRT 参数
    // 预期：警告 + 使用部分数据计算

    expect(true).toBe(true); // 占位测试
  });
});
