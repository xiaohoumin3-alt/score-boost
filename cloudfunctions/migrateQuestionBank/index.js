/**
 * migrateQuestionBank 云函数
 * 功能：迁移静态题库到 ai_question_pool
 * TDD: Red-Green-Refactor
 */

const { normalizeQuestion } = require('../shared/question-normalizer');

// 测试环境不使用 wx-server-sdk
let cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  cloud = null;
}

/**
 * 迁移静态题库到 ai_question_pool
 * @param {Object} db - 数据库实例
 * @param {string} subject - 科目: 'math' | 'biology' | 'geography'
 */
async function migrateStaticBank(db, subject = 'math') {
  // 加载静态题库
  let questionBank;
  try {
    const bank = require('./question_bank');
    const subjectMap = {
      math: 'QUESTION_BANK',
      biology: 'BIO_QUESTION_BANK',
      geography: 'GEO_QUESTION_BANK'
    };
    const bankKey = subjectMap[subject];
    if (!bank[bankKey]) {
      return { success: false, error: `Unknown subject: ${subject}` };
    }
    questionBank = bank[bankKey];
  } catch (e) {
    return { success: false, error: `Failed to load question bank: ${e.message}` };
  }

  let migrated = 0;
  const errors = [];

  // 遍历所有知识点
  for (const [kpId, questions] of Object.entries(questionBank)) {
    for (const q of questions) {
      try {
        // 使用归一化函数确保数据格式统一
        const record = normalizeQuestion({
          question: q.content || q.question || '',
          options: q.options || [],
          correct_answer: (q.correct_answer || '').toUpperCase(),
          kp_id: kpId,
          kp_name: q.kp_name || '',
          chapter: q.chapter || '',
          difficulty: q.difficulty || 'medium',
          subject: subject,
          source: 'static',
          verified: true
        });

        // 添加迁移特有字段
        record.correct_rate = 0.8;
        record.usage_count = 0;
        record.created_at = new Date().toISOString();

        await db.collection('ai_question_pool').add({ data: record });
        migrated++;

      } catch (e) {
        errors.push({ kp_id: kpId, question: q.content, error: e.message });
      }
    }
  }

  return {
    success: true,
    subject,
    migrated,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { subject = 'math' } = event.data || event;

  try {
    console.log('=== migrateQuestionBank === subject:', subject);

    const result = await migrateStaticBank(db, subject);

    return {
      success: result.success,
      ...result
    };

  } catch (e) {
    console.error('migrateQuestionBank error:', e);
    return {
      success: false,
      error: e.message || String(e)
    };
  }
};

// 导出供测试使用（保留exports.main）
Object.assign(exports, {
  migrateStaticBank
});
