/**
 * 英语科目加载测试
 */

const { loadKnowledgeTree } = require('../shared/knowledge_tree');

describe('英语科目加载测试', () => {
  describe('loadKnowledgeTree', () => {
    it('应该加载一年级英语上册数据', () => {
      const tree = loadKnowledgeTree('english', '1', 'up');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
      expect(tree.grade).toBe('1');
      expect(tree.semester).toBe('上册');
      expect(tree.chapters.length).toBeGreaterThan(0);
      expect(tree.chapters[0].knowledge_points.length).toBeGreaterThan(0);
    });

    it('应该加载七年级英语下册数据', () => {
      const tree = loadKnowledgeTree('english', '7', 'down');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
      expect(tree.grade).toBe('7');
      expect(tree.semester).toBe('下册');
      expect(tree.chapters.length).toBeGreaterThan(0);
    });

    it('应该加载九年级英语上册数据', () => {
      const tree = loadKnowledgeTree('english', '9', 'up');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
      expect(tree.chapters.length).toBeGreaterThan(0);
    });

    it('应该支持中文科目名"英语"', () => {
      const tree = loadKnowledgeTree('英语', '7', 'up');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
    });

    it('应该覆盖1-9年级', () => {
      const grades = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
      grades.forEach(grade => {
        const tree = loadKnowledgeTree('english', grade, 'up');
        expect(tree).toBeDefined();
        expect(tree.chapters.length).toBeGreaterThan(0);
      });
    });
  });
});
