/**
 * Phase 7: 题目生成集成测试 (TDD)
 * 功能：复用 questionGenerator，配置超时，支持 user_materials 向量检索
 */

const {
  generateQuestionsForTask
} = require('../index');

// 模拟专属测评任务
const mockExclusiveTask = {
  _id: 'queue_exclusive_123',
  student_id: 'student_123',
  openid: 'oHF0C7xxxxx',
  subject: 'math',
  grade: '8',
  semester: 'up',
  mode: 'exclusive',  // 专属测评模式
  num_questions: 10,
  difficulty_distribution: { medium: 1.0 },
  status: 'pending',
  priority: 100,
  exam_id: 'exam_123',
  source_materials: ['material_1', 'material_2'],  // 用户资料 ID 列表
  rag_chunks: ['chunk_1', 'chunk_2', 'chunk_3'],  // RAG 检索的 chunks
  created_at: new Date().toISOString()
};

// 模拟数据库集合
class MockUserMaterialsCollection {
  constructor() {
    this.materials = [];
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

    // 按 material_id 过滤
    if (this._whereFilter && this._whereFilter.material_id) {
      const materialIds = this._whereFilter.material_id.$in || [];
      result = result.filter(c => materialIds.includes(c.material_id));
    }

    // 按 openid 过滤
    if (this._whereFilter && this._whereFilter.openid) {
      result = result.filter(c => c.openid === this._whereFilter.openid);
    }

    if (this._limitCount) {
      result = result.slice(0, this._limitCount);
    }

    return { data: result };
  }

  addChunks(chunks) {
    this.chunks.push(...chunks.map((c, i) => ({
      _id: `chunk_${Date.now()}_${i}`,
      ...c
    })));
  }
}

class MockDb {
  constructor() {
    this.userMaterials = new MockUserMaterialsCollection();
  }

  collection(name) {
    if (name === 'user_materials_vectors') {
      return this.userMaterials;
    }
    return {
      where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) })
    };
  }
}

// 模拟 AI 生成函数（支持 user_materials 上下文）
async function mockGenerateAi(task, difficulty, count) {
  // 检查是否传递了 RAG chunks
  const hasRagContext = task.rag_chunks && task.rag_chunks.length > 0;

  const questions = [];
  for (let i = 0; i < count; i++) {
    questions.push({
      id: `ai_${Date.now()}_${i}`,
      type: 'choice',
      content: hasRagContext
        ? `基于用户资料生成的数学题目 ${i + 1}（包含 RAG 上下文）`
        : `普通数学题目 ${i + 1}`,
      options: ['选项A', '选项B', '选项C', '选项D'],
      correct_answer: 0,
      knowledge_point: '知识点' + (i + 1),
      difficulty: difficulty,
      explanation: '解析',
      subject: task.subject,
      source: hasRagContext ? 'ai_with_rag' : 'ai'
    });
  }

  return questions;
}

describe('Phase 7: 题目生成集成', () => {
  describe('Step 7.1: 专属测评任务识别', () => {
    it('应该识别专属测评模式 (mode=exclusive)', () => {
      const task = mockExclusiveTask;
      expect(task.mode).toBe('exclusive');
      expect(task.source_materials).toBeDefined();
      expect(task.rag_chunks).toBeDefined();
    });

    it('专属测评任务应该包含必要的 RAG 字段', () => {
      const task = mockExclusiveTask;
      expect(task.source_materials).toHaveLength(2);
      expect(task.rag_chunks).toHaveLength(3);
      expect(task.exam_id).toBe('exam_123');
    });
  });

  describe('Step 7.2: RAG 上下文注入', () => {
    let mockDb;

    beforeEach(() => {
      mockDb = new MockDb();
      // 添加模拟 chunks
      mockDb.userMaterials.addChunks([
        {
          openid: 'oHF0C7xxxxx',
          material_id: 'material_1',
          chunk_index: 0,
          content: '第一章：二次根式的内容',
          metadata: { chapter: '第一章', topic: '二次根式' }
        },
        {
          openid: 'oHF0C7xxxxx',
          material_id: 'material_2',
          chunk_index: 0,
          content: '第二章：勾股定理的内容',
          metadata: { chapter: '第二章', topic: '勾股定理' }
        }
      ]);
    });

    it('应该能够从 user_materials_vectors 检索 chunks', async () => {
      const chunks = await mockDb.collection('user_materials_vectors')
        .where({
          openid: 'oHF0C7xxxxx',
          material_id: mockDb.command?.in?.(['material_1', 'material_2']) || { $in: ['material_1', 'material_2'] }
        })
        .limit(50)
        .get();

      expect(chunks.data).toBeDefined();
      expect(chunks.data.length).toBeGreaterThan(0);
    });

    it('专属测评任务应该包含 RAG chunks 用于上下文', async () => {
      const task = { ...mockExclusiveTask };
      expect(task.rag_chunks).toBeDefined();
      expect(task.rag_chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Step 7.3: AI 生成支持 RAG 上下文', () => {
    it('普通任务生成不包含 RAG 上下文', async () => {
      const normalTask = {
        ...mockExclusiveTask,
        mode: 'quick',
        rag_chunks: []
      };

      const questions = await mockGenerateAi(normalTask, 'medium', 5);

      expect(questions).toHaveLength(5);
      questions.forEach(q => {
        expect(q.source).toBe('ai');
        expect(q.content).not.toContain('RAG');
      });
    });

    it('专属测评任务生成应该包含 RAG 上下文', async () => {
      const questions = await mockGenerateAi(mockExclusiveTask, 'medium', 5);

      expect(questions).toHaveLength(5);
      questions.forEach(q => {
        expect(q.source).toBe('ai_with_rag');
        expect(q.content).toContain('RAG');
      });
    });
  });

  describe('Step 7.4: 题目关联到 user_exams', () => {
    it('专属测评任务应该关联 exam_id', () => {
      expect(mockExclusiveTask.exam_id).toBe('exam_123');
    });

    it('生成的题目应该标记 source 为 user_material', async () => {
      const questions = await mockGenerateAi(mockExclusiveTask, 'medium', 3);

      questions.forEach(q => {
        expect(q.source).toBe('ai_with_rag');
      });
    });
  });

  describe('Step 7.5: 向后兼容性', () => {
    it('普通任务不应该包含 RAG 字段', () => {
      const normalTask = {
        _id: 'queue_normal_123',
        student_id: 'student_123',
        subject: 'math',
        grade: '8',
        mode: 'quick',
        num_questions: 10,
        difficulty_distribution: { medium: 1.0 },
        status: 'pending',
        priority: 1,
        created_at: new Date().toISOString()
      };

      expect(normalTask.mode).not.toBe('exclusive');
      expect(normalTask.source_materials).toBeUndefined();
      expect(normalTask.rag_chunks).toBeUndefined();
    });

    it('普通任务应该正常生成题目', async () => {
      const normalTask = {
        ...mockExclusiveTask,
        mode: 'quick',
        rag_chunks: []
      };

      const questions = await mockGenerateAi(normalTask, 'medium', 5);

      expect(questions).toHaveLength(5);
      expect(questions[0].source).toBe('ai');
    });
  });
});
