/**
 * 难度验证分析云函数
 * 功能：分析题库中各难度级别的实际表现，验证难度标记是否准确
 *
 * 分析维度：
 * 1. 题目级别分析：每个难度级别的实际正确率
 * 2. 学生级别分析：不同水平学生的答题表现
 * 3. 知识点分析：特定知识点的难度分布
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  console.log('[难度验证分析] 开始执行...');

  const report = {
    generated_at: new Date().toISOString(),
    summary: {},
    question_level: {},
    assessment_level: {},
    student_level: {},
    recommendations: []
  };

  try {
    // ==================== 1. 题目级别分析 ====================
    console.log('[1/4] 分析题目级别数据...');

    // 获取题库中每个难度级别的统计
    const difficultyStats = {
      easy: { total: 0, avgCorrectRate: 0, questions: [] },
      medium: { total: 0, avgCorrectRate: 0, questions: [] },
      hard: { total: 0, avgCorrectRate: 0, questions: [] }
    };

    // 聚合查询：按难度分组统计
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const result = await db.collection('ai_question_pool')
        .where({ difficulty })
        .field({
          difficulty: true,
          usage_count: true,
          correct_count: true,
          subject: true,
          grade: true,
          kp_name: true
        })
        .get();

      const questions = result.data || [];
      difficultyStats[difficulty].total = questions.length;

      // 计算每个题目的正确率
      const validQuestions = questions.filter(q => q.usage_count > 0);
      const totalUsage = validQuestions.reduce((sum, q) => sum + (q.usage_count || 0), 0);
      const totalCorrect = validQuestions.reduce((sum, q) => sum + (q.correct_count || 0), 0);

      difficultyStats[difficulty].avgCorrectRate = totalUsage > 0
        ? Math.round((totalCorrect / totalUsage) * 1000) / 10
        : 0;

      difficultyStats[difficulty].questionsWithUsage = validQuestions.length;
      difficultyStats[difficulty].questionsWithoutUsage = questions.length - validQuestions.length;
    }

    report.question_level = difficultyStats;

    // ==================== 2. 评估级别分析 ====================
    console.log('[2/4] 分析评估级别数据...');

    // 获取最近的评估记录（限制100条）
    const assessmentsResult = await db.collection('assessments')
      .where({ status: 'completed' })
      .orderBy('completed_at', 'desc')
      .limit(100)
      .field({
        grade: true,
        subject: true,
        results: true,
        score: true,
        completed_at: true
      })
      .get();

    const assessments = assessmentsResult.data || [];

    // 分析评估中的难度表现
    const assessmentAnalysis = {
      totalAssessments: assessments.length,
      byDifficulty: {
        easy: { totalQuestions: 0, totalCorrect: 0, correctRate: 0 },
        medium: { totalQuestions: 0, totalCorrect: 0, correctRate: 0 },
        hard: { totalQuestions: 0, totalCorrect: 0, correctRate: 0 }
      }
    };

    assessments.forEach(assessment => {
      const results = assessment.results || [];
      results.forEach(result => {
        const difficulty = result.difficulty;
        if (difficulty && assessmentAnalysis.byDifficulty[difficulty]) {
          assessmentAnalysis.byDifficulty[difficulty].totalQuestions++;
          if (result.is_correct) {
            assessmentAnalysis.byDifficulty[difficulty].totalCorrect++;
          }
        }
      });
    });

    // 计算每个难度级别的正确率
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const stats = assessmentAnalysis.byDifficulty[difficulty];
      stats.correctRate = stats.totalQuestions > 0
        ? Math.round((stats.totalCorrect / stats.totalQuestions) * 1000) / 10
        : 0;
    }

    report.assessment_level = assessmentAnalysis;

    // ==================== 3. 学生级别分析 ====================
    console.log('[3/4] 分析学生级别数据...');

    // 按分数段分组分析
    const studentSegments = {
      high: { name: '高分段 (>=80%)', count: 0, easyRate: 0, mediumRate: 0, hardRate: 0 },
      medium: { name: '中分段 (50-79%)', count: 0, easyRate: 0, mediumRate: 0, hardRate: 0 },
      low: { name: '低分段 (<50%)', count: 0, easyRate: 0, mediumRate: 0, hardRate: 0 }
    };

    assessments.forEach(assessment => {
      const scorePercent = assessment.score?.score_percent || 0;
      const results = assessment.results || [];

      let segment;
      if (scorePercent >= 80) segment = studentSegments.high;
      else if (scorePercent >= 50) segment = studentSegments.medium;
      else segment = studentSegments.low;

      segment.count++;

      // 统计每个难度在该分数段的正确率
      const difficultyStats = { easy: { total: 0, correct: 0 }, medium: { total: 0, correct: 0 }, hard: { total: 0, correct: 0 } };

      results.forEach(result => {
        const difficulty = result.difficulty;
        if (difficulty && difficultyStats[difficulty]) {
          difficultyStats[difficulty].total++;
          if (result.is_correct) difficultyStats[difficulty].correct++;
        }
      });

      for (const diff of ['easy', 'medium', 'hard']) {
        const stats = difficultyStats[diff];
        const rate = stats.total > 0 ? (stats.correct / stats.total) : 0;
        segment[`${diff}Rate`] = (segment[`${diff}Rate`] || 0) + rate;
      }
    });

    // 计算平均正确率
    for (const segmentKey of ['high', 'medium', 'low']) {
      const segment = studentSegments[segmentKey];
      if (segment.count > 0) {
        segment.easyRate = Math.round((segment.easyRate / segment.count) * 1000) / 10;
        segment.mediumRate = Math.round((segment.mediumRate / segment.count) * 1000) / 10;
        segment.hardRate = Math.round((segment.hardRate / segment.count) * 1000) / 10;
      }
    }

    report.student_level = studentSegments;

    // ==================== 4. 生成结论和建议 ====================
    console.log('[4/4] 生成结论和建议...');

    const recommendations = [];

    // 检查题目级别的难度准确性
    const easyRate = difficultyStats.easy.avgCorrectRate;
    const mediumRate = difficultyStats.medium.avgCorrectRate;
    const hardRate = difficultyStats.hard.avgCorrectRate;

    if (easyRate < 70) {
      recommendations.push({
        level: 'CRITICAL',
        issue: '简单题实际正确率过低',
        detail: `简单题平均正确率仅 ${easyRate}%，低于70%标准`,
        impact: '可能导致学生自信心受挫',
        action: '建议重新评估"简单"题的生成标准，或降低题目难度'
      });
    } else if (easyRate > 90) {
      recommendations.push({
        level: 'INFO',
        issue: '简单题实际正确率过高',
        detail: `简单题平均正确率达 ${easyRate}%，可能过于简单`,
        impact: '无法有效区分学生水平',
        action: '建议适当提升"简单"题难度'
      });
    } else {
      recommendations.push({
        level: 'PASS',
        issue: '简单题难度合理',
        detail: `简单题平均正确率 ${easyRate}%，在合理范围(70-90%)`
      });
    }

    if (mediumRate < 40 || mediumRate > 70) {
      recommendations.push({
        level: 'WARNING',
        issue: '中等题难度分布异常',
        detail: `中等题平均正确率 ${mediumRate}%，理想范围应为40-70%`,
        action: mediumRate < 40 ? '建议降低中等题难度' : '建议提升中等题难度'
      });
    } else {
      recommendations.push({
        level: 'PASS',
        issue: '中等题难度合理',
        detail: `中等题平均正确率 ${mediumRate}%，在合理范围(40-70%)`
      });
    }

    if (hardRate > 50) {
      recommendations.push({
        level: 'CRITICAL',
        issue: '困难题实际正确率过高',
        detail: `困难题平均正确率达 ${hardRate}%，高于50%标准`,
        impact: '困难题失去挑战性',
        action: '建议提升困难题难度'
      });
    } else if (hardRate < 15) {
      recommendations.push({
        level: 'WARNING',
        issue: '困难题可能过难',
        detail: `困难题平均正确率仅 ${hardRate}%，可能导致学生挫败`,
        action: '检查困难题是否超出年级范围'
      });
    } else {
      recommendations.push({
        level: 'PASS',
        issue: '困难题难度合理',
        detail: `困难题平均正确率 ${hardRate}%，在合理范围(15-50%)`
      });
    }

    // 检查数据量
    const totalQuestions = difficultyStats.easy.total + difficultyStats.medium.total + difficultyStats.hard.total;
    if (totalQuestions < 100) {
      recommendations.push({
        level: 'WARNING',
        issue: '数据量不足',
        detail: `题库仅 ${totalQuestions} 题，分析结果可能不够可靠`,
        action: '建议积累更多数据后再进行分析'
      });
    }

    // 检查未使用题目
    const unusedQuestions = difficultyStats.easy.questionsWithoutUsage +
                            difficultyStats.medium.questionsWithoutUsage +
                            difficultyStats.hard.questionsWithoutUsage;
    if (unusedQuestions > totalQuestions * 0.5) {
      recommendations.push({
        level: 'INFO',
        issue: '大量题目未被使用',
        detail: `${unusedQuestions} 道题目 (${Math.round(unusedQuestions/totalQuestions*100)}%) 从未被使用`,
        action: '考虑清理旧题目或增加题目曝光机会'
      });
    }

    report.recommendations = recommendations;

    // ==================== 生成总结 ====================
    report.summary = {
      total_questions: totalQuestions,
      total_assessments: assessmentAnalysis.totalAssessments,
      difficulty_distribution: {
        easy: difficultyStats.easy.total,
        medium: difficultyStats.medium.total,
        hard: difficultyStats.hard.total
      },
      actual_correct_rates: {
        easy: easyRate,
        medium: mediumRate,
        hard: hardRate
      },
      overall_health: recommendations.some(r => r.level === 'CRITICAL') ? '需要改进' :
                     recommendations.some(r => r.level === 'WARNING') ? '基本可用' :
                     '健康'
    };

    console.log('[难度验证分析] 分析完成');

    return {
      success: true,
      report
    };

  } catch (e) {
    console.error('[难度验证分析] 执行失败:', e);
    return {
      success: false,
      error: e.message,
      report
    };
  }
};
