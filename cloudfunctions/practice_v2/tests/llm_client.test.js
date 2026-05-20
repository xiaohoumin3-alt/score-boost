/**
 * LlmClient 单元测试
 * TDD: RED → GREEN → REFACTOR
 * 注意：此测试不执行实际 API 调用，使用 mock
 */

const { LlmClient } = require('../llm_client');

describe('LlmClient', () => {
  let client;

  beforeEach(() => {
    client = new LlmClient('test-api-key');
  });

  describe('初始化', () => {
    test('应创建 LlmClient 实例', () => {
      expect(client).toBeInstanceOf(LlmClient);
      expect(client.apiKey).toBe('test-api-key');
    });

    test('应使用环境变量作为默认 apiKey', () => {
      const originalKey = process.env.MINIMAX_API_KEY;
      process.env.MINIMAX_API_KEY = 'env-key';
      const envClient = new LlmClient();
      expect(envClient.apiKey).toBe('env-key');
      process.env.MINIMAX_API_KEY = originalKey;
    });
  });

  describe('_detectScenario', () => {
    test('应检测梯子场景并返回 id', () => {
      expect(client._detectScenario('梯子长5米，靠在墙上')).toBe('ladder');
      expect(client._detectScenario('梯子斜靠')).toBe('ladder');
    });

    test('应检测航海场景并返回 id', () => {
      expect(client._detectScenario('船向东航行5海里')).toBe('sailing');
      expect(client._detectScenario('航行方向')).toBe('sailing');
    });

    test('应检测屏幕场景并返回 id', () => {
      expect(client._detectScenario('屏幕对角线10英寸')).toBe('screen');
      expect(client._detectScenario('电视尺寸')).toBe('screen');
    });

    test('应检测建筑场景并返回 id', () => {
      expect(client._detectScenario('旗杆高12米，拉索')).toBe('construction');
      expect(client._detectScenario('电线杆')).toBe('construction');
    });

    test('应检测影子场景并返回 id', () => {
      expect(client._detectScenario('树影长度5米')).toBe('shadow');
      expect(client._detectScenario('建筑物影子')).toBe('shadow');
    });

    test('无法识别的场景应返回 other', () => {
      expect(client._detectScenario('这是一道普通的数学题')).toBe('other');
      expect(client._detectScenario('计算圆的面积')).toBe('other');
    });
  });

  describe('_detectTriple', () => {
    test('应检测完整勾股数', () => {
      expect(client._detectTriple('一个3-4-5的三角形')).toEqual([3, 4, 5]);
      expect(client._detectTriple('边长是5、12、13')).toEqual([5, 12, 13]);
    });

    test('应检测部分匹配的勾股数', () => {
      expect(client._detectTriple('梯子长5米，底端离墙3米')).toEqual([3, 4, 5]);
      expect(client._detectTriple('船行5和12海里')).toEqual([5, 12, 13]);
    });

    test('应检测12-16匹配到12-16-20', () => {
      expect(client._detectTriple('边长12和16')).toEqual([12, 16, 20]);
    });

    test('无匹配应返回 null', () => {
      expect(client._detectTriple('边长7和9')).toBeNull();
      expect(client._detectTriple('这是一道题')).toBeNull();
    });
  });

  describe('_detectPattern', () => {
    test('应检测求值问法', () => {
      expect(client._detectPattern('求长度')).toBe('求值');
      expect(client._detectPattern('是多少')).toBe('求值');
    });

    test('应检测计算问法', () => {
      expect(client._detectPattern('计算结果')).toBe('计算');
      expect(client._detectPattern('算出')).toBe('计算');
    });

    test('应检测判断问法', () => {
      expect(client._detectPattern('判断对错')).toBe('判断');
      expect(client._detectPattern('是否直角')).toBe('判断');
    });

    test('应检测选择问法', () => {
      expect(client._detectPattern('哪个正确')).toBe('选择');
      expect(client._detectPattern('哪项说法')).toBe('选择');
    });

    test('未知问法应返回其他', () => {
      expect(client._detectPattern('描述这个图形')).toBe('其他');
    });
  });

  describe('状态管理', () => {
    test('getState 应返回初始状态', () => {
      const state = client.getState();
      expect(state).toHaveProperty('usedScenarios');
      expect(state).toHaveProperty('usedTriples');
      expect(state).toHaveProperty('usedPatterns');
      expect(state.usedScenarios).toEqual([]);
      expect(state.usedTriples).toEqual([]);
      expect(state.usedPatterns).toEqual([]);
    });

    test('resetState 应清空状态', () => {
      client.state.recordQuestion({
        scenario_used: 'test',
        triple_used: [3, 4, 5],
        question_pattern: 'test'
      });
      client.resetState();
      const state = client.getState();
      expect(state.usedScenarios).toEqual([]);
      expect(state.usedTriples).toEqual([]);
      expect(state.usedPatterns).toEqual([]);
    });
  });
});
