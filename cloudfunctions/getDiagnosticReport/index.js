/**
 * 诊断报告云函数
 * 生成家长可见的周报：包含错误类型统计、知识点掌握情况、改进建议
 * 
 * 导师诊断核心：让家长不用看专业术语，也能理解孩子的学习状态
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const params = event.data || event || {};
    const studentId = params.student_id || event.student_id;
    const period = params.period || 'week'; // week / month

    if (!studentId) {
      return { success: false, error: '缺少 student_id' };
    }

    // 计算时间范围
    const now = new Date();
    const periodDays = period === 'month' ? 30 : 7;
    const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // 1. 获取 kp_progress 中该学生的所有进度记录
    const progressRes = await db.collection('kp_progress')
      .where({ student_id: studentId })
      .get();

    const allProgress = progressRes.data || [];

    // 2. 统计错误类型（从 error_stats 字段）
    const errorStats = { careless: 0, concept: 0, calculation: 0, unknown: 0 };
    const kpErrorStats = {}; // 按知识点统计错误类型

    for (const progress of allProgress) {
      if (progress.error_stats) {
        errorStats.careless += progress.error_stats.careless || 0;
        errorStats.concept += progress.error_stats.concept || 0;
        errorStats.calculation += progress.error_stats.calculation || 0;
        errorStats.unknown += progress.error_stats.unknown || 0;
      }

      // 按知识点记录错误
      if (progress.kp_id && progress.error_stats) {
        kpErrorStats[progress.kp_id] = {
          kp_name: progress.kp_name || progress.kp_id,
          ...progress.error_stats
        };
      }
    }

    const totalErrors = errorStats.careless + errorStats.concept + errorStats.calculation + errorStats.unknown;

    // 3. 计算知识点掌握情况
    const kpMastery = allProgress.map(p => ({
      kp_id: p.kp_id,
      kp_name: p.kp_name || p.kp_id,
      difficulty: p.current_difficulty || 'easy',
      total_attempts: p.total_attempts || 0,
      mastered: p[p.current_difficulty]?.mastered || false,
      consecutive_correct: p[p.current_difficulty]?.consecutive_correct || 0,
      last_reviewed: p.last_reviewed_at,
    }));

    // 4. 找出需要重点关注的知识点
    const weakKps = kpMastery
      .filter(kp => !kp.mastered && kp.total_attempts > 0)
      .sort((a, b) => {
        // 优先关注错误多的
        const aErrors = (kpErrorStats[a.kp_id]?.careless || 0) + (kpErrorStats[a.kp_id]?.concept || 0) + (kpErrorStats[a.kp_id]?.calculation || 0);
        const bErrors = (kpErrorStats[b.kp_id]?.careless || 0) + (kpErrorStats[b.kp_id]?.concept || 0) + (kpErrorStats[b.kp_id]?.calculation || 0);
        return bErrors - aErrors;
      })
      .slice(0, 3);

    // 5. 生成改进建议
    const suggestions = generateSuggestions(errorStats, weakKps);

    // 6. 统计本周练习次数
    const practiceCount = allProgress.filter(p => {
      if (!p.last_reviewed_at) return false;
      return new Date(p.last_reviewed_at) >= startDate;
    }).length;

    // 7. 生成报告
    const report = {
      success: true,
      data: {
        student_id: studentId,
        period: period,
        generated_at: now.toISOString(),

        // 摘要
        summary: {
          total_errors: totalErrors,
          practice_count: practiceCount,
          dominant_error_type: getDominantErrorType(errorStats),
          overall_status: getOverallStatus(errorStats, weakKps),
        },

        // 错误类型统计
        error_stats: {
          careless: errorStats.careless,
          concept: errorStats.concept,
          calculation: errorStats.calculation,
          unknown: errorStats.unknown,
          percentage: totalErrors > 0 ? {
            careless: Math.round(errorStats.careless / totalErrors * 100),
            concept: Math.round(errorStats.concept / totalErrors * 100),
            calculation: Math.round(errorStats.calculation / totalErrors * 100),
          } : { careless: 0, concept: 0, calculation: 0 },
        },

        // 薄弱知识点
        weak_knowledge_points: weakKps.map(kp => ({
          kp_name: kp.kp_name,
          error_breakdown: kpErrorStats[kp.kp_id] || { careless: 0, concept: 0, calculation: 0 },
        })),

        // 建议
        suggestions: suggestions,

        // 给家长的话（自然语言）
        parent_summary: generateParentSummary(errorStats, weakKps, practiceCount),
      }
    };

    return report;

  } catch (e) {
    console.error('[getDiagnosticReport] Error:', e);
    return { success: false, error: e.message || String(e) };
  }
};

/**
 * 获取主要错误类型
 */
