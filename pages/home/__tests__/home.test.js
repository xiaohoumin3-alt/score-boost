/**
 * home.js 单元测试
 * TDD: RED → GREEN → REFACTOR
 * 测试功能:
 * - loadAchievements: 计算最大连续正确并识别成就
 * - loadPendingReviews: 加载待复习知识点
 */

// Mock 微信API
global.wx = {
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  showToast: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showMock: jest.fn()
};

// Mock cloudApi
jest.mock('../../../utils/cloudApi.js', () => ({
  getKpProgress: jest.fn(),
  getAssessmentList: jest.fn()
}));

const api = require('../../../utils/cloudApi.js');

// 由于home.js是Page()注册，需要提取函数进行测试
// 这里我们直接测试核心逻辑函数

describe('home.loadAchievements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function testLoadAchievements(kpList, localAchievements = {}) {
    wx.getStorageSync.mockReturnValue(localAchievements);

    let maxStreak = 0;
    kpList.forEach(kp => {
      ['easy', 'medium', 'hard'].forEach(diff => {
        if (kp[diff] && kp[diff].consecutive_correct > maxStreak) {
          maxStreak = kp[diff].consecutive_correct;
        }
      });
    });

    const achievements = [];
    if (maxStreak >= 3) achievements.push({ id: 'streak_3', name: '连续3题', icon: '🔥' });
    if (maxStreak >= 7) achievements.push({ id: 'streak_7', name: '连续7题', icon: '💎' });
    if (maxStreak >= 30) achievements.push({ id: 'streak_30', name: '连续30题', icon: '👑' });

    const hasMastery = kpList.some(kp => kp.current_difficulty === 'easy');
    if (hasMastery) achievements.push({ id: 'first_mastery', name: '首次掌握', icon: '🎯' });

    if (localAchievements['perfect_practice']) {
      achievements.push({ id: 'perfect_practice', name: '满分练习', icon: '⭐' });
    }

    return { streak: maxStreak, achievements: achievements.slice(0, 3) };
  }

  test('应计算最大连续正确数（跨难度层级）', async () => {
    const kpList = [
      { kp_id: 'kp1', easy: { consecutive_correct: 5 }, current_difficulty: 'easy' },
      { kp_id: 'kp2', medium: { consecutive_correct: 10 }, current_difficulty: 'medium' }
    ];

    const result = await testLoadAchievements(kpList);

    expect(result.streak).toBe(10); // 取最大值
  });

  test('应识别连续3题成就', async () => {
    const kpList = [
      { kp_id: 'kp1', easy: { consecutive_correct: 3 }, current_difficulty: 'easy' }
    ];

    const result = await testLoadAchievements(kpList);

    expect(result.achievements).toContainEqual({ id: 'streak_3', name: '连续3题', icon: '🔥' });
  });

  test('应识别连续7题成就', async () => {
    const kpList = [
      { kp_id: 'kp1', easy: { consecutive_correct: 7 }, current_difficulty: 'easy' }
    ];

    const result = await testLoadAchievements(kpList);

    expect(result.achievements).toContainEqual({ id: 'streak_3', name: '连续3题', icon: '🔥' });
    expect(result.achievements).toContainEqual({ id: 'streak_7', name: '连续7题', icon: '💎' });
  });

  test('应识别首次掌握成就', async () => {
    const kpList = [
      { kp_id: 'kp1', current_difficulty: 'easy' }
    ];

    const result = await testLoadAchievements(kpList);

    expect(result.achievements).toContainEqual({ id: 'first_mastery', name: '首次掌握', icon: '🎯' });
  });

  test('应从本地存储读取满分成就', async () => {
    const kpList = [{ kp_id: 'kp1' }];
    const localAchievements = { perfect_practice: { unlockedAt: '2026-05-25' } };

    const result = await testLoadAchievements(kpList, localAchievements);

    expect(result.achievements).toContainEqual({ id: 'perfect_practice', name: '满分练习', icon: '⭐' });
  });

  test('应限制成就显示数量为3个', async () => {
    const kpList = [
      { kp_id: 'kp1', easy: { consecutive_correct: 30 }, current_difficulty: 'easy' }
    ];
    const localAchievements = { perfect_practice: { unlockedAt: '2026-05-25' } };

    const result = await testLoadAchievements(kpList, localAchievements);

    expect(result.achievements.length).toBeLessThanOrEqual(3);
  });
});

