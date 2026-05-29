/**
 * index.js 模块测试
 * 测试工厂函数和模块导出
 */

const {
  createLLMClient,
  MiniMaxClient,
  LLMError,
  LLMConfigError,
  LLMAPIError,
  LLMParseError,
  mapError,
  RETRYABLE_STATUS,
  RETRYABLE_CODES,
  retryWithBackoff,
  retryWithBackoffCustom,
  calculateDelay,
  sleep,
  getConfig,
  createTimeoutController
} = require('../index')

describe('index.js 模块导出', () => {
  test('应该导出所有异常类', () => {
    expect(LLMError).toBeDefined()
    expect(LLMConfigError).toBeDefined()
    expect(LLMAPIError).toBeDefined()
    expect(LLMParseError).toBeDefined()
  })

  test('应该导出错误映射工具', () => {
    expect(mapError).toBeDefined()
    expect(RETRYABLE_STATUS).toBeDefined()
    expect(RETRYABLE_CODES).toBeDefined()
  })

  test('应该导出重试工具', () => {
    expect(retryWithBackoff).toBeDefined()
    expect(retryWithBackoffCustom).toBeDefined()
    expect(calculateDelay).toBeDefined()
    expect(sleep).toBeDefined()
  })

  test('应该导出配置工具', () => {
    expect(getConfig).toBeDefined()
    expect(createTimeoutController).toBeDefined()
  })

  test('应该导出 MiniMaxClient', () => {
    expect(MiniMaxClient).toBeDefined()
  })

  test('应该导出 createLLMClient 工厂函数', () => {
    expect(createLLMClient).toBeDefined()
    expect(typeof createLLMClient).toBe('function')
  })
})

describe('createLLMClient', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('应该创建 MiniMax 客户端实例', () => {
    process.env.LLM_API_KEY = 'test-key'

    const client = createLLMClient({
      apiKey: 'custom-key',
      baseUrl: 'https://test.com',
      model: 'test-model'
    })

    expect(client).toBeInstanceOf(MiniMaxClient)
    expect(client.apiKey).toBe('custom-key')
    expect(client.baseUrl).toBe('https://test.com')
    expect(client.model).toBe('test-model')
  })

  test('应该使用默认配置当未提供完整参数', () => {
    process.env.LLM_API_KEY = 'test-key'

    const client = createLLMClient({
      apiKey: 'custom-key'
    })

    expect(client).toBeInstanceOf(MiniMaxClient)
    expect(client.apiKey).toBe('custom-key')
    expect(client.baseUrl).toBe('https://token-plan-cn.xiaomimimo.com/v1')
    expect(client.model).toBe('mimo-v2-flash')
  })

  test('应该拒绝不支持的 provider', () => {
    process.env.LLM_API_KEY = 'test-key'

    expect(() => createLLMClient({ provider: 'openai' }))
      .toThrow('不支持的 Provider: openai，目前仅支持 minimax')
  })

  test('应该支持自定义 logger', () => {
    const mockLogger = {
      warn: jest.fn(),
      debug: jest.fn()
    }

    const client = createLLMClient({
      provider: 'minimax',
      apiKey: 'test-key',
      baseUrl: 'https://test.com',
      model: 'test-model',
      maxRetries: 3,
      timeout: 30000,
      retryDelay: 1000,
      maxDelay: 60000,
      logger: mockLogger
    })

    expect(client.logger).toBe(mockLogger)
  })

  test('当提供完整参数时不应因环境变量未设置而失败', () => {
    // 这个测试验证当所有必需参数都提供时，
    // createLLMClient 不会因为环境变量未设置而失败
    // 注意：需要包含 provider 以避免触发 getConfig
    const client = createLLMClient({
      provider: 'minimax',
      apiKey: 'test-key',
      baseUrl: 'https://test.com',
      model: 'test-model',
      maxRetries: 3,
      timeout: 30000,
      retryDelay: 1000,
      maxDelay: 60000
    })

    expect(client).toBeInstanceOf(MiniMaxClient)
    expect(client.apiKey).toBe('test-key')
  })

  test('应该正确传递 maxRetries 配置', () => {
    process.env.LLM_API_KEY = 'test-key'

    const client = createLLMClient({
      apiKey: 'custom-key',
      maxRetries: 5
    })

    expect(client.maxRetries).toBe(5)
  })

  test('应该正确传递 timeout 配置', () => {
    process.env.LLM_API_KEY = 'test-key'

    const client = createLLMClient({
      apiKey: 'custom-key',
      timeout: 45000
    })

    expect(client.timeout).toBe(45000)
  })
})
