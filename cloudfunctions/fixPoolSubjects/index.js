/**
 * 修复 ai_question_pool 中 subject 错误的记录
 * 优先检查 geography/biology 记录是否真的是对应科目
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const GEO_KW = /地理位置|气候类型|地形特征|行政区划|省级行政区|地球运动|大洲大洋|自然资源|人口分布|中国的疆域|中国的地形|中国的气候|世界地理|板块构造|等高线|经纬度|季风气候|西北地区|青藏地区|南方地区|北方地区|河流水系|山脉高原|盆地平原|工业布局|农业类型|交通运输|城市化|区域发展|地球的形状|海陆分布|降水类型|温度带|干湿地区|中国的河流|中国的湖泊|黄土高原|长江三角洲|珠江三角洲|京津唐|辽中南/;
const BIO_KW = /细胞结构|光合作用|呼吸作用|遗传规律|生态系统|人体消化|血液循环|神经调节|免疫|DNA|基因|染色体|显微镜|组织器官|蒸腾作用|有丝分裂|减数分裂|蛋白质合成|酶促反应|激素调节|反射弧|抗体抗原|微生物|细菌|病毒|真菌|藻类|蕨类|裸子|被子/;
const MATH_KW = /二次根式|勾股定理|一次函数|平行四边形|三角形|方程|因式分解|不等式|概率|圆的|直径|半径|面积|周长|平方根|绝对值|整式|分式|全等|轴对称|相似|一元二次|韦达|完全平方|平方差|直角|锐角|钝角|内角|外角|对角线|中位线|梯形|菱形|矩形|正方形|平行|垂直|角平分线|中线|高线/;

function isActuallySubject(text, subject) {
  const kw = { geography: GEO_KW, biology: BIO_KW, math: MATH_KW }[subject];
  return kw ? kw.test(text) : false;
}

function correctSubject(text) {
  if (GEO_KW.test(text)) return 'geography';
  if (BIO_KW.test(text)) return 'biology';
  if (MATH_KW.test(text)) return 'math';
  return null;
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const startTime = Date.now();
  const TIME_LIMIT = 50000;

  let totalFixed = 0;
  let rounds = 0;

  // 优先检查 geography 和 biology 记录是否正确
  for (const checkSubject of ['geography', 'biology']) {
    let hasMore = true;
    while (hasMore && Date.now() - startTime < TIME_LIMIT) {
      rounds++;
      const result = await db.collection('ai_question_pool')
        .where({ subject: checkSubject })
        .limit(20)
        .get();

      const records = result.data || [];
      if (records.length === 0) { hasMore = false; break; }

      for (const record of records) {
        if (Date.now() - startTime >= TIME_LIMIT) break;
        const text = [record.kp_name, record.knowledge_point, record.question, record.content, record.chapter].filter(Boolean).join(' ');
        // 如果内容不含本科目关键词，但含其他科目关键词，修正
        if (!isActuallySubject(text, checkSubject)) {
          const correct = correctSubject(text);
          if (correct && correct !== checkSubject) {
            await db.collection('ai_question_pool').doc(record._id).update({ data: { subject: correct } });
            totalFixed++;
          }
        }
      }
      if (records.length < 20) hasMore = false;
    }
  }

  // 再处理没有 subject 的记录
  let hasMore = true;
  while (hasMore && Date.now() - startTime < TIME_LIMIT) {
    rounds++;
    const result = await db.collection('ai_question_pool')
      .where(_.or([{ subject: _.exists(false) }, { subject: '' }, { subject: null }]))
      .limit(20)
      .get();

    const records = result.data || [];
    if (records.length === 0) { hasMore = false; break; }

    for (const record of records) {
      if (Date.now() - startTime >= TIME_LIMIT) break;
      const text = [record.kp_name, record.knowledge_point, record.question, record.content, record.chapter].filter(Boolean).join(' ');
      const subject = correctSubject(text) || 'math';
      await db.collection('ai_question_pool').doc(record._id).update({ data: { subject } });
      totalFixed++;
    }
    if (records.length < 20) hasMore = false;
  }

  const counts = {};
  for (const s of ['math', 'geography', 'biology']) {
    const c = await db.collection('ai_question_pool').where({ subject: s }).count();
    counts[s] = c.total;
  }

  return {
    success: true,
    fixed: totalFixed,
    rounds,
    elapsed: Date.now() - startTime + 'ms',
    pool_totals: counts,
    done: totalFixed === 0 ? '全部修复完成' : '可能还有剩余，再运行一次'
  };
};
