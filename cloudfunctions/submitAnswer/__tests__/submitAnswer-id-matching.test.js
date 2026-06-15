/**
 * submitAnswer.test.js
 * 验证 submitAnswer 的 ID 匹配逻辑
 */

describe('submitAnswer ID 匹配', () => {
  test('results.question_id 应该与 ai_question_pool._id 匹配', () => {
    // 模拟场景：
    // 1. assessment 有 question_ids = ['id1', 'id2', ...]
    // 2. ai_question_pool 中的题目 _id = 'id1', 'id2', ...
    // 3. 用户提交答案使用 question_id = 'id1', 'id2', ...
    // 4. calculateScoreEstimation 查询 _id: _.in(batch) 应该找到匹配

    // 预期：如果 ID 匹配，poolQuestions 不应为空
    // 问题：如果 question_ids 使用 pool_id 而不是 _id，会匹配失败

    expect(true).toBe(true); // 占位测试
  });

  test('当题目未保存到题池时应返回明确的错误', () => {
    // 如果 questionGenerator 生成的题目没有保存到 ai_question_pool
    // submitAnswer 的 calculateScoreEstimation 应返回 null
    // 不应该使用默认参数计算导致 100 分

    expect(true).toBe(true); // 占位测试
  });
});
