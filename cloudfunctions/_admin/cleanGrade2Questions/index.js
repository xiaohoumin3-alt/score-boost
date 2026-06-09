const cloud = require('wx-server-sdk');
const fs = require('fs');
const path = require('path');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 2年级数学应该有的知识点
const grade2MathKnowledgePoints = new Set([
  '100以内加减法', '乘法口诀', '除法初步', '长度单位', '认识角'
]);

// 不应该在2年级出现的高年级知识点
const highGradeKnowledgePoints = new Set([
  '二次根式', '勾股定理', '一次函数', '平行四边形', '全等三角形',
  '轴对称', '数据的分析', '整式的乘法', '因式分解', '分式',
  '概率', '实数', '相似三角形', '锐角三角函数', '一元二次方程',
  '二次函数', '旋转', '圆', '投影与视图', '有理数',
  '整式的加减', '一元一次方程', '图形的初步认识', '数据的收集与整理'
]);

/**
 * 清理数据库中错误的2年级数学题目
 */
exports.main = async (event, context) => {
  const result = {
    total: 0,
    deleted: 0,
    kept: 0,
    errors: [],
    sample_deleted: [],
    sample_kept: []
  };

  try {
    console.log('[cleanGrade2Questions] 开始清理2年级数学题目...');

    // 分批查询所有2年级数学题目
    let hasMore = true;
    let batch = 0;
    const BATCH_SIZE = 100;

    while (hasMore) {
      batch++;
      console.log(`[cleanGrade2Questions] 处理批次 ${batch}...`);

      const res = await db.collection('ai_question_pool')
        .where({
          grade: '2',
          subject: 'math'
        })
        .skip(batch * BATCH_SIZE)
        .limit(BATCH_SIZE)
        .get();

      if (!res.data || res.data.length === 0) {
        hasMore = false;
        break;
      }

      result.total += res.data.length;

      for (const question of res.data) {
        const kp = question.knowledge_point || '';

        // 判断是否为高年级知识点
        const isHighGrade = highGradeKnowledgePoints.has(kp);
        const isCorrectGrade = grade2MathKnowledgePoints.has(kp);

        if (isHighGrade) {
          // 删除错误的题目
          try {
            await db.collection('ai_question_pool').doc(question._id).remove();
            result.deleted++;

            if (result.sample_deleted.length < 5) {
              result.sample_deleted.push({
                id: question._id,
                knowledge_point: kp,
                content: question.content?.substring(0, 50)
              });
            }
          } catch (delErr) {
            result.errors.push({
              id: question._id,
              error: delErr.message
            });
          }
        } else {
          // 保留正确的题目（包括题目内容正确但知识点为空的）
          result.kept++;

          if (result.sample_kept.length < 5) {
            result.sample_kept.push({
              id: question._id,
              knowledge_point: kp,
              content: question.content?.substring(0, 50)
            });
          }
        }
      }

      // 如果返回数量少于批次大小，说明已到末尾
      if (res.data.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    console.log('[cleanGrade2Questions] 清理完成:', result);

    return {
      success: true,
      data: result
    };

  } catch (e) {
    console.error('[cleanGrade2Questions] 错误:', e);
    return {
      success: false,
      error: e.message
    };
  }
};
