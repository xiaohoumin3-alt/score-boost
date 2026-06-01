/**
 * 配额系统测试
 * TDD: 测试优先编写
 */

const { checkQuota, getQuotaUsage, QUOTA_LIMITS } = require('../quota');

// Mock 数据库
const mockDb = {
  collection: jest.fn(() => mockDb),
  where: jest.fn(() => mockDb),
  field: jest.fn(() => mockDb),
  count: jest.fn(() => mockDb),
  orderBy: jest.fn(() => mockDb),
  limit: jest.fn(() => mockDb),
  get: jest.fn(),
  add: jest.fn(),
  command: {
    gte: jest.fn(() => 'mock-gte')
  }
};

// Mock 云环境
jest.mock('wx-server-sdk', () => ({
  DYNAMIC_CURRENT_ENV: 'mock-env',
}));

describe('配额系统 - 基础配置', () => {
  test('QUOTA_LIMITS 配置正确', () => {
    expect(QUOTA_LIMITS).toBeDefined();
    expect(QUOTA_LIMITS.personal.normal).toBe(5);
    expect(QUOTA_LIMITS.personal.vip).toBe(20);
    expect(QUOTA_LIMITS.textbook.normal).toBe(2);
    expect(QUOTA_LIMITS.textbook.vip).toBe(10);
  });
});

describe('配额系统 - 普通用户', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('普通用户个人资料配额 - 未超限', async () => {
    // Mock: 当月已上传3个，配额5个
    mockDb.count.mockResolvedValue({ total: 3 });

    const result = await checkQuota(
      'normal-user-openid',
      'personal',
      mockDb,
      { vip_status: 'free' }
    );

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.usage).toBe(3);
  });

  test('普通用户个人资料配额 - 已超限', async () => {
    // Mock: 当月已上传5个，配额5个
    mockDb.count.mockResolvedValue({ total: 5 });

    const result = await checkQuota(
      'normal-user-openid',
      'personal',
      mockDb,
      { vip_status: 'free' }
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('配额');
    expect(result.reason).toContain('5');
  });

  test('普通用户教材资料配额 - 未超限', async () => {
    mockDb.count.mockResolvedValue({ total: 1 });

    const result = await checkQuota(
      'normal-user-openid',
      'textbook',
      mockDb,
      { vip_status: 'free' }
    );

    expect(result.allowed).toBe(true);
  });

  test('普通用户教材资料配额 - 已超限', async () => {
    mockDb.count.mockResolvedValue({ total: 2 });

    const result = await checkQuota(
      'normal-user-openid',
      'textbook',
      mockDb,
      { vip_status: 'free' }
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('2');
  });
});

describe('配额系统 - VIP用户', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('VIP用户个人资料配额 - 20个', async () => {
    mockDb.count.mockResolvedValue({ total: 5 });

    const result = await checkQuota(
      'vip-user-openid',
      'personal',
      mockDb,
      { vip_status: 'vip', vip_expire_at: new Date(Date.now() + 86400000).toISOString() }
    );

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(20);
  });

  test('VIP用户教材资料配额 - 10个', async () => {
    mockDb.count.mockResolvedValue({ total: 3 });

    const result = await checkQuota(
      'vip-user-openid',
      'textbook',
      mockDb,
      { vip_status: 'vip', vip_expire_at: new Date(Date.now() + 86400000).toISOString() }
    );

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
  });

  test('VIP过期用户 - 按普通用户配额', async () => {
    mockDb.count.mockResolvedValue({ total: 5 });

    const result = await checkQuota(
      'expired-vip-openid',
      'personal',
      mockDb,
      { vip_status: 'vip', vip_expire_at: new Date(Date.now() - 86400000).toISOString() }
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('5'); // 普通用户配额
    expect(result.limit).toBe(5);
  });
});

describe('配额系统 - 友好错误提示', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('超配额时包含升级提示', async () => {
    mockDb.count.mockResolvedValue({ total: 5 });

    const result = await checkQuota(
      'normal-user-openid',
      'personal',
      mockDb,
      { vip_status: 'free' }
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/VIP|升级/);
  });

  test('错误信息包含当前配额和已用量', async () => {
    mockDb.count.mockResolvedValue({ total: 2 });

    const result = await checkQuota(
      'normal-user-openid',
      'textbook',
      mockDb,
      { vip_status: 'free' }
    );

    expect(result.reason).toMatch(/2.*2/); // 已用2/配额2
  });
});

describe('配额系统 - 配额计数函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getQuotaUsage 返回当月使用量', async () => {
    mockDb.count.mockResolvedValue({ total: 3 });

    const usage = await getQuotaUsage('user-openid', 'personal', mockDb);

    expect(usage).toBe(3);
  });

  test('getQuotaUsage 查询失败时返回0', async () => {
    mockDb.count.mockRejectedValue(new Error('DB error'));

    const usage = await getQuotaUsage('user-openid', 'personal', mockDb);

    expect(usage).toBe(0);
  });
});
