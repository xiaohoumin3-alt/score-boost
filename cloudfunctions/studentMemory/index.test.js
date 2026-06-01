/**
 * studentMemory 云函数测试
 * TDD: 测试先行
 */

// 模拟 assert 函数（ES环境）
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

// Mock wx-server-sdk
const mockCloud = {
  init: () => {},
  database: () => ({
    command: {
      arrayUnion: (arr) => arr
    },
    collection: (name) => ({
      where: () => ({
        get: () => mockGetResult(name),
        limit: () => ({ get: () => [] })
      }),
      doc: (id) => ({
        update: ({ data }) => {
          mockUpdateData = data;
          return { stats: { updated: 1 } };
        }
      }),
      add: ({ data }) => {
        mockAddData = data;
        return { _id: 'new_id' };
      }
    })
  })
};

let mockGetResult = (name) => ({ data: [] });
let mockUpdateData = null;
let mockAddData = null;

// 模拟云函数入口
async function studentMemory(event) {
  const { action, student_id, data } = event;

  const db = mockCloud.database();

  switch (action) {
    case 'get':
      return await getMemory(student_id, db);
    case 'update':
      return await updateMemory(student_id, data, db);
    default:
      return { success: false, error: 'Unknown action' };
  }
}

async function getMemory(studentId, db) {
  try {
    const result = await db.collection('student_memory').where({ student_id: studentId }).get();

    if (result.data && result.data.length > 0) {
      return { success: true, data: result.data[0] };
    }

    return {
      success: true,
      data: getDefaultMemory(studentId)
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function updateMemory(studentId, updateData, db) {
  try {
    const existing = await db.collection('student_memory').where({ student_id: studentId }).get();

    const now = new Date().toISOString();

    if (existing.data && existing.data.length > 0) {
      await db.collection('student_memory').doc(existing.data[0]._id).update({
        data: { ...updateData, updated_at: now }
      });
    } else {
      await db.collection('student_memory').add({
        data: {
          student_id: studentId,
          ...getDefaultMemory(studentId),
          ...updateData,
          created_at: now,
          updated_at: now
        }
      });
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getDefaultMemory(studentId) {
  return {
    student_id: studentId,
    summary: {
      recent_progress: [],
      current_score: 0,
      target_score: 85,
      weak_points: [],
      mastered: [],
      learning_trend: 'stable',
      consecutive_days: 0,
      ai_summary: ''
    },
    profile: {
      grade: '',
      subject: 'math',
      learning_style: 'visual',
      strong_points: [],
      weak_areas: [],
      preferred_difficulty: 'medium',
      avg_time_per_question: 90
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// 主测试函数
async function runTests() {
  console.log('=== studentMemory 云函数测试开始 ===\n');

  // 测试1: getMemory - 新用户返回默认记忆
  console.log('测试1: getMemory - 新用户返回默认记忆');
  mockGetResult = () => ({ data: [] });
  const result1 = await studentMemory({ action: 'get', student_id: 'new_user' });
  assertStrictEqual(result1.success, true, '获取成功');
  assertStrictEqual(result1.data.student_id, 'new_user', '学生ID正确');
  assertStrictEqual(result1.data.summary.target_score, 85, '默认目标分数85');
  assertStrictEqual(result1.data.profile.learning_style, 'visual', '默认学习风格visual');
  console.log('✓ 新用户返回默认记忆');
  console.log('');

  // 测试2: getMemory - 老用户返回已保存的记忆
  console.log('测试2: getMemory - 老用户返回已保存的记忆');
  const savedMemory = {
    student_id: 'old_user',
    summary: {
      recent_progress: [{ date: '2026-05-25', is_correct: true }],
      current_score: 75,
      target_score: 85,
      weak_points: [],
      mastered: [],
      learning_trend: 'up',
      consecutive_days: 5,
      ai_summary: '进步明显'
    },
    profile: {
      learning_style: 'auditory',
      avg_time_per_question: 60
    }
  };
  mockGetResult = () => ({ data: [savedMemory] });
  const result2 = await studentMemory({ action: 'get', student_id: 'old_user' });
  assertStrictEqual(result2.success, true, '获取成功');
  assertStrictEqual(result2.data.summary.current_score, 75, '当前分数75');
  assertStrictEqual(result2.data.profile.learning_style, 'auditory', '学习风格auditory');
  console.log('✓ 老用户返回已保存的记忆');
  console.log('');

  // 测试3: updateMemory - 新用户创建记忆
  console.log('测试3: updateMemory - 新用户创建记忆');
  mockGetResult = () => ({ data: [] });
  mockAddData = null;
  const result3 = await studentMemory({
    action: 'update',
    student_id: 'new_user',
    data: { 'summary.current_score': 70 }
  });
  assertStrictEqual(result3.success, true, '更新成功');
  assertOk(mockAddData, '创建了新记录');
  assertStrictEqual(mockAddData.summary.current_score, 70, '分数已更新');
  console.log('✓ 新用户创建记忆');
  console.log('');

  // 测试4: updateMemory - 老用户更新记忆
  console.log('测试4: updateMemory - 老用户更新记忆');
  mockGetResult = () => ({ data: [{ _id: 'existing_id', student_id: 'old_user' }] });
  mockUpdateData = null;
  const result4 = await studentMemory({
    action: 'update',
    student_id: 'old_user',
    data: { 'summary.current_score': 80 }
  });
  assertStrictEqual(result4.success, true, '更新成功');
  assertOk(mockUpdateData, '更新了记录');
  assertStrictEqual(mockUpdateData.summary.current_score, 80, '分数已更新');
  console.log('✓ 老用户更新记忆');
  console.log('');

  // 测试5: 默认记忆结构完整
  console.log('测试5: 默认记忆结构完整');
  mockGetResult = () => ({ data: [] });
  const result5 = await studentMemory({ action: 'get', student_id: 'test' });
  const mem = result5.data;
  assertOk(mem.summary, '有summary字段');
  assertOk(mem.profile, '有profile字段');
  assertOk(mem.created_at, '有created_at字段');
  assertOk(mem.updated_at, '有updated_at字段');
  assertOk(Array.isArray(mem.summary.weak_points), 'weak_points是数组');
  assertOk(Array.isArray(mem.summary.mastered), 'mastered是数组');
  console.log('✓ 默认记忆结构完整');
  console.log('');

  // 测试6: 支持嵌套更新
  console.log('测试6: 支持嵌套更新');
  mockGetResult = () => ({ data: [] });
  mockAddData = null;
  await studentMemory({
    action: 'update',
    student_id: 'test',
    data: {
      'summary.current_score': 75,
      'profile.learning_style': 'kinesthetic'
    }
  });
  assertOk(mockAddData, '创建了记录');
  assertStrictEqual(mockAddData.summary.current_score, 75, '嵌套更新current_score生效');
  assertStrictEqual(mockAddData.profile.learning_style, 'kinesthetic', '嵌套更新learning_style生效');
  console.log('✓ 支持嵌套更新');
  console.log('');

  // 测试7: unknown action返回错误
  console.log('测试7: unknown action返回错误');
  const result7 = await studentMemory({ action: 'unknown', student_id: 'test' });
  assertStrictEqual(result7.success, false, '返回失败');
  assertOk(result7.error, '有错误信息');
  console.log('✓ unknown action返回错误');
  console.log('');

  console.log('=== 所有测试通过 ===');
  console.log('studentMemory云函数测试完成');
}

// 运行测试
runTests().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
