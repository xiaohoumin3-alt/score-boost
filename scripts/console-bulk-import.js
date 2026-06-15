/**
 * 云开发控制台 - 数据批量导入脚本
 * 使用方式：在云开发控制台的浏览器控制台中粘贴运行
 *
 * 步骤：
 * 1. 打开 https://console.cloud.tencent.com/tcb
 * 2. 选择环境 cloud1-7gg9y9tjb2b867b6
 * 3. 进入"数据库" -> "assessments" 集合
 * 4. 按F12打开浏览器控制台
 * 5. 粘贴此脚本并运行
 */

(async function() {
  console.log('=== IRT 数据积累 - 批量导入开始 ===\n');

  // 科目和年级配置
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

  // 能力水平分布
  const THETA_LEVELS = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5];

  /**
   * 基于 theta 模拟答题（2PL模型简化版）
   */
  function simulateAnswers(theta, questionCount) {
    const results = [];
    for (let i = 0; i < questionCount; i++) {
      const p = 1 / (1 + Math.exp(-theta));
      results.push(Math.random() < p ? 1 : 0);
    }
    return results;
  }

  /**
   * 生成单条测评记录
   */
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

  /**
   * 批量导入测评记录
   */
  async function importAssessments() {
    console.log('步骤1: 生成测评记录...');
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

    // 在控制台中显示前5条数据供验证
    console.log('示例数据（前5条）:');
    assessments.slice(0, 5).forEach((record, i) => {
      console.log(`${i + 1}. ${record.assessment_id}: ${record.subject} ${record.grade}年级, θ=${record.theta}, 正确率=${record.score.score_percent}%`);
    });

    console.log('\n步骤2: 导入数据到数据库...');
    console.log('请在控制台界面中执行以下操作：');
    console.log('1. 点击"导入"按钮');
    console.log('2. 选择"JSON 导入"');
    console.log('3. 将下方的JSON数据复制并粘贴');
    console.log('4. 点击"确定"开始导入\n');

    // 输出JSON数据供复制
    const jsonData = JSON.stringify(assessments, null, 2);
    console.log('%c=== 以下是可复制的数据 ===', 'color: #1890ff; font-weight: bold; font-size: 14px');
    console.log('%c' + jsonData, 'color: #333; font-size: 12px;');
    console.log('%c=== 数据结束 ===', 'color: #1890ff; font-weight: bold; font-size: 14px');

    // 同时提供下载
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assessments_mock_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('\n数据文件已自动下载，也可以使用文件导入方式。');

    return assessments.length;
  }

  /**
   * 生成题目统计更新数据
   */
  async function generateQuestionStats() {
    console.log('\n步骤3: 生成题目统计数据...');

    const stats = [];
    let questionId = 0;

    for (const { subject, grades } of SUBJECTS_GRADES) {
      for (const grade of grades) {
        for (let i = 0; i < 20; i++) {
          const usageCount = Math.floor(Math.random() * 50) + 10;
          const correctRate = 0.5 + (Math.random() - 0.5) * 0.4;

          stats.push({
            _id: `temp_q_${subject}_${grade}_${i}`,
            usage_count: usageCount,
            correct_count: Math.round(usageCount * correctRate),
          });
          questionId++;
        }
      }
    }

    console.log(`已生成 ${stats.length} 道题的统计数据`);

    const jsonData = JSON.stringify(stats, null, 2);
    console.log('%c=== 题目统计数据 ===', 'color: #52c41a; font-weight: bold; font-size: 14px');
    console.log('%c' + jsonData, 'color: #333; font-size: 12px;');
    console.log('%c=== 数据结束 ===', 'color: #52c41a; font-weight: bold; font-size: 14px');

    // 下载题目统计文件
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `question_stats_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('题目统计数据文件已下载。');
    console.log('导入方式：在 ai_question_pool 集合中，使用"更新"功能导入此JSON');

    return stats.length;
  }

  // 执行主流程
  try {
    const assessmentCount = await importAssessments();
    const statsCount = await generateQuestionStats();

    console.log('\n=== 完成 ===');
    console.log(`测评记录: ${assessmentCount} 条`);
    console.log(`题目统计: ${statsCount} 条`);
    console.log('\n下一步：');
    console.log('1. 在 assessments 集合中导入下载的 assessments JSON');
    console.log('2. 在 ai_question_pool 集合中导入下载的 question_stats JSON');
    console.log('3. 运行测试：tcb fn invoke testIRTSystem --params \'{"action":"checkStats"}\'');

  } catch (e) {
    console.error('执行失败:', e);
  }
})();
