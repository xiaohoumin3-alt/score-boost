/**
 * 题目参数库构建器
 * 从 ai_question_pool 读取题目，为每道题分配 IRT 参数 (a, b)
 * 优先级：已有 IRT 参数 > 答题数据驱动 > 知识点研究参数 > 冷启动默认值
 * 版本: v2.0
 */

const ColdStartManager = require('./models/cold-start');
const { generateIRTParams, SUBJECT_DIFFICULTY_ADJUST, GRADE_DIFFICULTY_ADJUST } = require('./irt-seed-generator');

/**
 * 难度字段 → IRT 难度 b 的映射
 */
const DIFFICULTY_TO_B = {
  easy:   { min: -2.0, max: -0.5, default: -1.0 },
  medium: { min: -0.5, max: 0.5,  default: 0.0 },
  hard:   { min: 0.5,  max: 2.0,  default: 1.0 },
};

/**
 * 根据题目已有数据估计 IRT 参数
 * 优先级：irt_a/irt_b > 数据驱动 > 研究参数 > 冷启动
 * @param {object} question - ai_question_pool 中的题目记录
 * @returns {{ a: number, b: number, source: string }}
 */
function estimateItemParams(question) {
  // 优先级 1: 已有 IRT 参数（来自种子数据或在线学习更新）
  if (question.irt_a !== undefined && question.irt_b !== undefined) {
    return {
      a: question.irt_a,
      b: question.irt_b,
      source: question.irt_source || 'precomputed',
    };
  }

  const usageCount = question.usage_count || 0;
  const correctCount = question.correct_count || 0;
  const difficulty = question.difficulty || 'medium';

  // 优先级 2: 有足够答题数据时，用正确率估计
  if (usageCount >= 10) {
    const correctRate = correctCount / usageCount;
    let b;
    if (correctRate <= 0.01) b = 2.5;
    else if (correctRate >= 0.99) b = -2.5;
    else b = -Math.log(correctRate / (1 - correctRate));

    const distFromMid = Math.abs(correctRate - 0.5);
    const a = 0.8 + (0.5 - distFromMid) * 2.0;

    return {
      a: Math.round(a * 100) / 100,
      b: Math.round(b * 100) / 100,
      source: 'data_driven',
    };
  }

  // 优先级 3: 基于知识点难度分布的研究参数
  if (question.kp_id || question.kp_name) {
    const kp = {
      kp_id: question.kp_id || '',
      kp_name: question.kp_name || question.knowledge_point || '',
      subject: question.subject || 'math',
      grade: parseInt(question.grade) || 8,
      chapter: question.chapter || '',
      difficulty_weight: question.difficulty_weight || { easy: 0.4, medium: 0.4, hard: 0.2 },
    };
    const params = generateIRTParams(kp, difficulty);
    return {
      a: params.a,
      b: params.b,
      source: 'research_based',
    };
  }

  // 优先级 4: 冷启动默认值
  const range = DIFFICULTY_TO_B[difficulty] || DIFFICULTY_TO_B.medium;
  const coldStart = new ColdStartManager();
  const grade = question.grade || '8';
  const subject = question.subject || 'math';

  coldStart.loadPretrainedModel(subject, grade);
  const itemParams = coldStart.generateItemParams(subject, grade, question.kp_name);

  const b = Math.max(range.min, Math.min(range.max, itemParams.difficulty));
  const a = itemParams.discrimination;

  return {
    a: Math.round(a * 100) / 100,
    b: Math.round(b * 100) / 100,
    source: 'cold_start',
  };
}

/**
 * 批量为题目生成 IRT 参数（用于数据库更新）
 * @param {object[]} questions - ai_question_pool 的题目数组
 * @returns {{ item_id: string, irt_a: number, irt_b: number, irt_source: string }[]}
 */
function buildItemBank(questions) {
  return questions.map(q => {
    const params = estimateItemParams(q);
    return {
      item_id: q._id || q.pool_id,
      irt_a: params.a,
      irt_b: params.b,
      irt_source: params.source,
    };
  });
}

/**
 * 将 IRT 参数转换为 IRTModel 可用的格式
 * @param {object[]} questions - ai_question_pool 的题目数组
 * @returns {{ item_id: string, a: number, b: number, subject: string, grade: string, knowledge_point: string }[]}
 */
function toIRTItems(questions) {
  return questions.map(q => {
    const params = estimateItemParams(q);
    return {
      item_id: q._id || q.pool_id,
      a: params.a,
      b: params.b,
      subject: q.subject || '',
      grade: q.grade || '',
      knowledge_point: q.kp_name || q.knowledge_point || '',
    };
  });
}

module.exports = {
  estimateItemParams,
  buildItemBank,
  toIRTItems,
  DIFFICULTY_TO_B,
};
