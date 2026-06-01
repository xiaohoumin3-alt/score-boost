/**
 * 题库 - 预置题目，支持离线快速出题
 */

const QUESTION_BANK = {
  kp1_1: [
    { content: '下列哪个是二次根式？', options: ['A. √5', 'B. 3²', 'C. -2', 'D. 1/2'], correct_answer: 'A', difficulty: 'easy' },
    { content: '下列哪个式子有意义？', options: ['A. √(-4)', 'B. √4', 'C. √(-1)', 'D. √(-9)'], correct_answer: 'B', difficulty: 'easy' },
    { content: '当x满足什么条件时，√(x-1)有意义？', options: ['A. x≥1', 'B. x≤1', 'C. x>1', 'D. x<1'], correct_answer: 'A', difficulty: 'medium' },
    { content: '√16的值是？', options: ['A. 4', 'B. ±4', 'C. 8', 'D. -4'], correct_answer: 'A', difficulty: 'easy' },
  ],
  kp1_2: [
    { content: '(√3)² 的值是？', options: ['A. 3', 'B. 6', 'C. 9', 'D. √3'], correct_answer: 'A', difficulty: 'easy' },
    { content: '√(5²)的值是？', options: ['A. 5', 'B. -5', 'C. ±5', 'D. 25'], correct_answer: 'A', difficulty: 'easy' },
    { content: '√(a²)=|a|，当a<0时，√(a²)等于？', options: ['A. a', 'B. -a', 'C. a²', 'D. -a²'], correct_answer: 'B', difficulty: 'medium' },
    { content: '化简√48的结果是？', options: ['A. 4√3', 'B. 3√4', 'C. 2√12', 'D. 8√3'], correct_answer: 'A', difficulty: 'medium' },
  ],
  kp1_3: [
    { content: '√12 化简后等于？', options: ['A. 2√3', 'B. 3√2', 'C. 4√3', 'D. 6'], correct_answer: 'A', difficulty: 'easy' },
    { content: '√2 × √8 的值是？', options: ['A. 4', 'B. √16', 'C. 2√2', 'D. 8'], correct_answer: 'A', difficulty: 'easy' },
    { content: '√18 ÷ √2 的值是？', options: ['A. 3', 'B. √9', 'C. √16', 'D. 9'], correct_answer: 'A', difficulty: 'medium' },
    { content: '分母有理化：1/√3 = ？', options: ['A. √3', 'B. √3/3', 'C. 3√3', 'D. 1/3√3'], correct_answer: 'B', difficulty: 'medium' },
  ],
  kp2_1: [
    { content: '直角三角形两直角边为3和4，斜边长为？', options: ['A. 5', 'B. 6', 'C. 7', 'D. 12'], correct_answer: 'A', difficulty: 'easy' },
    { content: '在直角三角形中，a=5，b=12，则c=？', options: ['A. 13', 'B. 17', 'C. 7', 'D. 60'], correct_answer: 'A', difficulty: 'easy' },
    { content: '等边三角形边长为6，高为？', options: ['A. 3√3', 'B. 3', 'C. 6', 'D. 3√2'], correct_answer: 'A', difficulty: 'medium' },
    { content: '菱形对角线长为6和8，边长为？', options: ['A. 5', 'B. 7', 'C. 10', 'D. 14'], correct_answer: 'A', difficulty: 'medium' },
  ],
  kp2_2: [
    { content: '三边长为5, 12, 13的三角形是？', options: ['A. 直角三角形', 'B. 锐角三角形', 'C. 钝角三角形', 'D. 无法确定'], correct_answer: 'A', difficulty: 'easy' },
    { content: '三边为3,4,6的三角形是什么三角形？', options: ['A. 钝角三角形', 'B. 直角三角形', 'C. 锐角三角形', 'D. 等腰三角形'], correct_answer: 'A', difficulty: 'medium' },
    { content: '判断：边长为7,24,25的三角形是直角三角形吗？', options: ['A. 是', 'B. 不是', 'C. 无法判断', 'D. 等腰直角三角形'], correct_answer: 'A', difficulty: 'easy' },
  ],
  kp2_3: [
    { content: '一个梯子长5米，底端离墙3米，顶端离地面多高？', options: ['A. 4米', 'B. 3米', 'C. 2米', 'D. 5米'], correct_answer: 'A', difficulty: 'easy' },
    { content: '从A点到B点，走路4km，向北走3km，AB距离为？', options: ['A. 5km', 'B. 7km', 'C. 1km', 'D. 12km'], correct_answer: 'A', difficulty: 'easy' },
    { content: '正方形边长为5√2，对角线长为？', options: ['A. 10', 'B. 5', 'C. 10√2', 'D. 5√4'], correct_answer: 'A', difficulty: 'medium' },
  ],
  kp3_1: [
    { content: '平行四边形的对角线有什么性质？', options: ['A. 互相平分', 'B. 相等', 'C. 垂直', 'D. 互相垂直平分'], correct_answer: 'A', difficulty: 'easy' },
    { content: '平行四边形 ABCD 中，∠A=60°，则∠C=？', options: ['A. 60°', 'B. 120°', 'C. 90°', 'D. 30°'], correct_answer: 'A', difficulty: 'easy' },
    { content: '平行四边形周长为20，相邻两边之比为3:2，则较长边为？', options: ['A. 6', 'B. 4', 'C. 10', 'D. 5'], correct_answer: 'A', difficulty: 'medium' },
  ],
  kp3_2: [
    { content: '下列哪个条件不能判定四边形是平行四边形？', options: ['A. 一组对边平行', 'B. 两组对边分别平行', 'C. 两组对边分别相等', 'D. 对角线互相平分'], correct_answer: 'A', difficulty: 'easy' },
    { content: '一组对边平行且相等的四边形是？', options: ['A. 平行四边形', 'B. 矩形', 'C. 菱形', 'D. 梯形'], correct_answer: 'A', difficulty: 'medium' },
    { content: '对角线互相平分的四边形是？', options: ['A. 平行四边形', 'B. 矩形', 'C. 菱形', 'D. 正方形'], correct_answer: 'A', difficulty: 'easy' },
  ],
  kp3_3: [
    { content: '矩形的对角线有什么特点？', options: ['A. 相等', 'B. 垂直', 'C. 不相等', 'D. 互相垂直'], correct_answer: 'A', difficulty: 'easy' },
    { content: '菱形的对角线有什么特点？', options: ['A. 互相垂直平分', 'B. 相等', 'C. 平行', 'D. 相等且平分'], correct_answer: 'A', difficulty: 'easy' },
    { content: '正方形是特殊的？', options: ['A. 矩形且菱形', 'B. 只有矩形', 'C. 只有菱形', 'D. 梯形'], correct_answer: 'A', difficulty: 'easy' },
  ],
  kp4_1: [
    { content: '在函数y=2x+1中，当x=3时，y的值为？', options: ['A. 7', 'B. 5', 'C. 6', 'D. 8'], correct_answer: 'A', difficulty: 'easy' },
    { content: '下列哪个是函数关系？', options: ['A. y=±√x', 'B. y=2x', 'C. x=y²', 'D. x²+y²=1'], correct_answer: 'A', difficulty: 'medium' },
    { content: '函数y=x²中，x的取值范围是？', options: ['A. 全体实数', 'B. x≥0', 'C. x≤0', 'D. x≠0'], correct_answer: 'A', difficulty: 'easy' },
  ],
  kp4_2: [
    { content: '一次函数y=2x+1的图像经过哪个点？', options: ['A. (0,1)', 'B. (1,0)', 'C. (0,2)', 'D. (2,0)'], correct_answer: 'A', difficulty: 'easy' },
    { content: 'y=3x-2与y轴交点坐标是？', options: ['A. (0,-2)', 'B. (0,2)', 'C. (2,0)', 'D. (-2,0)'], correct_answer: 'A', difficulty: 'easy' },
    { content: '一次函数y=kx+b，k>0，b>0，图像不经过哪个象限？', options: ['A. 第三象限', 'B. 第一象限', 'C. 第二象限', 'D. 第四象限'], correct_answer: 'A', difficulty: 'medium' },
  ],
  kp4_3: [
    { content: '小明以2元/支的价格买铅笔，花y元买x支，函数关系式为？', options: ['A. y=2x', 'B. y=x+2', 'C. y=2/x', 'D. y=x-2'], correct_answer: 'A', difficulty: 'easy' },
    { content: '出租车起价10元，每公里2元，费用y与里程x的函数是？', options: ['A. y=2x+10', 'B. y=10x+2', 'C. y=2x', 'D. y=x+12'], correct_answer: 'A', difficulty: 'easy' },
    { content: '某种商品进价100元，售价150元，卖出m件的利润是？', options: ['A. 50m', 'B. 150m', 'C. 100m', 'D. 250m'], correct_answer: 'A', difficulty: 'medium' },
  ],
  kp5_1: [
    { content: '数据2, 3, 5, 5, 7的众数是？', options: ['A. 5', 'B. 4.4', 'C. 4', 'D. 3'], correct_answer: 'A', difficulty: 'easy' },
    { content: '数据1,2,3,4,5的平均数是？', options: ['A. 3', 'B. 2.5', 'C. 4', 'D. 3.5'], correct_answer: 'A', difficulty: 'easy' },
    { content: '数据3,3,3,3,3,3的中位数是？', options: ['A. 3', 'B. 3.5', 'C. 4', 'D. 2.5'], correct_answer: 'A', difficulty: 'easy' },
  ],
  kp5_2: [
    { content: '数据1, 1, 1, 1的方差是？', options: ['A. 0', 'B. 1', 'C. 4', 'D. 0.5'], correct_answer: 'A', difficulty: 'easy' },
    { content: '数据2,4,6,8的方差是？', options: ['A. 4', 'B. 5', 'C. 8', 'D. 2'], correct_answer: 'A', difficulty: 'medium' },
    { content: '方差越大，说明数据？', options: ['A. 波动越大', 'B. 波动越小', 'C. 越稳定', 'D. 越集中'], correct_answer: 'A', difficulty: 'easy' },
  ],
};

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateQuestions(plan, numQuestions = 5) {
  const questions = [];
  const kpCount = {};

  for (let i = 0; i < Math.min(numQuestions, plan.length); i++) {
    const item = plan[i];
    const kpId = item.kp.kp_id;
    const difficulty = item.difficulty;

    if (!kpCount[kpId]) kpCount[kpId] = 0;

    const bank = QUESTION_BANK[kpId];
    if (bank) {
      const matching = bank.filter(q => q.difficulty === difficulty);
      const source = matching.length > 0 ? matching : bank;
      // 用索引轮换选择题目，确保不重复
      const q = source[kpCount[kpId] % source.length];

      // 转换 options 格式: ['A. xxx', 'B. xxx'] -> [{key: 'A', value: 'xxx'}, ...]
      const optionsFormatted = q.options.map(opt => {
        const match = opt.match(/^([A-D])\.\s*(.+)$/);
        if (match) {
          return { key: match[1], value: match[2] };
        }
        return { key: '', value: opt };
      });

      questions.push({
        id: `q${kpCount[kpId] + 1}_${kpId}`,
        type: 'choice',
        content: q.content,
        options: optionsFormatted,
        correct_answer: q.correct_answer,
        knowledge_point: item.kp.kp_name,
        knowledge_point_id: kpId,
        difficulty: difficulty,
        chapter: item.kp.chapter_name,
      });
      kpCount[kpId]++;
    }
  }

  return questions;
}

function getAllKpIds() {
  return Object.keys(QUESTION_BANK);
}

module.exports = {
  QUESTION_BANK,
  generateQuestions,
  getAllKpIds,
};
