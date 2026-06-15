/**
 * scoreCalibration 云函数
 * 基于 IRT 模型 + 真实题目参数预估考试分数
 * 输入: { assessment_id }
 * 输出: 预估分数详情
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const IRTModel = require('./shared/models/irt-model');
const ScoreEstimator = require('./shared/models/score-estimator');
const { toIRTItems } = require('./shared/item-bank-builder');

exports.main = async (event) => {
  const { assessment_id } = event;

  if (!assessment_id) {
    return { success: false, error: 'assessment_id is required' };
  }

  const db = cloud.database();
  const _ = db.command;

  try {
    // 1. 加载测评记录
    const assessRes = await db.collection('assessments')
      .where({ assessment_id })
      .get();

    if (!assessRes.data || assessRes.data.length === 0) {
      return { success: false, error: 'Assessment not found' };
    }

    const assessment = assessRes.data[0];
    const subject = assessment.subject || 'math';
    const grade = assessment.grade || '8';
    const results = assessment.results || [];
    const score = assessment.score || {};

    if (results.length === 0) {
      return { success: false, error: 'No results found in assessment' };
    }

    // 2. 收集所有题目 ID
    const questionIds = results.map(r => r.question_id).filter(Boolean);

    // 3. 从 ai_question_pool 加载题目（含 IRT 参数）
    let poolQuestions = [];
    if (questionIds.length > 0) {
      // 分批查询（云数据库 where in 限制 20 条）
      for (let i = 0; i < questionIds.length; i += 20) {
        const batch = questionIds.slice(i, i + 20);
        const poolRes = await db.collection('ai_question_pool')
          .where({ _id: _.in(batch) })
          .get();
        poolQuestions = poolQuestions.concat(poolRes.data || []);
      }
    }

    // 4. 构建 IRT 题目参数
    const irtItems = toIRTItems(poolQuestions);

    // 5. 构建答题记录（IRT 格式）
    const responses = results.map(r => ({
      item_id: r.question_id,
      correct: r.is_correct ? 1 : 0,
      question_type: 'choice',
    }));

    // 6. 初始化 IRT 模型并加载题目参数
    const irtModel = new IRTModel();
    irtModel.loadItemBank(irtItems);

    // 7. 使用 ScoreEstimator 估算分数
    const estimator = new ScoreEstimator(subject);

    // 手动加载 IRT 题目到 estimator 的内部模型
    estimator.irtModel.loadItemBank(irtItems);

    const estimation = estimator.estimateFromResponses(responses, grade);

    // 8. 计算平均难度（基于 IRT b 参数）
    const difficultyAvg = irtItems.length > 0
      ? irtItems.reduce((sum, item) => sum + (item.b + 3) / 6, 0) / irtItems.length
      : 0.5;

    // 9. 更新 assessment 记录，存储预估结果
    const scoreEstimation = {
      estimatedScore: estimation.estimatedScore,
      examScore: estimation.examScore,
      level: estimation.level,
      levelText: estimation.text,
      confidence: estimation.confidence,
      margin: estimation.margin,
      theta: estimation.theta,
      se: estimation.se,
      difficultyAvg: Math.round(difficultyAvg * 100) / 100,
      questionCount: responses.length,
      irtItemCoverage: irtItems.length,
      isPrimarySchool: estimation.isPrimarySchool, // 学段标识
      estimated_at: new Date().toISOString(),
    };

    await db.collection('assessments')
      .where({ assessment_id })
      .update({
        data: {
          score_estimation: scoreEstimation,
        }
      });

    return {
      success: true,
      data: scoreEstimation,
    };

  } catch (e) {
    console.error('[scoreCalibration] Error:', e);
    return { success: false, error: e.message || String(e) };
  }
};
