/**
 * testIRTSystem 云函数
 * 端到端测试 IRT 系统 + 检查答题数据统计
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { action = 'test' } = event;
  const db = cloud.database();
  const _ = db.command;

  if (action === 'test') {
    // 端到端测试
    const assessments = await db.collection('assessments')
      .where({ status: 'completed' })
      .limit(1)
      .get();

    if (assessments.data.length === 0) {
      return { success: true, message: '没有已完成的测评', data: { hasCompletedAssessment: false } };
    }

    const assessment = assessments.data[0];
    const calibrationResult = await cloud.callFunction({
      name: 'scoreCalibration',
      data: { assessment_id: assessment.assessment_id }
    });

    return {
      success: true,
      message: 'IRT 系统测试成功',
      data: {
        assessment_id: assessment.assessment_id,
        subject: assessment.subject,
        grade: assessment.grade,
        question_count: assessment.results?.length || 0,
        score_estimation: calibrationResult.result,
      }
    };
  }

  if (action === 'checkStats') {
    // 检查答题数据统计
    const poolStats = await db.collection('ai_question_pool')
      .where({ usage_count: _.gt(0) })
      .limit(1000)
      .field({ usage_count: true, correct_count: true, irt_a: true, irt_b: true })
      .get();

    let totalUsage = 0;
    let totalCorrect = 0;
    let withData = 0;
    const usageDistribution = {};

    for (const q of poolStats.data) {
      const usage = q.usage_count || 0;
      totalUsage += usage;
      totalCorrect += q.correct_count || 0;
      if (usage > 0) withData++;
      usageDistribution[usage] = (usageDistribution[usage] || 0) + 1;
    }

    return {
      success: true,
      data: {
        totalQuestions: poolStats.data.length,
        questionsWithData: withData,
        totalAnswers: totalUsage,
        totalCorrect: totalCorrect,
        overallCorrectRate: totalUsage > 0 ? Math.round(totalCorrect / totalUsage * 1000) / 10 : 0,
        usageDistribution: Object.entries(usageDistribution).sort((a, b) => parseInt(a[0]) - parseInt(b[0])),
      }
    };
  }

  return { success: false, error: 'Unknown action' };
};
