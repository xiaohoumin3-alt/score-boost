/**
 * IRT精度验证分析云函数
 * 功能：验证IRT模型和分数预估的准确性
 *
 * 验证维度：
 * 1. IRT参数覆盖率与来源分布
 * 2. θ（能力值）估计稳定性
 * 3. 预估分数准确性分析
 * 4. 2PL模型拟合度检验
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  console.log('[IRT精度验证] 开始执行...');

  const report = {
    generated_at: new Date().toISOString(),
    summary: {},
    parameter_coverage: {},
    theta_stability: {},
    estimation_accuracy: {},
    model_fit: {},
    recommendations: []
  };

  try {
    // ==================== 1. IRT参数覆盖率分析 ====================
    console.log('[1/5] 分析IRT参数覆盖率...');

    // 获取题库总数和IRT参数覆盖情况
    const totalResult = await db.collection('ai_question_pool').count();
    const totalQuestions = totalResult.total || 0;

    // 统计各类参数来源的题目数量
    const withIRT = await db.collection('ai_question_pool')
      .where({ irt_a: _.exists(true) })
      .count();

    // 采样分析参数来源
    const sampleResult = await db.collection('ai_question_pool')
      .field({ irt_source: true, irt_a: true, irt_b: true, difficulty: true })
      .limit(500)
      .get();

    const sourceStats = {
      precomputed: 0,      // 已有IRT参数（种子数据）
      data_driven: 0,     // 基于答题数据估计
      research_based: 0,  // 基于研究参数生成
      cold_start: 0,      // 冷启动默认值
      rule_based: 0,      // 基于规则生成
      unknown: 0          // 未知来源
    };

    const difficultyDistribution = { easy: 0, medium: 0, hard: 0 };

    sampleResult.data.forEach(q => {
      const source = q.irt_source || 'unknown';
      if (sourceStats.hasOwnProperty(source)) {
        sourceStats[source]++;
      } else {
        sourceStats.unknown++;
      }

      const diff = q.difficulty || 'medium';
      if (difficultyDistribution.hasOwnProperty(diff)) {
        difficultyDistribution[diff]++;
      }
    });

    // 推算整体分布（基于采样比例）
    const sampleRate = Math.min(1, sampleResult.data.length / Math.max(1, totalQuestions));

    report.parameter_coverage = {
      total_questions: totalQuestions,
      with_irt_params: withIRT.total || 0,
      coverage_percent: totalQuestions > 0 ? Math.round((withIRT.total / totalQuestions) * 100) : 0,
      sample_size: sampleResult.data.length,
      source_distribution: sourceStats,
      source_percentages: Object.fromEntries(
        Object.entries(sourceStats).map(([k, v]) => [
          k,
          sampleResult.data.length > 0 ? Math.round((v / sampleResult.data.length) * 100) : 0
        ])
      ),
      difficulty_distribution: difficultyDistribution
    };

    // ==================== 2. θ估计稳定性分析 ====================
    console.log('[2/5] 分析θ估计稳定性...');

    // 获取有多次测评记录的学生（同一openid多次测评）
    const assessmentsResult = await db.collection('assessments')
      .where({ status: 'completed' })
      .orderBy('completed_at', 'desc')
      .limit(200)
      .field({
        openid: true,
        subject: true,
        grade: true,
        score: true,
        score_estimation: true,
        completed_at: true
      })
      .get();

    const assessments = assessmentsResult.data || [];

    // 按学生分组
    const studentAssessments = {};
    assessments.forEach(a => {
      const openid = a.openid || 'unknown';
      if (!studentAssessments[openid]) {
        studentAssessments[openid] = [];
      }
      studentAssessments[openid].push(a);
    });

    // 找出有多次测评的学生
    const multiTestStudents = Object.entries(studentAssessments)
      .filter(([_, assessments]) => assessments.length >= 2)
      .map(([openid, assessments]) => ({
        openid,
        count: assessments.length,
        assessments: assessments.sort((a, b) =>
          new Date(a.completed_at || 0) - new Date(b.completed_at || 0)
        )
      }));

    // 分析θ值变化
    const thetaVariations = [];
    multiTestStudents.forEach(student => {
      const thetas = student.assessments
        .map(a => a.score_estimation?.theta)
        .filter(t => t !== undefined && t !== null);

      if (thetas.length >= 2) {
        const min = Math.min(...thetas);
        const max = Math.max(...thetas);
        const range = max - min;
        const avg = thetas.reduce((sum, t) => sum + t, 0) / thetas.length;
        const variance = thetas.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / thetas.length;
        const stdDev = Math.sqrt(variance);

        thetaVariations.push({
          range,
          stdDev,
          count: thetas.length,
          thetas
        });
      }
    });

    // 统计θ变化情况
    const stableTheta = thetaVariations.filter(v => v.range < 0.5).length;
    const moderateTheta = thetaVariations.filter(v => v.range >= 0.5 && v.range < 1.5).length;
    const volatileTheta = thetaVariations.filter(v => v.range >= 1.5).length;

    report.theta_stability = {
      total_students: Object.keys(studentAssessments).length,
      multi_test_students: multiTestStudents.length,
      theta_variations_analyzed: thetaVariations.length,
      stability_distribution: {
        stable: stableTheta,      // 变化 < 0.5
        moderate: moderateTheta,  // 0.5 ≤ 变化 < 1.5
        volatile: volatileTheta   // 变化 ≥ 1.5
      },
      stability_percentages: thetaVariations.length > 0 ? {
        stable: Math.round((stableTheta / thetaVariations.length) * 100),
        moderate: Math.round((moderateTheta / thetaVariations.length) * 100),
        volatile: Math.round((volatileTheta / thetaVariations.length) * 100)
      } : {},
      avg_std_dev: thetaVariations.length > 0
        ? Math.round((thetaVariations.reduce((sum, v) => sum + v.stdDev, 0) / thetaVariations.length) * 1000) / 1000
        : 0
    };

    // ==================== 3. 预估分数准确性分析 ====================
    console.log('[3/5] 分析预估分数准确性...');

    // 分析预估分数与实际正确率的一致性
    const accuracyAnalysis = {
      high_score: { count: 0, avg_correct_rate: 0, avg_theta: 0 },
      mid_score: { count: 0, avg_correct_rate: 0, avg_theta: 0 },
      low_score: { count: 0, avg_correct_rate: 0, avg_theta: 0 }
    };

    assessments.forEach(a => {
      const estScore = a.score_estimation?.estimatedScore || 0;
      const theta = a.score_estimation?.theta || 0;
      const correctRate = a.score?.score_percent || 0;

      let segment;
      if (estScore >= 80) segment = accuracyAnalysis.high_score;
      else if (estScore >= 60) segment = accuracyAnalysis.mid_score;
      else segment = accuracyAnalysis.low_score;

      segment.count++;
      segment.avg_correct_rate += correctRate;
      segment.avg_theta += theta;
    });

    // 计算平均值
    for (const key of ['high_score', 'mid_score', 'low_score']) {
      const segment = accuracyAnalysis[key];
      if (segment.count > 0) {
        segment.avg_correct_rate = Math.round((segment.avg_correct_rate / segment.count) * 10) / 10;
        segment.avg_theta = Math.round((segment.avg_theta / segment.count) * 100) / 100;
      }
    }

    report.estimation_accuracy = accuracyAnalysis;

    // ==================== 4. 2PL模型拟合度检验 ====================
    console.log('[4/5] 检验2PL模型拟合度...');

    // 检查题目参数是否在合理范围内
    const paramRanges = {
      a_in_range: 0,        // a ∈ [0.5, 2.5]
      a_too_low: 0,         // a < 0.5
      a_too_high: 0,        // a > 2.5
      b_in_range: 0,        // b ∈ [-3, 3]
      b_out_of_range: 0      // b ∉ [-3, 3]
    };

    sampleResult.data.forEach(q => {
      const a = q.irt_a;
      const b = q.irt_b;

      if (a !== undefined) {
        if (a >= 0.5 && a <= 2.5) paramRanges.a_in_range++;
        else if (a < 0.5) paramRanges.a_too_low++;
        else paramRanges.a_too_high++;
      }

      if (b !== undefined) {
        if (b >= -3 && b <= 3) paramRanges.b_in_range++;
        else paramRanges.b_out_of_range++;
      }
    });

    report.model_fit = {
      parameter_ranges: paramRanges,
      parameter_validity: {
        a_valid_percent: sampleResult.data.length > 0
          ? Math.round((paramRanges.a_in_range / sampleResult.data.filter(q => q.irt_a !== undefined).length) * 100)
          : 0,
        b_valid_percent: sampleResult.data.length > 0
          ? Math.round((paramRanges.b_in_range / sampleResult.data.filter(q => q.irt_b !== undefined).length) * 100)
          : 0
      }
    };

    // ==================== 5. 生成结论和建议 ====================
    console.log('[5/5] 生成结论和建议...');

    const recommendations = [];

    // 检查IRT参数覆盖率
    if (report.parameter_coverage.coverage_percent < 50) {
      recommendations.push({
        level: 'CRITICAL',
        issue: 'IRT参数覆盖率过低',
        detail: `仅 ${report.parameter_coverage.coverage_percent}% 的题目有IRT参数`,
        impact: '大部分题目使用冷启动默认值，精度无法保证',
        action: '建议优先使用irtParameterUpdate云函数为题目生成IRT参数'
      });
    } else if (report.parameter_coverage.coverage_percent < 80) {
      recommendations.push({
        level: 'WARNING',
        issue: 'IRT参数覆盖率不足',
        detail: `${report.parameter_coverage.coverage_percent}% 的题目有IRT参数`,
        action: '建议逐步提升覆盖率至80%以上'
      });
    } else {
      recommendations.push({
        level: 'PASS',
        issue: 'IRT参数覆盖率良好',
        detail: `${report.parameter_coverage.coverage_percent}% 的题目有IRT参数`
      });
    }

    // 检查数据驱动参数占比
    const dataDrivenPercent = report.parameter_coverage.source_percentages?.data_driven || 0;
    if (dataDrivenPercent < 20) {
      recommendations.push({
        level: 'WARNING',
        issue: '基于真实答题数据的参数过少',
        detail: `仅 ${dataDrivenPercent}% 的题目使用数据驱动参数`,
        action: '鼓励更多用户答题，积累数据后重新估计参数'
      });
    }

    // 检查θ估计稳定性
    const volatilePercent = report.theta_stability.stability_percentages?.volatile || 0;
    if (volatilePercent > 30) {
      recommendations.push({
        level: 'WARNING',
        issue: 'θ估计值波动较大',
        detail: `${volatilePercent}% 的学生θ值波动超过1.5`,
        action: '检查题目参数是否稳定，考虑增加题目数量'
      });
    }

    // 检查预估分数一致性
    const highScoreRate = report.estimation_accuracy.high_score.avg_correct_rate;
    const lowScoreRate = report.estimation_accuracy.low_score.avg_correct_rate;

    if (highScoreRate < 70) {
      recommendations.push({
        level: 'CRITICAL',
        issue: '高分预估与实际表现不一致',
        detail: `预估80分以上的学生平均正确率仅 ${highScoreRate}%`,
        action: '检查分数映射器是否过于乐观'
      });
    }

    if (lowScoreRate > 60) {
      recommendations.push({
        level: 'CRITICAL',
        issue: '低分预估与实际表现不一致',
        detail: `预估60分以下的学生平均正确率达 ${lowScoreRate}%`,
        action: '检查分数映射器是否过于悲观'
      });
    }

    // 检查模型拟合度
    const aValidPercent = report.model_fit.parameter_validity.a_valid_percent;
    if (aValidPercent < 90) {
      recommendations.push({
        level: 'WARNING',
        issue: '部分题目区分度参数异常',
        detail: `${100 - aValidPercent}% 的题目a参数不在[0.5, 2.5]范围内`,
        action: '检查异常题目参数，考虑重新标定'
      });
    }

    // 检查数据量
    if (assessments.length < 100) {
      recommendations.push({
        level: 'INFO',
        issue: '数据量较少',
        detail: `仅 ${assessments.length} 条测评记录`,
        action: '建议积累更多数据后再进行精度验证'
      });
    }

    report.recommendations = recommendations;

    // ==================== 生成总结 ====================
    report.summary = {
      irt_coverage: report.parameter_coverage.coverage_percent,
      theta_stability: volatilePercent < 30 ? 'stable' : 'needs_attention',
      estimation_consistency: (highScoreRate >= 70 && lowScoreRate <= 60) ? 'good' : 'needs_review',
      model_fit: aValidPercent >= 90 ? 'adequate' : 'has_issues',
      overall_health: recommendations.some(r => r.level === 'CRITICAL') ? '需要改进' :
                     recommendations.some(r => r.level === 'WARNING') ? '基本可用' :
                     '健康'
    };

    console.log('[IRT精度验证] 分析完成');

    return {
      success: true,
      report
    };

  } catch (e) {
    console.error('[IRT精度验证] 执行失败:', e);
    return {
      success: false,
      error: e.message,
      report
    };
  }
};
