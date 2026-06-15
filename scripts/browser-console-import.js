/**
 * 云开发控制台 - 直接执行数据导入
 * 使用方式：在云开发控制台的网络标签中查看API调用并复制
 *
 * 或者：在云开发控制台的数据库页面中，使用"导入"功能
 * 但为了"踏平等待时间"，我创建一个可在浏览器控制台直接执行的脚本
 */

// 这个脚本需要在浏览器控制台中运行
// 它将直接调用云开发的API来导入数据

(async function() {
  console.log('=== IRT 数据积累 - 浏览器控制台执行 ===');

  // 方式1：如果云开发控制台提供了HTTP API
  // 检查是否有tcb或cloudbase的全局对象
  if (typeof window !== 'undefined') {
    console.log('检测到浏览器环境');

    // 检查是否有云开发SDK
    if (window.tcb || window.cloudbase) {
      console.log('找到云开发SDK，尝试直接调用...');
      // 这里可以直接使用SDK调用API
    }
  }

  // 方式2：创建可下载的JSON文件供导入
  console.log('\n生成数据文件...');

  // 科目配置
  const SUBJECTS_GRADES = [
    { subject: 'math', grades: [7, 8, 9], count: 20 },
    { subject: 'chinese', grades: [7, 8, 9], count: 15 },
    { subject: 'english', grades: [7, 8, 9], count: 15 },
    { subject: 'physics', grades: [8, 9], count: 15 },
    { subject: 'chemistry', grades: [9], count: 15 },
    { subject: 'biology', grades: [7, 8, 9], count: 10 },
    { subject: 'geography', grades: [7, 8, 9], count: 10 },
    { subject: 'history', grades: [7, 8, 9], count: 10 },
    { subject: 'politics', grades: [7, 8, 9], count: 10 },
  ];

  const THETA_LEVELS = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5];

  function simulateAnswers(theta, questionCount) {
    const results = [];
    for (let i = 0; i < questionCount; i++) {
      const p = 1 / (1 + Math.exp(-theta));
      results.push(Math.random() < p ? 1 : 0);
    }
    return results;
  }

  function generateAssessment(subject, grade, index, timestamp) {
    const theta = THETA_LEVELS[index % THETA_LEVELS.length];
    const questionCount = 20;
    const answers = simulateAnswers(theta, questionCount);
    const correctCount = answers.filter(a => a === 1).length;

    return {
      assessment_id: `mock_${subject}_${grade}_${timestamp}_${index}`,
      subject: subject,
      grade: String(grade),
      status: 'completed',
      source: 'mock',
      theta: theta,
      question_ids: [],
      results: answers.map((a, idx) => ({
        question_id: `temp_q_${subject}_${grade}_${idx}`,
        is_correct: a === 1,
        knowledge_point: `temp_kp_${subject}_${grade}_${idx}`,
      })),
      score: {
        total_correct: correctCount,
        total_questions: questionCount,
        score_percent: Math.round(correctCount / questionCount * 1000) / 10,
      },
      created_at: new Date(timestamp + index * 1000).toISOString(),
      completed_at: new Date(timestamp + index * 1000 + 60000).toISOString(),
    };
  }

  // 生成数据
  const timestamp = Date.now();
  const assessments = [];

  let index = 0;
  for (const { subject, grades, count } of SUBJECTS_GRADES) {
    for (const grade of grades) {
      for (let i = 0; i < count; i++) {
        assessments.push(generateAssessment(subject, grade, index++, timestamp));
      }
    }
  }

  console.log(`已生成 ${assessments.length} 条测评记录`);

  // 创建Blob并下载
  const jsonData = JSON.stringify(assessments, null, 2);
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // 自动触发下载
  const a = document.createElement('a');
  a.href = url;
  a.download = `assessments_${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('✓ 数据文件已下载');
  console.log('下一步：在云开发控制台的数据库页面中导入此文件');

  return assessments.length;
})();
