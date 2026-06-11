/**
 * 个性化题目生成Prompt模板
 * AI原生架构 - 核心组件
 */

/**
 * 清理用户输入，防止 Prompt Injection
 * @param {string} input - 用户输入
 * @param {number} maxLength - 最大长度（默认100）
 * @returns {string} 清理后的输入
 */
function sanitizeInput(input, maxLength = 100) {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // 移除控制字符
    .replace(/\n/g, ' ')              // 换行替换为空格
    .trim()
    .substring(0, maxLength);
}

/**
 * 学生画像结构定义
 * 用于文档和类型参考
 */
const STUDENT_PROFILE_SCHEMA = {
  weak_points: 'Array<string> - 薄弱知识点列表',
  mastered: 'Array<string> - 已掌握知识点列表',
  learning_style: 'string - visual|auditory|kinesthetic',
  error_patterns: 'Array<string> - 常见错误模式列表',
  recent_mistakes: 'Array<Object> - 最近错题记录 [{question, error, timestamp}]',
  preferred_difficulty: 'string - easy|medium|hard',
  avg_time_per_question: 'number - 平均答题时间(秒)'
};

/**
 * 构建个性化Prompt
 * @param {Object} params - 生成参数
 * @param {string} params.kp_name - 知识点名称
 * @param {string} params.difficulty - 难度
 * @param {Object} params.student_profile - 学生画像
 * @param {string} params.question_type - 题型
 * @returns {string} 完整Prompt
 */
function buildPersonalizedPrompt(params) {
  const { kp_name, difficulty, student_profile = {} } = params;

  // FIX MEDIUM: 清理用户输入防止 Prompt Injection
  const safeKpName = sanitizeInput(kp_name, 100);
  const safeDifficulty = sanitizeInput(difficulty, 20);

  // 学生画像部分
  const profileSection = buildStudentProfileSection(student_profile);

  // 生成要求部分
  const requirementSection = buildRequirementSection(student_profile);

  // 干扰项设计部分
  const distractorSection = buildDistractorSection(student_profile.error_patterns || []);

  const prompt = `你是一位专业的数学学习导师，正在为学生生成个性化练习题。

${profileSection}

## 生成要求
${requirementSection}

## 干扰项设计
${distractorSection}

## 目标知识点
知识点：${safeKpName}
难度：${safeDifficulty}

${getDifficultyGuidance(difficulty)}

${getQuestionTypeRequirements(params.question_type || 'choice')}

**严格返回纯JSON格式，不要任何其他文字**

${getJsonSchema(params.question_type || 'choice')}`;

  return prompt;
}

/**
 * 构建学生画像部分
 */
function buildStudentProfileSection(profile) {
  if (!profile || Object.keys(profile).length === 0) {
    return '## 学生画像\n（新用户，暂无历史数据）';
  }

  return `## 学生画像
- 薄弱知识点：${(profile.weak_points || []).join(', ') || '无'}
- 已掌握：${(profile.mastered || []).join(', ') || '无'}
- 学习风格：${profile.learning_style || '未知'}
- 常见错误模式：${(profile.error_patterns || []).join('; ') || '无'}
- 最近错题：${formatRecentMistakes(profile.recent_mistakes || [])}
- 平均答题时间：${profile.avg_time_per_question || 90}秒/题`;
}

/**
 * 构建生成要求部分
 */
function buildRequirementSection(profile) {
  const requirements = [
    '1. **针对性设计**：题目必须针对学生的薄弱点'
  ];

  if (profile.learning_style === 'visual') {
    requirements.push('2. **风格适配**：题目应包含几何图形或数轴描述（视觉型）');
  } else if (profile.learning_style === 'auditory') {
    requirements.push('2. **风格适配**：题目以文字叙述为主，便于理解（听觉型）');
  } else {
    requirements.push('2. **风格适配**：题目以代数表达为主（通用型）');
  }

  if (profile.avg_time_per_question && profile.avg_time_per_question < 60) {
    requirements.push('3. **时间匹配**：学生答题速度快，题目可适当增加思考深度');
  }

  return requirements.join('\n');
}

/**
 * 构建干扰项设计部分
 */
function buildDistractorSection(errorPatterns) {
  if (!errorPatterns || errorPatterns.length === 0) {
    return '（无历史错误模式，使用通用干扰项）';
  }

  const hints = errorPatterns.map((pattern, i) => {
    if (pattern.includes('绝对值')) {
      return `  - 选项${String.fromCharCode(66 + i)}：基于错误"直接去掉绝对值符号"设计`;
    }
    if (pattern.includes('负号')) {
      return `  - 选项${String.fromCharCode(66 + i)}：基于错误"忘记处理负号"设计`;
    }
    if (pattern.includes('符号')) {
      return `  - 选项${String.fromCharCode(66 + i)}：基于错误"符号判断错误"设计`;
    }
    return `  - 选项${String.fromCharCode(66 + i)}：基于错误"${pattern}"设计`;
  });

  return `基于学生常见错误模式设计干扰项：\n${hints.join('\n')}`;
}

/**
 * 格式化最近错题
 */
function formatRecentMistakes(mistakes) {
  if (mistakes.length === 0) return '无';
  return mistakes.slice(0, 3).map((m, i) => `${i + 1}. ${m.question}（错误：${m.error}）`).join('\n');
}

/**
 * 获取难度指导
 */
function getDifficultyGuidance(difficulty) {
  const guidance = {
    easy: `【难度标准 - 简单】
- 直接套用公式或基本概念即可解答
- 单步推理，不需要复杂变换
- 数据简单，计算量小`,
    medium: `【难度标准 - 中等】
- 需要对公式或概念进行适度变形或转换
- 需要2-3步推理才能得出答案
- 可能涉及多个知识点的综合应用`,
    hard: `【难度标准 - 困难】
- 需要多步推理，或涉及抽象概念理解
- 可能需要逆向思维或特殊情况分析
- 选项高度相似，每个选项都有一定的合理性`
  };
  return guidance[difficulty] || guidance.medium;
}

/**
 * 获取题型要求
 */
function getQuestionTypeRequirements(questionType) {
  if (questionType === 'choice') {
    return `## 选择题要求
1. 必须提供恰好 4 个选项且仅 1 个正确答案
2. **选项长度均衡**：所有选项长度应大致相同
3. **数学符号格式**：使用Unicode数学符号（√ ≤ ≥ π ² ³ 等），不要使用LaTeX格式
4. **禁止生成需要图片的题目**：所有几何信息必须用文字描述`;
  }
  return '';
}

/**
 * 获取JSON Schema
 */
function getJsonSchema(questionType) {
  if (questionType === 'choice') {
    return `JSON格式：
{
  "question": "题目内容",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "correct_answer": 0,
  "explanation": "解析内容"
}`;
  }
  return '';
}

module.exports = {
  buildPersonalizedPrompt,
  STUDENT_PROFILE_SCHEMA
};
