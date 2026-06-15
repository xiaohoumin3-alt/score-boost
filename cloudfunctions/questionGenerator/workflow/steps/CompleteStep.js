/**
 * 完成步骤
 *
 * 职责：更新队列状态为 completed，并补充 assessment 的 questions 字段
 */

const { BaseStep } = require('../BaseStep');

/**
 * 完成步骤
 */
class CompleteStep extends BaseStep {
  /**
   * @param {Object} options - 步骤选项
   * @param {Array<string>} options.dependencies - 依赖的步骤名称列表
   */
  constructor(options = {}) {
    super('Complete', {
      checkCancelled: false,  // 状态更新步骤不需要取消检测
      dependencies: options.dependencies || ['CreateAssessment']
    });
  }

  /**
   * 执行步骤：更新队列状态为 completed，并补充 assessment 题目数据
   * @param {TaskContext} ctx - 任务上下文
   * @returns {Promise<StepResult>} 执行结果
   */
  async execute(ctx) {
    const { task, db, state } = ctx;

    try {
      // 获取 assessmentId
      const { STEP_OUTPUT_KEYS } = require('../constants');
      const assessmentId = state.get(STEP_OUTPUT_KEYS.ASSESSMENT_ID);
      const questionIds = state.get(STEP_OUTPUT_KEYS.QUESTION_IDS) || [];

      console.log('[CompleteStep] === START ===');
      console.log('[CompleteStep] task._id:', task._id);
      console.log('[CompleteStep] assessmentId:', assessmentId);
      console.log('[CompleteStep] questionIds count:', questionIds.length);
      console.log('[CompleteStep] questionIds:', JSON.stringify(questionIds));

      // 使用 updateQueueStatus 函数
      const { updateQueueStatus } = require('../utils/updateQueueStatus');

      // 深度测评：不更新 assessments，查询题池可用题数并去重
      if (task.type === 'extended_assessment') {
        console.log(`[CompleteStep] extended_assessment mode, querying pool for available questions`);

        // 查询题池可用题数（新保存题 + 已有同边界可用题）
        const poolQuery = {
          grade: String(task.grade || ''),
          subject: task.subject,
        };
        const verifiedResult = await db.collection('ai_question_pool')
          .where({ ...poolQuery, verified: true })
          .get();
        const unverifiedResult = await db.collection('ai_question_pool')
          .where({ ...poolQuery, verified: false })
          .get();

        const verifiedQuestionIds = (verifiedResult.data || []).map(q => q._id);
        const unverifiedQuestionIds = (unverifiedResult.data || []).map(q => q._id);
        const existingQuestionIds = [...verifiedQuestionIds, ...unverifiedQuestionIds];

        // 去重：新保存题 + 已有可用题
        const allQuestionIds = [...new Set([...questionIds, ...existingQuestionIds])];
        const finalCount = allQuestionIds.length;

        console.log(`[CompleteStep] extended_assessment final available questions: ${finalCount} (new: ${questionIds.length}, existing: ${existingQuestionIds.length})`);

        // 去重题数 >= task.num_questions 才标记 completed
        if (finalCount < (task.num_questions || 5)) {
          console.warn(`[CompleteStep] extended_assessment insufficient questions: ${finalCount} < ${task.num_questions || 5}`);
          return {
            success: false,
            error: new Error(`题池可用题数不足：${finalCount} < ${task.num_questions || 5}`),
            shouldAbort: false
          };
        }

        // 写回 question_ids 和 timeline.completed_at
        const updateFields = {
          question_ids: allQuestionIds,
          timeline: {
            completed_at: new Date().toISOString()
          }
        };
        const result = await updateQueueStatus(db, task._id, 'completed', updateFields);

        if (!result.success) {
          return {
            success: false,
            error: new Error(result.error || 'Failed to update status'),
            shouldAbort: false
          };
        }

        console.log(`[CompleteStep] extended_assessment completed with ${allQuestionIds.length} questions`);
        return {
          success: true,
          data: {
            [STEP_OUTPUT_KEYS.QUESTION_IDS]: allQuestionIds
          }
        };
      }

      // 从 ai_question_pool 获取完整题目数据
      const questions = [];
      if (questionIds.length > 0) {
        console.log('[CompleteStep] Fetching from ai_question_pool...');
        const poolResult = await db.collection('ai_question_pool')
          .where({
            _id: db.command.in(questionIds)
          })
          .get();

        console.log('[CompleteStep] Pool result count:', poolResult.data?.length || 0);

        if (poolResult.data && poolResult.data.length > 0) {
          // 诊断：打印第一个问题的完整结构
          if (poolResult.data.length > 0) {
            console.log('[CompleteStep] First question keys:', Object.keys(poolResult.data[0]));
            console.log('[CompleteStep] First question sample:', JSON.stringify(poolResult.data[0]).substring(0, 300));
          }

          for (const q of poolResult.data) {
            // 使用 pool_id 或 _id 作为文档 ID
            const docId = q.pool_id || q._id;
            const questionContent = q.question || q.content || '';

            console.log('[CompleteStep] Processing question: docId=', docId, 'hasQuestion=', !!questionContent);

            // 验证必要字段
            if (!docId || !questionContent) {
              console.log('[CompleteStep] Skipping invalid question: docId=', docId, ', hasQuestion=', !!questionContent);
              continue;
            }

            // 处理 correct_answer：支持字母和数字两种格式
            let correctAnswer = q.correct_answer;
            if (typeof correctAnswer === 'string') {
              // 字母格式 (A, B, C, D) 转换为数字索引
              const letterToNum = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5 };
              const upperAnswer = correctAnswer.toUpperCase().trim();
              correctAnswer = letterToNum[upperAnswer] !== undefined ? letterToNum[upperAnswer] : 0;
            }
            // 如果不是数字也不是有效字母，默认为 0
            if (typeof correctAnswer !== 'number' || isNaN(correctAnswer)) {
              correctAnswer = 0;
            }

            questions.push({
              id: docId,
              type: q.question_type || 'choice',
              content: questionContent,
              options: Array.isArray(q.options) ? q.options : [],
              correct_answer: correctAnswer,
              knowledge_point: q.kp_name || '',
              knowledge_point_id: q.kp_id || '',
              difficulty: q.difficulty || 'medium'
            });
          }
        }
      }

      console.log('[CompleteStep] Questions prepared:', questions.length);

      // 根据任务类型设置不同的完成数据
      const updateFields = {
        timeline: {
          completed_at: new Date().toISOString()
        }
      };

      // 亲子测评/孩子题：传递 question_ids 供调用方获取题目
      if (task.type === 'parent_assessment' || task.type === 'child_assessment') {
        // 更新 assessment 记录（如果有）
        if (assessmentId && questions.length > 0) {
          console.log('[CompleteStep] Updating assessment:', assessmentId);
          try {
            await db.collection('assessments')
              .where({ assessment_id: assessmentId })
              .update({
                questions: questions,
                status: 'in_progress'
              });
          } catch (e) {
            console.error('[CompleteStep] Assessment update failed:', e.message);
          }
        }

        updateFields.question_ids = questionIds;
        if (task.assessment_id) {
          updateFields.assessment_id = task.assessment_id;
        }
        console.log(`[CompleteStep] ${task.type} mode, returning question_ids:`, questionIds.length);
      } else {
        // 默认流程：更新 assessment 并传递 assessment_id
        if (questions.length > 0) {
          console.log('[CompleteStep] Updating assessment:', assessmentId);
          try {
            const updateResult = await db.collection('assessments')
              .where({ assessment_id: assessmentId })
              .update({
                questions: questions,
                status: 'in_progress'
              });
            console.log('[CompleteStep] Assessment update result:', JSON.stringify(updateResult));
          } catch (e) {
            console.error('[CompleteStep] Assessment update failed:', e.message);
            // 继续执行，不因为 assessment 更新失败而终止
          }
        } else {
          console.log('[CompleteStep] NO QUESTIONS to update - questions.length is 0!');
        }

        updateFields.generated_assessment_id = assessmentId;
      }

      const result = await updateQueueStatus(db, task._id, 'completed', updateFields);

      if (!result.success) {
        return {
          success: false,
          error: new Error(result.error || 'Failed to update status'),
          shouldAbort: false
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error,
        shouldAbort: false
      };
    }
  }
}

module.exports = { CompleteStep };
