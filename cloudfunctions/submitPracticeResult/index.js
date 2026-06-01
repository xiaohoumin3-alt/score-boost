/**
 * 提交练习答案云函数
 * 更新 kp_progress 进度
 * AI原生Phase 3: 集成自适应难度调整
 * Phase 4: 集成错误分类（导师诊断核心）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const { calculateNewDifficulty } = require('./adaptive-difficulty.js');

// ============ 错误分类器（内联，简化部署） ============
const ERROR_TYPES = { CARELESS: 'careless', CONCEPT: 'concept', CALCULATION: 'calculation', UNKNOWN: 'unknown' };

/**
 * 错误分类
 * @param {Object} params
 * @returns {Object} {error_type, confidence, reason, hint_level}
 */
function classifyError(params) {
  const {
    kpName = '',
    userAnswer = '',
    correctAnswer = '',
    difficulty = 'medium',
    consecutiveCorrect = 0,
    consecutiveWrong = 0,
    timeSpent = 0,
  } = params;

  const uAns = userAnswer.toString().trim().toUpperCase();
  const cAns = correctAnswer.toString().trim().toUpperCase();

  // 1. 格式错误（选了相邻选项）
  const options = ['A', 'B', 'C', 'D', 'E', 'F'];
  const uIdx = options.indexOf(uAns);
  const cIdx = options.indexOf(cAns);
  if (uIdx >= 0 && cIdx >= 0 && Math.abs(uIdx - cIdx) === 1) {
    return { error_type: ERROR_TYPES.CARELESS, confidence: 0.75, reason: '选了相邻选项' };
  }

  // 2. 正负号错误
  const uNum = parseFloat(uAns.replace(/[^0-9.-]/g, ''));
  const cNum = parseFloat(cAns.replace(/[^0-9.-]/g, ''));
  if (!isNaN(uNum) && !isNaN(cNum) && Math.abs(uNum + cNum) < 0.01 && Math.abs(uNum) > 0.01) {
    return { error_type: ERROR_TYPES.CARELESS, confidence: 0.70, reason: '正负号错误' };
  }

  // 3. 小数点位数错误
  if (!isNaN(uNum) && !isNaN(cNum) && uNum !== 0 && cNum !== 0) {
    const ratio = Math.abs(uNum / cNum);
    if ((ratio > 9 && ratio < 11) || (ratio > 0.09 && ratio < 0.11)) {
      return { error_type: ERROR_TYPES.CARELESS, confidence: 0.65, reason: '小数点位数错误' };
    }
  }

  // 4. 概念性符号错误（绝对值结果为负）
  if (kpName.includes('绝对值') && uAns.startsWith('-')) {
    return { error_type: ERROR_TYPES.CONCEPT, confidence: 0.85, reason: '绝对值概念错误' };
  }

  // 5. 之前做对过，现在错了 → 概念混淆
  if (consecutiveCorrect >= 2) {
    return { error_type: ERROR_TYPES.CONCEPT, confidence: 0.75, reason: '之前做对过，现在错，可能是概念不牢' };
  }

  // 6. 复杂题答题时间长但错了 → 计算问题
  if (difficulty !== 'easy' && timeSpent > 60) {
    return { error_type: ERROR_TYPES.CALCULATION, confidence: 0.70, reason: '中难题答题时间长但仍错' };
  }

  // 7. 连续错误 → 计算方法没掌握
  if (consecutiveWrong >= 2) {
    return { error_type: ERROR_TYPES.CALCULATION, confidence: 0.65, reason: '连续错误，计算方法可能没掌握' };
  }

  // 默认：无法分类
  return { error_type: ERROR_TYPES.UNKNOWN, confidence: 0.30, reason: '无法确定错误类型' };
}

