/**
 * generateDailyTask 云函数测试
 */

function assertStrictEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, message) {
  if (!value) {
    throw new Error(`${message}: expected truthy, got ${value}`);
  }
}

// Mock cloud.callFunction
let mockMemoryData = null;

function mockCallFunction(params) {
  return {
    result: {
      success: true,
      data: mockMemoryData || { summary: { weak_points: [] } }
    }
  };
}

async function generateDailyTask(event) {
  const { student_id } = event;

  try {
    // Mock: 获取学生Memory
    const memoryResult = mockCallFunction({
      name: 'studentMemory',
      data: { action: 'get', student_id }
    });

    if (!memoryResult.result || !memoryResult.result.success) {
      return getColdStartTask();
    }

    const memory = memoryResult.result.data;

    // 冷启动处理
    if (!memory.summary.weak_points || memory.summary.weak_points.length === 0) {
      return getColdStartTask();
    }

    // 选择最紧迫的薄弱点
    const targetWP = selectMostUrgentWeakPoint(memory.summary.weak_points);

    if (!targetWP) {
      return getColdStartTask();
    }

    // 生成任务
    const errorCount = targetWP.error_count || 1;
    const pattern = targetWP.pattern || '相关题目';

    const task = {
      title: `${targetWP.kp_name}·5分钟`,
      reason: `因为你最近在"${pattern}"上错了${errorCount}次`,
      estimated_time: 5,
      question_count: 3,
      kp_id: targetWP.kp_id,
      kp_name: targetWP.kp_name,
      difficulty: 'easy',
      generated_at: new Date().toISOString(),
      target_weak_point: {
        kp_id: targetWP.kp_id,
        kp_name: targetWP.kp_name,
        error_count: errorCount,
        pattern: pattern
      }
    };

    return { success: true, data: task };
  } catch (e) {
    return getColdStartTask();
  }
}

function getColdStartTask() {
  return {
    success: true,
    data: {
      title: '二次根式基础·5分钟',
      reason: '让我们开始今天的练习，巩固基础',
      estimated_time: 5,
      question_count: 3,
      kp_id: 'kp_003',
      kp_name: '二次根式',
      difficulty: 'easy',
      generated_at: new Date().toISOString()
    }
  };
}

function selectMostUrgentWeakPoint(weakPoints) {
  if (!weakPoints || weakPoints.length === 0) {
    return null;
  }

  const sorted = [...weakPoints].sort((a, b) => {
    const aCount = a.error_count || 0;
    const bCount = b.error_count || 0;
    return bCount - aCount;
  });

  return sorted[0];
}

// 主测试函数
async function runTests() {
  console.log('=== generateDailyTask 云函数测试开始 ===\n');

  // 测试1: 冷启动 - 新用户无薄弱点
  console.log('测试1: 冷启动 - 新用户无薄弱点');
  mockMemoryData = { summary: { weak_points: [] } };
  const result1 = await generateDailyTask({ student_id: 'new_user' });
  assertStrictEqual(result1.success, true, '成功');
  assertStrictEqual(result1.data.title, '二次根式基础·5分钟', '返回冷启动任务');
  console.log('✓ 冷启动返回默认任务');
  console.log('');

  // 测试2: 有薄弱点 - 生成针对性任务
  console.log('测试2: 有薄弱点 - 生成针对性任务');
  mockMemoryData = {
    summary: {
      weak_points: [
        { kp_id: 'kp_001', kp_name: '绝对值', error_count: 5, pattern: '直接去掉绝对值符号' },
        { kp_id: 'kp_002', kp_name: '二次根式', error_count: 2, pattern: '计算错误' }
      ]
    }
  };
  const result2 = await generateDailyTask({ student_id: 'student_1' });
  assertStrictEqual(result2.success, true, '成功');
  assertStrictEqual(result2.data.kp_name, '绝对值', '选择错误次数最多的薄弱点');
  assertOk(result2.data.reason.includes('5次'), '理由包含错误次数');
  console.log('✓ 有薄弱点时生成针对性任务');
  console.log('');

  // 测试3: 任务结构完整
  console.log('测试3: 任务结构完整');
  const task = result2.data;
  assertOk(task.title, '有title');
  assertOk(task.reason, '有reason');
  assertOk(task.estimated_time > 0, '有estimated_time');
  assertOk(task.question_count > 0, '有question_count');
  assertOk(task.kp_id, '有kp_id');
  assertOk(task.difficulty, '有difficulty');
  console.log('✓ 任务结构完整');
  console.log('');

  // 测试4: 多个薄弱点按错误次数排序
  console.log('测试4: 多个薄弱点按错误次数排序');
  mockMemoryData = {
    summary: {
      weak_points: [
        { kp_id: 'kp_001', kp_name: '知识点A', error_count: 1 },
        { kp_id: 'kp_002', kp_name: '知识点B', error_count: 10 },
        { kp_id: 'kp_003', kp_name: '知识点C', error_count: 5 }
      ]
    }
  };
  const result4 = await generateDailyTask({ student_id: 'test' });
  assertStrictEqual(result4.data.kp_name, '知识点B', '选择错误次数最多的');
  console.log('✓ 按错误次数排序选择薄弱点');
  console.log('');

  // 测试5: 无pattern时的默认处理
  console.log('测试5: 无pattern时的默认处理');
  mockMemoryData = {
    summary: {
      weak_points: [
        { kp_id: 'kp_001', kp_name: '测试知识点', error_count: 3 }
      ]
    }
  };
  const result5 = await generateDailyTask({ student_id: 'test' });
  assertOk(result5.data.reason.includes('相关题目'), '无pattern时使用默认');
  console.log('✓ 无pattern时使用默认文案');
  console.log('');

  console.log('=== 所有测试通过 ===');
  console.log('generateDailyTask云函数测试完成');
}

runTests().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
