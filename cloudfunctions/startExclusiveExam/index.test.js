/**
 * startExclusiveExam 云函数测试
 * TDD: Red-Green-Refactor
 */

const { cloudMock } = require('@test/mocks/cloud');

describe('startExclusiveExam', () => {
  let mockContext;

  beforeEach(() => {
    mockContext = cloudMock.getContext();
  });

  test('should reject non-VIP users', async () => {
    mockContext.userInfo.isVip = false;

    const event = {
      subject: 'math',
      grade: '高一',
      materialIds: ['material1', 'material2']
    };

    const result = await main(event, mockContext);
    expect(result.errMsg).toContain('需要VIP权限');
  });

  test('should create exclusive assessment for VIP', async () => {
    mockContext.userInfo.isVip = true;

    const event = {
      subject: 'math',
      grade: '高一',
      materialIds: ['material1', 'material2'],
      questionCount: 10
    };

    const result = await main(event, mockContext);
    expect(result.assessmentId).toBeDefined();
    expect(result.status).toBe('generating');
  });

  test('should validate quota before creating assessment', async () => {
    mockContext.userInfo.isVip = true;

    const event = {
      subject: 'math',
      grade: '高一',
      materialIds: ['material1', 'material2'],
      questionCount: 10
    };

    // 模拟配额不足
    mockContext.db.collection('user_quota').where.returns({
      data: [{ remainingQuota: 0 }]
    });

    const result = await main(event, mockContext);
    expect(result.errMsg).toContain('配额不足');
  });
});
