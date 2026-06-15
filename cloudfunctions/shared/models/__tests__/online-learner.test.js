/**
 * 在线学习器测试
 */

const OnlineLearner = require('../online-learner');

describe('OnlineLearner', () => {
  let learner;

  beforeEach(() => {
    learner = new OnlineLearner();
  });

  describe('recordResponse', () => {
    test('记录单次答题', () => {
      learner.recordResponse('user1', 'q1', true, 5000);
      const stats = learner.getItemStats('q1');
      expect(stats.correct_count).toBe(1);
      expect(stats.total_count).toBe(1);
    });

    test('记录多次答题', () => {
      learner.recordResponse('user1', 'q1', true, 5000);
      learner.recordResponse('user1', 'q1', false, 8000);
      learner.recordResponse('user2', 'q1', true, 4000);
      
      const stats = learner.getItemStats('q1');
      expect(stats.correct_count).toBe(2);
      expect(stats.total_count).toBe(3);
    });

    test('获取学生历史', () => {
      learner.recordResponse('user1', 'q1', true, 5000);
      learner.recordResponse('user1', 'q2', false, 6000);
      
      const history = learner.getStudentHistory('user1');
      expect(history.responses.length).toBe(2);
    });
  });

  describe('updateItemDifficulty', () => {
    test('数据不足时不更新', () => {
      learner.recordResponse('user1', 'q1', true, 5000);
      const update = learner.updateItemDifficulty('q1');
      expect(update).toBeNull();
    });

    test('数据足够时更新难度', () => {
      for (let i = 0; i < 20; i++) {
        learner.recordResponse(`user${i}`, 'q1', i < 15, 5000);
      }
      
      const update = learner.updateItemDifficulty('q1');
      expect(update).not.toBeNull();
      expect(update.sampleSize).toBe(20);
      expect(typeof update.newDifficulty).toBe('number');
    });

    test('全对题目 → 低难度', () => {
      for (let i = 0; i < 20; i++) {
        learner.recordResponse(`user${i}`, 'q1', true, 5000);
      }
      
      const update = learner.updateItemDifficulty('q1');
      expect(update.newDifficulty).toBeLessThan(0);
    });

    test('全错题目 → 高难度', () => {
      for (let i = 0; i < 20; i++) {
        learner.recordResponse(`user${i}`, 'q1', false, 5000);
      }
      
      const update = learner.updateItemDifficulty('q1');
      expect(update.newDifficulty).toBeGreaterThan(0);
    });
  });

  describe('导出/导入', () => {
    test('导出后导入保持数据一致', () => {
      learner.recordResponse('user1', 'q1', true, 5000);
      
      const exported = learner.exportStats();
      const newLearner = new OnlineLearner();
      newLearner.importStats(exported);
      
      const stats = newLearner.getItemStats('q1');
      expect(stats.correct_count).toBe(1);
    });
  });
});
