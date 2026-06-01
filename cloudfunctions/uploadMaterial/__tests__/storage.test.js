/**
 * 存储模块测试 - TDD Phase 3
 * 分流存储: user_materials 和 material_review
 */

const { savePersonalMaterial, saveTextbookForReview } = require('../storage');

// Mock 数据库
const mockDb = {
  collection: jest.fn(() => mockDb),
  add: jest.fn(),
  doc: jest.fn(() => mockDb),
  update: jest.fn(),
  set: jest.fn()
};

describe('存储模块 - user_materials存储', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('savePersonalMaterial 存储个人材料成功', async () => {
    const materialData = {
      openid: 'test-user-openid',
      material_type: 'personal',
      file_name: '我的笔记.pdf',
      file_type: 'pdf',
      file_url: 'cloud://test.pdf',
      subject: '数学',
      grade: '高一',
      chunks_count: 5,
      knowledge_points: ['函数', '方程']
    };

    mockDb.add.mockResolvedValue({ id: 'material-123' });

    const result = await savePersonalMaterial(materialData, mockDb);

    expect(mockDb.collection).toHaveBeenCalledWith('user_materials');
    expect(mockDb.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        openid: 'test-user-openid',
        material_type: 'personal',
        file_name: '我的笔记.pdf',
        file_type: 'pdf',
        file_url: 'cloud://test.pdf',
        subject: '数学',
        grade: '高一',
        chunks_count: 5,
        knowledge_points: ['函数', '方程']
      })
    });
    expect(result).toEqual({
      success: true,
      material_id: 'material-123'
    });
  });

  test('savePersonalMaterial 处理数据库错误', async () => {
    const materialData = {
      openid: 'test-user-openid',
      material_type: 'personal',
      file_name: '我的笔记.pdf',
      file_type: 'pdf',
      file_url: 'cloud://test.pdf'
    };

    mockDb.add.mockRejectedValue(new Error('数据库连接失败'));

    const result = await savePersonalMaterial(materialData, mockDb);

    expect(result.success).toBe(false);
    expect(result.error).toContain('数据库连接失败');
  });

  test('savePersonalMaterial 验证必填字段', async () => {
    const materialData = {
      openid: 'test-user-openid',
      material_type: 'personal'
      // 缺少 file_name, file_type, file_url
    };

    const result = await savePersonalMaterial(materialData, mockDb);

    expect(result.success).toBe(false);
    expect(result.error).toContain('必填字段');
  });
});

describe('存储模块 - material_review存储', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saveTextbookForReview 存储教材审核记录成功', async () => {
    const textbookData = {
      material_id: 'material-456',
      openid: 'test-user-openid',
      file_name: '高中数学教材.pdf',
      subject: '数学',
      grade: '高一',
      extracted_kp_count: 15,
      knowledge_points: ['集合', '函数', '方程', '不等式']
    };

    mockDb.add.mockResolvedValue({ id: 'review-123' });

    const result = await saveTextbookForReview(textbookData, mockDb);

    expect(mockDb.collection).toHaveBeenCalledWith('material_review');
    expect(mockDb.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        material_id: 'material-456',
        openid: 'test-user-openid',
        file_name: '高中数学教材.pdf',
        subject: '数学',
        grade: '高一',
        extracted_kp_count: 15,
        knowledge_points: ['集合', '函数', '方程', '不等式'],
        status: 'pending'
      })
    });
    expect(result).toEqual({
      success: true,
      review_id: 'review-123'
    });
  });

  test('saveTextbookForReview 默认status为pending', async () => {
    const textbookData = {
      material_id: 'material-456',
      openid: 'test-user-openid',
      file_name: '高中数学教材.pdf',
      subject: '数学',
      grade: '高一'
    };

    mockDb.add.mockResolvedValue({ id: 'review-123' });

    await saveTextbookForReview(textbookData, mockDb);

    expect(mockDb.add).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'pending'
      })
    });
  });

  test('saveTextbookForReview 处理数据库错误', async () => {
    const textbookData = {
      material_id: 'material-456',
      openid: 'test-user-openid',
      file_name: '高中数学教材.pdf',
      subject: '数学',
      grade: '高一'
    };

    mockDb.add.mockRejectedValue(new Error('写入失败'));

    const result = await saveTextbookForReview(textbookData, mockDb);

    expect(result.success).toBe(false);
    expect(result.error).toContain('写入失败');
  });

  test('saveTextbookForReview 验证必填字段', async () => {
    const textbookData = {
      material_id: 'material-456'
      // 缺少 openid, file_name, subject, grade
    };

    const result = await saveTextbookForReview(textbookData, mockDb);

    expect(result.success).toBe(false);
    expect(result.error).toContain('必填字段');
  });
});
