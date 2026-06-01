/**
 * 学习路径推荐系统测试
 * Phase 5: Learning Path
 */

const assert = require('assert');
const { generateLearningPath, calculateKpPriority, sortPathByPriority } = require('./learning-path.js');

// 模拟知识点数据
const mockKnowledgePoints = [
  { kp_id: 'kp_001', kp_name: '绝对值', difficulty: 'easy', foundation: true, priority: 8 },
  { kp_id: 'kp_002', kp_name: '二次根式', difficulty: 'easy', foundation: true, priority: 9, depends_on: ['kp_001'] },
  { kp_id: 'kp_003', kp_name: '勾股定理', difficulty: 'medium', foundation: false, priority: 7 },
  { kp_id: 'kp_004', kp_name: '平行四边形', difficulty: 'medium', foundation: false, priority: 6 },
  { kp_id: 'kp_005', kp_name: '一次函数', difficulty: 'hard', foundation: false, priority: 8 },
];

// 模拟学生进度数据
const mockStudentProgress = {
  'kp_001': { mastered: true, score: 90 },
  'kp_002': { mastered: false, score: 65 },
  'kp_003': { mastered: false, score: 45 },
  'kp_004': { mastered: false, score: 70 },
  'kp_005': { mastered: false, score: 30 },
};

async function runTests() {
  console.log('=== 学习路径推荐系统测试开始 ===\n');

  // 测试1: 分数 < 60，优先基础知识点
  console.log('测试1: 低分段路径规划（分数 < 60）');
  const path1 = generateLearningPath(45, 85, mockKnowledgePoints, mockStudentProgress);
  assert.ok(path1.length > 0, '应生成学习路径');
  assert.ok(path1[0].foundation === true, '低分段应优先基础知识点');
  console.log('✓ 通过: 首个知识点 =', path1[0].kp_name, '（基础:', path1[0].foundation + '）');
  console.log('');

  // 测试2: 分数 60-80，针对性补强
  console.log('测试2: 中分段路径规划（60-80分）');
  const path2 = generateLearningPath(72, 85, mockKnowledgePoints, mockStudentProgress);
  assert.ok(path2.length > 0, '应生成学习路径');
  // 中分段应优先推荐薄弱且重要的知识点
  const weakAndImportant = path2.find(kp => mockStudentProgress[kp.kp_id]?.score < 70);
  assert.ok(weakAndImportant, '中分段应优先推荐薄弱知识点');
  console.log('✓ 通过: 包含薄弱知识点推荐');
  console.log('');

  // 测试3: 分数 > 80，拓展提升
  console.log('测试3: 高分段路径规划（分数 > 80）');
  const path3 = generateLearningPath(85, 90, mockKnowledgePoints, mockStudentProgress);
  assert.ok(path3.length > 0, '应生成学习路径');
  // 高分段应推荐未掌握的高价值知识点
  const hasUnmasteredHighValue = path3.some(kp => !mockStudentProgress[kp.kp_id]?.mastered && kp.priority >= 7);
  assert.ok(hasUnmasteredHighValue, '高分段应推荐高价值未掌握知识点');
  console.log('✓ 通过: 包含高价值未掌握知识点');
  console.log('');

  // 测试4: 知识点优先级计算
  console.log('测试4: 知识点优先级计算');
  const priority1 = calculateKpPriority(mockKnowledgePoints[0], mockStudentProgress['kp_001']);
  assert.ok(priority1 >= 0 && priority1 <= 100, '优先级应在0-100范围内');
  console.log('✓ 通过: 绝对值优先级 =', priority1);
  console.log('');

  // 测试5: 薄弱知识点优先级更高
  console.log('测试5: 薄弱知识点优先级更高');
  const priorityStrong = calculateKpPriority(mockKnowledgePoints[1], { mastered: true, score: 90 });
  const priorityWeak = calculateKpPriority(mockKnowledgePoints[1], { mastered: false, score: 45 });
  assert.ok(priorityWeak > priorityStrong, '薄弱知识点优先级应更高');
  console.log('✓ 通过: 强势(' + priorityStrong + ') < 薄弱(' + priorityWeak + ')');
  console.log('');

  // 测试6: 路径排序
  console.log('测试6: 路径按优先级排序');
  const unsortedPath = [mockKnowledgePoints[2], mockKnowledgePoints[0], mockKnowledgePoints[4]];
  const sortedPath = sortPathByPriority(unsortedPath, mockStudentProgress);
  for (let i = 0; i < sortedPath.length - 1; i++) {
    const p1 = calculateKpPriority(sortedPath[i], mockStudentProgress[sortedPath[i].kp_id]);
    const p2 = calculateKpPriority(sortedPath[i + 1], mockStudentProgress[sortedPath[i + 1].kp_id]);
    assert.ok(p1 >= p2, '路径应按优先级降序排列');
  }
  console.log('✓ 通过: 路径已按优先级降序排列');
  console.log('');

  // 测试7: 依赖关系处理
  console.log('测试7: 依赖关系处理');
  const path7 = generateLearningPath(50, 85, mockKnowledgePoints, {});
  // 如果kp_002依赖kp_001，且两者都未掌握，kp_001应在kp_002之前
  const idx1 = path7.findIndex(kp => kp.kp_id === 'kp_001');
  const idx2 = path7.findIndex(kp => kp.kp_id === 'kp_002');
  if (idx1 >= 0 && idx2 >= 0) {
    assert.ok(idx1 < idx2, '依赖的知识点应先出现');
    console.log('✓ 通过: 依赖关系正确（kp_001在kp_002之前）');
  } else {
    console.log('⊘ 跳过: 不包含依赖的知识点');
  }
  console.log('');

  // 测试8: 空数据处理
  console.log('测试8: 空数据处理');
  const path8 = generateLearningPath(60, 85, [], {});
  assert.ok(Array.isArray(path8) && path8.length === 0, '空数据应返回空数组');
  console.log('✓ 通过: 空数据返回空数组');
  console.log('');

  console.log('=== 所有测试通过 ===');
  console.log('学习路径推荐系统测试完成');
}

runTests().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
