/**
 * 统一难度指导管理
 * 移除高年级示例（勾股定理、等边三角形、二次根式）
 */

function getDifficultyGuidance(difficulty, grade) {
  const guidance = {
    easy: `【难度标准 - 简单】
- 直接套用公式或基本概念即可解答
- 单步推理，不需要复杂变换
- 数据简单，计算量小
- 选项中只有一个明显正确答案，干扰项较弱`,

    medium: `【难度标准 - 中等】
- 需要对公式或概念进行适度变形或转换
- 需要2-3步推理才能得出答案
- 可能涉及多个知识点的综合应用
- 选项设计有一定迷惑性，需要仔细辨别`,

    hard: `【难度标准 - 困难】
- 需要多步推理，或涉及抽象概念理解
- 可能需要逆向思维或特殊情况分析
- 结果可能具有反直觉性，容易误判
- 选项高度相似，每个选项都有一定的合理性
- 可能涉及陷阱题型或边界条件`
  };

  return guidance[difficulty] || guidance.medium;
}

module.exports = {
  getDifficultyGuidance
};
