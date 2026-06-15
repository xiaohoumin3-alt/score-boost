/**
 * irt-model-init.test.js
 * 验证 IRT 模型初始化检查
 */

const IRTModel = require('../models/irt-model');

describe('IRT模型初始化检查', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('未初始化时 estimateAbility 应发出警告并回退到简单计算', () => {
    const model = new IRTModel();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    // 模拟答题数据
    const responses = [
      { item_id: 'q1', correct: true, question_type: 'choice' },
      { item_id: 'q2', correct: false, question_type: 'choice' },
      { item_id: 'q3', correct: true, question_type: 'choice' },
    ];

    const result = model.estimateAbility(responses);

    // 应该发出警告
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[IRT] itemBank未初始化')
    );

    // 回退到基于正确率的简单计算
    // 2/3 正确率 → theta = ln(2/3 / 1/3) = ln(2) ≈ 0.693
    expect(result.theta).toBeCloseTo(0.693, 1);
    expect(result.questionCount).toBe(3);
    expect(result.fallback).toBe('rate_based');

    consoleWarnSpy.mockRestore();
  });

  test('初始化后应正常计算 IRT', () => {
    const model = new IRTModel();

    // 加载题目参数
    model.loadItemBank([
      { item_id: 'q1', discrimination: 1.5, difficulty: -1 },
      { item_id: 'q2', discrimination: 1.0, difficulty: 0 },
      { item_id: 'q3', discrimination: 1.2, difficulty: 0.5 },
    ]);

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const responses = [
      { item_id: 'q1', correct: true },
      { item_id: 'q2', correct: false },
      { item_id: 'q3', correct: true },
    ];

    const result = model.estimateAbility(responses);

    // 不应该发出警告
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    // theta 应该在合理范围内
    expect(result.theta).toBeGreaterThan(-4);
    expect(result.theta).toBeLessThan(4);

    consoleWarnSpy.mockRestore();
  });

  test('部分题目参数缺失时使用默认值', () => {
    const model = new IRTModel();

    // 只加载部分题目
    model.loadItemBank([
      { item_id: 'q1', discrimination: 1.5, difficulty: -1 },
    ]);

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const responses = [
      { item_id: 'q1', correct: true },
      { item_id: 'q2_missing', correct: false }, // 缺失
      { item_id: 'q3_missing', correct: true },  // 缺失
    ];

    const result = model.estimateAbility(responses);

    // 应该发出警告（部分题目缺失）
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[IRT] 部分题目参数缺失')
    );

    consoleWarnSpy.mockRestore();
  });

  test('空响应时返回默认值', () => {
    const model = new IRTModel();
    const result = model.estimateAbility([]);

    expect(result.theta).toBe(0);
    expect(result.se).toBe(1);
    expect(result.confidence).toBe(0);
  });
});
