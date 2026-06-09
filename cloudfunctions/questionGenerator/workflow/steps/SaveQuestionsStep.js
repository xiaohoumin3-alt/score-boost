/**
 * 保存题目步骤
 *
 * 职责：保存题目到 ai_question_pool，支持回滚
 */

const { BaseStep } = require('../BaseStep');
const { normalizeQuestion } = require('../../shared/question-normalizer');
const { checkDuplicate } = require('../../shared/dedup');
const { STEP_OUTPUT_KEYS } = require('../constants');

/**
 * 保存题目步骤
 */
class SaveQuestionsStep extends BaseStep {
  constructor() {
    super('SaveQuestions', {
      checkCancelled: true,  // 需要取消检测
      dependencies: ['Generate'],
      outputKey: STEP_OUTPUT_KEYS.QUESTION_IDS
    });
  }

  /**
   * 执行步骤：保存题目到 ai_question_pool
   * @param {TaskContext} ctx - 任务上下文
   * @returns {Promise<StepResult>} 执行结果
   */
  async execute(ctx) {
    const { task, db } = ctx;

    // 使用约定键名获取前置步骤输出
    const questions = ctx.getRequired(STEP_OUTPUT_KEYS.QUESTIONS);

    console.log('[SaveQuestionsStep] === START ===');
    console.log('[SaveQuestionsStep] task._id:', task._id);
    console.log('[SaveQuestionsStep] questions count:', questions?.length || 0);
    console.log('[SaveQuestionsStep] sample questions:', questions?.slice(0, 2).map(q => ({ id: q.id, content: q.content?.substring(0, 30) })));

    if (!Array.isArray(questions) || questions.length === 0) {
      console.log('[SaveQuestionsStep] ERROR: No questions to save!');
      return {
        success: false,
        shouldAbort: false, // 数据验证失败，不需要回滚
        error: new Error('No questions to save')
      };
    }

    let skippedCount = 0;
    let skippedReasons = { noContent: 0, noOptions: 0, duplicate: 0, other: 0 };
    const questionIds = [];
    try {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`[SaveQuestionsStep] Processing question ${i + 1}/${questions.length}:`, JSON.stringify({
          hasContent: !!(q.content || q.question),
          hasOptions: !!(q.options && Array.isArray(q.options) && q.options.length >= 2),
          subject: q.subject,
          source: q.source
        }));

        // 移除可能的重复键字段，让数据库自动生成_id
        const { _id, pool_id, id, ...questionData } = q;

        // 确保 content 字段存在（题池旧数据可能缺少此字段）
        if (!questionData.content && questionData.question) {
          questionData.content = questionData.question;
        }

        // 确保 options 是字符串数组（题池旧数据可能是对象数组或空数组）
        if (questionData.options && Array.isArray(questionData.options)) {
          questionData.options = questionData.options.map(opt => {
            if (typeof opt === 'string') return opt;
            if (typeof opt === 'object' && opt !== null) return opt.value || opt.text || String(opt);
            return String(opt);
          });
        }

        // 如果仍然没有 content 或选项不足，跳过此题
        if (!questionData.content) {
          console.warn(`[SaveQuestionsStep] [${i}] Skipping - no content. Original:`, JSON.stringify(q).substring(0, 100));
          skippedCount++;
          skippedReasons.noContent++;
          continue;
        }
        if (!questionData.options || !Array.isArray(questionData.options) || questionData.options.length < 2) {
          console.warn(`[SaveQuestionsStep] [${i}] Skipping - insufficient options. Has ${questionData.options?.length || 0} options`);
          skippedCount++;
          skippedReasons.noOptions++;
          continue;
        }

        const normalizedQ = normalizeQuestion({
          ...questionData,
          subject: task.subject || questionData.subject || 'math',
          temp_task_id: task._id,
        });

        // Dedup check
        const isDup = await checkDuplicate(db, normalizedQ.question, normalizedQ.kp_id);
        if (isDup) {
          console.log(`[SaveQuestionsStep] [${i}] Skipping - duplicate:`, normalizedQ.question.substring(0, 30));
          skippedCount++;
          skippedReasons.duplicate++;
          continue;
        }

        console.log(`[SaveQuestionsStep] [${i}] PASS all checks, saving question:`, normalizedQ.question.substring(0, 30));

        const result = await db.collection('ai_question_pool').add({ data: normalizedQ });
        questionIds.push(result._id);
      }

      console.log('[SaveQuestionsStep] === SUMMARY ===');
      console.log('[SaveQuestionsStep] Total processed:', questions.length);
      console.log('[SaveQuestionsStep] Total saved:', questionIds.length);
      console.log('[SaveQuestionsStep] Total skipped:', skippedCount);
      console.log('[SaveQuestionsStep] Skip reasons:', JSON.stringify(skippedReasons));
      console.log('[SaveQuestionsStep] Question IDs:', JSON.stringify(questionIds));
    } catch (error) {
      // 数据保存失败，需要回滚已保存的数据
      return {
        success: false,
        shouldAbort: true, // 触发回滚
        error
      };
    }

    return {
      success: true,
      data: {
        [STEP_OUTPUT_KEYS.QUESTION_IDS]: questionIds
      }
    };
  }

  /**
   * 回滚：删除已保存的题目
   * @param {TaskContext} ctx - 任务上下文
   */
  async rollback(ctx) {
    const { task, db } = ctx;
    await db.collection('ai_question_pool')
      .where({ temp_task_id: task._id, verified: false })
      .remove();
  }
}

module.exports = { SaveQuestionsStep };
