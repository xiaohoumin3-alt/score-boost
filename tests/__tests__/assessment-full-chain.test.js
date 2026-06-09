/**
 * assessment-full-chain.test.js
 * 回归测试：测评全链路（G2）
 *
 * 模拟完整的测评流程：startAssessment → getAssessment → submitAnswer
 * 验证修复后数据格式一致性
 */

// ========== Mock Database ==========

function createMockDb() {
  const collections = {};

  function getCollection(name) {
    if (!collections[name]) {
      collections[name] = {
        records: [],
        _updates: [],
        where(conditions) {
          return {
            orderBy: () => ({ limit: (n) => ({ get: async () => ({ data: collections[name].records.slice(0, n) }) }) }),
            limit: (n) => ({ get: async () => ({ data: collections[name].records.slice(0, n) }) }),
            get: async () => ({
              data: collections[name].records.filter(r => {
                return Object.entries(conditions).every(([k, v]) => {
                  if (typeof v === 'object' && v.in) return v.in.includes(r[k]);
                  return r[k] === v;
                });
              })
            }),
          };
        },
        add({ data }) {
          const record = Array.isArray(data) ? data : { _id: `auto_${Date.now()}_${Math.random()}`, ...data };
          if (Array.isArray(data)) {
            data.forEach(d => collections[name].records.push({ _id: `auto_${Date.now()}`, ...d }));
          } else {
            collections[name].records.push(record);
          }
          return { _id: Array.isArray(data) ? 'batch' : record._id };
        },
        doc(id) {
          return {
            get: async () => ({
              data: collections[name].records.find(r => r._id === id || r.assessment_id === id)
            }),
            update({ data: updateData }) {
              collections[name]._updates.push({ id, data: updateData });
              const record = collections[name].records.find(r => r._id === id || r.assessment_id === id);
              if (record) Object.assign(record, updateData);
            },
          };
        },
        command: {
          in: (arr) => ({ in: arr }),
          nin: (arr) => ({ nin: arr }),
          inc: (n) => ({ inc: n }),
        },
      };
    }
    return collections[name];
  }

  return {
    collection: getCollection,
    command: {
      in: (arr) => ({ in: arr }),
      nin: (arr) => ({ nin: arr }),
      inc: (n) => ({ inc: n }),
    },
    _collections: collections,
  };
}

