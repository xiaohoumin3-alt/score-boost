/**
 * 题池数据清洗脚本
 * 修复被错误标记的数学题
 */

const mathChapters = [
  "勾股定理",
  "二次根式",
  "平方根",
  "绝对值",
  "函数",
  "方程",
  "几何",
  "代数",
  "概率",
  "统计",
  "三角形",
  "四边形",
  "圆",
  "整式的乘法",
  "分式",
  "全等三角形",
  "轴对称",
  "平行四边形",
  "数据的分析"
];

const mathKnowledgePoints = [
  "勾股定理的应用",
  "二次根式的概念",
  "二次根式的运算",
  "绝对值的概念",
  "三角形内角和",
  "等腰三角形",
  "等边三角形",
  "三角形的判定",
  "平行线",
  "相似三角形",
  "圆的性质",
  "圆的周长和面积",
  "函数的概念",
  "一次函数",
  "二次函数",
  "一元一次方程",
  "一元二次方程",
  "分式方程",
  "不等式",
  "概率计算",
  "统计图表"
];

// 更新条件：所有 subject 为 geography 但 chapter 或 kp_name 包含数学内容的题目
const updateFilter = {
  subject: "geography",
  $or: [
    { chapter: { $in: mathChapters } },
    { kp_name: { $in: mathKnowledgePoints } },
    { question: { $regex: "三角形|二次根式|勾股定理|内角和|绝对值|函数|方程|几何|代数|概率|统计" } },
    { explanation: { $regex: "三角形|二次根式|勾股定理|内角和|绝对值|函数|方程|几何|代数|概率|统计" } }
  ]
};

// 批量更新操作
const updateCommand = {
  TableName: "ai_question_pool",
  CommandType: "UPDATE",
  Command: JSON.stringify({
    update: "ai_question_pool",
    updates: mathChapters.map(chapter => ({
      q: { ...updateFilter, chapter },
      u: { $set: { subject: "math" } }
    })).concat(mathKnowledgePoints.map(kp_name => ({
      q: { ...updateFilter, kp_name },
      u: { $set: { subject: "math" } }
    })))
  })
};

console.log("=== 题池数据清洗方案 ===");
console.log("目标：修复所有被错误标记为 geography 的数学题");
console.log("清洗条件：");
console.log("- 数学章节：", mathChapters.join(", "));
console.log("- 数学知识点：", mathKnowledgePoints.join(", "));
console.log("更新操作：", JSON.stringify(updateCommand, null, 2));

module.exports = { updateFilter, updateCommand };
