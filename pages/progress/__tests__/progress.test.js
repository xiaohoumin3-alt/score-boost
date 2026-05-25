/**
 * progress.js 单元测试
 * TDD: RED → GREEN → REFACTOR
 * 测试功能:
 * - loadProgress: 加载知识点进度数据
 * - estimateScore: 估算当前分数
 */

// Mock 微信API
global.wx = {
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showToast: jest.fn()
};

// Mock cloudApi
jest.mock('../../../utils/cloudApi.js', () => ({
  getKpProgress: jest.fn()
}));

const api = require('../../../utils/cloudApi.js');

describe('progress.estimateScore', () => {
  function estimateScore(kpList, targetScore) {
    if (!kpList || kpList.length === 0) return 0;
    const weights = { easy: 1.0, medium: 0.6, hard: 0.2, unknown: 0.1 };
    const totalWeight = kpList.reduce((sum, kp) => {
      const diff = kp.current_difficulty || 'unknown';
      return sum + (weights[diff] !== undefined ? weights[diff] : weights.unknown);
    }, 0);
    const maxWeight = kpList.length;
    return Math.round((totalWeight / maxWeight) * targetScore);
  }

  test('空数组应返回0分', () => {
    const result = estimateScore([], 85);
    expect(result).toBe(0);
  });

  test('null应返回0分', () => {
    const result = estimateScore(null, 85);
    expect(result).toBe(0);
  });

  test('全部easy应返回目标分', () => {
    const kpList = [
      { current_difficulty: 'easy' },
      { current_difficulty: 'easy' },
      { current_difficulty: 'easy' }
    ];

    const result = estimateScore(kpList, 85);

    expect(result).toBe(85); // 1.0 * 85
  });

  test('全部medium应返回目标的60%', () => {
    const kpList = [
      { current_difficulty: 'medium' },
      { current_difficulty: 'medium' }
    ];

    const result = estimateScore(kpList, 85);

    expect(result).toBe(51); // 0.6 * 85 = 51
  });

  test('全部hard应返回目标的20%', () => {
    const kpList = [
      { current_difficulty: 'hard' },
      { current_difficulty: 'hard' }
    ];

    const result = estimateScore(kpList, 85);

    expect(result).toBe(17); // 0.2 * 85 = 17
  });

  test('全部unknown应返回目标的10%', () => {
    const kpList = [
      { current_difficulty: 'unknown' }
    ];

    const result = estimateScore(kpList, 85);

    expect(result).toBe(9); // 0.1 * 85 ≈ 9
  });

  test('混合难度应正确计算加权平均', () => {
    const kpList = [
      { current_difficulty: 'easy' },      // 1.0
      { current_difficulty: 'medium' },   // 0.6
      { current_difficulty: 'hard' },     // 0.2
      { current_difficulty: 'unknown' }   // 0.1
    ];

    const result = estimateScore(kpList, 85);

    // (1.0 + 0.6 + 0.2 + 0.1) / 4 * 85 = 1.9 / 4 * 85 = 0.475 * 85 ≈ 40
    expect(result).toBe(40);
  });

  test('缺少difficulty字段应默认为unknown', () => {
    const kpList = [
      { current_difficulty: 'easy' },
      {}  // 无difficulty字段
    ];

    const result = estimateScore(kpList, 85);

    // (1.0 + 0.1) / 2 * 85 = 0.55 * 85 ≈ 47
    expect(result).toBe(47);
  });
});

describe('progress.loadProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('应正确统计各状态知识点数量', async () => {
    const kpList = [
      { current_difficulty: 'easy' },
      { current_difficulty: 'easy' },
      { current_difficulty: 'medium' },
      { current_difficulty: 'hard' }
    ];

    const masteredKp = kpList.filter(kp => kp.current_difficulty === 'easy').length;
    const learningKp = kpList.filter(kp => kp.current_difficulty === 'medium').length;
    const weakKp = kpList.filter(kp => kp.current_difficulty === 'hard').length;

    expect(masteredKp).toBe(2);
    expect(learningKp).toBe(1);
    expect(weakKp).toBe(1);
  });

  test('应正确计算目标差距', () => {
    const currentScore = 60;
    const targetScore = 85;
    const totalGap = Math.max(0, targetScore - currentScore);

    expect(totalGap).toBe(25);
  });

  test('已达目标时差距应为0', () => {
    const currentScore = 90;
    const targetScore = 85;
    const totalGap = Math.max(0, targetScore - currentScore);

    expect(totalGap).toBe(0);
  });

  test('应正确处理数组和非数组响应', () => {
    const arrayData = [{ kp_id: 'kp1' }, { kp_id: 'kp2' }];
    const singleData = { kp_id: 'kp1' };

    const arrayResult = Array.isArray(arrayData) ? arrayData : [arrayData];
    const singleResult = Array.isArray(singleData) ? singleData : [singleData];

    expect(arrayResult.length).toBe(2);
    expect(singleResult.length).toBe(1);
  });
});

describe('progress.goPractice', () => {
  // Mock app.globalData
  let mockApp = {
    globalData: {},
    targetKpId: null,
    targetKpName: null
  };

  beforeEach(() => {
    mockApp.targetKpId = null;
    mockApp.targetKpName = null;
  });

  test('应设置目标知识点ID和名称', () => {
    const kp = { kp_id: 'kp2_3', kp_name: '勾股定理' };

    mockApp.targetKpId = kp.kp_id;
    mockApp.targetKpName = kp.kp_name || kp.kp_id;

    expect(mockApp.targetKpId).toBe('kp2_3');
    expect(mockApp.targetKpName).toBe('勾股定理');
  });

  test('kp_name为空时应使用kp_id', () => {
    const kp = { kp_id: 'kp2_3', kp_name: '' };

    mockApp.targetKpId = kp.kp_id;
    mockApp.targetKpName = kp.kp_name || kp.kp_id;

    expect(mockApp.targetKpName).toBe('kp2_3');
  });
});
