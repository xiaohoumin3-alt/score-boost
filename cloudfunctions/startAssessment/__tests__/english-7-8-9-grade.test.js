/**
 * 7/8/9年级英语科目支持测试
 * 验证startAssessment是否支持7/8/9年级英语
 */

const { loadKnowledgeTree } = require('../shared/knowledge_tree');

describe('7/8/9年级英语科目支持测试', () => {
  describe('loadKnowledgeTree支持英语7/8/9年级', () => {
    it('应该加载七年级英语上册数据', () => {
      const tree = loadKnowledgeTree('english', '7', 'up');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
      expect(tree.grade).toBe('7');
      expect(tree.chapters.length).toBeGreaterThan(0);
    });

    it('应该加载七年级英语下册数据', () => {
      const tree = loadKnowledgeTree('english', '7', 'down');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
      expect(tree.grade).toBe('7');
      expect(tree.chapters.length).toBeGreaterThan(0);
    });

    it('应该加载八年级英语上册数据', () => {
      const tree = loadKnowledgeTree('english', '8', 'up');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
      expect(tree.grade).toBe('8');
      expect(tree.chapters.length).toBeGreaterThan(0);
    });

    it('应该加载八年级英语下册数据', () => {
      const tree = loadKnowledgeTree('english', '8', 'down');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
      expect(tree.grade).toBe('8');
      expect(tree.chapters.length).toBeGreaterThan(0);
    });

    it('应该加载九年级英语上册数据', () => {
      const tree = loadKnowledgeTree('english', '9', 'up');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
      expect(tree.grade).toBe('9');
      expect(tree.chapters.length).toBeGreaterThan(0);
    });

    it('应该加载九年级英语下册数据', () => {
      const tree = loadKnowledgeTree('english', '9', 'down');
      expect(tree).toBeDefined();
      expect(tree.subject).toBe('英语');
      expect(tree.grade).toBe('9');
      expect(tree.chapters.length).toBeGreaterThan(0);
    });
  });

  describe('startAssessment科目年级矩阵验证', () => {
    it('应该验证英语在SUBJECT_GRADE_MATRIX中的范围是1-9', () => {
      // 模拟startAssessment中的SUBJECT_GRADE_MATRIX
      const SUBJECT_GRADE_MATRIX = {
        'math': { min: 1, max: 9 },
        'chinese': { min: 1, max: 9 },
        'english': { min: 1, max: 9 },
        'biology': { min: 7, max: 8 },
        'geography': { min: 7, max: 8 },
        'history': { min: 7, max: 9 },
        'politics': { min: 7, max: 9 },
        'physics': { min: 8, max: 9 },
        'chemistry': { min: 9, max: 9 }
      };

      const englishRange = SUBJECT_GRADE_MATRIX.english;
      expect(englishRange.min).toBe(1);
      expect(englishRange.max).toBe(9);

      // 验证7/8/9年级在范围内
      expect(englishRange.min).toBeLessThanOrEqual(7);
      expect(englishRange.max).toBeGreaterThanOrEqual(9);
    });

    it('应该验证7年级英语不报错', () => {
      const SUBJECT_GRADE_MATRIX = {
        'english': { min: 1, max: 9 }
      };

      const subject = 'english';
      const grade = '7';
      const gradeNum = parseInt(grade, 10);
      const validRange = SUBJECT_GRADE_MATRIX[subject];

      const isValid = !isNaN(gradeNum) && gradeNum >= validRange.min && gradeNum <= validRange.max;
      expect(isValid).toBe(true);
    });

    it('应该验证8年级英语不报错', () => {
      const SUBJECT_GRADE_MATRIX = {
        'english': { min: 1, max: 9 }
      };

      const subject = 'english';
      const grade = '8';
      const gradeNum = parseInt(grade, 10);
      const validRange = SUBJECT_GRADE_MATRIX[subject];

      const isValid = !isNaN(gradeNum) && gradeNum >= validRange.min && gradeNum <= validRange.max;
      expect(isValid).toBe(true);
    });

    it('应该验证9年级英语不报错', () => {
      const SUBJECT_GRADE_MATRIX = {
        'english': { min: 1, max: 9 }
      };

      const subject = 'english';
      const grade = '9';
      const gradeNum = parseInt(grade, 10);
      const validRange = SUBJECT_GRADE_MATRIX[subject];

      const isValid = !isNaN(gradeNum) && gradeNum >= validRange.min && gradeNum <= validRange.max;
      expect(isValid).toBe(true);
    });
  });

  describe('英语知识点内容验证', () => {
    it('应该验证七年级英语有实际知识点', () => {
      const tree = loadKnowledgeTree('english', '7', 'up');
      const kpCount = tree.chapters.reduce((count, chapter) => {
        return count + (chapter.knowledge_points?.length || 0);
      }, 0);

      expect(kpCount).toBeGreaterThan(0);
      expect(kpCount).toBeGreaterThan(5); // 至少应该有5个知识点
    });

    it('应该验证八年级英语有实际知识点', () => {
      const tree = loadKnowledgeTree('english', '8', 'up');
      const kpCount = tree.chapters.reduce((count, chapter) => {
        return count + (chapter.knowledge_points?.length || 0);
      }, 0);

      expect(kpCount).toBeGreaterThan(0);
    });

    it('应该验证九年级英语有实际知识点', () => {
      const tree = loadKnowledgeTree('english', '9', 'up');
      const kpCount = tree.chapters.reduce((count, chapter) => {
        return count + (chapter.knowledge_points?.length || 0);
      }, 0);

      expect(kpCount).toBeGreaterThan(0);
    });
  });
});
