/**
 * updateIRTParams 云函数
 * 批量更新现有题目的 IRT 参数
 * 为缺失 irt_a/irt_b 的题目生成参数
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 难度字段 → IRT 难度 b 的映射
 */
const DIFFICULTY_TO_B = {
  easy:   { min: -2.0, max: -0.5, default: -1.0 },
  medium: { min: -0.5, max: 0.5,  default: 0.0 },
  hard:   { min: 0.5,  max: 2.0,  default: 1.0 },
};

/**
 * 年级难度修正系数
 */
const GRADE_DIFFICULTY_ADJUST = {
  1: -0.5, 2: -0.45, 3: -0.4, 4: -0.3, 5: -0.2, 6: -0.1,
  7: 0, 8: 0.1, 9: 0.2,
};

/**
 * 根据题目已有数据估计 IRT 参数
 */
function estimateItemParams(question) {
  const difficulty = question.difficulty || 'medium';
  const range = DIFFICULTY_TO_B[difficulty] || DIFFICULTY_TO_B.medium;

  // 基础 b 值
  let b = range.default;

  // 年级修正
  const grade = parseInt(question.grade) || 8;
  const gradeAdj = GRADE_DIFFICULTY_ADJUST[grade] || 0;
  b += gradeAdj;

  // 在范围内加入随机扰动
  b = Math.max(range.min, Math.min(range.max, b + (Math.random() - 0.5) * 0.6));

  // 区分度 a：简单题区分度低，难题区分度高
  const aBase = difficulty === 'easy' ? 0.9 : difficulty === 'hard' ? 1.4 : 1.1;
  const a = aBase + (Math.random() - 0.5) * 0.4;

  return {
    a: Math.round(a * 100) / 100,
    b: Math.round(b * 100) / 100,
    source: 'rule_based',
  };
}

exports.main = async (event) => {
  const { action = 'update', batch_size = 100 } = event;
  const db = cloud.database();
  const _ = db.command;

  if (action === 'status') {
    const total = await db.collection('ai_question_pool').count();
    const withIRT = await db.collection('ai_question_pool')
      .where({ irt_a: _.exists(true) })
      .count();
    const missing = total.total - withIRT.total;

    return {
      success: true,
      data: {
        totalQuestions: total.total,
        withIRT: withIRT.total,
        missingIRT: missing,
        coveragePercent: total.total > 0 ? Math.round(withIRT.total / total.total * 100) : 0,
      }
    };
  }

  if (action === 'updateBatch') {
    const { batchIndex = 0, batchSize = 50 } = event;

    const skip = batchIndex * batchSize;
    const questions = await db.collection('ai_question_pool')
      .where({ irt_a: _.exists(false) })
      .skip(skip)
      .limit(batchSize)
      .get();

    if (questions.data.length === 0) {
      return {
        success: true,
        data: { updated: 0, message: 'No more questions' }
      };
    }

    let updated = 0;
    let errors = 0;

    for (const q of questions.data) {
      try {
        const params = estimateItemParams(q);

        await db.collection('ai_question_pool')
          .doc(q._id)
          .update({
            data: {
              irt_a: params.a,
              irt_b: params.b,
              irt_source: params.source,
              irt_updated_at: new Date().toISOString(),
            }
          });

        updated++;
      } catch (e) {
        errors++;
        console.warn('[updateIRTParams] Failed:', q._id, e.message);
      }
    }

    return {
      success: true,
      data: { updated, errors, total: questions.data.length, batchIndex }
    };
  }

  return { success: false, error: `Unknown action: ${action}` };
};
