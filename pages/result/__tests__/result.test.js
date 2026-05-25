/**
 * result.js 单元测试
 * TDD: RED → GREEN → REFACTOR
 * 测试功能:
 * - checkAndUnlockPerfectAchievement: 满分成就触发逻辑
 */

// Mock 微信API
global.wx = {
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  showModal: jest.fn()
};

describe('result.checkAndUnlockPerfectAchievement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function checkAndUnlockPerfectAchievement(correctCount, totalCount, existingAchievements = {}, perfectShown = false) {
    const isPerfect = correctCount === totalCount && totalCount >= 5;

    if (isPerfect) {
      const achievements = { ...existingAchievements };
      const achievementId = 'perfect_practice';

      if (!achievements[achievementId] && !perfectShown) {
        achievements[achievementId] = {
          unlockedAt: new Date().toISOString(),
          count: 1
        };
        wx.setStorageSync('achievements', achievements);

        setTimeout(() => {
          wx.showModal({
            title: '🎉 满分表现！',
            content: '太棒了！继续保持！\n⭐ 满分成就已解锁',
            showCancel: false,
            confirmText: '继续'
          });
        }, 1000);

        return { unlocked: true, shown: true };
      }
    }

    return { unlocked: false, shown: false };
  }

  test('满分且至少5题时应解锁成就', () => {
    wx.getStorageSync.mockReturnValue({});
    const result = checkAndUnlockPerfectAchievement(5, 5);

    expect(result.unlocked).toBe(true);
    expect(wx.setStorageSync).toHaveBeenCalledWith(
      'achievements',
      expect.objectContaining({
        perfect_practice: expect.objectContaining({
          unlockedAt: expect.any(String),
          count: 1
        })
      })
    );
  });

  test('满分且超过5题时应解锁成就', () => {
    wx.getStorageSync.mockReturnValue({});
    const result = checkAndUnlockPerfectAchievement(10, 10);

    expect(result.unlocked).toBe(true);
  });

  test('满分但少于5题时不应解锁成就', () => {
    wx.getStorageSync.mockReturnValue({});
    const result = checkAndUnlockPerfectAchievement(3, 3);

    expect(result.unlocked).toBe(false);
    expect(wx.setStorageSync).not.toHaveBeenCalled();
  });

  test('未满分时不应该解锁成就', () => {
    wx.getStorageSync.mockReturnValue({});
    const result = checkAndUnlockPerfectAchievement(4, 5);

    expect(result.unlocked).toBe(false);
    expect(wx.setStorageSync).not.toHaveBeenCalled();
  });

  test('已解锁成就时不应重复解锁', () => {
    const existingAchievements = {
      perfect_practice: {
        unlockedAt: '2026-05-20T10:00:00Z',
        count: 1
      }
    };
    wx.getStorageSync.mockReturnValue(existingAchievements);

    const result = checkAndUnlockPerfectAchievement(5, 5, existingAchievements);

    expect(result.unlocked).toBe(false);
    expect(wx.setStorageSync).not.toHaveBeenCalled();
  });

  test('session级别perfectShown为true时不应重复弹窗', () => {
    wx.getStorageSync.mockReturnValue({});
    const result = checkAndUnlockPerfectAchievement(5, 5, {}, true);

    expect(result.unlocked).toBe(false);
    expect(result.shown).toBe(false);
    expect(wx.setStorageSync).not.toHaveBeenCalled();
  });

  test('解锁后应延迟显示弹窗', () => {
    wx.getStorageSync.mockReturnValue({});
    checkAndUnlockPerfectAchievement(5, 5);

    // 1000ms前不应调用showModal
    expect(wx.showModal).not.toHaveBeenCalled();

    // 快进1000ms
    jest.advanceTimersByTime(1000);

    // 现在应该调用showModal
    expect(wx.showModal).toHaveBeenCalledWith({
      title: '🎉 满分表现！',
      content: '太棒了！继续保持！\n⭐ 满分成就已解锁',
      showCancel: false,
      confirmText: '继续'
    });
  });

  test('弹窗内容应包含正确信息', () => {
    wx.getStorageSync.mockReturnValue({});
    checkAndUnlockPerfectAchievement(5, 5);

    jest.advanceTimersByTime(1000);

    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('满分'),
        content: expect.stringContaining('满分成就')
      })
    );
  });

  test('应保存解锁时间戳', () => {
    wx.getStorageSync.mockReturnValue({});
    const beforeTime = new Date().toISOString();

    checkAndUnlockPerfectAchievement(5, 5);

    const callArgs = wx.setStorageSync.mock.calls[0];
    const achievements = callArgs[1];
    const unlockedAt = achievements.perfect_practice.unlockedAt;

    expect(unlockedAt).toBeTruthy();
    expect(new Date(unlockedAt).toISOString()).toBe(beforeTime);
  });
});

