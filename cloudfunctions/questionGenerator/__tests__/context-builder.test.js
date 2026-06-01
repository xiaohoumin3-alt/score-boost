/**
 * context-builder 单元测试 (TDD)
 * Phase 7: RAG 上下文构建器
 */

const {
  buildUserMaterialContext,
  isExclusiveMode,
  getRagChunkIds
} = require('../workflow/utils/context-builder');

// 模拟数据库
class MockVectorCollection {
  constructor() {
    this.chunks = [];
  }

  where(condition) {
    this._whereFilter = condition;
    return this;
  }

  limit(count) {
    this._limitCount = count;
    return this;
  }

  async get() {
    let result = this.chunks;

    if (this._whereFilter && this._whereFilter._id) {
      const ids = this._whereFilter._id.$in || [];
      result = result.filter(c => ids.includes(c._id));
    }

    if (this._limitCount) {
      result = result.slice(0, this._limitCount);
    }

    return { data: result };
  }

  addChunks(chunks) {
    this.chunks.push(...chunks);
  }
}

class MockCommand {
  in(arr) {
    return { $in: arr };
  }
}

class MockDb {
  constructor() {
    this.vectors = new MockVectorCollection();
  }

  collection(name) {
    if (name === 'user_materials_vectors') {
      return this.vectors;
    }
    throw new Error(`Unknown collection: ${name}`);
  }
}

describe('context-builder', () => {
  let mockDb;
  let mockCommand;

  beforeEach(() => {
    mockDb = new MockDb();
    mockCommand = new MockCommand();

    // 添加测试 chunks
    mockDb.vectors.addChunks([
      {
        _id: 'chunk_1',
        openid: 'user123',
        material_id: 'material_1',
        content: '第一章内容：二次根式的定义和性质',
        metadata: { chapter: '第一章', topic: '二次根式' }
      },
      {
        _id: 'chunk_2',
        openid: 'user123',
        material_id: 'material_1',
        content: '第二章内容：勾股定理及其应用',
        metadata: { chapter: '第二章', topic: '勾股定理' }
      },
      {
        _id: 'chunk_3',
        openid: 'user123',
        material_id: 'material_2',
        content: '第三章内容：一次函数的图像和性质',
        metadata: { chapter: '第三章', topic: '一次函数' }
      }
    ]);
  });

  describe('buildUserMaterialContext', () => {
    it('应该返回空上下文当 chunkIds 为空', async () => {
      const context = await buildUserMaterialContext(mockDb, mockCommand, 'user123', [], 50);

      expect(context.hasContext).toBe(false);
      expect(context.chunks).toHaveLength(0);
      expect(context.summary).toBe('');
    });

    it('应该返回空上下文当 chunkIds 为 null', async () => {
      const context = await buildUserMaterialContext(mockDb, mockCommand, 'user123', null, 50);

      expect(context.hasContext).toBe(false);
      expect(context.chunks).toHaveLength(0);
    });

    it('应该检索指定 chunks 并构建上下文', async () => {
      const chunkIds = ['chunk_1', 'chunk_2'];
      const context = await buildUserMaterialContext(mockDb, mockCommand, 'user123', chunkIds, 50);

      expect(context.hasContext).toBe(true);
      expect(context.chunks).toHaveLength(2);
      expect(context.summary).toContain('二次根式');
      expect(context.summary).toContain('勾股定理');
    });

    it('应该限制返回的 chunks 数量', async () => {
      const chunkIds = ['chunk_1', 'chunk_2', 'chunk_3'];
      const context = await buildUserMaterialContext(mockDb, mockCommand, 'user123', chunkIds, 2);

      expect(context.hasContext).toBe(true);
      expect(context.chunks).toHaveLength(2);
      expect(context.chunkCount).toBe(2);
    });

    it('chunks 应该包含正确的结构', async () => {
      const chunkIds = ['chunk_1'];
      const context = await buildUserMaterialContext(mockDb, mockCommand, 'user123', chunkIds, 50);

      expect(context.chunks[0]).toEqual({
        id: 'chunk_1',
        content: '第一章内容：二次根式的定义和性质',
        metadata: { chapter: '第一章', topic: '二次根式' },
        material_id: 'material_1'
      });
    });

    it('应该处理数据库错误', async () => {
      const errorDb = {
        collection: () => {
          throw new Error('Database error');
        }
      };

      const context = await buildUserMaterialContext(errorDb, mockCommand, 'user123', ['chunk_1'], 50);

      expect(context.hasContext).toBe(false);
      expect(context.error).toBe('Database error');
    });
  });

  describe('isExclusiveMode', () => {
    it('应该识别专属测评模式', () => {
      const task = { mode: 'exclusive' };
      expect(isExclusiveMode(task)).toBe(true);
    });

    it('应该识别非专属测评模式', () => {
      const task = { mode: 'quick' };
      expect(isExclusiveMode(task)).toBe(false);
    });

    it('应该处理空任务', () => {
      expect(isExclusiveMode(null)).toBe(false);
      expect(isExclusiveMode(undefined)).toBe(false);
      expect(isExclusiveMode({})).toBe(false);
    });
  });

  describe('getRagChunkIds', () => {
    it('应该返回 RAG chunks ID 列表', () => {
      const task = { rag_chunks: ['chunk_1', 'chunk_2', 'chunk_3'] };
      const ids = getRagChunkIds(task);

      expect(ids).toEqual(['chunk_1', 'chunk_2', 'chunk_3']);
    });

    it('应该处理空 rag_chunks', () => {
      expect(getRagChunkIds({})).toEqual([]);
      expect(getRagChunkIds({ rag_chunks: [] })).toEqual([]);
      expect(getRagChunkIds({ rag_chunks: null })).toEqual([]);
    });

    it('应该处理 null 任务', () => {
      expect(getRagChunkIds(null)).toEqual([]);
      expect(getRagChunkIds(undefined)).toEqual([]);
    });
  });
});
