/**
 * 自适应难度调整模块
 * Phase 3: Adaptive Difficulty
 *
 * 规则：
 * - 连续3题正确 → 降难度 (hard→medium→easy)
 * - 连续2题错误 → 升难度 (easy→medium→hard)
 * - 达到easy且连续3题正确 → 标记为"已掌握"
 */

// 难度常量
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

/**
 * 计算新难度
 * @param {string} currentDifficulty - 当前难度
 * @param {number} consecutiveCorrect - 连续正确次数
 * @param {number} consecutiveWrong - 连续错误次数
 * @returns {{newDifficulty: string, isMastered: boolean, reason: string}}
 */
function calculateNewDifficulty(currentDifficulty, consecutiveCorrect, consecutiveWrong) {
  // 连续3题正确 → 降难度
  if (consecutiveCorrect >= 3) {
    const currentIndex = DIFFICULTY_ORDER.indexOf(currentDifficulty);
    if (currentIndex > 0) {
      return {
        newDifficulty: DIFFICULTY_ORDER[currentIndex - 1],
        isMastered: false,
        reason: `连续${consecutiveCorrect}题正确，难度降低`
      };
    } else if (currentIndex === 0) {
      // 已在easy难度，标记为已掌握
      return {
        newDifficulty: 'easy',
        isMastered: true,
        reason: `连续${consecutiveCorrect}题正确，已掌握该知识点`
      };
    }
  }

  // 连续2题错误 → 升难度
  if (consecutiveWrong >= 2) {
    const currentIndex = DIFFICULTY_ORDER.indexOf(currentDifficulty);
    if (currentIndex < DIFFICULTY_ORDER.length - 1) {
      return {
        newDifficulty: DIFFICULTY_ORDER[currentIndex + 1],
        isMastered: false,
        reason: `连续${consecutiveWrong}题错误，难度提高`
      };
    }
    // 已在hard难度，保持不变
    return {
      newDifficulty: currentDifficulty,
      isMastered: false,
      reason: '已在最高难度，保持不变'
    };
  }

  // 不满足调整条件，保持当前难度
  return {
    newDifficulty: currentDifficulty,
    isMastered: false,
    reason: '不满足难度调整条件'
  };
}

module.exports = {
  calculateNewDifficulty,
  DIFFICULTY_ORDER
};