describe('result.onLoad参数解析', () => {
  function parseOnLoadParams(query) {
    const mode = query.mode || 'assessment';

    if (mode === 'practice') {
      const correct = parseInt(query.correct) || 0;
      const total = parseInt(query.total) || 0;
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
      const isPerfect = correct === total && total > 0;

      return { mode, score: correct, total, accuracy, isPerfect };
    } else {
      const score = parseInt(query.score) || 0;
      const total = parseInt(query.total) || 5;
      const isPerfect = score === total;

      return { mode, score, total, isPerfect };
    }
  }

  test('应正确解析practice模式参数', () => {
    const query = { mode: 'practice', correct: '8', total: '10' };
    const result = parseOnLoadParams(query);

    expect(result.mode).toBe('practice');
    expect(result.score).toBe(8);
    expect(result.total).toBe(10);
    expect(result.accuracy).toBe(80);
    expect(result.isPerfect).toBe(false);
  });

  test('应正确解析assessment模式参数', () => {
    const query = { mode: 'assessment', score: '5', total: '5' };
    const result = parseOnLoadParams(query);

    expect(result.mode).toBe('assessment');
    expect(result.score).toBe(5);
    expect(result.total).toBe(5);
    expect(result.isPerfect).toBe(true);
  });

  test('默认模式应为assessment', () => {
    const query = { score: '3', total: '5' };
    const result = parseOnLoadParams(query);

    expect(result.mode).toBe('assessment');
  });

  test('缺少参数时应使用默认值', () => {
    const query = {};
    const result = parseOnLoadParams(query);

    expect(result.score).toBe(0);
    expect(result.total).toBe(5); // assessment默认total
  });

  test('practice模式total为0时accuracy应为0', () => {
    const query = { mode: 'practice', correct: '0', total: '0' };
    const result = parseOnLoadParams(query);

    expect(result.accuracy).toBe(0);
    expect(result.isPerfect).toBe(false);
  });
});

describe('result.loadNextReviewTime (M6)', () => {
  const MOCK_NOW = new Date('2026-05-25T12:00:00Z').getTime();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(MOCK_NOW);
    const OriginalDate = global.Date;
    global.Date = function(...args) {
      if (args.length === 0) return new OriginalDate(MOCK_NOW);
      return new OriginalDate(...args);
    };
    global.Date.prototype = OriginalDate.prototype;
    global.Date.now = jest.fn(() => MOCK_NOW);
    global.Date.parse = OriginalDate.parse;
    global.Date.UTC = OriginalDate.UTC;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function calculateNextReviewText(kpList) {
    const now = Date.now();
    const upcomingReviews = kpList
      .filter(kp => kp.next_review_at)
      .map(kp => ({ kp, time: new Date(kp.next_review_at).getTime() }))
      .filter(item => item.time > now)
      .sort((a, b) => a.time - b.time);

    if (upcomingReviews.length === 0) {
      return { showReviewTip: false, nextReviewText: '' };
    }

    const nextTime = upcomingReviews[0].time;
    const diffMs = nextTime - now;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let reviewText = '';
    if (diffDays > 0) {
      reviewText = `${diffDays}天后复习`;
    } else if (diffHours > 0) {
      reviewText = `${diffHours}小时后复习`;
    } else {
      reviewText = '即将复习';
    }

    return { showReviewTip: true, nextReviewText: reviewText };
  }

  test('应显示3天后复习', () => {
    const kpList = [
      { kp_id: 'kp1', next_review_at: '2026-05-28T12:00:00Z' }
    ];

    const result = calculateNextReviewText(kpList);

    expect(result.showReviewTip).toBe(true);
    expect(result.nextReviewText).toBe('3天后复习');
  });

  test('应显示5小时后复习', () => {
    const kpList = [
      { kp_id: 'kp1', next_review_at: '2026-05-25T17:00:00Z' }
    ];

    const result = calculateNextReviewText(kpList);

    expect(result.showReviewTip).toBe(true);
    expect(result.nextReviewText).toBe('5小时后复习');
  });

  test('应选择最近的复习时间', () => {
    const kpList = [
      { kp_id: 'kp1', next_review_at: '2026-05-28T12:00:00Z' },
      { kp_id: 'kp2', next_review_at: '2026-05-26T12:00:00Z' }
    ];

    const result = calculateNextReviewText(kpList);

    expect(result.nextReviewText).toBe('1天后复习');
  });

  test('无未来复习时间时应不显示提示', () => {
    const kpList = [
      { kp_id: 'kp1', next_review_at: '2026-05-20T12:00:00Z' }
    ];

    const result = calculateNextReviewText(kpList);

    expect(result.showReviewTip).toBe(false);
  });

  test('空列表时应不显示提示', () => {
    const result = calculateNextReviewText([]);

    expect(result.showReviewTip).toBe(false);
  });
});
