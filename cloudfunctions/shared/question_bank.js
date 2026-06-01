/**
 * 题库 - 预置题目，支持离线快速出题
 * 当题库中没有目标难度题目时，回退到AI生成，确保题目难度符合预期
 */

const { createLLMClient } = require('./llm-core');

// LLM客户端实例（按需初始化）
let llmClient = null;

function getLlmClient() {
  if (!llmClient) {
    llmClient = createLLMClient();
  }
  return llmClient;
}

const QUESTION_BANK = {
  kp1_1: [
    { content: '下列哪个是二次根式？', options: ['A. √5', 'B. 3²', 'C. -2', 'D. 1/2'], correct_answer: 'A', difficulty: 'easy' },
    { content: '下列哪个式子有意义？', options: ['A. √(-4)', 'B. √4', 'C. √(-1)', 'D. √(-9)'], correct_answer: 'B', difficulty: 'easy' },
    { content: '当x满足什么条件时，√(x-1)有意义？', options: ['A. x≥1', 'B. x≤1', 'C. x>1', 'D. x<1'], correct_answer: 'A', difficulty: 'medium' },
    { content: '√16的值是？', options: ['A. 4', 'B. ±4', 'C. 8', 'D. -4'], correct_answer: 'A', difficulty: 'easy' },
    { content: '若√(a+2) + √(3-a)有意义，则a的取值范围是？', options: ['A. -2≤a≤3', 'B. a≥-2', 'C. a≤3', 'D. -2<a<3'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp1_2: [
    { content: '(√3)² 的值是？', options: ['A. 3', 'B. 6', 'C. 9', 'D. √3'], correct_answer: 'A', difficulty: 'easy' },
    { content: '√(5²)的值是？', options: ['A. 5', 'B. -5', 'C. ±5', 'D. 25'], correct_answer: 'A', difficulty: 'easy' },
    { content: '√(a²)=|a|，当a<0时，√(a²)等于？', options: ['A. a', 'B. -a', 'C. a²', 'D. -a²'], correct_answer: 'B', difficulty: 'medium' },
    { content: '化简√48的结果是？', options: ['A. 4√3', 'B. 3√4', 'C. 2√12', 'D. 8√3'], correct_answer: 'A', difficulty: 'medium' },
    { content: '若a<0，b<0，化简√(a²b²)的结果是？', options: ['A. -ab', 'B. ab', 'C. a²b²', 'D. |a||b|'], correct_answer: 'A', difficulty: 'hard' },
    { content: '已知x = √5 + 1，则x² - 2x + 1的值是？', options: ['A. 5', 'B. 4', 'C. 6', 'D. 7'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp1_3: [
    { content: '√12 化简后等于？', options: ['A. 2√3', 'B. 3√2', 'C. 4√3', 'D. 6'], correct_answer: 'A', difficulty: 'easy' },
    { content: '√2 × √8 的值是？', options: ['A. 4', 'B. √16', 'C. 2√2', 'D. 8'], correct_answer: 'A', difficulty: 'easy' },
    { content: '√18 ÷ √2 的值是？', options: ['A. 3', 'B. √9', 'C. √16', 'D. 9'], correct_answer: 'A', difficulty: 'medium' },
    { content: '分母有理化：1/√3 = ？', options: ['A. √3', 'B. √3/3', 'C. 3√3', 'D. 1/3√3'], correct_answer: 'B', difficulty: 'medium' },
    { content: '若 √(a-1) + √(b+2) = 0，则 a + b = ？', options: ['A. -1', 'B. 1', 'C. 0', 'D. 3'], correct_answer: 'A', difficulty: 'hard' },
    { content: '计算：(√6 + √2)(√6 - √2) - √8的结果是？', options: ['A. 4 - 2√2', 'B. 2√2', 'C. 4', 'D. 6'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp2_1: [
    { content: '直角三角形两直角边为3和4，斜边长为？', options: ['A. 5', 'B. 6', 'C. 7', 'D. 12'], correct_answer: 'A', difficulty: 'easy' },
    { content: '在直角三角形中，a=5，b=12，则c=？', options: ['A. 13', 'B. 17', 'C. 7', 'D. 60'], correct_answer: 'A', difficulty: 'easy' },
    { content: '等边三角形边长为6，高为？', options: ['A. 3√3', 'B. 3', 'C. 6', 'D. 3√2'], correct_answer: 'A', difficulty: 'medium' },
    { content: '菱形对角线长为6和8，边长为？', options: ['A. 5', 'B. 7', 'C. 10', 'D. 14'], correct_answer: 'A', difficulty: 'medium' },
    { content: '直角三角形斜边上的高将斜边分成两段，长分别为4和9，则斜边上的高是？', options: ['A. 6', 'B. 5', 'C. 7', 'D. 8'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp2_2: [
    { content: '三边长为5, 12, 13的三角形是？', options: ['A. 直角三角形', 'B. 锐角三角形', 'C. 钝角三角形', 'D. 无法确定'], correct_answer: 'A', difficulty: 'easy' },
    { content: '三边为3,4,6的三角形是什么三角形？', options: ['A. 钝角三角形', 'B. 直角三角形', 'C. 锐角三角形', 'D. 等腰三角形'], correct_answer: 'A', difficulty: 'medium' },
    { content: '判断：边长为7,24,25的三角形是直角三角形吗？', options: ['A. 是', 'B. 不是', 'C. 无法判断', 'D. 等腰直角三角形'], correct_answer: 'A', difficulty: 'easy' },
    { content: '若三角形三边长分别为√2, √3, √5，则这个三角形是什么三角形？', options: ['A. 直角三角形', 'B. 锐角三角形', 'C. 钝角三角形', 'D. 等腰三角形'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp2_3: [
    { content: '一个梯子长5米，底端离墙3米，顶端离地面多高？', options: ['A. 4米', 'B. 3米', 'C. 2米', 'D. 5米'], correct_answer: 'A', difficulty: 'easy' },
    { content: '从A点到B点，走路4km，向北走3km，AB距离为？', options: ['A. 5km', 'B. 7km', 'C. 1km', 'D. 12km'], correct_answer: 'A', difficulty: 'easy' },
    { content: '正方形边长为5√2，对角线长为？', options: ['A. 10', 'B. 5', 'C. 10√2', 'D. 5√4'], correct_answer: 'A', difficulty: 'medium' },
    { content: '一只蚂蚁从长方体一个顶点沿表面爬到相对顶点，长方体长宽高分别为3,4,5，最短路径为？', options: ['A. √74', 'B. √90', 'C. √50', 'D. 10'], correct_answer: 'A', difficulty: 'hard' },
    { content: '在平面直角坐标系中，点A(-3,0)，点B(0,4)，点P在x轴上，且PA+PB最小，则点P坐标是？', options: ['A. (-9/7, 0)', 'B. (-1, 0)', 'C. (0, 0)', 'D. (-2, 0)'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp3_1: [
    { content: '平行四边形的对角线有什么性质？', options: ['A. 互相平分', 'B. 相等', 'C. 垂直', 'D. 互相垂直平分'], correct_answer: 'A', difficulty: 'easy' },
    { content: '平行四边形 ABCD 中，∠A=60°，则∠C=？', options: ['A. 60°', 'B. 120°', 'C. 90°', 'D. 30°'], correct_answer: 'A', difficulty: 'easy' },
    { content: '平行四边形周长为20，相邻两边之比为3:2，则较长边为？', options: ['A. 6', 'B. 4', 'C. 10', 'D. 5'], correct_answer: 'A', difficulty: 'medium' },
    { content: '平行四边形ABCD中，对角线AC与BD相交于点O，若AO=3，BO=5，则AB的取值范围是？', options: ['A. 2<AB<8', 'B. AB>5', 'C. AB<3', 'D. 0<AB<15'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp3_2: [
    { content: '下列哪个条件不能判定四边形是平行四边形？', options: ['A. 一组对边平行', 'B. 两组对边分别平行', 'C. 两组对边分别相等', 'D. 对角线互相平分'], correct_answer: 'A', difficulty: 'easy' },
    { content: '一组对边平行且相等的四边形是？', options: ['A. 平行四边形', 'B. 矩形', 'C. 菱形', 'D. 梯形'], correct_answer: 'A', difficulty: 'medium' },
    { content: '对角线互相平分的四边形是？', options: ['A. 平行四边形', 'B. 矩形', 'C. 菱形', 'D. 正方形'], correct_answer: 'A', difficulty: 'easy' },
    { content: '在平行四边形ABCD中，若AB=5，BC=3，对角线AC的取值范围是？', options: ['A. 2<AC<8', 'B. 0<AC<15', 'C. AC>5', 'D. AC<3'], correct_answer: 'A', difficulty: 'hard' },
    { content: '在四边形ABCD中，AB∥CD，AB=CD，添加一个条件后可判定ABCD是平行四边形，不能添加的是？', options: ['A. AD∥BC', 'B. AD=BC', 'C. ∠A=∠C', 'D. ∠B=∠D'], correct_answer: 'C', difficulty: 'hard' },
  ],
  kp3_3: [
    { content: '矩形的对角线有什么特点？', options: ['A. 相等', 'B. 垂直', 'C. 不相等', 'D. 互相垂直'], correct_answer: 'A', difficulty: 'easy' },
    { content: '菱形的对角线有什么特点？', options: ['A. 互相垂直平分', 'B. 相等', 'C. 平行', 'D. 相等且平分'], correct_answer: 'A', difficulty: 'easy' },
    { content: '正方形是特殊的？', options: ['A. 矩形且菱形', 'B. 只有矩形', 'C. 只有菱形', 'D. 梯形'], correct_answer: 'A', difficulty: 'easy' },
    { content: '一个四边形的四条边都相等，对角线相等，则这个四边形是？', options: ['A. 正方形', 'B. 菱形', 'C. 矩形', 'D. 平行四边形'], correct_answer: 'A', difficulty: 'hard' },
    { content: '矩形ABCD中，对角线AC与BD相交于点O，若AB=6，OA=5，则矩形周长是？', options: ['A. 28', 'B. 24', 'C. 20', 'D. 32'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp4_1: [
    { content: '在函数y=2x+1中，当x=3时，y的值为？', options: ['A. 7', 'B. 5', 'C. 6', 'D. 8'], correct_answer: 'A', difficulty: 'easy' },
    { content: '下列哪个是函数关系？', options: ['A. y=±√x', 'B. y=2x', 'C. x=y²', 'D. x²+y²=1'], correct_answer: 'A', difficulty: 'medium' },
    { content: '函数y=x²中，x的取值范围是？', options: ['A. 全体实数', 'B. x≥0', 'C. x≤0', 'D. x≠0'], correct_answer: 'A', difficulty: 'easy' },
    { content: '若函数y=√(x-2)有意义，且y=3，则x的值是？', options: ['A. 11', 'B. 7', 'C. 5', 'D. 9'], correct_answer: 'A', difficulty: 'hard' },
    { content: '已知函数y = √(x-3) + √(6-x)，则x的取值范围和y的最大值是？', options: ['A. 3≤x≤6，y最大值为√3', 'B. x>3，y最大值为3', 'C. 3<x<6，y最大值为6', 'D. x≥3，y最大值为√6'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp4_2: [
    { content: '一次函数y=2x+1的图像经过哪个点？', options: ['A. (0,1)', 'B. (1,0)', 'C. (0,2)', 'D. (2,0)'], correct_answer: 'A', difficulty: 'easy' },
    { content: 'y=3x-2与y轴交点坐标是？', options: ['A. (0,-2)', 'B. (0,2)', 'C. (2,0)', 'D. (-2,0)'], correct_answer: 'A', difficulty: 'easy' },
    { content: '一次函数y=kx+b，k>0，b>0，图像不经过哪个象限？', options: ['A. 第三象限', 'B. 第一象限', 'C. 第二象限', 'D. 第四象限'], correct_answer: 'A', difficulty: 'medium' },
    { content: '若一次函数y=kx+b的图像经过点(1,3)和点(-1,7)，则k与b的值是？', options: ['A. k=-2, b=5', 'B. k=2, b=1', 'C. k=-1, b=4', 'D. k=1, b=2'], correct_answer: 'A', difficulty: 'hard' },
    { content: '一次函数y=kx+b的图像经过第一、二、四象限，则k和b的符号是？', options: ['A. k<0，b>0', 'B. k>0，b>0', 'C. k<0，b<0', 'D. k>0，b<0'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp4_3: [
    { content: '小明以2元/支的价格买铅笔，花y元买x支，函数关系式为？', options: ['A. y=2x', 'B. y=x+2', 'C. y=2/x', 'D. y=x-2'], correct_answer: 'A', difficulty: 'easy' },
    { content: '出租车起价10元，每公里2元，费用y与里程x的函数是？', options: ['A. y=2x+10', 'B. y=10x+2', 'C. y=2x', 'D. y=x+12'], correct_answer: 'A', difficulty: 'easy' },
    { content: '某种商品进价100元，售价150元，卖出m件的利润是？', options: ['A. 50m', 'B. 150m', 'C. 100m', 'D. 250m'], correct_answer: 'A', difficulty: 'medium' },
    { content: '水箱中有水100升，每分钟流出5升，同时流入2升，几分钟后水箱水量减少一半？', options: ['A. 20分钟', 'B. 10分钟', 'C. 15分钟', 'D. 25分钟'], correct_answer: 'A', difficulty: 'hard' },
    { content: '甲、乙两人分别从A、B两地同时出发相向而行，甲速度为5km/h，乙速度为3km/h，2小时后相遇。若甲单独走完全程需要？', options: ['A. 3.2小时', 'B. 4小时', 'C. 3小时', 'D. 5小时'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp5_1: [
    { content: '数据2, 3, 5, 5, 7的众数是？', options: ['A. 5', 'B. 4.4', 'C. 4', 'D. 3'], correct_answer: 'A', difficulty: 'easy' },
    { content: '数据1,2,3,4,5的平均数是？', options: ['A. 3', 'B. 2.5', 'C. 4', 'D. 3.5'], correct_answer: 'A', difficulty: 'easy' },
    { content: '数据3,3,3,3,3,3的中位数是？', options: ['A. 3', 'B. 3.5', 'C. 4', 'D. 2.5'], correct_answer: 'A', difficulty: 'easy' },
    { content: '一组数据从小到大排列为：2, x, 5, 7, y，已知中位数是6，平均数也是6，则x和y的值是？', options: ['A. x=5, y=10', 'B. x=4, y=12', 'C. x=6, y=9', 'D. x=5, y=11'], correct_answer: 'A', difficulty: 'hard' },
    { content: '一组数据：3, 5, 7, 9, x。若中位数与平均数相等，则x的值是？', options: ['A. 6或9', 'B. 7', 'C. 8', 'D. 5或11'], correct_answer: 'A', difficulty: 'hard' },
  ],
  kp5_2: [
    { content: '数据1, 1, 1, 1的方差是？', options: ['A. 0', 'B. 1', 'C. 4', 'D. 0.5'], correct_answer: 'A', difficulty: 'easy' },
    { content: '数据2,4,6,8的方差是？', options: ['A. 4', 'B. 5', 'C. 8', 'D. 2'], correct_answer: 'A', difficulty: 'medium' },
    { content: '方差越大，说明数据？', options: ['A. 波动越大', 'B. 波动越小', 'C. 越稳定', 'D. 越集中'], correct_answer: 'A', difficulty: 'easy' },
    { content: '甲组数据：1, 2, 3, 4, 5；乙组数据：2, 3, 3, 3, 4。哪组数据更稳定？', options: ['A. 乙组', 'B. 甲组', 'C. 一样稳定', 'D. 无法判断'], correct_answer: 'A', difficulty: 'hard' },
    { content: '一组数据的方差为4，若每个数据都乘以2，则新数据的方差是？', options: ['A. 16', 'B. 8', 'C. 4', 'D. 2'], correct_answer: 'A', difficulty: 'hard' },
  ],
};

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 使用AI生成题目（当题库中无匹配难度时回退）
 * @param {Object} params - 生成参数
 * @param {string} params.kp_name - 知识点名称
 * @param {string} params.difficulty - 难度 easy/medium/hard
 * @param {string} params.chapter - 章节
 * @returns {Promise<Object|null>} 生成的题目对象，失败返回null
 */
async function generateQuestionWithAI(params) {
  try {
    const llm = getLlmClient();
    const result = await llm.complete({
      systemPrompt: '你是一个专业的数学题目生成助手。请严格按照用户要求的JSON格式返回题目。',
      userPrompt: `请为以下知识点生成一道${params.difficulty === 'easy' ? '简单' : params.difficulty === 'medium' ? '中等' : '困难'}难度的选择题：

知识点：${params.kp_name}
章节：${params.chapter || '通用'}

要求：
1. 题目清晰明确
2. 4个选项，只有一个正确
3. 提供详细解析
4. **只返回纯JSON格式，不要任何其他文字**

JSON格式：
{
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "correct_answer": 0,
  "explanation": "解析内容"
}`,
      temperature: 0.7,
      maxTokens: 500
    });

    // 解析AI返回的JSON
    let aiQuestion;
    try {
      // 清理可能的markdown代码块标记
      let content = result.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      aiQuestion = JSON.parse(content);
    } catch (parseError) {
      console.error('[question_bank] AI返回解析失败:', parseError, 'raw:', result.content);
      return null;
    }

    // 转换为统一格式
    return {
      content: aiQuestion.question || aiQuestion.content,
      options: aiQuestion.options || [],
      correct_answer: typeof aiQuestion.correct_answer === 'number'
        ? ['A', 'B', 'C', 'D'][aiQuestion.correct_answer]
        : aiQuestion.correct_answer,
      difficulty: params.difficulty,
      ai_generated: true,
    };
  } catch (error) {
    console.error('[question_bank] AI生成失败:', error.message);
    return null;
  }
}

async function generateQuestions(plan, numQuestions = 5) {
  const questions = [];
  const kpCount = {};

  for (let i = 0; i < Math.min(numQuestions, plan.length); i++) {
    const item = plan[i];
    const kpId = item.kp.kp_id;
    const difficulty = item.difficulty;

    if (!kpCount[kpId]) kpCount[kpId] = 0;

    const bank = QUESTION_BANK[kpId];
    if (bank) {
      // 先尝试从题库中找匹配难度的题目
      const matching = bank.filter(q => q.difficulty === difficulty);

      let q;
      let usedFallback = false;

      if (matching.length > 0) {
        // 题库中有匹配难度，直接使用
        q = randomChoice(matching);
      } else {
        // 题库中没有匹配难度，回退到AI生成
        console.log(`[question_bank] 题库${kpId}中无${difficulty}难度题目，使用AI生成`);
        const aiQuestion = await generateQuestionWithAI({
          kp_name: item.kp.kp_name,
          difficulty: difficulty,
          chapter: item.kp.chapter_name,
        });

        if (aiQuestion) {
          q = aiQuestion;
          usedFallback = true;
        } else {
          // AI生成失败，回退到题库中任意题目
          console.warn(`[question_bank] AI生成失败，使用题库任意题目`);
          q = randomChoice(bank);
        }
      }

      questions.push({
        id: `q${kpCount[kpId] + 1}_${kpId}`,
        type: 'choice',
        content: q.content,
        options: q.options,
        correct_answer: q.correct_answer,
        knowledge_point: item.kp.kp_name,
        knowledge_point_id: kpId,
        difficulty: difficulty, // 始终使用目标难度
        chapter: item.kp.chapter_name,
        ai_generated: usedFallback,
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
