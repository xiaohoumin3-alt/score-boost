/**
 * RAG检索模块测试
 * TDD: 先写测试，再写实现
 */

const {
  searchUserMaterialChunks,
  buildRAGContext
} = require('../rag-search');

describe('RAG检索模块', () => {
  describe('searchUserMaterialChunks', () => {
    it('应该从user_materials_vectors检索相关chunks', async () => {
      const mockDb = {
        collection: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          data: [
            {
              _id: 'chunk1',
              openid: 'user123',
              material_id: 'mat1',
              chunk_text: '这是第一章的内容',
              metadata: { chapter: '第一章' }
            },
            {
              _id: 'chunk2',
              openid: 'user123',
              material_id: 'mat1',
              chunk_text: '这是第二章的内容',
              metadata: { chapter: '第二章' }
            }
          ]
        })
      };

      const mockCommand = {
        in: jest.fn((arr) => arr)
      };

      const result = await searchUserMaterialChunks(
        mockDb,
        mockCommand,
        'user123',
        ['mat1'],
        '二次函数',
        5
      );

      expect(result).toHaveLength(2);
      expect(result[0].openid).toBe('user123');
      expect(result[0].material_id).toBe('mat1');
      expect(mockDb.collection).toHaveBeenCalledWith('user_materials_vectors');
    });

    it('应该使用metadata过滤openid和material_id', async () => {
      const mockDb = {
        collection: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ data: [] })
      };

      const mockCommand = {
        in: jest.fn((arr) => arr)
      };

      await searchUserMaterialChunks(
        mockDb,
        mockCommand,
        'user123',
        ['mat1', 'mat2'],
        '测试查询',
        10
      );

      expect(mockDb.collection).toHaveBeenCalledWith('user_materials_vectors');
    });

    it('查询失败时应该返回空数组', async () => {
      const mockDb = {
        collection: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      const mockCommand = {
        in: jest.fn((arr) => arr)
      };

      const result = await searchUserMaterialChunks(
        mockDb,
        mockCommand,
        'user123',
        ['mat1'],
        '测试',
        5
      );

      expect(result).toEqual([]);
    });

    it('应该限制返回数量为topK', async () => {
      const mockDb = {
        collection: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          data: [
            { _id: 'chunk1' },
            { _id: 'chunk2' },
            { _id: 'chunk3' }
          ]
        })
      };

      const mockCommand = {
        in: jest.fn((arr) => arr)
      };

      await searchUserMaterialChunks(
        mockDb,
        mockCommand,
        'user123',
        ['mat1'],
        '测试',
        3
      );

      expect(mockDb.collection).toHaveBeenCalledWith('user_materials_vectors');
    });
  });

  describe('buildRAGContext', () => {
    it('应该将chunks组装成LLM context', () => {
      const chunks = [
        {
          _id: 'chunk1',
          chunk_text: '二次函数的定义是...',
          metadata: { chapter: '第一章', page: 1 }
        },
        {
          _id: 'chunk2',
          chunk_text: '二次函数的图像性质...',
          metadata: { chapter: '第二章', page: 5 }
        }
      ];

      const context = buildRAGContext(chunks);

      expect(context).toContain('二次函数的定义是...');
      expect(context).toContain('二次函数的图像性质...');
      expect(context).toContain('【参考资料1】');
      expect(context).toContain('【参考资料2】');
    });

    it('空chunks应该返回提示信息', () => {
      const context = buildRAGContext([]);
      expect(context).toContain('暂无参考资料');
    });

    it('应该包含格式化的元数据', () => {
      const chunks = [
        {
          _id: 'chunk1',
          chunk_text: '测试内容',
          metadata: { chapter: '第一章', section: '1.1节' }
        }
      ];

      const context = buildRAGContext(chunks);
      expect(context).toContain('第一章');
      expect(context).toContain('1.1节');
    });

    it('应该生成绩效的题目生成prompt', () => {
      const chunks = [
        {
          _id: 'chunk1',
          chunk_text: '函数的单调性是指...',
          metadata: { topic: '函数性质' }
        }
      ];

      const context = buildRAGContext(chunks, {
        subject: '数学',
        grade: '高一',
        difficulty: 'medium',
        questionCount: 5
      });

      expect(context).toContain('数学');
      expect(context).toContain('高一');
      expect(context).toContain('medium');
      expect(context).toContain('5');
    });
  });
});
