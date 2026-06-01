/**
 * 工作流步骤输出键名约定
 *
 * 用于步骤间数据传递，确保键名统一，避免魔法字符串
 */
const STEP_OUTPUT_KEYS = {
  /** GenerateStep 输出：生成的题目列表 */
  QUESTIONS: 'questions',
  /** SaveQuestionsStep 输出：保存后的题目ID列表 */
  QUESTION_IDS: 'questionIds',
  /** CreateAssessmentStep 输出：创建的assessment ID */
  ASSESSMENT_ID: 'assessmentId'
};

module.exports = {
  STEP_OUTPUT_KEYS
};
