/**
 * checkFields 云函数
 * 检查题库字段完整性
 *
 * 规范化后只检查：
 * - subject: 科目（题目固有属性）
 * - knowledge_point: 知识点名称
 * - chapter: 章节（知识点组织维度）
 *
 * 不再检查：grade, semester（已移除，通过 kp_id 隐含）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  try {
    // 采样检查字段情况
    const sample = await db.collection('ai_question_pool')
      .field({
        subject: true,
        knowledge_point: true,
        knowledge_point_id: true,
        chapter: true
      })
      .limit(100)
      .get();

    const stats = {
      total: sample.data.length,
      hasSubject: 0,
      hasKnowledgePoint: 0,
      hasKnowledgePointId: 0,
      hasChapter: 0,
      fieldAnalysis: []
    };

    sample.data.forEach(q => {
      const analysis = {
        subject: q.subject,
        knowledge_point: q.knowledge_point,
        knowledge_point_id: q.knowledge_point_id,
        chapter: q.chapter
      };
      stats.fieldAnalysis.push(analysis);

      if (q.subject) stats.hasSubject++;
      if (q.knowledge_point) stats.hasKnowledgePoint++;
      if (q.knowledge_point_id) stats.hasKnowledgePointId++;
      if (q.chapter) stats.hasChapter++;
    });

    // 检查空值数量
    const emptySubject = await db.collection('ai_question_pool')
      .where({ subject: _.exists(false).or(_.eq('')) })
      .count();

    const emptyKnowledgePoint = await db.collection('ai_question_pool')
      .where({ knowledge_point: _.exists(false).or(_.eq('')) })
      .count();

    const emptyKnowledgePointId = await db.collection('ai_question_pool')
      .where({ knowledge_point_id: _.exists(false).or(_.eq('')) })
      .count();

    return {
      success: true,
      sample: stats,
      emptySubject: emptySubject.total || 0,
      emptyKnowledgePoint: emptyKnowledgePoint.total || 0,
      emptyKnowledgePointId: emptyKnowledgePointId.total || 0,
      examples: stats.fieldAnalysis.slice(0, 10)
    };

  } catch (e) {
    return { success: false, error: e.message };
  }
};
