/**
 * adminReviewMaterial 云函数测试
 * TDD: Red-Green-Refactor
 */

// 必须在导入前设置mock
const cloud = require('wx-server-sdk');

jest.mock('wx-server-sdk', () => {
  const mockCollection = {
    where: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    field: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    get: jest.fn(),
    add: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    count: jest.fn()
  };

  const mockDb = {
    collection: jest.fn().mockReturnValue(mockCollection),
    startTransaction: jest.fn(),
    command: {
      and: jest.fn(),
      or: jest.fn(),
      eq: jest.fn(),
      neq: jest.fn(),
      gt: jest.fn(),
      gte: jest.fn(),
      lt: jest.fn(),
      lte: jest.fn(),
      in: jest.fn(),
      nin: jest.fn(),
      set: jest.fn()
    }
  };

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: jest.fn().mockReturnValue(mockDb),
    getWXContext: jest.fn().mockReturnValue({
      OPENID: 'test_openid',
      APPID: 'test_appid'
    })
  };
});

// 现在可以导入主模块
const { main } = require('../index');
const db = cloud.database();

describe('adminReviewMaterial', () => {
  let mockContext;
  let mockCollection;
  let mockTransaction;

  beforeEach(() => {
    jest.clearAllMocks();

    // 获取mock实例
    mockCollection = db.collection();

    mockTransaction = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue({}),
          get: jest.fn()
        })
      }),
      commit: jest.fn(),
      rollback: jest.fn()
    };

    db.startTransaction.mockResolvedValue(mockTransaction);

    // 模拟管理员上下文 - 使用默认管理员ID
    mockContext = {
      userInfo: {
        openId: 'oxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
      },
      ENV: 'test-env'
    };
  });

  /**
   * Step 4.1: 审核列表查询
   */
  describe('listPending - 审核列表查询', () => {
    test('should return pending materials with pagination', async () => {
      const mockMaterials = [
        {
          _id: 'mat1',
          title: '测试资料1',
          status: 'pending',
          subject: 'math',
          grade: '高一',
          created_at: '2024-01-01T00:00:00.000Z',
          uploader_name: '张三'
        }
      ];

      mockCollection.get.mockResolvedValue({ data: mockMaterials, errMsg: null });
      mockCollection.count.mockResolvedValue({ total: 1, errMsg: null });

      const event = {
        action: 'listPending',
        page: 1,
        limit: 10,
        subject: 'math'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMaterials);
      expect(mockCollection.limit).toHaveBeenCalledWith(10);
      expect(mockCollection.skip).toHaveBeenCalledWith(0);
    });

    test('should support pagination parameters', async () => {
      mockCollection.get.mockResolvedValue({ data: [], errMsg: null });
      mockCollection.count.mockResolvedValue({ total: 0, errMsg: null });

      const event = {
        action: 'listPending',
        page: 2,
        limit: 20
      };

      await main(event, mockContext);

      expect(mockCollection.skip).toHaveBeenCalledWith(20);
      expect(mockCollection.limit).toHaveBeenCalledWith(20);
    });

    test('should return empty array when no pending materials', async () => {
      mockCollection.get.mockResolvedValue({ data: [], errMsg: null });
      mockCollection.count.mockResolvedValue({ total: 0, errMsg: null });

      const event = {
        action: 'listPending'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  /**
   * Step 4.2: 审核详情查询
   */
  describe('getDetail - 审核详情查询', () => {
    test('should return material detail with knowledge points', async () => {
      const mockMaterial = {
        _id: 'mat1',
        title: '二次根式练习',
        status: 'pending',
        subject: 'math',
        grade: '高一',
        knowledge_points: [
          { kp_id: 'kp1_1', name: '二次根式的定义', confidence: 0.95 }
        ]
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });

      const event = {
        action: 'getDetail',
        materialId: 'mat1'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMaterial);
      expect(result.data.knowledge_points).toBeDefined();
    });

    test('should return error when material not found', async () => {
      mockCollection.get.mockResolvedValue({ data: null, errMsg: null });

      const event = {
        action: 'getDetail',
        materialId: 'nonexistent'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(false);
      expect(result.code).toBe('MATERIAL_NOT_FOUND');
    });
  });

  /**
   * Step 4.3: 批准操作
   */
  describe('approve - 批准操作', () => {
    test('should approve material', async () => {
      const mockMaterial = {
        _id: 'mat1',
        status: 'pending',
        knowledge_points: [{ kp_id: 'kp1_1', name: '二次根式的定义' }]
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });
      mockCollection.update.mockResolvedValue({ _id: 'mat1' });

      const event = {
        action: 'approve',
        materialId: 'mat1',
        reviewerNote: '资料质量良好'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(true);
      expect(result.status).toBe('approved');
    });

    test('should fail when material already processed', async () => {
      const mockMaterial = {
        _id: 'mat1',
        status: 'rejected'
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });

      const event = {
        action: 'approve',
        materialId: 'mat1'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(false);
      expect(result.code).toBe('ALREADY_PROCESSED');
    });

    test('should validate required parameters', async () => {
      const event = {
        action: 'approve'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_PARAMS');
    });
  });

  /**
   * Step 4.4: 拒绝操作
   */
  describe('reject - 拒绝操作', () => {
    test('should reject material with reason', async () => {
      const mockMaterial = {
        _id: 'mat1',
        status: 'pending'
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });
      mockCollection.update.mockResolvedValue({ _id: 'mat1' });

      const event = {
        action: 'reject',
        materialId: 'mat1',
        reviewerNote: '内容不相关'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(true);
      expect(result.status).toBe('rejected');
    });

    test('should require reviewerNote for rejection', async () => {
      const mockMaterial = {
        _id: 'mat1',
        status: 'pending'
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });

      const event = {
        action: 'reject',
        materialId: 'mat1'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_NOTE');
    });
  });

  /**
   * Step 4.5: 知识点编辑
   */
  describe('updateKnowledgePoints - 知识点编辑', () => {
    test('should allow admin to edit knowledge points', async () => {
      const mockMaterial = {
        _id: 'mat1',
        status: 'pending',
        knowledge_points: [{ kp_id: 'kp1_1', name: '原知识点' }]
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });
      mockCollection.update.mockResolvedValue({ _id: 'mat1' });

      const event = {
        action: 'updateKnowledgePoints',
        materialId: 'mat1',
        knowledgePoints: [
          { kp_id: 'kp1_1', name: '修改后的知识点' }
        ]
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(true);
      expect(mockCollection.update).toHaveBeenCalled();
    });

    test('should validate knowledge point format', async () => {
      const mockMaterial = {
        _id: 'mat1',
        status: 'pending',
        knowledge_points: []
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });

      const event = {
        action: 'updateKnowledgePoints',
        materialId: 'mat1',
        knowledgePoints: [{ kp_id: 'kp1' }] // missing name
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_PARAMS');
    });
  });

  /**
   * Step 4.6: 事务性保证
   */
  describe('transaction - 事务性保证', () => {
    test('should use transaction for approve operation', async () => {
      const mockMaterial = {
        _id: 'mat1',
        status: 'pending',
        knowledge_points: [{ kp_id: 'kp1_1', name: '测试知识点' }]
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });
      mockTransaction.commit.mockResolvedValue({ stats: { updated: 1 } });

      const event = {
        action: 'approve',
        materialId: 'mat1',
        useTransaction: true
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(true);
      expect(db.startTransaction).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    test('should rollback on transaction failure', async () => {
      const mockMaterial = {
        _id: 'mat1',
        status: 'pending',
        knowledge_points: [{ kp_id: 'kp1_1', name: '测试知识点' }]
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });
      mockTransaction.commit.mockRejectedValue(new Error('Transaction failed'));

      const event = {
        action: 'approve',
        materialId: 'mat1',
        useTransaction: true
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(false);
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    test('should support idempotent operations', async () => {
      const mockMaterial = {
        _id: 'mat1',
        status: 'approved',
        reviewerId: 'admin_openid_123'
      };

      mockCollection.get.mockResolvedValue({ data: mockMaterial, errMsg: null });

      const event = {
        action: 'approve',
        materialId: 'mat1'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(true);
      expect(result.alreadyApproved).toBe(true);
    });
  });

  /**
   * 权限验证
   */
  describe('permission - 权限验证', () => {
    test('should reject non-admin users', async () => {
      const nonAdminContext = {
        userInfo: {
          openId: 'non_admin_openid_not_in_list'
        }
      };

      const event = {
        action: 'approve',
        materialId: 'mat1'
      };

      const result = await main(event, nonAdminContext);

      expect(result.success).toBe(false);
      expect(result.code).toBe('PERMISSION_DENIED');
    });
  });

  /**
   * 参数验证
   */
  describe('validation - 参数验证', () => {
    test('should reject invalid action', async () => {
      const event = {
        action: 'invalidAction',
        materialId: 'mat1'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_ACTION');
    });

    test('should validate action parameter presence', async () => {
      const event = {
        materialId: 'mat1'
      };

      const result = await main(event, mockContext);

      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_ACTION');
    });
  });
});
