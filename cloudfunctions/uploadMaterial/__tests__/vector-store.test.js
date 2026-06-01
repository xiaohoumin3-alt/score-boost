/**
 * 向量存储模块测试 - TDD Phase 3
 * 统一向量集合: user_materials_vectors
 * 使用 metadata 过滤: openid, material_id, material_type
 */

const {
  saveVectors,
  searchVectors,
  deleteVectors
} = require('../vector-store');

// Mock 向量数据库
const mockVectorDb = {
  insert: jest.fn(),
  search: jest.fn(),
  delete: jest.fn()
};

describe('向量存储模块 - user_materials_vectors集合', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saveVectors 保存向量到统一集合', async () => {
    const vectorData = {
      material_id: 'material-123',
      openid: 'test-user-openid',
      material_type: 'personal',
      chunks: [
        {
          id: 'chunk-1',
          text: '这是第一段文本',
          embedding: [0.1, 0.2, 0.3],
          metadata: {
            chunk_index: 0,
            subject: '数学'
          }
        },
        {
          id: 'chunk-2',
          text: '这是第二段文本',
          embedding: [0.4, 0.5, 0.6],
          metadata: {
            chunk_index: 1,
            subject: '数学'
          }
        }
      ]
    };

    mockVectorDb.insert.mockResolvedValue({ inserted: 2 });

    const result = await saveVectors(vectorData, mockVectorDb);

    expect(mockVectorDb.insert).toHaveBeenCalledWith({
      collection_name: 'user_materials_vectors',
      vectors: expect.arrayContaining([
        expect.objectContaining({
          material_id: 'material-123',
          openid: 'test-user-openid',
          material_type: 'personal'
        })
      ])
    });
    expect(result.success).toBe(true);
    expect(result.inserted_count).toBe(2);
  });

  test('saveVectors metadata包含过滤字段', async () => {
    const vectorData = {
      material_id: 'material-123',
      openid: 'test-user-openid',
      material_type: 'textbook',
      chunks: [
        {
          id: 'chunk-1',
          text: '教材内容',
          embedding: [0.1, 0.2, 0.3],
          metadata: {
            chunk_index: 0
          }
        }
      ]
    };

    mockVectorDb.insert.mockResolvedValue({ inserted: 1 });

    await saveVectors(vectorData, mockVectorDb);

    const insertCall = mockVectorDb.insert.mock.calls[0][0];
    const savedVector = insertCall.vectors[0];

    expect(savedVector.material_id).toBe('material-123');
    expect(savedVector.openid).toBe('test-user-openid');
    expect(savedVector.material_type).toBe('textbook');
  });

  test('searchVectors 通过metadata过滤检索', async () => {
    const searchParams = {
      openid: 'test-user-openid',
      material_type: 'personal',
      query_embedding: [0.1, 0.2, 0.3],
      limit: 5
    };

    const mockResults = [
      {
        id: 'chunk-1',
        text: '相关内容1',
        score: 0.95,
        metadata: {
          material_id: 'material-123',
          chunk_index: 0
        }
      },
      {
        id: 'chunk-2',
        text: '相关内容2',
        score: 0.85,
        metadata: {
          material_id: 'material-123',
          chunk_index: 1
        }
      }
    ];

    mockVectorDb.search.mockResolvedValue({ results: mockResults });

    const result = await searchVectors(searchParams, mockVectorDb);

    expect(mockVectorDb.search).toHaveBeenCalledWith({
      collection_name: 'user_materials_vectors',
      filter: {
        openid: 'test-user-openid',
        material_type: 'personal'
      },
      vector: searchParams.query_embedding,
      limit: 5
    });
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  test('searchVectors 支持按material_id过滤', async () => {
    const searchParams = {
      material_id: 'material-123',
      query_embedding: [0.1, 0.2, 0.3],
      limit: 10
    };

    mockVectorDb.search.mockResolvedValue({ results: [] });

    await searchVectors(searchParams, mockVectorDb);

    expect(mockVectorDb.search).toHaveBeenCalledWith({
      collection_name: 'user_materials_vectors',
      filter: {
        material_id: 'material-123'
      },
      vector: searchParams.query_embedding,
      limit: 10
    });
  });

  test('deleteVectors 删除指定材料的所有向量', async () => {
    const deleteParams = {
      material_id: 'material-123'
    };

    mockVectorDb.delete.mockResolvedValue({ deleted: 5 });

    const result = await deleteVectors(deleteParams, mockVectorDb);

    expect(mockVectorDb.delete).toHaveBeenCalledWith({
      collection_name: 'user_materials_vectors',
      filter: {
        material_id: 'material-123'
      }
    });
    expect(result.success).toBe(true);
    expect(result.deleted_count).toBe(5);
  });

  test('deleteVectors 支持按openid删除用户所有向量', async () => {
    const deleteParams = {
      openid: 'test-user-openid'
    };

    mockVectorDb.delete.mockResolvedValue({ deleted: 20 });

    const result = await deleteVectors(deleteParams, mockVectorDb);

    expect(mockVectorDb.delete).toHaveBeenCalledWith({
      collection_name: 'user_materials_vectors',
      filter: {
        openid: 'test-user-openid'
      }
    });
    expect(result.deleted_count).toBe(20);
  });

  test('saveVectors 处理空chunks', async () => {
    const vectorData = {
      material_id: 'material-123',
      openid: 'test-user-openid',
      material_type: 'personal',
      chunks: []
    };

    const result = await saveVectors(vectorData, mockVectorDb);

    expect(result.success).toBe(false);
    expect(result.error).toContain('chunks不能为空');
    expect(mockVectorDb.insert).not.toHaveBeenCalled();
  });

  test('searchVectors 处理向量数据库错误', async () => {
    const searchParams = {
      openid: 'test-user-openid',
      query_embedding: [0.1, 0.2, 0.3],
      limit: 5
    };

    mockVectorDb.search.mockRejectedValue(new Error('向量数据库连接失败'));

    const result = await searchVectors(searchParams, mockVectorDb);

    expect(result.success).toBe(false);
    expect(result.error).toContain('向量数据库连接失败');
  });
});
