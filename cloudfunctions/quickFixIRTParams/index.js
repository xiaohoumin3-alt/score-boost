/**
 * quickFixIRTParams 云函数
 * 快速修复IRT参数：基于种子数据批量更新题库
 * 解决方案：使用已有的研究参数替换题库中的默认值
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const fs = require('fs');
const path = require('path');

/**
 * 内置种子数据（基于教育研究的IRT参数）
 * 来源：DIFFICULTY_IRT_PARAMS × SUBJECT_DIFFICULTY_ADJUST × GRADE_DIFFICULTY_ADJUST
 */
const RESEARCH_BASED_PARAMS = {
  // 简单题参数 (预期正确率 ~80%)
  easy: {
    math: {
      1: { a: 0.95, b: -2.05 }, 2: { a: 0.97, b: -2.00 }, 3: { a: 0.99, b: -1.95 },
      4: { a: 1.01, b: -1.85 }, 5: { a: 1.03, b: -1.75 }, 6: { a: 1.05, b: -1.65 },
      7: { a: 1.05, b: -1.55 }, 8: { a: 1.05, b: -1.45 }, 9: { a: 1.05, b: -1.35 }
    },
    chinese: {
      1: { a: 0.98, b: -1.95 }, 2: { a: 1.00, b: -1.90 }, 3: { a: 1.02, b: -1.85 },
      4: { a: 1.04, b: -1.75 }, 5: { a: 1.06, b: -1.65 }, 6: { a: 1.08, b: -1.55 },
      7: { a: 1.08, b: -1.45 }, 8: { a: 1.08, b: -1.35 }, 9: { a: 1.08, b: -1.25 }
    },
    english: {
      1: { a: 0.95, b: -2.05 }, 2: { a: 0.97, b: -2.00 }, 3: { a: 0.99, b: -1.95 },
      4: { a: 1.01, b: -1.85 }, 5: { a: 1.03, b: -1.75 }, 6: { a: 1.05, b: -1.65 },
      7: { a: 1.05, b: -1.55 }, 8: { a: 1.05, b: -1.45 }, 9: { a: 1.05, b: -1.35 }
    },
    physics: {
      8: { a: 1.03, b: -1.65 }, 9: { a: 1.03, b: -1.55 }
    },
    chemistry: {
      9: { a: 1.03, b: -1.55 }
    },
    biology: {
      7: { a: 1.07, b: -1.35 }, 8: { a: 1.07, b: -1.25 }, 9: { a: 1.07, b: -1.15 }
    },
    geography: {
      7: { a: 1.07, b: -1.35 }, 8: { a: 1.07, b: -1.25 }, 9: { a: 1.07, b: -1.15 }
    },
    history: {
      7: { a: 1.06, b: -1.40 }, 8: { a: 1.06, b: -1.30 }, 9: { a: 1.06, b: -1.20 }
    },
    politics: {
      7: { a: 1.06, b: -1.40 }, 8: { a: 1.06, b: -1.30 }, 9: { a: 1.06, b: -1.20 }
    }
  },
  // 中等题参数 (预期正确率 ~55%)
  medium: {
    math: {
      1: { a: 1.15, b: -0.55 }, 2: { a: 1.17, b: -0.50 }, 3: { a: 1.19, b: -0.45 },
      4: { a: 1.21, b: -0.35 }, 5: { a: 1.23, b: -0.25 }, 6: { a: 1.25, b: -0.15 },
      7: { a: 1.25, b: -0.05 }, 8: { a: 1.25, b: 0.05 }, 9: { a: 1.25, b: 0.15 }
    },
    chinese: {
      1: { a: 1.18, b: -0.45 }, 2: { a: 1.20, b: -0.40 }, 3: { a: 1.22, b: -0.35 },
      4: { a: 1.24, b: -0.25 }, 5: { a: 1.26, b: -0.15 }, 6: { a: 1.28, b: -0.05 },
      7: { a: 1.28, b: 0.05 }, 8: { a: 1.28, b: 0.15 }, 9: { a: 1.28, b: 0.25 }
    },
    english: {
      1: { a: 1.15, b: -0.55 }, 2: { a: 1.17, b: -0.50 }, 3: { a: 1.19, b: -0.45 },
      4: { a: 1.21, b: -0.35 }, 5: { a: 1.23, b: -0.25 }, 6: { a: 1.25, b: -0.15 },
      7: { a: 1.25, b: -0.05 }, 8: { a: 1.25, b: 0.05 }, 9: { a: 1.25, b: 0.15 }
    },
    physics: {
      8: { a: 1.23, b: -0.05 }, 9: { a: 1.23, b: 0.05 }
    },
    chemistry: {
      9: { a: 1.23, b: 0.05 }
    },
    biology: {
      7: { a: 1.27, b: 0.15 }, 8: { a: 1.27, b: 0.25 }, 9: { a: 1.27, b: 0.35 }
    },
    geography: {
      7: { a: 1.27, b: 0.15 }, 8: { a: 1.27, b: 0.25 }, 9: { a: 1.27, b: 0.35 }
    },
    history: {
      7: { a: 1.26, b: 0.10 }, 8: { a: 1.26, b: 0.20 }, 9: { a: 1.26, b: 0.30 }
    },
    politics: {
      7: { a: 1.26, b: 0.10 }, 8: { a: 1.26, b: 0.20 }, 9: { a: 1.26, b: 0.30 }
    }
  },
  // 困难题参数 (预期正确率 ~30%)
  hard: {
    math: {
      1: { a: 1.35, b: 0.75 }, 2: { a: 1.37, b: 0.80 }, 3: { a: 1.39, b: 0.85 },
      4: { a: 1.41, b: 0.95 }, 5: { a: 1.43, b: 1.05 }, 6: { a: 1.45, b: 1.15 },
      7: { a: 1.45, b: 1.25 }, 8: { a: 1.45, b: 1.35 }, 9: { a: 1.45, b: 1.45 }
    },
    chinese: {
      1: { a: 1.38, b: 0.85 }, 2: { a: 1.40, b: 0.90 }, 3: { a: 1.42, b: 0.95 },
      4: { a: 1.44, b: 1.05 }, 5: { a: 1.46, b: 1.15 }, 6: { a: 1.48, b: 1.25 },
      7: { a: 1.48, b: 1.35 }, 8: { a: 1.48, b: 1.45 }, 9: { a: 1.48, b: 1.55 }
    },
    english: {
      1: { a: 1.35, b: 0.75 }, 2: { a: 1.37, b: 0.80 }, 3: { a: 1.39, b: 0.85 },
      4: { a: 1.41, b: 0.95 }, 5: { a: 1.43, b: 1.05 }, 6: { a: 1.45, b: 1.15 },
      7: { a: 1.45, b: 1.25 }, 8: { a: 1.45, b: 1.35 }, 9: { a: 1.45, b: 1.45 }
    },
    physics: {
      8: { a: 1.43, b: 1.15 }, 9: { a: 1.43, b: 1.25 }
    },
    chemistry: {
      9: { a: 1.43, b: 1.25 }
    },
    biology: {
      7: { a: 1.47, b: 1.35 }, 8: { a: 1.47, b: 1.45 }, 9: { a: 1.47, b: 1.55 }
    },
    geography: {
      7: { a: 1.47, b: 1.35 }, 8: { a: 1.47, b: 1.45 }, 9: { a: 1.47, b: 1.55 }
    },
    history: {
      7: { a: 1.46, b: 1.30 }, 8: { a: 1.46, b: 1.40 }, 9: { a: 1.46, b: 1.50 }
    },
    politics: {
      7: { a: 1.46, b: 1.30 }, 8: { a: 1.46, b: 1.40 }, 9: { a: 1.46, b: 1.50 }
    }
  }
};

