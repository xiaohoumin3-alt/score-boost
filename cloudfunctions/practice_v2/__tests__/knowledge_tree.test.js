/**
 * knowledge_tree 模块测试
 */

const {
  loadKnowledgeTree,
  generateQuestionPlan
} = require('../shared/knowledge_tree');

describe('practice_v2 knowledge tree', () => {
  test('loads Chinese grade names from packaged data files', () => {
    const tree = loadKnowledgeTree('chinese', '二年级', '下');
    const plan = generateQuestionPlan(tree, 5);

    expect(tree.chapters.length).toBeGreaterThan(0);
    expect(plan).toHaveLength(5);
    plan.forEach(item => {
      expect(item.kp).toBeDefined();
      expect(item.kp.kp_id).toBeTruthy();
    });
  });

  test('does not create invalid plan items for an empty knowledge tree', () => {
    const plan = generateQuestionPlan({ chapters: [] }, 5);

    expect(plan).toEqual([]);
  });
});
