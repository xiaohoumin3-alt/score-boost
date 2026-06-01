/**
 * 检查复测条件
 * 判断所有薄弱点是否已通过目标难度
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 根据测评分数确定目标难度（0-5分制）
function getTargetDifficulty(score) {
  if (score <= 2) return 'easy';    // 0-2分（<=40%）
  if (score <= 3) return 'medium';  // 3分（60%）
  return 'hard';                    // 4-5分（>=80%）
}

exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const { assessment_id, score } = params;

    if (!assessment_id || score === undefined) {
      return { success: false, error: '缺少 assessment_id 或 score' };
    }

    // 1. 查询该测评关联的所有 kp_progress 记录
    const progressRes = await db.collection('kp_progress')
      .where({ assessment_id })
      .get();

    // 2. 如果没有记录（>90分或首次测评），直接允许复测
    if (!progressRes.data || progressRes.data.length === 0) {
      const targetDifficulty = getTargetDifficulty(score);
      return {
        success: true,
        data: {
          eligible: true,
          targetDifficulty: targetDifficulty,
          reason: '无练习记录，可直接复测',
          progress: [],
        }
      };
    }

    // 3. 有记录时，检查目标难度.completed 是否全为 true
    const targetDifficulty = getTargetDifficulty(score);
    console.log('[checkRetestEligibility] score=' + score + ' → difficulty=' + targetDifficulty);
    const allCompleted = progressRes.data.every(p => {
      const targetState = p[targetDifficulty];
      return targetState && targetState.completed === true;
    });

    // 4. 返回结果
    return {
      success: true,
      data: {
        eligible: allCompleted,
        targetDifficulty: targetDifficulty,
        reason: allCompleted
          ? '所有薄弱点目标难度已通过'
          : `还需完成 ${targetDifficulty} 难度的薄弱点`,
        progress: progressRes.data.map(p => ({
          kp_id: p.kp_id,
          current_difficulty: p.current_difficulty,
          target_completed: p[targetDifficulty]?.completed || false,
        })),
      }
    };

  } catch (e) {
    console.error('checkRetestEligibility error:', e);
    return { success: false, error: e.message || String(e) };
  }
};