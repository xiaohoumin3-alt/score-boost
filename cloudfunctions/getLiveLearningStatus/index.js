// 云函数：获取实时学习动态
// 功能：查询最近5分钟内活跃的学生数量，返回示例学生列表
// 基数策略：显示数字 = 真实用户数 + 1000

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 基数：冷启动时显示1000+用户
const BASE_COUNT = 1000;

// 波动幅度：±5%，让数字更"活跃"
const FLUCTUATION_RATE = 0.05;

// 缓存时间：2分钟（优化性能，降低数据库负载）
const CACHE_TTL = 120;

// 姓氏库（用于虚拟姓氏生成）
const SURNAMES = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
// 名字后缀（增加多样性）
const NAME_SUFFIXES = ['小明', '小红', '小华', '小强', '小丽', '小军', '小敏', '小杰', '小芳', '小伟'];

/**
 * 匿名化姓名（带随机性，避免长期追踪）
 * @param {string} nameOrId - 学生ID
 * @returns {string} 匿名化后的姓名（如"张小明"）
 */
function anonymizeName(nameOrId) {
  if (!nameOrId) return '某同学';

  // 使用时间戳+ID的hash，每分钟变化一次，增加随机性
  const timeSlot = Math.floor(Date.now() / (1000 * 60));  // 每分钟变化
  const hashInput = String(nameOrId) + timeSlot;
  const hash = hashInput.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

  const surnameIndex = hash % SURNAMES.length;
  const suffixIndex = (hash >> 2) % NAME_SUFFIXES.length;  // 使用不同的位选择后缀

  return `${SURNAMES[surnameIndex]}${NAME_SUFFIXES[suffixIndex]}`;
}

/**
 * 年级格式化（数字→中文）
 * @param {string} grade - 年级数字或中文
 * @returns {string} 格式化后的年级
 */
function formatGrade(grade) {
  const gradeMap = {
    '1': '一年级', '2': '二年级', '3': '三年级',
    '4': '四年级', '5': '五年级', '6': '六年级',
    '7': '七年级', '8': '八年级', '9': '九年级'
  };
  return gradeMap[grade] || grade;
}

/**
 * 提取知识点
 * @param {object} assessment - 测评记录
 * @returns {string} 知识点名称
 */
function extractKnowledgePoint(assessment) {
  if (!assessment) return '练习中';

  // 从 questions 中获取知识点名称
  const questions = assessment.questions || [];
  if (questions.length > 0) {
    const kp = questions[0].kp_name || questions[0].knowledgePoint;
    return kp || '练习中';
  }

  return '练习中';
}

/**
 * 获取随机示例学生（优化：合并查询）
 * @param {number} count - 需要的学生数量
 * @returns {Promise<Array>} 示例学生列表
 */
async function getRandomLearners(count) {
  try {
    // 1. 一次查询获取最近活跃的测评记录（包含学生ID和知识点）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeAssessments = await db.collection('assessments')
      .where({
        created_at: _.gte(fiveMinutesAgo),
        status: 'completed'
      })
      .field({
        student_id: true,
        questions: true  // 直接获取知识点信息
      })
      .orderBy('created_at', 'desc')
      .limit(100)  // 限制返回数量，避免大数据量
      .get();

    // 2. 提取唯一学生ID
    const uniqueStudentIds = [...new Set(activeAssessments.data.map(a => a.student_id))];

    // 3. 如果没有活跃学生，返回空数组
    if (uniqueStudentIds.length === 0) {
      return [];
    }

    // 4. 随机选择 N 个学生
    const selectedIds = uniqueStudentIds
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, uniqueStudentIds.length));

    // 5. 批量查询学生信息（仅一次查询）
    const studentMemories = await db.collection('student_memory')
      .where({
        student_id: _.in(selectedIds)
      })
      .field({
        student_id: true,
        'profile.grade': true  // 只查询需要的字段
      })
      .get();

    // 6. 组装数据（从已获取的activeAssessments中提取知识点）
    const studentMap = new Map(studentMemories.data.map(s => [s.student_id, s]));
    const assessmentMap = new Map();

    // 为每个学生构建最近的知识点
    for (const assessment of activeAssessments.data) {
      if (!assessmentMap.has(assessment.student_id)) {
        assessmentMap.set(assessment.student_id, assessment);
      }
    }

    return selectedIds.map(studentId => {
      const student = studentMap.get(studentId);
      const assessment = assessmentMap.get(studentId);

      // 匿名化：直接使用studentId生成，不读取real_name字段
      return {
        name: anonymizeName(studentId),
        grade: formatGrade(student?.profile?.grade || '未知'),
        kp: extractKnowledgePoint(assessment)
      };
    });
  } catch (e) {
    console.error('[getLiveLearningStatus] getRandomLearners error:', e);
    return [];
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  try {
    // 1. 尝试从缓存读取（可选，如果cache集合不存在则跳过）
    let useCache = false;
    try {
      const cacheKey = 'live_learning_status';
      const cacheResult = await db.collection('cache')
        .where({
          key: cacheKey,
          expires_at: _.gte(new Date())
        })
        .get();

      if (cacheResult.data.length > 0) {
        console.log('[getLiveLearningStatus] 使用缓存数据');
        return {
          success: true,
          data: JSON.parse(cacheResult.data[0].value)
        };
      }
      useCache = true;  // cache集合存在
    } catch (cacheError) {
      console.log('[getLiveLearningStatus] cache集合不存在，跳过缓存');
    }

    // 2. 查询真实在线人数（最近5分钟内有答题记录）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const realOnlineCount = await db.collection('assessments')
      .where({
        created_at: _.gte(fiveMinutesAgo),
        status: 'completed'
      })
      .count();

    // 3. 显示数字 = 真实数 + 基数（加轻微波动，让页面更活跃）
    const fluctuation = Math.floor(Math.random() * BASE_COUNT * FLUCTUATION_RATE * 2) - BASE_COUNT * FLUCTUATION_RATE;
    const displayCount = realOnlineCount.total + BASE_COUNT + fluctuation;

    // 4. 获取示例学生（随机3个在线学生）
    const liveLearners = await getRandomLearners(3);

    const result = {
      onlineCount: displayCount,
      liveLearners
    };

    // 5. 写入缓存（如果cache集合存在）
    if (useCache) {
      try {
        const expiresAt = new Date(Date.now() + CACHE_TTL * 1000);
        await db.collection('cache').add({
          data: {
            key: 'live_learning_status',
            value: JSON.stringify(result),
            expires_at: expiresAt,
            created_at: new Date()
          }
        });
        console.log('[getLiveLearningStatus] 缓存已写入');
      } catch (cacheError) {
        console.error('[getLiveLearningStatus] 缓存写入失败（非关键）:', cacheError);
      }
    }

    return {
      success: true,
      data: result
    };

  } catch (e) {
    console.error('[getLiveLearningStatus] error:', e);
    // 降级策略：返回默认数据
    return {
      success: true,
      data: {
        onlineCount: BASE_COUNT,
        liveLearners: [],
        _fallback: true
      }
    };
  }
};
