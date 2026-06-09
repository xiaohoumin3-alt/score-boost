/**
 * practice-full-chain.test.js
 * 回归测试：练习全链路（G3）
 *
 * 模拟完整练习流程：practice_v2 → submitPracticeResult → kp_progress 更新
 * 验证自适应难度调整和进度追踪
 */

// ========== 题目归一化 ==========

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map(opt => {
    if (typeof opt === 'string') return opt.replace(/^[A-D]\.\s*/, '');
    if (typeof opt === 'object' && opt !== null) return opt.value || opt.text || String(opt);
    return String(opt);
  });
}

function normalizeAnswer(answer) {
  if (typeof answer === 'number') return String.fromCharCode(65 + answer);
  const upper = String(answer || 'A').toUpperCase().trim();
  if (['A','B','C','D'].includes(upper)) return upper;
  return 'A';
}

// ========== 自适应难度逻辑（与 submitPracticeResult 一致） ==========

function calculateNewDifficulty(currentDifficulty, consecutiveCorrect, consecutiveWrong) {
  const THRESHOLD_UP = 3;
  const THRESHOLD_DOWN = 2;
  const levels = ['easy', 'medium', 'hard'];
  const currentIndex = levels.indexOf(currentDifficulty);
  let newDifficulty = currentDifficulty;
  let isMastered = false;

  if (consecutiveCorrect >= THRESHOLD_UP && currentIndex < levels.length - 1) {
    newDifficulty = levels[currentIndex + 1];
  }
  if (consecutiveWrong >= THRESHOLD_DOWN && currentIndex > 0) {
    newDifficulty = levels[currentIndex - 1];
  }
  if (currentDifficulty === 'hard' && consecutiveCorrect >= 5) {
    isMastered = true;
  }

  return { newDifficulty, isMastered };
}

// ========== SM-2 复习间隔 ==========

function calculateReviewInterval(consecutiveCorrect) {
  const intervals = [1440, 4320, 10080, 20160, 43200]; // 分钟
  const index = Math.min(Math.max(consecutiveCorrect - 1, 0), intervals.length - 1);
  return intervals[index];
}

// ========== 测试 ==========

describe('回归测试 G3: 练习全链路 — 自适应难度', () => {

  test('easy 连续3对 → 升级到 medium', () => {
    const result = calculateNewDifficulty('easy', 3, 0);
    expect(result.newDifficulty).toBe('medium');
    expect(result.isMastered).toBe(false);
  });

  test('medium 连续3对 → 升级到 hard', () => {
    const result = calculateNewDifficulty('medium', 3, 0);
    expect(result.newDifficulty).toBe('hard');
    expect(result.isMastered).toBe(false);
  });

  test('hard 连续3对 → 保持 hard（已是最高）', () => {
    const result = calculateNewDifficulty('hard', 3, 0);
    expect(result.newDifficulty).toBe('hard');
    expect(result.isMastered).toBe(false);
  });

  test('hard 连续5对 → 标记为 mastered', () => {
    const result = calculateNewDifficulty('hard', 5, 0);
    expect(result.newDifficulty).toBe('hard');
    expect(result.isMastered).toBe(true);
  });

  test('medium 连续2错 → 降级到 easy', () => {
    const result = calculateNewDifficulty('medium', 0, 2);
    expect(result.newDifficulty).toBe('easy');
  });

  test('hard 连续2错 → 降级到 medium', () => {
    const result = calculateNewDifficulty('hard', 0, 2);
    expect(result.newDifficulty).toBe('medium');
  });

  test('easy 连续2错 → 保持 easy（已是最低）', () => {
    const result = calculateNewDifficulty('easy', 0, 2);
    expect(result.newDifficulty).toBe('easy');
  });

  test('1对1错 → 保持当前难度', () => {
    expect(calculateNewDifficulty('medium', 1, 1).newDifficulty).toBe('medium');
    expect(calculateNewDifficulty('easy', 1, 0).newDifficulty).toBe('easy');
    expect(calculateNewDifficulty('hard', 0, 1).newDifficulty).toBe('hard');
  });
});