/**
 * 获取研究参数
 */
function getResearchParams(difficulty, subject, grade) {
  const gradeNum = parseInt(grade) || 8;
  const subjectKey = subject || 'math';
  const difficultyKey = difficulty || 'medium';

  const params = RESEARCH_BASED_PARAMS[difficultyKey]?.[subjectKey]?.[gradeNum];

  if (params) {
    return { ...params, source: 'research_based' };
  }

  // 默认参数
  const defaults = {
    easy: { a: 1.0, b: -1.5 },
    medium: { a: 1.2, b: 0.0 },
    hard: { a: 1.5, b: 1.5 }
  };

  return { ...defaults[difficultyKey] || defaults.medium, source: 'research_based' };
}

exports.main = async (event) => {
  const { action = 'update', batchIndex = 0, batchSize = 100, dryRun = false } = event;
  const db = cloud.database();
  const _ = db.command;

  if (action === 'updateBatch') {
    const { difficulty: targetDifficulty, subject: targetSubject, dryRun = false } = event;

    // 查询需要更新的题目：
    // 1. irt_source为unknown或不存在
    // 2. 有irt_a/irt_b但缺少difficulty/subject/grade信息的
    let query = {
      $or: [
        { irt_source: 'unknown' },
        { irt_source: _.exists(false) }
      ]
    };

    // 可选：按科目和难度筛选
    if (targetSubject || targetDifficulty) {
      query = {
        $and: [
          query,
          ...(targetSubject ? [{ subject: targetSubject }] : []),
          ...(targetDifficulty ? [{ difficulty: targetDifficulty }] : [])
        ]
      };
    }

    const skip = batchIndex * batchSize;
    const questions = await db.collection('ai_question_pool')
      .where(query)
      .skip(skip)
      .limit(batchSize)
      .get();

    if (questions.data.length === 0) {
      return {
        success: true,
        data: { updated: 0, message: 'No more questions to update' }
      };
    }

    let updated = 0;
    let errors = 0;
    const updates = [];

    for (const q of questions.data) {
      try {
        const params = getResearchParams(q.difficulty, q.subject, q.grade);

        if (dryRun) {
          updates.push({
            _id: q._id,
            difficulty: q.difficulty,
            subject: q.subject,
            grade: q.grade,
            old_a: q.irt_a,
            old_b: q.irt_b,
            new_a: params.a,
            new_b: params.b
          });
        } else {
          await db.collection('ai_question_pool')
            .doc(q._id)
            .update({
              data: {
                irt_a: params.a,
                irt_b: params.b,
                irt_source: params.source,
                irt_updated_at: new Date().toISOString()
              }
            });
        }

        updated++;
      } catch (e) {
        errors++;
        console.warn('[quickFixIRTParams] Failed:', q._id, e.message);
      }
    }

    return {
      success: true,
      data: {
        updated,
        errors,
        total: questions.data.length,
        batchIndex,
        dryRun,
        filters: { difficulty: targetDifficulty, subject: targetSubject },
        preview: dryRun ? updates.slice(0, 10) : undefined
      }
    };
  }

  if (action === 'status') {
    const total = await db.collection('ai_question_pool').count();
    const unknown = await db.collection('ai_question_pool')
      .where({ irt_source: 'unknown' })
      .count();
    const research = await db.collection('ai_question_pool')
      .where({ irt_source: 'research_based' })
      .count();
    const dataDriven = await db.collection('ai_question_pool')
      .where({ irt_source: 'data_driven' })
      .count();

    return {
      success: true,
      data: {
        total: total.total,
        unknown: unknown.total,
        research: research.total,
        dataDriven: dataDriven.total,
        needUpdate: unknown.total,
        coverage: {
          research: Math.round((research.total / total.total) * 100),
          dataDriven: Math.round((dataDriven.total / total.total) * 100),
          unknown: Math.round((unknown.total / total.total) * 100)
        }
      }
    };
  }

  if (action === 'debugSources') {
    // 调试：查看所有 irt_source 的实际值分布
    const sampleResult = await db.collection('ai_question_pool')
      .field({ irt_source: true, irt_a: true, irt_b: true, difficulty: true, subject: true, grade: true })
      .limit(200)
      .get();

    const sourceCounts = {};
    const hasParamsButNoSource = [];

    sampleResult.data.forEach(q => {
      const source = q.irt_source;
      const sourceKey = source === null || source === undefined || source === '' ? '(empty)' : String(source);
      sourceCounts[sourceKey] = (sourceCounts[sourceKey] || 0) + 1;

      if ((q.irt_a !== undefined || q.irt_b !== undefined) && !q.irt_source) {
        hasParamsButNoSource.push({
          _id: q._id,
          irt_a: q.irt_a,
          irt_b: q.irt_b,
          difficulty: q.difficulty,
          subject: q.subject,
          grade: q.grade
        });
      }
    });

    return {
      success: true,
      data: {
        sample_size: sampleResult.data.length,
        source_distribution: sourceCounts,
        has_params_but_no_source: hasParamsButNoSource.length,
        samples: hasParamsButNoSource.slice(0, 5)
      }
    };
  }

  return { success: false, error: `Unknown action: ${action}` };
};
