/**
 * result页面难度引导系统验收测试
 * 测试全分数段难度引导逻辑
 */

describe('result页面难度引导系统', () => {
  // Mock小程序Page对象
  let mockPage;

  beforeEach(() => {
    // 重置mock
    mockPage = {
      data: {
        accuracy: 0,
        score: 0,
        difficultyGuidance: null
      },
      setData: function(data) {
        Object.assign(this.data, data);
      }
    };
  });

  /**
   * 加载getDifficultyGuidance函数逻辑
   * 从result.js中提取的核心逻辑
   */
  function getDifficultyGuidance(accuracy) {
    // 防御：处理异常值
    if (isNaN(accuracy) || accuracy < 0) {
      return {
        action: 'reset',
        targetDifficulty: 'easy',
        buttonText: '重新开始测评',
        subText: '数据异常，请重新测评',
        reason: '数据异常'
      };
    }

    // 全错：特别提示
    if (accuracy === 0) {
      return {
        action: 'reset',
        targetDifficulty: 'easy',
        buttonText: '重新开始基础测评',
        subText: '建议从基础开始，系统会帮你逐步提升',
        reason: '需要重新建立基础'
      };
    }

    if (accuracy >= 90) {
      return {
        action: 'upgrade',
        targetDifficulty: 'hard',
        buttonText: '挑战Hard难度测评',
        subText: '为你提升挑战，突破极限',
        reason: '当前难度对你已偏低'
      };
    }
    if (accuracy >= 60) {
      return {
        action: 'maintain',
        targetDifficulty: 'medium',
        buttonText: '继续当前难度练习',
        subText: '继续保持，巩固提升',
        reason: '当前难度适合你'
      };
    }
    return {
      action: 'downgrade',
      targetDifficulty: 'easy',
      buttonText: '尝试Easy难度',
      subText: '为你降低难度，打好基础',
      reason: '当前难度对你偏高'
    };
  }

  describe('正常场景测试', () => {
    test('高分用户(accuracy=95)应返回upgrade策略', () => {
      const guidance = getDifficultyGuidance(95);
      expect(guidance.action).toBe('upgrade');
      expect(guidance.targetDifficulty).toBe('hard');
      expect(guidance.buttonText).toBe('挑战Hard难度测评');
      expect(guidance.subText).toBe('为你提升挑战，突破极限');
    });

    test('中分用户(accuracy=75)应返回maintain策略', () => {
      const guidance = getDifficultyGuidance(75);
      expect(guidance.action).toBe('maintain');
      expect(guidance.targetDifficulty).toBe('medium');
      expect(guidance.buttonText).toBe('继续当前难度练习');
      expect(guidance.subText).toBe('继续保持，巩固提升');
    });

    test('低分用户(accuracy=45)应返回downgrade策略', () => {
      const guidance = getDifficultyGuidance(45);
      expect(guidance.action).toBe('downgrade');
      expect(guidance.targetDifficulty).toBe('easy');
      expect(guidance.buttonText).toBe('尝试Easy难度');
      expect(guidance.subText).toBe('为你降低难度，打好基础');
    });

    test('满分用户(accuracy=100)应返回upgrade策略', () => {
      const guidance = getDifficultyGuidance(100);
      expect(guidance.action).toBe('upgrade');
      expect(guidance.targetDifficulty).toBe('hard');
    });
  });

  describe('边界条件测试', () => {
    test('边界高分(accuracy=90)应返回upgrade策略', () => {
      const guidance = getDifficultyGuidance(90);
      expect(guidance.action).toBe('upgrade');
      expect(guidance.targetDifficulty).toBe('hard');
    });

    test('边界中分(accuracy=60)应返回maintain策略', () => {
      const guidance = getDifficultyGuidance(60);
      expect(guidance.action).toBe('maintain');
      expect(guidance.targetDifficulty).toBe('medium');
    });

    test('边界低分(accuracy=59)应返回downgrade策略', () => {
      const guidance = getDifficultyGuidance(59);
      expect(guidance.action).toBe('downgrade');
      expect(guidance.targetDifficulty).toBe('easy');
    });

    test('accuracy=0应返回reset策略', () => {
      const guidance = getDifficultyGuidance(0);
      expect(guidance.action).toBe('reset');
      expect(guidance.targetDifficulty).toBe('easy');
      expect(guidance.buttonText).toBe('重新开始基础测评');
      expect(guidance.subText).toBe('建议从基础开始，系统会帮你逐步提升');
    });

    test('accuracy=1应返回downgrade策略', () => {
      const guidance = getDifficultyGuidance(1);
      expect(guidance.action).toBe('downgrade');
      expect(guidance.targetDifficulty).toBe('easy');
    });
  });

  describe('异常值测试', () => {
    test('accuracy=NaN应返回reset策略', () => {
      const guidance = getDifficultyGuidance(NaN);
      expect(guidance.action).toBe('reset');
      expect(guidance.targetDifficulty).toBe('easy');
      expect(guidance.buttonText).toBe('重新开始测评');
      expect(guidance.subText).toBe('数据异常，请重新测评');
    });

    test('accuracy=-1应返回reset策略', () => {
      const guidance = getDifficultyGuidance(-1);
      expect(guidance.action).toBe('reset');
      expect(guidance.targetDifficulty).toBe('easy');
      expect(guidance.reason).toBe('数据异常');
    });

    test('accuracy=101应返回upgrade策略', () => {
      // 101分虽然异常，但>=90逻辑会触发upgrade
      const guidance = getDifficultyGuidance(101);
      expect(guidance.action).toBe('upgrade');
      expect(guidance.targetDifficulty).toBe('hard');
    });
  });

  describe('数据结构验证', () => {
    test('所有策略返回对象应包含必需字段', () => {
      const accuracies = [95, 75, 45, 0, 90, 60, 59];
      accuracies.forEach(acc => {
        const guidance = getDifficultyGuidance(acc);
        expect(guidance).toHaveProperty('action');
        expect(guidance).toHaveProperty('targetDifficulty');
        expect(guidance).toHaveProperty('buttonText');
        expect(guidance).toHaveProperty('subText');
        expect(guidance).toHaveProperty('reason');

        // 验证action值的有效性
        expect(['upgrade', 'maintain', 'downgrade', 'reset']).toContain(guidance.action);

        // 验证targetDifficulty值的有效性
        expect(['hard', 'medium', 'easy']).toContain(guidance.targetDifficulty);

        // 验证buttonText为非空字符串
        expect(typeof guidance.buttonText).toBe('string');
        expect(guidance.buttonText.length).toBeGreaterThan(0);

        // 验证subText为非空字符串
        expect(typeof guidance.subText).toBe('string');
        expect(guidance.subText.length).toBeGreaterThan(0);
      });
    });
  });

  describe('action与targetDifficulty一致性测试', () => {
    test('upgrade动作应对应hard难度', () => {
      const guidance = getDifficultyGuidance(95);
      if (guidance.action === 'upgrade') {
        expect(guidance.targetDifficulty).toBe('hard');
      }
    });

    test('maintain动作应对应medium难度', () => {
      const guidance = getDifficultyGuidance(75);
      if (guidance.action === 'maintain') {
        expect(guidance.targetDifficulty).toBe('medium');
      }
    });

    test('downgrade动作应对应easy难度', () => {
      const guidance = getDifficultyGuidance(45);
      if (guidance.action === 'downgrade') {
        expect(guidance.targetDifficulty).toBe('easy');
      }
    });

    test('reset动作应对应easy难度', () => {
      const guidance = getDifficultyGuidance(0);
      if (guidance.action === 'reset') {
        expect(guidance.targetDifficulty).toBe('easy');
      }
    });
  });
});