function getDominantErrorType(errorStats) {
  if (errorStats.careless >= errorStats.concept && errorStats.careless >= errorStats.calculation) {
    return 'careless';
  }
  if (errorStats.concept >= errorStats.calculation) {
    return 'concept';
  }
  if (errorStats.calculation > 0) {
    return 'calculation';
  }
  return null;
}

/**
 * 获取整体状态
 */
function getOverallStatus(errorStats, weakKps) {
  const total = errorStats.careless + errorStats.concept + errorStats.calculation;
  
  if (total === 0) return 'excellent';
  if (total <= 3) return 'good';
  if (errorStats.concept > errorStats.careless) return 'needs_concept_review';
  if (errorStats.calculation > errorStats.careless) return 'needs_calculation_practice';
  return 'needs_careful_review';
}

/**
 * 生成改进建议
 */
function generateSuggestions(errorStats, weakKps) {
  const suggestions = [];

  if (errorStats.careless > errorStats.concept && errorStats.careless > errorStats.calculation) {
    suggestions.push({
      type: 'careless',
      title: '培养仔细审题的习惯',
      description: '这周粗心错误较多，建议：1) 读题时用手指点着逐字读 2) 做完检查一遍再提交',
      priority: 'high',
    });
  }

  if (errorStats.concept > 0) {
    suggestions.push({
      type: 'concept',
      title: '回顾核心概念',
      description: '有些知识点理解不够清晰，建议每天花5分钟回顾今天学的定义和公式',
      priority: errorStats.concept > 2 ? 'high' : 'medium',
    });
  }

  if (errorStats.calculation > 0) {
    suggestions.push({
      type: 'calculation',
      title: '专项计算训练',
      description: '计算出错较多，建议按步骤写过程，不要跳步',
      priority: errorStats.calculation > 2 ? 'high' : 'medium',
    });
  }

  if (weakKps.length > 0) {
    suggestions.push({
      type: 'practice',
      title: '重点练习薄弱知识点',
      description: `建议重点练习：${weakKps.map(k => k.kp_name).join('、')}`,
      priority: 'medium',
    });
  }

  return suggestions;
}

/**
 * 生成给家长的自然语言总结
 */
function generateParentSummary(errorStats, weakKps, practiceCount) {
  const total = errorStats.careless + errorStats.concept + errorStats.calculation;

  if (total === 0) {
    return `这周孩子表现很棒！没有错误，都是正确的。继续保持！`;
  }

  const lines = [`本周共出现 ${total} 次错误。`];

  if (errorStats.careless > 0) {
    lines.push(`其中 ${errorStats.careless} 次是粗心问题（审题/计算不仔细），这是最容易改进的，建议提醒孩子放慢审题速度。`);
  }

  if (errorStats.concept > 0) {
    lines.push(`${errorStats.concept} 次是概念理解问题，需要回顾相关知识点定义。`);
  }

  if (errorStats.calculation > 0) {
    lines.push(`${errorStats.calculation} 次是计算问题，建议按步骤写，不要跳步。`);
  }

  if (weakKps.length > 0) {
    lines.push(`本周重点关注：${weakKps.map(k => k.kp_name).join('、')}。`);
  }

  if (practiceCount > 0) {
    lines.push(`本周共练习 ${practiceCount} 个知识点。`);
  }

  return lines.join(' ');
}