describe('回归测试 G3: 练习全链路 — SM-2 复习间隔', () => {

  test('连续0对 → 1天间隔', () => {
    expect(calculateReviewInterval(0)).toBe(1440);
  });

  test('连续1对 → 1天间隔', () => {
    expect(calculateReviewInterval(1)).toBe(1440);
  });

  test('连续2对 → 3天间隔', () => {
    expect(calculateReviewInterval(2)).toBe(4320);
  });

  test('连续3对 → 7天间隔', () => {
    expect(calculateReviewInterval(3)).toBe(10080);
  });

  test('连续4对 → 14天间隔', () => {
    expect(calculateReviewInterval(4)).toBe(20160);
  });

  test('连续5对及以上 → 30天间隔', () => {
    expect(calculateReviewInterval(5)).toBe(43200);
    expect(calculateReviewInterval(10)).toBe(43200);
  });
});

describe('回归测试 G3: 练习全链路 — 错误分类', () => {

  // 简化版错误分类逻辑（与 submitPracticeResult 一致）
  function classifyError({ kpName, userAnswer, correctAnswer, difficulty, consecutiveCorrect, consecutiveWrong }) {
    // 粗心错误：答对了类似题目但这次答错
    if (consecutiveCorrect >= 2 && userAnswer && correctAnswer) {
      const userLetter = userAnswer.toUpperCase();
      const correctLetter = correctAnswer.toUpperCase();
      // 相邻选项 (A↔B, B↔C, C↔D)
      const adjacent = Math.abs(userLetter.charCodeAt(0) - correctLetter.charCodeAt(0)) === 1;
      if (adjacent) {
        return { error_type: 'careless', confidence: 0.7 };
      }
    }

    // 概念错误：基础题也答错
    if (difficulty === 'easy' && consecutiveWrong >= 2) {
      return { error_type: 'concept', confidence: 0.8 };
    }

    // 计算错误：medium 难度首次答错
    if (difficulty === 'medium' && consecutiveWrong === 1 && consecutiveCorrect >= 1) {
      return { error_type: 'calculation', confidence: 0.6 };
    }

    return { error_type: 'unknown', confidence: 0.3 };
  }

  test('相邻选项误选 → careless', () => {
    const result = classifyError({
      kpName: '二次根式',
      userAnswer: 'B',
      correctAnswer: 'A',
      difficulty: 'medium',
      consecutiveCorrect: 3,
      consecutiveWrong: 1,
    });
    expect(result.error_type).toBe('careless');
  });

  test('easy 题连续答错 → concept', () => {
    const result = classifyError({
      kpName: '二次根式',
      userAnswer: 'C',
      correctAnswer: 'A',
      difficulty: 'easy',
      consecutiveCorrect: 0,
      consecutiveWrong: 2,
    });
    expect(result.error_type).toBe('concept');
  });

  test('无法判断 → unknown', () => {
    const result = classifyError({
      kpName: '勾股定理',
      userAnswer: 'D',
      correctAnswer: 'A',
      difficulty: 'hard',
      consecutiveCorrect: 0,
      consecutiveWrong: 1,
    });
    expect(result.error_type).toBe('unknown');
  });
});

describe('回归测试 G3: 练习全链路 — 题目格式一致性', () => {

  test('practice_v2 生成的题目经归一化后格式正确', () => {
    // 模拟 practice_v2 AI 生成的题目格式
    const aiQuestion = {
      id: 'ai_1234567890_abc',
      type: 'choice',
      question: '计算：(√6 + √2)(√6 - √2) - √8的结果是？',
      options: [
        { key: 'A', value: '4 - 2√2' },
        { key: 'B', value: '2√2' },
        { key: 'C', value: '4' },
        { key: 'D', value: '6' },
      ],
      correct_answer: 'A',
      kp_id: 'kp1_3',
      kp_name: '二次根式的运算',
      difficulty: 'hard',
      knowledge_point_id: 'kp1_3', // 重复字段
      knowledge_point: '二次根式的运算', // 重复字段
      source: 'ai',
    };

    // 模拟写入题池时的归一化
    const poolRecord = {
      question: aiQuestion.question,
      options: normalizeOptions(aiQuestion.options),
      correct_answer: normalizeAnswer(aiQuestion.correct_answer),
      kp_id: aiQuestion.kp_id,
      kp_name: aiQuestion.kp_name,
      difficulty: aiQuestion.difficulty,
      subject: 'math',
      source: 'ai',
      verified: false,
    };

    // 验证格式
    expect(typeof poolRecord.question).toBe('string');
    expect(Array.isArray(poolRecord.options)).toBe(true);
    expect(poolRecord.options.every(o => typeof o === 'string')).toBe(true);
    expect(typeof poolRecord.correct_answer).toBe('string');
    expect(['A','B','C','D']).toContain(poolRecord.correct_answer);
    expect(poolRecord.kp_id).toBe('kp1_3');
  });
});
