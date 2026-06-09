/**
 * 检查特定题目在题池中的数据
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

async function main() {
  const db = cloud.database();
  
  // 查找包含"若直角三角形的三边长分别为2、3、x"的题目
  const result = await db.collection('ai_question_pool')
    .where({
      question: db.command.regex('.*直角三角形.*2.*3.*x.*')
    })
    .get();
  
  console.log('找到题目数:', result.data.length);
  
  if (result.data.length > 0) {
    result.data.forEach((q, idx) => {
      console.log(`\n=== 题目 ${idx + 1} ===`);
      console.log('_id:', q._id);
      console.log('question:', q.question);
      console.log('options:', JSON.stringify(q.options));
      console.log('correct_answer:', q.correct_answer);
      console.log('verified:', q.verified);
      console.log('kp_id:', q.kp_id);
    });
  } else {
    console.log('未找到匹配题目');
  }
}

main().catch(console.error);
