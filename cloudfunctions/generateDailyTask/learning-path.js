/**
 * 学习路径推荐模块
 * Phase 5: Learning Path
 *
 * 根据学生当前水平和目标，生成个性化学习路径
 */

/**
 * 计算知识点优先级
 * @param {Object} kp - 知识点对象
 * @param {Object} progress - 学生进度 {mastered, score}
 * @returns {number} 优先级分数 (0-100)
 */
function calculateKpPriority(kp, progress) {
  if (!progress) {
    // 无进度数据，基于知识点属性
    let priority = kp.priority || 5;
    if (kp.foundation) priority += 20;
    return Math.min(priority, 100);
  }

  let priority = kp.priority || 5;

  // 基础知识点加成
  if (kp.foundation) {
    priority += 20;
  }

  // 已掌握的降低优先级
  if (progress.mastered) {
    priority -= 40;
  } else {
    // 未掌握的，分数越低优先级越高
    if (progress.score < 60) {
      priority += 30;
    } else if (progress.score < 80) {
      priority += 15;
    }
  }

  return Math.max(0, Math.min(priority, 100));
}

/**
 * 按优先级排序路径（保持依赖关系）
 * @param {Array} knowledgePoints - 知识点数组（已按依赖关系排序）
 * @param {Object} studentProgress - 学生进度
 * @returns {Array} 排序后的知识点数组
 */
function sortPathByPriority(knowledgePoints, studentProgress) {
  // 使用稳定的排序算法，确保依赖关系不被破坏
  // 如果A依赖B，确保B在A之前

  return [...knowledgePoints].sort((a, b) => {
    // 检查依赖关系
    const aDependsOnB = a.depends_on && a.depends_on.includes(b.kp_id);
    const bDependsOnA = b.depends_on && b.depends_on.includes(a.kp_id);

    if (aDependsOnB) return 1; // A依赖B，B应该在A前面
    if (bDependsOnA) return -1; // B依赖A，A应该在B前面

    // 没有依赖关系，按优先级排序
    const priorityA = calculateKpPriority(a, studentProgress[a.kp_id]);
    const priorityB = calculateKpPriority(b, studentProgress[b.kp_id]);
    return priorityB - priorityA; // 降序
  });
}

/**
 * 处理依赖关系（拓扑排序）
 * @param {Array} knowledgePoints - 知识点数组
 * @returns {Array} 处理依赖后的数组
 */
function resolveDependencies(knowledgePoints) {
  const kpMap = new Map(knowledgePoints.map(kp => [kp.kp_id, kp]));
  const sorted = [];
  const visited = new Set();

  function visit(kp) {
    if (visited.has(kp.kp_id)) return;
    visited.add(kp.kp_id);

    // 先访问依赖的知识点
    if (kp.depends_on) {
      for (const depId of kp.depends_on) {
        const depKp = kpMap.get(depId);
        if (depKp && knowledgePoints.find(k => k.kp_id === depId)) {
          visit(depKp);
        }
      }
    }

    sorted.push(kp);
  }

  for (const kp of knowledgePoints) {
    if (!visited.has(kp.kp_id)) {
      visit(kp);
    }
  }

  return sorted;
}

/**
 * 生成学习路径
 * @param {number} currentScore - 当前分数
 * @param {number} targetScore - 目标分数
 * @param {Array} knowledgePoints - 知识点数组
 * @param {Object} studentProgress - 学生进度 {kp_id: {mastered, score}}
 * @returns {Array} 学习路径（知识点数组）
 */
function generateLearningPath(currentScore, targetScore, knowledgePoints, studentProgress = {}) {
  if (!knowledgePoints || knowledgePoints.length === 0) {
    return [];
  }

  // 根据分数段过滤和排序知识点
  let filteredKps = [...knowledgePoints];

  // 低分段（<60）：优先基础知识点
  if (currentScore < 60) {
    const foundationKps = filteredKps.filter(kp => kp.foundation);
    if (foundationKps.length > 0) {
      filteredKps = foundationKps;
    }
  }

  // 处理依赖关系
  const resolvedKps = resolveDependencies(filteredKps);

  // 按优先级排序
  const sortedPath = sortPathByPriority(resolvedKps, studentProgress);

  return sortedPath;
}

module.exports = {
  generateLearningPath,
  calculateKpPriority,
  sortPathByPriority
};
