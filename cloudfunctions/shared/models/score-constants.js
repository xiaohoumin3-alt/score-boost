/**
 * 分数预估常量配置
 * 版本: v2.0
 */

const SCORE_CONSTANTS = {
  // 难度相关
  CORRELATION_COEF_BASE: 1.0,      // 其他题型相关性基础系数
  DIFFICULTY_SENSITIVITY: 0.2,      // 难度敏感度
  DIFFICULTY_BONUS_SCALE: 8,        // 难度修正满分影响（±4分）
  
  // 置信度相关
  EXTREMITY_PENALTY_POWER: 2,      // 极端值惩罚幂次
  EXTREMITY_PENALTY_SCALE: 0.3,    // 极端值惩罚系数
  VOLUME_THRESHOLD: 20,            // 满置信度题量阈值
  
  // IRT 相关
  IRT_CONVERGENCE_THRESHOLD: 0.001,
  IRT_MAX_ITERATIONS: 30,
  IRT_INFORMATION_THRESHOLD: 1e-10,
  IRTABILITY_RANGE: { min: -3, max: 3 },
  
  // 年级修正系数
  GRADE_CORRECTIONS: {
    1: 1.1, 2: 1.08, 3: 1.05, 4: 1.02, 5: 1.0, 6: 0.98,
    7: 0.95, 8: 0.92, 9: 0.9
  },
};

module.exports = SCORE_CONSTANTS;
