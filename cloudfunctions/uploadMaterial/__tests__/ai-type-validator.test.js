/**
 * ai-type-validator 真实测试
 *
 * 不使用 jest.mock。调用真实 LLM（通过 .env.local 中的 key）。
 * 空文本路径不触发 LLM 调用。
 * LLM 成功路径在正常测试中运行（验证真实可用性）。
 *
 * 如果 LLM_API_KEY 未配置，LLM 相关测试通过降级断言。
 */

const { validateTypeMatch, VERIFY_ENABLED } = require('../ai-type-validator');

describe('ai-type-validator', () => {

  describe('validateTypeMatch — 空文本跳过验证（不调用 LLM）', () => {
    test('空字符串应跳过验证并返回 match=true', async () => {
      const result = await validateTypeMatch('', 'biology', '八年级上');
      expect(result.match).toBe(true);
      expect(result.confidence).toBe(0.5);
    });

    test('纯空格字符串应跳过验证', async () => {
      const result = await validateTypeMatch('   ', 'biology', '八年级上');
      expect(result.match).toBe(true);
    });

    test('null 应跳过验证', async () => {
      const result = await validateTypeMatch(null, 'biology', '八年级上');
      expect(result.match).toBe(true);
    });
  });

  describe('validateTypeMatch — 真实 LLM 调用', () => {
    test('生物学内容与 biology 学科应匹配', async () => {
      const result = await validateTypeMatch(
        '光合作用是植物利用阳光合成有机物的过程，叶绿体是光合作用的场所。',
        'biology',
        '八年级上'
      );

      expect(result).toHaveProperty('match');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('message');
      expect(typeof result.match).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
      // 生物学内容应被判定为匹配
      expect(result.match).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    }, 30000);

    test('数学内容与 biology 学科应不匹配', async () => {
      const result = await validateTypeMatch(
        '二次方程 ax²+bx+c=0 的求根公式为 x=(-b±√(b²-4ac))/2a',
        'biology',
        '八年级上'
      );

      expect(result).toHaveProperty('match');
      expect(result).toHaveProperty('confidence');
      // 数学内容放在生物学科下应被判定为不匹配
      expect(result.match).toBe(false);
    }, 30000);
  });

  describe('VERIFY_ENABLED constant', () => {
    test('should be a boolean', () => {
      expect(typeof VERIFY_ENABLED).toBe('boolean');
    });
  });
});
