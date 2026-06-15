/**
 * 题目格式归一化模块
 *
 * 统一题目数据模型，解决各云函数间数据格式不一致问题
 * Schema:
 * - question: string (题目内容)
 * - options: string[] (选项文本数组)
 * - correct_answer: string (正确答案字母 A-D)
 * - kp_id: string (知识点ID)
 * - kp_name: string (知识点名称)
 * - difficulty: string (easy/medium/hard)
 * - explanation: string (解析)
 * - question_type: string (题目类型，默认 'choice')
 * - subject: string
 * - grade: string
 * - chapter: string
 */

/**
 * 统一选项格式
 * 输入可能是：string[], {key, value}[], undefined
 * 输出统一为 string[]
 */
function normalizeOptions(options) {
  if (!options || !Array.isArray(options) || options.length === 0) {
    return [];
  }
  return options.map((opt) => {
    if (typeof opt === 'string') {
      // Remove leading "A. " or "A、" prefix if present
      return opt.replace(/^[A-D][.、)\s]\s*/, '');
    }
    if (typeof opt === 'object' && opt !== null) {
      return opt.value || opt.text || opt.content || opt.label || String(opt);
    }
    return String(opt);
  });
}

/**
 * 统一答案格式
 * 输入可能是：number(0-3), string("A"-"D"), string("0"-"3")
 * 输出统一为 string "A"-"D"
 */
function normalizeAnswer(answer) {
  if (answer === undefined || answer === null) return '';

  if (typeof answer === 'number') {
    return ['A', 'B', 'C', 'D'][answer] || String(answer);
  }

  if (typeof answer === 'string') {
    const upper = answer.trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(upper)) return upper;
    const num = parseInt(answer, 10);
    if (!isNaN(num) && num >= 0 && num <= 3) {
      return ['A', 'B', 'C', 'D'][num];
    }
  }

  return String(answer);
}

/**
 * 归一化题目记录（写入 ai_question_pool 前调用）
 * 自动为新题目预设 IRT 参数
 */
function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('normalizeQuestion: raw data is required');
  }

  const question = raw.question || raw.content || '';
  const options = normalizeOptions(raw.options);
  const correct_answer = normalizeAnswer(raw.correct_answer);
  const kp_id = raw.kp_id || raw.knowledge_point_id || raw.knowledge_point || '';
  const kp_name = raw.kp_name || raw.knowledge_point_name || raw.knowledge_point || '';

  const result = {
    question,
    options,
    correct_answer,
    kp_id,
    kp_name,
    difficulty: raw.difficulty || 'medium',
    explanation: raw.explanation || '',
    question_type: raw.question_type || 'choice',
    subject: raw.subject || '',
    grade: raw.grade || '',
    chapter: raw.chapter || '',
  };

  if (raw.source) result.source = raw.source;
  if (raw.verified !== undefined) result.verified = raw.verified;
  if (raw.created_at) result.created_at = raw.created_at;
  if (raw.pool_id) result.pool_id = raw.pool_id;

  // 自动预设 IRT 参数（新题目入库时）
  if (raw.irt_a === undefined && raw.irt_b === undefined) {
    try {
      const { generateIRTParams } = require('./irt-seed-generator');
      const kp = {
        kp_id,
        kp_name,
        subject: result.subject,
        grade: parseInt(result.grade) || 8,
        chapter: result.chapter,
        difficulty_weight: raw.difficulty_weight || { easy: 0.4, medium: 0.4, hard: 0.2 },
      };
      const irtParams = generateIRTParams(kp, result.difficulty);
      result.irt_a = irtParams.a;
      result.irt_b = irtParams.b;
      result.irt_source = 'auto_assigned';
    } catch (e) {
      // IRT 参数分配失败不影响主流程
    }
  } else {
    if (raw.irt_a !== undefined) result.irt_a = raw.irt_a;
    if (raw.irt_b !== undefined) result.irt_b = raw.irt_b;
    if (raw.irt_source) result.irt_source = raw.irt_source;
  }

  return result;
}

/**
 * 格式化题目为 API 返回格式（从 ai_question_pool 读取后调用）
 */
function formatQuestionForApi(poolRecord) {
  if (!poolRecord) return null;

  return {
    id: poolRecord.pool_id || poolRecord.id || poolRecord._id,
    type: poolRecord.question_type || 'choice',
    content: poolRecord.question || poolRecord.content || '',
    options: normalizeOptions(poolRecord.options),
    correct_answer: normalizeAnswer(poolRecord.correct_answer),
    knowledge_point: poolRecord.kp_name || poolRecord.knowledge_point_name || '',
    knowledge_point_id: poolRecord.kp_id || poolRecord.knowledge_point_id || '',
    difficulty: poolRecord.difficulty || 'medium',
    explanation: poolRecord.explanation || '',
    subject: poolRecord.subject || '',
    grade: poolRecord.grade || '',
    chapter: poolRecord.chapter || '',
  };
}

module.exports = {
  normalizeQuestion,
  normalizeOptions,
  normalizeAnswer,
  formatQuestionForApi
};

// Patch: add schema_version support
const _origNormalize = module.exports.normalizeQuestion;
const { getSchemaVersion } = require('./schema-version');

const origNormalizeQuestion = module.exports.normalizeQuestion;
module.exports.normalizeQuestion = function(raw) {
  const result = origNormalizeQuestion(raw);
  result.schema_version = getSchemaVersion();
  return result;
};
