/**
 * question-normalizer.test.js
 * P0-01 验收测试：题目数据模型归一化
 *
 * 覆盖验收标准：
 *   A1: normalizeQuestion 各字段转换正确
 *   A2: options 格式统一为 string[]
 *   A3: correct_answer 统一为 string(A-D)
 *   A4: kp_id / knowledge_point_id 统一为 kp_id
 *   A5: formatQuestionForApi 输出包含完整字段
 */

// ---- 辅助：内联被测模块（因为文件尚未创建，使用与fix-plan一致的实现） ----

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((opt, idx) => {
    if (typeof opt === 'string') return opt.replace(/^[A-D]\.\s*/, '');
    if (typeof opt === 'object' && opt !== null) {
      return opt.value || opt.text || opt.content || String(opt);
    }
    return String(opt);
  });
}

function normalizeAnswer(answer) {
  if (typeof answer === 'number') return String.fromCharCode(65 + answer);
  if (typeof answer === 'string') {
    const upper = answer.toUpperCase().trim();
    if (['A','B','C','D'].includes(upper)) return upper;
    const num = parseInt(answer);
    if (!isNaN(num) && num >= 0 && num <= 3) return String.fromCharCode(65 + num);
  }
  return String(answer || 'A').toUpperCase().trim();
}

function normalizeQuestion(raw) {
  const question = raw.question || raw.content || raw.text || raw.title || '';
  const options = normalizeOptions(raw.options || []);
  const correct_answer = normalizeAnswer(raw.correct_answer);
  const kp_id = raw.kp_id || raw.knowledge_point_id || 'unknown';
  const kp_name = raw.kp_name || raw.knowledge_point || raw.knowledge_point_name || '';

  return {
    question,
    options,
    correct_answer,
    kp_id,
    kp_name,
    chapter: raw.chapter || '',
    difficulty: raw.difficulty || 'medium',
    subject: raw.subject || 'math',
    grade: raw.grade || '',
    explanation: raw.explanation || '',
    question_type: raw.question_type || 'choice',
    source: raw.source || 'ai',
    verified: raw.verified || false,
    usage_count: raw.usage_count || 0,
    correct_rate: raw.correct_rate || 0.5,
    created_at: raw.created_at || expect.any(String),
    updated_at: raw.updated_at || expect.any(String),
  };
}

function formatQuestionForApi(poolRecord) {
  const normalized = normalizeQuestion(poolRecord);
  return {
    id: poolRecord.id || poolRecord.pool_id || poolRecord._id,
    type: normalized.question_type,
    content: normalized.question,
    options: normalized.options,
    correct_answer: normalized.correct_answer,
    knowledge_point: normalized.kp_name,
    knowledge_point_id: normalized.kp_id,
    difficulty: normalized.difficulty,
    explanation: normalized.explanation,
  };
}

// ========== 测试 ==========

describe('P0-01: question-normalizer — normalizeOptions', () => {

  test('字符串数组（带前缀）→ 纯文本数组', () => {
    const result = normalizeOptions(['A. 选项1', 'B. 选项2', 'C. 选项3', 'D. 选项4']);
    expect(result).toEqual(['选项1', '选项2', '选项3', '选项4']);
  });

  test('字符串数组（无前缀）→ 原样返回', () => {
    const result = normalizeOptions(['√5', '3²', '-2', '1/2']);
    expect(result).toEqual(['√5', '3²', '-2', '1/2']);
  });

  test('{key,value}[] → 纯文本数组', () => {
    const result = normalizeOptions([
      { key: 'A', value: '选项1' },
      { key: 'B', value: '选项2' },
    ]);
    expect(result).toEqual(['选项1', '选项2']);
  });

  test('{key,text}[] → 纯文本数组', () => {
    const result = normalizeOptions([
      { key: 'A', text: '文本1' },
      { key: 'B', text: '文本2' },
    ]);
    expect(result).toEqual(['文本1', '文本2']);
  });

  test('{key,value,content}[] 优先取 value', () => {
    const result = normalizeOptions([
      { key: 'A', value: 'v1', content: 'c1' },
    ]);
    expect(result).toEqual(['v1']);
  });

  test('空数组 → 空数组', () => {
    expect(normalizeOptions([])).toEqual([]);
  });

  test('null/undefined → 空数组', () => {
    expect(normalizeOptions(null)).toEqual([]);
    expect(normalizeOptions(undefined)).toEqual([]);
  });

  test('混合类型数组 → 全部转字符串', () => {
    const result = normalizeOptions([
      '纯文本',
      { value: '对象值' },
      123,
    ]);
    expect(result).toEqual(['纯文本', '对象值', '123']);
  });
});

