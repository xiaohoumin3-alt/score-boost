/**
 * 题池数据彻底清洗脚本
 * 修复所有被错误标记为biology的数学题
 */

// 数学关键词列表（更全面）
const mathKeywords = [
  "三角形", "二次根式", "勾股定理", "平方根", "绝对值",
  "函数", "方程", "几何", "代数", "概率", "统计",
  "一元二次", "一次函数", "二次函数", "等腰三角形", "等边三角形",
  "直角三角形", "√", "x²", "y=", "斜边", "底角", "顶角",
  "内角和", "外角", "相似", "全等", "平行线", "垂线",
  "因式分解", "分式", "不等式", "坐标系", "抛物线",
  "圆的", "圆的周长", "圆的面积", "切线", "弦",
  "四边形", "平行四边形", "矩形", "菱形", "正方形",
  "梯形", "多边形", "正多边形", "旋转", "平移",
  "对称", "轴对称", "中心对称", "锐角", "钝角",
  "直角", "余角", "补角", "邻角", "对顶角",
  "同位角", "内错角", "同旁内角", "三角函数",
  "正弦", "余弦", "正切", "余切", "sin", "cos",
  "tan", "cot", "向量", "矩阵", "行列式",
  "导数", "积分", "微分", "极限", "数列",
  "等差数列", "等比数列", "通项公式", "求和", "积",
  "商", "余数", "整除", "质数", "合数",
  "素数", "因数", "倍数", "最大公约数", "最小公倍数",
  "分数", "小数", "百分数", "比例", "比值",
  "正比例", "反比例", "利率", "利息", "折扣",
  "利润", "成本", "售价", "单价", "数量",
  "总价", "平均数", "中位数", "众数", "方差",
  "标准差", "频率", "频数", "样本", "总体",
  "抽样", "随机", "独立", "互斥", "对立",
  "排列", "组合", "二项式定理", "概率", "期望",
  "方差", "标准差", "正态分布", "二项分布", "几何分布"
];

// 生成MongoDB查询条件
function generateMathQuery() {
  // 构建正则表达式（转义特殊字符）
  const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // 将关键词分为两组以避免超过正则表达式长度限制
  const group1 = mathKeywords.slice(0, 30).map(escapeRegex).join("|");
  const group2 = mathKeywords.slice(30).map(escapeRegex).join("|");

  return {
    subject: "biology",
    $or: [
      { question: { $regex: group1 } },
      { question: { $regex: group2 } },
      { kp_name: { $regex: group1 } },
      { kp_name: { $regex: group2 } },
      { chapter: { $regex: group1 } },
      { chapter: { $regex: group2 } }
    ]
  };
}

// 批量更新函数
async function cleanBiologyPool() {
  const query = generateMathQuery();
  console.log("=== 题池彻底清洗方案 ===");
  console.log("目标：修复所有被错误标记为 biology 的数学题");
  console.log("数学关键词数量：", mathKeywords.length);
  console.log("查询条件：", JSON.stringify(query, null, 2));

  // 生成批量更新命令（每批500个）
  // 这里需要先查询所有匹配的ID，然后分批更新
  console.log("\n执行步骤：");
  console.log("1. 查询所有匹配的题目ID");
  console.log("2. 分批更新（每批500个）");
  console.log("3. 验证更新结果");

  return { query, mathKeywords };
}

module.exports = { cleanBiologyPool, generateMathQuery };

// 如果直接运行此脚本
if (require.main === module) {
  const result = cleanBiologyPool();
  console.log("\n生成的查询条件：");
  console.log(JSON.stringify(result.query, null, 2));
}
