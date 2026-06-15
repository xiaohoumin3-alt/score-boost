function clampNumber(value, fallback = 0) {
  return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function normalizeCountsToDistribution(counts, total) {
  const safeTotal = Math.max(1, parseInt(total || 0, 10));
  const easy = Math.max(0, clampNumber(counts.easy));
  const medium = Math.max(0, clampNumber(counts.medium));
  const hard = Math.max(0, clampNumber(counts.hard));
  const sum = easy + medium + hard;

  if (sum <= 0) {
    return { easy: 0.5, medium: 0.3, hard: 0.2 };
  }

  return {
    easy: easy / safeTotal,
    medium: medium / safeTotal,
    hard: hard / safeTotal
  };
}

function normalizeDifficultyDistribution(task = {}) {
  const dist = task.difficulty_distribution || {};
  const counts = task.difficulty_counts;

  if (counts) {
    return {
      distribution: normalizeCountsToDistribution(counts, task.num_questions),
      compatMode: false,
      source: 'difficulty_counts'
    };
  }

  const easy = clampNumber(dist.easy, 0.5);
  const medium = clampNumber(dist.medium, 0.3);
  const hard = clampNumber(dist.hard, 0.2);
  const sum = easy + medium + hard;

  if (sum > 1.5) {
    return {
      distribution: normalizeCountsToDistribution({ easy, medium, hard }, task.num_questions),
      compatMode: true,
      source: 'legacy_distribution_counts'
    };
  }

  return {
    distribution: { easy, medium, hard },
    compatMode: false,
    source: 'difficulty_distribution'
  };
}

function calculateDifficultyCounts(numQuestions, distribution) {
  const total = Math.max(0, parseInt(numQuestions || 0, 10));
  const easyRatio = clampNumber(distribution.easy, 0.5);
  const mediumRatio = clampNumber(distribution.medium, 0.3);
  let easy = Math.floor(total * easyRatio);
  let medium = Math.floor(total * mediumRatio);
  let hard = total - easy - medium;

  if (hard < 0) {
    hard = 0;
    const overflow = easy + medium - total;
    medium = Math.max(0, medium - overflow);
  }

  return { easy, medium, hard };
}

function createQuestionPlanSnapshot(plan = [], defaults = {}) {
  return (Array.isArray(plan) ? plan : [])
    .filter(item => item && item.kp)
    .map(item => ({
      kp_id: item.kp.kp_id || item.kp.id,
      kp_name: item.kp.kp_name || item.kp.name,
      chapter_id: item.kp.chapter_id,
      chapter_name: item.kp.chapter_name,
      grade: item.kp.grade || defaults.grade,
      semester: item.kp.semester || defaults.semester,
      difficulty: item.difficulty || 'medium'
    }))
    .filter(item => item.kp_name);
}

function buildTargetKps(questionPlan = [], overrides = {}) {
  const targetKps = [];

  if (overrides.kp_name || overrides.knowledge_point_id || overrides.kp_id) {
    targetKps.push({
      kp_id: overrides.knowledge_point_id || overrides.kp_id || overrides.kp_name,
      kp_name: overrides.kp_name || overrides.knowledge_point_name || overrides.knowledge_point_id,
      chapter_name: overrides.chapter_name,
      grade: overrides.grade,
      semester: overrides.semester
    });
  }

  for (const item of (Array.isArray(questionPlan) ? questionPlan : [])) {
    if (!item || !item.kp_name) continue;
    targetKps.push({
      kp_id: item.kp_id,
      kp_name: item.kp_name,
      chapter_name: item.chapter_name,
      grade: item.grade,
      semester: item.semester,
      difficulty: item.difficulty
    });
  }

  const seen = new Set();
  return targetKps.filter(item => {
    const key = item.kp_id || item.kp_name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeStudentProfile(profile = {}) {
  if (!profile || typeof profile !== 'object' || Object.keys(profile).length === 0) {
    return '';
  }

  const parts = [];
  if (Array.isArray(profile.weak_points) && profile.weak_points.length > 0) {
    parts.push(`薄弱知识点：${profile.weak_points.slice(0, 5).join('、')}`);
  }
  if (Array.isArray(profile.error_patterns) && profile.error_patterns.length > 0) {
    parts.push(`错误模式：${profile.error_patterns.slice(0, 5).join('、')}`);
  }
  if (profile.preferred_difficulty) {
    parts.push(`建议难度：${profile.preferred_difficulty}`);
  }
  if (typeof profile.avg_time_per_question === 'number') {
    parts.push(`平均答题时间：${profile.avg_time_per_question}秒/题`);
  }

  return parts.join('\n');
}

module.exports = {
  normalizeDifficultyDistribution,
  calculateDifficultyCounts,
  createQuestionPlanSnapshot,
  buildTargetKps,
  summarizeStudentProfile
};
