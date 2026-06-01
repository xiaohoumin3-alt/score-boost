/**
 * adminReviewMaterial 云函数测试
 * TDD: Red-Green-Refactor
 */

const { cloudMock } = require('@test/mocks/cloud');

describe('adminReviewMaterial', () => {
  let mockContext;

  beforeEach(() => {
    mockContext = cloudMock.getContext();
    // 模拟管理员权限
    mockContext.userInfo = {
      ...mockContext.userInfo,
      isAdmin: true
    };
  });

  test('should reject non-admin users', async () => {
    mockContext.userInfo.isAdmin = false;

    const event = {
      materialId: 'test_material_id',
      action: 'approve'
    };

    const result = await main(event, mockContext);
    expect(result.errMsg).toContain('权限不足');
  });

  test('should approve valid material', async () => {
    const materialId = 'test_material_id';

    // 创建测试数据
    await mockContext.db.collection('user_materials').add({
      data: {
        _id: materialId,
        status: 'pending_review'
      }
    });

    const event = {
      materialId,
      action: 'approve',
      reviewerNote: '资料质量良好'
    };

    const result = await main(event, mockContext);
    expect(result.success).toBe(true);
    expect(result.status).toBe('approved');
  });

  test('should reject invalid material', async () => {
    const materialId = 'test_material_id';

    const event = {
      materialId,
      action: 'reject',
      reviewerNote: '内容不相关'
    };

    const result = await main(event, mockContext);
    expect(result.success).toBe(true);
    expect(result.status).toBe('rejected');
  });
});
