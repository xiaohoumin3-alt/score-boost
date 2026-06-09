/**
 * LLM 数据库配置模块测试
 */

// Mock db 对象工厂
function createMockDb(activeConfig = null) {
  return {
    collection: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            data: activeConfig ? [activeConfig] : []
          })
        })
      })
    })
  };
}

describe('LLM Config DB', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('getConfig', () => {
    test('应该返回激活的 Provider 配置', async () => {
      const mockDb = createMockDb({
        _id: 'deepseek',
        api_key: 'sk-test-key',
        base_url: 'https://api.deepseek.com',
        model: 'deepseek-chat'
      });

      const { getConfig } = require('../llm-config-db');
      const config = await getConfig(mockDb);

      expect(config.providerId).toBe('deepseek');
      expect(config.apiKey).toBe('sk-test-key');
      expect(config.baseUrl).toBe('https://api.deepseek.com');
      expect(config.model).toBe('deepseek-chat');
    });

    test('应该查询 is_active: true 的记录', async () => {
      const mockDb = createMockDb({
        _id: 'deepseek',
        api_key: 'sk-test',
        base_url: 'https://api.deepseek.com',
        model: 'deepseek-chat'
      });

      const { getConfig } = require('../llm-config-db');
      await getConfig(mockDb);

      expect(mockDb.collection).toHaveBeenCalledWith('llm_config');
      // 验证 where 条件
      const collectionMock = mockDb.collection.mock.results[0].value;
      expect(collectionMock.where).toHaveBeenCalledWith({ is_active: true });
    });

    test('当没有激活的 Provider 时应抛出错误', async () => {
      const mockDb = createMockDb(null);

      const { getConfig } = require('../llm-config-db');

      await expect(getConfig(mockDb)).rejects.toThrow('No active provider found');
    });

    test('当配置缺少必需字段时应抛出错误', async () => {
      const mockDb = createMockDb({
        _id: 'broken',
        api_key: '',  // 空 API key
        base_url: 'https://api.deepseek.com',
        model: 'deepseek-chat'
      });

      const { getConfig } = require('../llm-config-db');

      await expect(getConfig(mockDb)).rejects.toThrow('missing required fields');
    });

    test('当缺少 base_url 时应抛出错误', async () => {
      const mockDb = createMockDb({
        _id: 'broken',
        api_key: 'sk-test',
        // 缺少 base_url
        model: 'deepseek-chat'
      });

      const { getConfig } = require('../llm-config-db');

      await expect(getConfig(mockDb)).rejects.toThrow('missing required fields');
    });

    test('当缺少 model 时应抛出错误', async () => {
      const mockDb = createMockDb({
        _id: 'broken',
        api_key: 'sk-test',
        base_url: 'https://api.deepseek.com'
        // 缺少 model
      });

      const { getConfig } = require('../llm-config-db');

      await expect(getConfig(mockDb)).rejects.toThrow('missing required fields');
    });

    test('数据库查询失败时应抛出错误', async () => {
      const mockDb = {
        collection: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockRejectedValue(new Error('Network error'))
            })
          })
        })
      };

      const { getConfig } = require('../llm-config-db');

      await expect(getConfig(mockDb)).rejects.toThrow('Network error');
    });
  });
});