// ========== 题目归一化（与 fix-plan 一致） ==========

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((opt) => {
    if (typeof opt === 'string') return opt.replace(/^[A-D]\.\s*/, '');
    if (typeof opt === 'object' && opt !== null) return opt.value || opt.text || String(opt);
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
  return 'A';
}

function normalizeQuestion(raw) {
  return {
    question: raw.question || raw.content || '',
    options: normalizeOptions(raw.options || []),
    correct_answer: normalizeAnswer(raw.correct_answer),
    kp_id: raw.kp_id || raw.knowledge_point_id || 'unknown',
    kp_name: raw.kp_name || raw.knowledge_point || '',
    difficulty: raw.difficulty || 'medium',
    subject: raw.subject || 'math',
    grade: raw.grade || '',
    explanation: raw.explanation || '',
  };
}

// ========== 测试 ==========

describe('回归测试 G2: 测评全链路 — 题目格式一致性', () => {

  test('题池题目经归一化后能正确写入和读取', async () => {
    const db = createMockDb();
    const pool = db.collection('ai_question_pool');

    // 模拟 generateAiQuestion 写入（使用 number 答案 + 对象选项）
    const rawQuestion = {
      question: '下列哪个是二次根式？',
      options: [
        { key: 'A', value: '√5' },
        { key: 'B', value: '3²' },
        { key: 'C', value: '-2' },
        { key: 'D', value: '1/2' },
      ],
      correct_answer: 0, // number
      kp_id: 'kp1_1',
      kp_name: '二次根式的概念',
      difficulty: 'easy',
      subject: 'math',
      grade: '8',
      source: 'ai',
    };

    // 归一化后写入
    const normalized = normalizeQuestion(rawQuestion);
    pool.add({ data: { _id: 'pool_001', ...normalized } });

    // 读取并验证
    const result = await pool.doc('pool_001').get();
    expect(result.data).toBeDefined();

    const q = result.data;
    expect(q.question).toBe('下列哪个是二次根式？');
    expect(q.options).toEqual(['√5', '3²', '-2', '1/2']);
    expect(q.correct_answer).toBe('A'); // number 0 → string 'A'
    expect(q.kp_id).toBe('kp1_1');
  });

  test('答题时 questionMap 能正确匹配题目 ID', async () => {
    const db = createMockDb();
    const assessments = db.collection('assessments');

    // 模拟 startAssessment 创建的 assessment（带内嵌题目）
    const assessmentData = {
      _id: 'assess_001',
      assessment_id: 'uuid-test-001',
      status: 'in_progress',
      questions: [
        {
          id: 'pool_001',
          type: 'choice',
          content: '下列哪个是二次根式？',
          options: ['√5', '3²', '-2', '1/2'],
          correct_answer: 'A',
          knowledge_point: '二次根式的概念',
          knowledge_point_id: 'kp1_1',
          difficulty: 'easy',
        },
        {
          id: 'pool_002',
          type: 'choice',
          content: '√16的值是？',
          options: ['4', '±4', '8', '-4'],
          correct_answer: 'A',
          knowledge_point: '二次根式的性质',
          knowledge_point_id: 'kp1_2',
          difficulty: 'easy',
        },
      ],
      answers: [],
    };
    assessments.add({ data: assessmentData });

    // 模拟 submitAnswer 逻辑
    const doc = await assessments.doc('assess_001').get();
    const session = doc.data;
    const questions = session.questions || [];

    // 构建 questionMap
    const questionMap = {};
    questions.forEach(q => { questionMap[q.id] = q; });

    // 验证：每个题目 ID 都能匹配到
    expect(questionMap['pool_001']).toBeDefined();
    expect(questionMap['pool_002']).toBeDefined();
    expect(questionMap['pool_001'].correct_answer).toBe('A');

    // 模拟答题
    const newAnswers = [
      { question_id: 'pool_001', answer: 'A' },
      { question_id: 'pool_002', answer: 'B' },
    ];

    let totalCorrect = 0;
    for (const answer of newAnswers) {
      const question = questionMap[answer.question_id];
      expect(question).toBeDefined(); // 关键：不应该是 undefined
      const isCorrect = answer.answer === question.correct_answer;
      if (isCorrect) totalCorrect++;
    }

    expect(totalCorrect).toBe(1); // pool_001 正确，pool_002 错误
  });

  test('判分兼容 number 和 string 格式的 correct_answer', () => {
    // 模拟 submitAnswer 中的兼容逻辑
    function gradeAnswer(userAnswer, correctAnswer) {
      const user = (userAnswer || '').toUpperCase().trim();
      let correct = correctAnswer;
      if (typeof correct === 'number') {
        correct = String.fromCharCode(65 + correct);
      } else {
        correct = String(correct || '').toUpperCase().trim();
      }
      return user === correct;
    }

    // number 格式答案
    expect(gradeAnswer('A', 0)).toBe(true);
    expect(gradeAnswer('B', 1)).toBe(true);
    expect(gradeAnswer('A', 1)).toBe(false);

    // string 格式答案
    expect(gradeAnswer('A', 'A')).toBe(true);
    expect(gradeAnswer('a', 'A')).toBe(true);
    expect(gradeAnswer('B', 'A')).toBe(false);
  });

  test('5种题目来源格式全部能正确归一化', () => {
    const formats = [
      // generateAiQuestion 格式
      { question: 'Q1', options: ['A', 'B', 'C', 'D'], correct_answer: 0 },
      // practice_v2 格式
      { question: 'Q2', options: [{ key: 'A', value: '选项1' }, { key: 'B', value: '选项2' }], correct_answer: 'B' },
      // questionGenerator 格式
      { content: 'Q3', options: ['A. 选项1', 'B. 选项2'], correct_answer: 'A' },
      // startAssessment 格式
      { question: 'Q4', options: [{ key: 'A', value: 'v1' }, { key: 'B', value: 'v2' }], correct_answer: 1 },
      // question_bank 格式
      { content: 'Q5', options: ['选项1', '选项2', '选项3', '选项4'], correct_answer: 'C' },
    ];

    const results = formats.map(normalizeQuestion);

    // 所有结果的字段名和类型一致
    for (const r of results) {
      expect(typeof r.question).toBe('string');
      expect(Array.isArray(r.options)).toBe(true);
      expect(typeof r.correct_answer).toBe('string');
      expect(['A', 'B', 'C', 'D']).toContain(r.correct_answer);
    }

    // 验证具体转换
    expect(results[0].options).toEqual(['A', 'B', 'C', 'D']);
    expect(results[1].options).toEqual(['选项1', '选项2']);
    expect(results[2].options).toEqual(['选项1', '选项2']);
    expect(results[2].question).toBe('Q3');
    expect(results[3].correct_answer).toBe('B');
    expect(results[4].correct_answer).toBe('C');
  });
});

describe('回归测试 G2: 测评全链路 — 知识点匹配', () => {

  test('不同科目的题目不会混淆', () => {
    const mathQuestion = normalizeQuestion({
      question: '求直角三角形斜边长',
      options: ['5', '6', '7', '8'],
      correct_answer: 'A',
      subject: 'math',
      kp_id: 'kp2_1',
    });

    const biologyQuestion = normalizeQuestion({
      question: '下列哪个属于腔肠动物？',
      options: ['水螅', '蚯蚓', '蝗虫', '鲫鱼'],
      correct_answer: 'A',
      subject: 'biology',
      kp_id: 'bio_kp1_1',
    });

    expect(mathQuestion.subject).toBe('math');
    expect(biologyQuestion.subject).toBe('biology');
    expect(mathQuestion.kp_id).not.toBe(biologyQuestion.kp_id);
  });
});
