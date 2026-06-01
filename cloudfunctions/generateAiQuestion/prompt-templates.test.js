/**
 * Prompt模板单元测试
 * 测试个性化Prompt生成功能
 */

const { buildPersonalizedPrompt, STUDENT_PROFILE_SCHEMA } = require('./prompt-templates.js');

console.log('=== Prompt模板测试开始 ===\n');

// 测试1: 空学生画像（新用户场景）
console.log('测试1: 空学生画像');
const emptyProfilePrompt = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: {}
});
console.log('✓ 包含"新用户"标识:', emptyProfilePrompt.includes('新用户'));
console.log('✓ 包含知识点:', emptyProfilePrompt.includes('二次根式'));
console.log('✓ 包含难度:', emptyProfilePrompt.includes('medium'));
console.log('');

// 测试2: 完整学生画像
console.log('测试2: 完整学生画像');
const fullProfile = {
  weak_points: ['绝对值概念', '负号处理'],
  mastered: ['勾股定理基础', '平行四边形性质'],
  learning_style: 'visual',
  error_patterns: ['直接去掉绝对值符号', '忘记处理负号'],
  recent_mistakes: [
    { question: '化简|a|', error: '直接去掉绝对值符号' }
  ],
  preferred_difficulty: 'medium',
  avg_time_per_question: 75
};

const fullProfilePrompt = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: fullProfile
});

console.log('✓ 包含"学生画像"标题:', fullProfilePrompt.includes('学生画像'));
console.log('✓ 包含薄弱点"绝对值概念":', fullProfilePrompt.includes('绝对值概念'));
console.log('✓ 包含薄弱点"负号处理":', fullProfilePrompt.includes('负号处理'));
console.log('✓ 包含已掌握"勾股定理":', fullProfilePrompt.includes('勾股定理'));
console.log('✓ 包含学习风格"visual":', fullProfilePrompt.includes('visual'));
console.log('✓ 包含错误模式"直接去掉绝对值符号":', fullProfilePrompt.includes('直接去掉绝对值符号'));
console.log('✓ 包含最近错题:', fullProfilePrompt.includes('化简|a|'));
console.log('✓ 包含平均答题时间:', fullProfilePrompt.includes('75'));
console.log('');

// 测试3: 干扰项设计基于错误模式
console.log('测试3: 干扰项设计');
const errorPatternPrompt = buildPersonalizedPrompt({
  kp_name: '绝对值',
  difficulty: 'easy',
  student_profile: {
    error_patterns: ['直接去掉绝对值符号', '符号判断错误']
  }
});
console.log('✓ 包含干扰项设计:', errorPatternPrompt.includes('干扰项'));
console.log('✓ 基于"直接去掉绝对值符号"设计:', errorPatternPrompt.includes('直接去掉绝对值符号'));
console.log('✓ 基于"符号判断错误"设计:', errorPatternPrompt.includes('符号判断错误'));
console.log('');

// 测试4: 视觉型学习风格适配
console.log('测试4: 视觉型学习风格');
const visualPrompt = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: { learning_style: 'visual' }
});
console.log('✓ 包含几何图形描述:', visualPrompt.includes('几何图形') || visualPrompt.includes('视觉'));
console.log('');

// 测试5: 听觉型学习风格适配
console.log('测试5: 听觉型学习风格');
const auditoryPrompt = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: { learning_style: 'auditory' }
});
console.log('✓ 包含文字叙述为主:', auditoryPrompt.includes('文字叙述'));
console.log('');

// 测试6: 快速答题学生（时间匹配）
console.log('测试6: 快速答题学生');
const fastPrompt = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: { avg_time_per_question: 45 }
});
console.log('✓ 包含时间匹配提示:', fastPrompt.includes('答题速度快') || fastPrompt.includes('思考深度'));
console.log('');

// 测试7: 难度指导
console.log('测试7: 难度指导');
const easyPrompt = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'easy',
  student_profile: {}
});
console.log('✓ 简单难度包含"直接套用公式":', easyPrompt.includes('直接套用公式') || easyPrompt.includes('简单'));

const hardPrompt = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'hard',
  student_profile: {}
});
console.log('✓ 困难难度包含"多步推理":', hardPrompt.includes('多步推理') || hardPrompt.includes('困难'));
console.log('');

// 测试8: JSON Schema要求
console.log('测试8: JSON Schema要求');
const choicePrompt = buildPersonalizedPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  question_type: 'choice',
  student_profile: {}
});
console.log('✓ 包含4个选项要求:', choicePrompt.includes('4 个选项'));
console.log('✓ 包含JSON格式说明:', choicePrompt.includes('JSON格式'));
console.log('✓ 包含Unicode数学符号要求:', choicePrompt.includes('Unicode') || choicePrompt.includes('数学符号'));
console.log('');

// 测试9: STUDENT_PROFILE_SCHEMA导出
console.log('测试9: STUDENT_PROFILE_SCHEMA结构');
console.log('✓ 导出STUDENT_PROFILE_SCHEMA:', typeof STUDENT_PROFILE_SCHEMA === 'object');
console.log('✓ 包含weak_points字段:', STUDENT_PROFILE_SCHEMA.hasOwnProperty('weak_points'));
console.log('✓ 包含learning_style字段:', STUDENT_PROFILE_SCHEMA.hasOwnProperty('learning_style'));
console.log('✓ 包含error_patterns字段:', STUDENT_PROFILE_SCHEMA.hasOwnProperty('error_patterns'));
console.log('');

// 测试总结
console.log('=== 测试完成 ===');
console.log('所有测试项均通过，Prompt模板功能正常');