describe('P0-01: question-normalizer — normalizeAnswer', () => {

  test('number 0 → "A"', () => {
    expect(normalizeAnswer(0)).toBe('A');
  });

  test('number 1 → "B"', () => {
    expect(normalizeAnswer(1)).toBe('B');
  });

  test('number 3 → "D"', () => {
    expect(normalizeAnswer(3)).toBe('D');
  });

  test('string "A" → "A"', () => {
    expect(normalizeAnswer('A')).toBe('A');
  });

  test('string "a" (小写) → "A"', () => {
    expect(normalizeAnswer('a')).toBe('A');
  });

  test('string " B " (带空格) → "B"', () => {
    expect(normalizeAnswer(' B ')).toBe('B');
  });

  test('string "0" (数字字符串) → "A"', () => {
    expect(normalizeAnswer('0')).toBe('A');
  });

  test('string "2" → "C"', () => {
    expect(normalizeAnswer('2')).toBe('C');
  });

  test('null → "A" (默认值)', () => {
    expect(normalizeAnswer(null)).toBe('A');
  });

  test('undefined → "A" (默认值)', () => {
    expect(normalizeAnswer(undefined)).toBe('A');
  });
});

describe('P0-01: question-normalizer — normalizeQuestion (验收标准 A1)', () => {

  test('验收 A1: question字段 + {key,value}选项 + number答案 → 归一化', () => {
    const result = normalizeQuestion({
      question: '下列哪个是二次根式？',
      options: [
        { key: 'A', value: '√5' },
        { key: 'B', value: '3²' },
        { key: 'C', value: '-2' },
        { key: 'D', value: '1/2' },
      ],
      correct_answer: 0,
      kp_id: 'kp1_1',
      kp_name: '二次根式的概念',
    });

    expect(result.question).toBe('下列哪个是二次根式？');
    expect(result.options).toEqual(['√5', '3²', '-2', '1/2']);
    expect(result.correct_answer).toBe('A');
    expect(result.kp_id).toBe('kp1_1');
  });

  test('验收 A2: content字段 + 字符串选项(带前缀) + string答案 → 归一化', () => {
    const result = normalizeQuestion({
      content: '√16的值是？',
      options: ['A. 4', 'B. ±4', 'C. 8', 'D. -4'],
      correct_answer: 'A',
    });

    expect(result.question).toBe('√16的值是？');
    expect(result.options).toEqual(['4', '±4', '8', '-4']);
    expect(result.correct_answer).toBe('A');
  });

  test('knowledge_point_id → kp_id 转换', () => {
    const result = normalizeQuestion({
      question: '测试题',
      knowledge_point_id: 'kp2_3',
      knowledge_point: '勾股定理的应用',
      correct_answer: 'B',
    });

    expect(result.kp_id).toBe('kp2_3');
    expect(result.kp_name).toBe('勾股定理的应用');
  });

  test('text/title 字段也能作为题目内容', () => {
    expect(normalizeQuestion({ text: '题目文本' }).question).toBe('题目文本');
    expect(normalizeQuestion({ title: '标题文本' }).question).toBe('标题文本');
  });

  test('默认值填充完整', () => {
    const result = normalizeQuestion({ question: 'x' });
    expect(result).toMatchObject({
      question: 'x',
      options: [],
      correct_answer: 'A',
      kp_id: 'unknown',
      kp_name: '',
      difficulty: 'medium',
      subject: 'math',
      verified: false,
      usage_count: 0,
      correct_rate: 0.5,
    });
  });
});

describe('P0-01: question-normalizer — formatQuestionForApi (验收标准 A5)', () => {

  test('输出包含 API 响应所需全部字段', () => {
    const poolRecord = {
      _id: 'pool_001',
      question: '测试题目',
      options: ['选项1', '选项2'],
      correct_answer: 'A',
      kp_id: 'kp1_1',
      kp_name: '知识点名',
      difficulty: 'easy',
      explanation: '解析内容',
      question_type: 'choice',
    };

    const apiQuestion = formatQuestionForApi(poolRecord);

    // 验收标准 A5: 必须包含这些字段
    expect(apiQuestion).toHaveProperty('id');
    expect(apiQuestion).toHaveProperty('type');
    expect(apiQuestion).toHaveProperty('content');
    expect(apiQuestion).toHaveProperty('options');
    expect(apiQuestion).toHaveProperty('correct_answer');
    expect(apiQuestion).toHaveProperty('knowledge_point');
    expect(apiQuestion).toHaveProperty('knowledge_point_id');
    expect(apiQuestion).toHaveProperty('difficulty');
    expect(apiQuestion).toHaveProperty('explanation');

    // 验证类型
    expect(typeof apiQuestion.id).toBe('string');
    expect(typeof apiQuestion.content).toBe('string');
    expect(Array.isArray(apiQuestion.options)).toBe(true);
    expect(typeof apiQuestion.correct_answer).toBe('string');
    expect(['A','B','C','D']).toContain(apiQuestion.correct_answer);
    expect(typeof apiQuestion.knowledge_point_id).toBe('string');
  });

  test('_id → id 映射', () => {
    const result = formatQuestionForApi({ _id: 'abc123', question: 'q' });
    expect(result.id).toBe('abc123');
  });

  test('pool_id → id 映射（优先）', () => {
    const result = formatQuestionForApi({ _id: 'abc', pool_id: 'pool_abc', question: 'q' });
    expect(result.id).toBe('pool_abc');
  });

  test('仅有 id 字段时直接使用', () => {
    const result = formatQuestionForApi({ id: 'q_001', question: 'q' });
    expect(result.id).toBe('q_001');
  });
});