// ============ 主逻辑 ============
exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const {
      student_id,
      kp_id,
      kp_name = '',
      difficulty,
      is_correct,
      assessment_id,
      user_answer,
      correct_answer,
      time_spent = 0,
    } = params;

    if (!kp_id || !difficulty) {
      return { success: false, error: '缺少必要参数' };
    }

    // 1. 查询当前进度
    const progressRes = await db.collection('kp_progress')
      .where({ student_id, kp_id })
      .get();

    const currentProgress = progressRes.data && progressRes.data.length > 0
      ? progressRes.data[0]
      : null;

    // 2. 构建新进度
    let newProgress = currentProgress ? { ...currentProgress } : {
      student_id,
      kp_id,
      kp_name,
      assessment_id: assessment_id || '',
      easy: { consecutive_correct: 0, consecutive_wrong: 0, mastered: false },
      medium: { consecutive_correct: 0, consecutive_wrong: 0, mastered: false },
      hard: { consecutive_correct: 0, consecutive_wrong: 0, mastered: false },
      current_difficulty: difficulty,
      created_at: new Date().toISOString(),
      // 错误类型统计（新增）
      error_stats: { careless: 0, concept: 0, calculation: 0, unknown: 0 },
      total_attempts: 0,
    };

    if (assessment_id) {
      newProgress.assessment_id = assessment_id;
    }

    // 确保难度对象存在
    if (!newProgress[difficulty]) {
      newProgress[difficulty] = { consecutive_correct: 0, consecutive_wrong: 0, mastered: false };
    }
    if (newProgress[difficulty].consecutive_wrong === undefined) {
      newProgress[difficulty].consecutive_wrong = 0;
    }
    if (newProgress[difficulty].mastered === undefined) {
      newProgress[difficulty].mastered = false;
    }

    // 3. 更新正确/错误计数
    if (is_correct) {
      newProgress[difficulty].consecutive_correct++;
      newProgress[difficulty].consecutive_wrong = 0;
    } else {
      newProgress[difficulty].consecutive_wrong = (newProgress[difficulty].consecutive_wrong || 0) + 1;
    }

    // 4. 错误分类（答错时才分类）
    let errorClassification = null;
    if (!is_correct && user_answer && correct_answer) {
      errorClassification = classifyError({
        kpName: kp_name || newProgress.kp_name || '',
        userAnswer: user_answer,
        correctAnswer: correct_answer,
        difficulty: difficulty,
        consecutiveCorrect: newProgress[difficulty].consecutive_correct,
        consecutiveWrong: newProgress[difficulty].consecutive_wrong,
        timeSpent: time_spent,
      });

      // 记录错误类型统计
      if (!newProgress.error_stats) {
        newProgress.error_stats = { careless: 0, concept: 0, calculation: 0, unknown: 0 };
      }
      newProgress.error_stats[errorClassification.error_type] =
        (newProgress.error_stats[errorClassification.error_type] || 0) + 1;
    }
    newProgress.total_attempts = (newProgress.total_attempts || 0) + 1;

    // 5. 自适应难度调整
    const difficultyAdjustment = calculateNewDifficulty(
      newProgress.current_difficulty,
      newProgress[newProgress.current_difficulty].consecutive_correct,
      newProgress[newProgress.current_difficulty].consecutive_wrong
    );

    newProgress.current_difficulty = difficultyAdjustment.newDifficulty;
    if (difficultyAdjustment.isMastered) {
      newProgress[difficulty].mastered = true;
    }

    if (difficultyAdjustment.newDifficulty !== difficulty) {
      const newDiff = difficultyAdjustment.newDifficulty;
      if (!newProgress[newDiff]) {
        newProgress[newDiff] = { consecutive_correct: 0, consecutive_wrong: 0, mastered: false };
      }
    }

    newProgress.updated_at = new Date().toISOString();

    // 6. SM-2 复习时间
    const reviewIntervals = [1440, 4320, 10080, 20160, 43200];
    const currentConsecutive = newProgress[difficulty].consecutive_correct || 0;
    const intervalIndex = Math.min(Math.max(currentConsecutive - 1, 0), reviewIntervals.length - 1);
    const intervalMinutes = reviewIntervals[intervalIndex];

    newProgress.next_review_at = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
    newProgress.last_reviewed_at = new Date().toISOString();

    // 7. 持久化
    if (currentProgress) {
      const { _id, ...updateData } = newProgress;
      await db.collection('kp_progress').doc(currentProgress._id).update({
        data: updateData
      });
    } else {
      await db.collection('kp_progress').add({
        data: newProgress
      });
    }

    // 8. 更新Memory（异步）
    updateStudentMemory(student_id, kp_id, difficulty, is_correct, errorClassification).catch(err => {
      console.log('[submitPracticeResult] Memory update failed:', err.message);
    });

    // 9. 返回
    return {
      success: true,
      data: {
        kp_id,
        current_difficulty: newProgress.current_difficulty,
        previous_difficulty: difficulty,
        next_review_at: newProgress.next_review_at,
        difficulty_changed: difficultyAdjustment.newDifficulty !== difficulty,
        difficulty_state: newProgress[newProgress.current_difficulty],
        // 错误分类结果（答错时返回）
        error_classification: errorClassification,
        is_mastered: difficultyAdjustment.isMastered || newProgress[difficulty].mastered || false,
      }
    };

  } catch (e) {
    console.error('submitPracticeResult error:', e);
    return { success: false, error: e.message || String(e) };
  }
};

async function updateStudentMemory(studentId, kpId, difficulty, isCorrect, errorClassification) {
  try {
    await cloud.callFunction({
      name: 'studentMemory',
      data: {
        action: 'addProgress',
        student_id: studentId,
        data: {
          kp_id: kpId,
          difficulty: difficulty,
          is_correct: isCorrect,
          error_type: errorClassification ? errorClassification.error_type : null,
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (e) {
    console.log('[updateStudentMemory] Failed:', e.message);
  }
}