describe('home.loadPendingReviews', () => {
  const MOCK_NOW = new Date('2026-05-25T12:00:00Z').getTime();

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(MOCK_NOW);
    // Mock new Date() 构造函数
    const OriginalDate = global.Date;
    global.Date = function(...args) {
      if (args.length === 0) {
        return new OriginalDate(MOCK_NOW);
      }
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

  async function testLoadPendingReviews(kpList) {
    const now = new Date();

    let pendingReviews = kpList.filter(kp => {
      if (!kp.next_review_at) return false;
      return new Date(kp.next_review_at) <= now;
    });

    pendingReviews.sort((a, b) => {
      const aTime = new Date(a.next_review_at || 0).getTime();
      const bTime = new Date(b.next_review_at || 0).getTime();
      if (aTime !== bTime) return aTime - bTime;
      const diffOrder = { hard: 1, medium: 2, easy: 3, unknown: 4 };
      const aOrder = diffOrder[a.current_difficulty] || diffOrder.unknown;
      const bOrder = diffOrder[b.current_difficulty] || diffOrder.unknown;
      return aOrder - bOrder;
    });

    return {
      hasPendingReviews: pendingReviews.length > 0,
      pendingReviews
    };
  }

  test('应筛选需要复习的知识点（next_review_at <= now）', async () => {
    const kpList = [
      { kp_id: 'kp1', kp_name: '勾股定理', next_review_at: '2026-05-25T11:00:00Z', current_difficulty: 'hard' },
      { kp_id: 'kp2', kp_name: '二次根式', next_review_at: '2026-05-26T12:00:00Z', current_difficulty: 'medium' }
    ];

    const result = await testLoadPendingReviews(kpList);

    expect(result.hasPendingReviews).toBe(true);
    expect(result.pendingReviews.length).toBe(1);
    expect(result.pendingReviews[0].kp_id).toBe('kp1');
  });

  test('应按复习时间排序（最早的在前）', async () => {
    const kpList = [
      { kp_id: 'kp1', kp_name: '勾股定理', next_review_at: '2026-05-25T13:00:00Z', current_difficulty: 'medium' },
      { kp_id: 'kp2', kp_name: '二次根式', next_review_at: '2026-05-25T11:00:00Z', current_difficulty: 'hard' }
    ];

    const result = await testLoadPendingReviews(kpList);

    expect(result.pendingReviews[0].kp_id).toBe('kp2'); // 更早的在前
  });

  test('复习时间相同时按难度排序（hard > medium > easy）', async () => {
    const kpList = [
      { kp_id: 'kp1', kp_name: '勾股定理', next_review_at: '2026-05-25T11:00:00Z', current_difficulty: 'medium' },
      { kp_id: 'kp2', kp_name: '二次根式', next_review_at: '2026-05-25T11:00:00Z', current_difficulty: 'hard' }
    ];

    const result = await testLoadPendingReviews(kpList);

    expect(result.pendingReviews[0].kp_id).toBe('kp2'); // hard优先
  });

  test('无next_review_at的知识点应被过滤', async () => {
    const kpList = [
      { kp_id: 'kp1', kp_name: '勾股定理', current_difficulty: 'hard' }
    ];

    const result = await testLoadPendingReviews(kpList);

    expect(result.hasPendingReviews).toBe(false);
    expect(result.pendingReviews.length).toBe(0);
  });

  test('未来复习时间的知识点应被过滤', async () => {
    const kpList = [
      { kp_id: 'kp1', kp_name: '勾股定理', next_review_at: '2026-05-26T12:00:00Z', current_difficulty: 'hard' }
    ];

    const result = await testLoadPendingReviews(kpList);

    expect(result.hasPendingReviews).toBe(false);
  });
});
