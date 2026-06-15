/**
 * questionOptimizer 共享模块
 * 智能题目管理：复用、预生成、质量验证
 *
 * 职责：
 * 1. 从 ai_question_pool 获取题目（优先复用）
 * 2. 题目质量验证（IRT 参数合理性）
 * 3. 题目复用统计
 */

/**
 * 从题池获取题目（优先复用已验证题目）
 * @param {Object} db - 数据库实例
 * @param {Object} criteria - { grade, subject, kp_id?, difficulty?, excludeIds? }
 * @param {number} count - 需要的题目数
 * @returns {Promise<Array>} 题目列表（标准化格式）
 */
async function getQuestions(db, criteria, count = 5) {
  const { grade, subject, kp_id, difficulty, excludeIds = [] } = criteria;

  const where = {
    grade: String(grade),
    subject,
    verified: true
  };

  if (kp_id) where.kp_id = kp_id;
  if (difficulty !== undefined) {
    where.difficulty = typeof difficulty === 'string'
      ? difficulty
      : { easy: 'easy', medium: 'medium', hard: 'hard' }[Math.round(difficulty)] || 'medium';
  }

  try {
    let query = db.collection('ai_question_pool').where(where);

    const result = await query.limit(count * 3).get();
    let questions = result.data || [];

    if (excludeIds.length > 0) {
      const excludeSet = new Set(excludeIds);
      questions = questions.filter(q => !excludeSet.has(q._id));
    }

    questions.sort(() => Math.random() - 0.5);

    return questions.slice(0, count).map(normalizeQuestion);
  } catch (e) {
    console.error('[questionOptimizer] getQuestions 失败:', e.message);
    return [];
  }
}

/**
 * 标准化题目格式
 * @param {Object} raw - 原始题目记录
 * @returns {Object} 标准化题目
 */
function normalizeQuestion(raw) {
  const difficulty = typeof raw.difficulty === 'string'
    ? { easy: -1, medium: 0, hard: 1 }[raw.difficulty] || 0
    : (raw.difficulty || raw.irt_b || 0);

  return {
    question_id: raw._id || raw.question_id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    content: raw.question || raw.content || '',
    options: raw.options || [],
    correct_answer: normalizeCorrectAnswer(raw.correct_answer),
    difficulty,
    discrimination: raw.discrimination || raw.irt_a || 1.0,
    guessing: raw.guessing || raw.irt_c || 0.25,
    kp_id: raw.kp_id || '',
    kp_name: raw.kp_name || raw.knowledge_point || '',
    knowledge_point_id: raw.kp_id || ''
  };
}

function normalizeCorrectAnswer(value) {
  if (typeof value === 'number') return ['A', 'B', 'C', 'D'][value] || null;
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(upper)) return upper;
    if (/^[0-3]$/.test(upper)) return ['A', 'B', 'C', 'D'][Number(upper)];
  }
  return null;
}

/**
 * 验证题目质量（IRT 参数合理性）
 * @param {Object} question - 标准化题目
 * @returns {Object} { valid: boolean, issues: string[] }
 */
function validateQuestion(question) {
  const issues = [];

  if (!question.content || question.content.length < 5) {
    issues.push('题目内容过短');
  }

  if (!question.options || question.options.length !== 4) {
    issues.push('选项数量必须为4');
  }

  if (!question.correct_answer || !['A', 'B', 'C', 'D'].includes(question.correct_answer)) {
    issues.push('正确答案无效');
  }

  if (typeof question.difficulty !== 'number' || question.difficulty < -3 || question.difficulty > 3) {
    issues.push('难度参数超出范围 [-3, 3]');
  }

  if (typeof question.discrimination !== 'number' || question.discrimination <= 0 || question.discrimination > 2.5) {
    issues.push('区分度参数超出范围 (0, 2.5]');
  }

  if (typeof question.guessing !== 'number' || question.guessing < 0 || question.guessing > 0.5) {
    issues.push('猜测参数超出范围 [0, 0.5]');
  }

  return { valid: issues.length === 0, issues };
}

/**
 * 批量验证题目质量
 * @param {Array} questions - 题目列表
 * @returns {Object} { valid: Array, invalid: Array }
 */
function validateQuestions(questions) {
  const valid = [];
  const invalid = [];

  for (const q of questions) {
    const result = validateQuestion(q);
    if (result.valid) {
      valid.push(q);
    } else {
      invalid.push({ question: q, issues: result.issues });
    }
  }

  return { valid, invalid };
}

/**
 * 获取知识点覆盖统计
 * @param {Object} db - 数据库实例
 * @param {string} grade - 年级
 * @param {string} subject - 科目
 * @returns {Promise<Object>} { kp_id -> count } 映射
 */
async function getKnowledgePointCoverage(db, grade, subject) {
  try {
    const result = await db.collection('ai_question_pool')
      .where({ grade: String(grade), subject, verified: true })
      .field({ kp_id: true })
      .limit(500)
      .get();

    const coverage = {};
    for (const q of (result.data || [])) {
      const kp = q.kp_id || 'unknown';
      coverage[kp] = (coverage[kp] || 0) + 1;
    }

    return coverage;
  } catch (e) {
    console.error('[questionOptimizer] 获取知识点覆盖失败:', e.message);
    return {};
  }
}

module.exports = {
  getQuestions,
  normalizeQuestion,
  validateQuestion,
  validateQuestions,
  getKnowledgePointCoverage
};
