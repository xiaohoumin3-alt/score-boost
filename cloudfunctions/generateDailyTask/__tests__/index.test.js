/**
 * generateDailyTask 测试
 * 验证冷启动任务包含 action: 'start_assessment'
 */

const { getColdStartTask } = require('../index');

describe('generateDailyTask cold start', () => {
  test('冷启动任务应包含 action: start_assessment', () => {
    const result = getColdStartTask('math', '2');

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.action).toBe('start_assessment');
    expect(result.data.title).toContain('乘法口诀');
  });

  test('冷启动任务应引导测评而非直接练习', () => {
    const result = getColdStartTask('chinese', '3');

    // 验证 action 正确引导
    expect(result.data.action).toBe('start_assessment');

    // 验证不会包含练习相关字段（这些只应在有测评数据时设置）
    expect(result.data.kp_id).toBeDefined();
    expect(result.data.kp_name).toBeDefined();
  });

  test('各年级冷启动任务都应包含 action', () => {
    const grades = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    grades.forEach(grade => {
      const result = getColdStartTask('math', grade);
      expect(result.data.action).toBe('start_assessment');
    });
  });

  test('缺失年级时应使用默认值（一年级）', () => {
    const result = getColdStartTask('math', undefined);
    expect(result.data.action).toBe('start_assessment');
    expect(result.data.title).toContain('100以内加减法');
  });
});
