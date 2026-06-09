/**
 * Config 缓存机制测试
 *
 * 测试 loadConfig(db), getConfig(), forceRefresh, 环境变量回退
 */

function mockDb() {
  return { /* 不会被使用，因为 mock 了 llm-config-db */ };
}

function mockDbConfig(value) {
  const { getConfig } = require('../llm-config-db');
  getConfig.mockResolvedValue(value);
  return getConfig;
}

function mockDbConfigError(error) {
  const { getConfig } = require('../llm-config-db');
  getConfig.mockRejectedValue(error);
  return getConfig;
}

function mockDbConfigSequence(values) {
  const { getConfig } = require('../llm-config-db');
  values.forEach((value) => getConfig.mockResolvedValueOnce(value));
  return getConfig;
}

describe('Config Cache', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../llm-config-db', () => ({
      getConfig: jest.fn()
    }));
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    jest.dontMock('../llm-config-db');
    process.env = OLD_ENV;
  });

  describe('loadConfig', () => {
    test('应该从数据库加载配置', async () => {
      mockDbConfig({
        apiKey: 'sk-db-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        providerId: 'deepseek'
      });

      const { loadConfig } = require('../llm-core/config');
      const config = await loadConfig(mockDb());

      expect(config._source).toBe('database');
      expect(config.apiKey).toBe('sk-db-key');
      expect(config.providerId).toBe('deepseek');
    });

    test('数据库失败时应回退到环境变量', async () => {
      process.env.LLM_API_KEY = 'sk-env-key';
      process.env.LLM_BASE_URL = 'https://env.example.com';
      process.env.LLM_MODEL = 'env-model';

      mockDbConfigError(new Error('DB error'));

      const { loadConfig } = require('../llm-core/config');
      const config = await loadConfig(mockDb());

      expect(config._source).toBe('env');
      expect(config.apiKey).toBe('sk-env-key');
      expect(config.baseUrl).toBe('https://env.example.com');
      expect(config.model).toBe('env-model');
    });

    test('数据库失败且无环境变量时应使用代码默认值', async () => {
      delete process.env.LLM_API_KEY;
      delete process.env.LLM_BASE_URL;
      delete process.env.LLM_MODEL;

      mockDbConfigError(new Error('DB error'));

      const { loadConfig } = require('../llm-core/config');
      const config = await loadConfig(mockDb());

      expect(config._source).toBe('env');
      expect(config.apiKey).toBe('');
      expect(config.baseUrl).toBe('https://api.deepseek.com');
      expect(config.model).toBe('deepseek-chat');
    });

    test('首次调用应查询数据库', async () => {
      const getDbConfig = mockDbConfig({
        apiKey: 'sk-first',
        baseUrl: 'https://api.example.com',
        model: 'first-model',
        providerId: 'first'
      });

      const { loadConfig } = require('../llm-core/config');
      await loadConfig(mockDb());

      expect(getDbConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('getConfig (缓存)', () => {
    test('loadConfig 后 getConfig 应返回缓存配置', async () => {
      mockDbConfig({
        apiKey: 'sk-cached',
        baseUrl: 'https://api.cached.com',
        model: 'cached-model',
        providerId: 'cached'
      });

      const mod = require('../llm-core/config');
      await mod.loadConfig(mockDb());

      const config1 = mod.getConfig();
      const config2 = mod.getConfig();

      expect(config1.apiKey).toBe('sk-cached');
      expect(config1).toBe(config2);
    });

    test('未调用 loadConfig 时 getConfig 应使用环境变量', () => {
      process.env.LLM_API_KEY = 'sk-no-load';
      process.env.LLM_BASE_URL = 'https://no-load.example.com';

      const { getConfig } = require('../llm-core/config');
      const config = getConfig();

      expect(config.apiKey).toBe('sk-no-load');
      expect(config.baseUrl).toBe('https://no-load.example.com');
    });

    test('无任何配置时 getConfig 应抛出错误', () => {
      delete process.env.LLM_API_KEY;

      const { getConfig } = require('../llm-core/config');

      expect(() => getConfig()).toThrow('LLM_API_KEY not configured');
    });
  });

  describe('forceRefresh', () => {
    test('forceRefresh=true 应重新查询数据库', async () => {
      const getDbConfig = mockDbConfigSequence([
        {
          apiKey: 'sk-old',
          baseUrl: 'https://api.old.com',
          model: 'old-model',
          providerId: 'old'
        },
        {
          apiKey: 'sk-new',
          baseUrl: 'https://api.new.com',
          model: 'new-model',
          providerId: 'new'
        }
      ]);

      const mod = require('../llm-core/config');
      await mod.loadConfig(mockDb());

      expect(mod.getConfig().providerId).toBe('old');

      await mod.loadConfig(mockDb(), true);

      expect(mod.getConfig().providerId).toBe('new');
      expect(getDbConfig).toHaveBeenCalledTimes(2);
    });

    test('forceRefresh=false 且已有缓存不应查询数据库', async () => {
      const getDbConfig = mockDbConfig({
        apiKey: 'sk-cached',
        baseUrl: 'https://api.cached.com',
        model: 'cached-model',
        providerId: 'cached'
      });

      const mod = require('../llm-core/config');
      await mod.loadConfig(mockDb());
      await mod.loadConfig(mockDb());

      expect(getDbConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('createTimeoutController', () => {
    test('应该创建 AbortController', () => {
      const { createTimeoutController } = require('../llm-core/config');
      const controller = createTimeoutController(5000);
      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal).toBeInstanceOf(AbortSignal);
      controller.abort();
    });
  });
});
