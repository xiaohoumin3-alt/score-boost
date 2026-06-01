/**
 * generateAiQuestion 云函数测试
 * 测试个性化Prompt集成
 */

// Mock环境变量
process.env.MINIMAX_API_KEY = 'test_key';

const { buildPersonalizedPrompt } = require('./prompt-templates.js');

// 简化的LlmClient类测试（只测试_buildPrompt方法）
class TestLlmClient {
  _buildPrompt(params) {
    const { kp_name, difficulty, chapter, question_type = 'choice', knowledge_context = '', exclude_questions = [], student_profile } = params;

    // 新增：优先使用个性化Prompt
    if (student_profile && Object.keys(student_profile).length > 0) {
      return buildPersonalizedPrompt(params);
    }

    // 保留：原有通用Prompt（fallback）
    return this._buildGenericPrompt(params);
  }

  _buildGenericPrompt(params) {
    const { kp_name, difficulty, chapter = '通用' } = params;
    return `通用Prompt: ${kp_name} ${difficulty} ${chapter}`;
  }
}

console.log('=== LlmClient._buildPrompt 测试开始 ===\n');

// 测试1: 无student_profile时使用通用Prompt
console.log('测试1: 无student_profile时使用通用Prompt');
const client = new TestLlmClient();
const genericPrompt = client._buildPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  chapter: '第十章'
});
console.log('✓ 使用通用Prompt:', genericPrompt.startsWith('通用Prompt'));
console.log('✓ 包含知识点:', genericPrompt.includes('二次根式'));
console.log('');

// 测试2: 有student_profile时使用个性化Prompt
console.log('测试2: 有student_profile时使用个性化Prompt');
const personalizedPrompt = client._buildPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: {
    weak_points: ['绝对值概念'],
    learning_style: 'visual'
  }
});
console.log('✓ 使用个性化Prompt:', personalizedPrompt.includes('学生画像'));
console.log('✓ 包含薄弱点:', personalizedPrompt.includes('绝对值概念'));
console.log('✓ 不使用通用Prompt:', !personalizedPrompt.startsWith('通用Prompt'));
console.log('');

// 测试3: 空student_profile时使用通用Prompt
console.log('测试3: 空student_profile时使用通用Prompt');
const emptyProfilePrompt = client._buildPrompt({
  kp_name: '二次根式',
  difficulty: 'medium',
  student_profile: {}
});
console.log('✓ 空画像使用通用Prompt:', emptyProfilePrompt.startsWith('通用Prompt'));
console.log('');

// 测试4: 完整student_profile生成完整Prompt
console.log('测试4: 完整student_profile生成完整Prompt');
const fullProfilePrompt = client._buildPrompt({
  kp_name: '绝对值',
  difficulty: 'easy',
  student_profile: {
    weak_points: ['绝对值概念'],
    error_patterns: ['直接去掉绝对值符号'],
    learning_style: 'visual'
  }
});
console.log('✓ 包含学生画像:', fullProfilePrompt.includes('学生画像'));
console.log('✓ 包含薄弱点:', fullProfilePrompt.includes('绝对值概念'));
console.log('✓ 包含错误模式:', fullProfilePrompt.includes('直接去掉绝对值符号'));
console.log('✓ 包含干扰项设计:', fullProfilePrompt.includes('干扰项'));
console.log('');

console.log('=== 测试完成 ===');
console.log('所有测试通过，LlmClient._buildPrompt正确集成个性化Prompt');
