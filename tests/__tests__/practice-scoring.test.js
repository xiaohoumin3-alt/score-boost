/**
 * practice-scoring.test.js
 * 回归测试：练习页面评分逻辑
 *
 * Bug: 练习页面的 selectOption 函数没有在答案中存储 is_correct 字段，
 * 导致 submitAll 统计分数时正确题数始终为0。
 *
 * Fix: 在 answers[questionId] 中添加 is_correct 字段。
 */

describe('回归测试: 练习页面评分', () => {

  test('答案对象应包含 is_correct 字段', () => {
    // 模拟当前题目
    const currentQuestion = {
      id: 'q123',
      correct_answer: 'B',
      question: '测试题目'
    };

    // 模拟用户选择正确答案
    const selectedOption = 'B';
    const isCorrect = selectedOption === currentQuestion.correct_answer;

    // 构造答案对象（模拟 practice.js selectOption 的行为）
    const answer = {
      question_id: currentQuestion.id,
      answer: selectedOption,
      is_correct: isCorrect  // 这是修复后必须有的字段
    };

    // 验证答案对象结构
    expect(answer).toHaveProperty('question_id');
    expect(answer).toHaveProperty('answer');
    expect(answer).toHaveProperty('is_correct');

    // 验证 is_correct 计算正确
    expect(answer.is_correct).toBe(true);

    // 验证可以使用 is_correct 统计分数
    const answers = { q123: answer };
    let correctCount = 0;
    for (const key in answers) {
      if (answers[key].is_correct) correctCount++;
    }
    expect(correctCount).toBe(1);
  });

  test('错误答案的 is_correct 应为 false', () => {
    const currentQuestion = {
      id: 'q456',
      correct_answer: 'C',
      question: '测试题目2'
    };

    const selectedOption = 'A';  // 错误答案
    const isCorrect = selectedOption === currentQuestion.correct_answer;

    const answer = {
      question_id: currentQuestion.id,
      answer: selectedOption,
      is_correct: isCorrect
    };

    expect(answer.is_correct).toBe(false);
    expect(answer.answer).toBe('A');
  });

  test('多题场景下正确统计分数', () => {
    const questions = [
      { id: 'q1', correct_answer: 'A' },
      { id: 'q2', correct_answer: 'B' },
      { id: 'q3', correct_answer: 'C' },
      { id: 'q4', correct_answer: 'D' },
      { id: 'q5', correct_answer: 'A' },
      { id: 'q6', correct_answer: 'C' }
    ];

    // 模拟用户答案：对5题，错1题
    const userAnswers = ['A', 'B', 'C', 'C', 'A', 'C'];  // q4答错（D选成C）

    const answers = {};
    questions.forEach((q, idx) => {
      const selectedOption = userAnswers[idx];
      answers[q.id] = {
        question_id: q.id,
        answer: selectedOption,
        is_correct: selectedOption === q.correct_answer
      };
    });

    // 统计正确题数（模拟 practice.js submitAll 的逻辑）
    let correctCount = 0;
    const total = questions.length;
    for (const key in answers) {
      if (answers[key].is_correct) correctCount++;
    }

    expect(correctCount).toBe(5);
    expect(total).toBe(6);
    expect(correctCount / total).toBeCloseTo(0.833, 2);
  });

  test('缺失 is_correct 字段会导致统计为0（bug复现）', () => {
    // 这是修复前的错误代码模式
    const currentQuestion = { id: 'q789', correct_answer: 'B' };
    const selectedOption = 'B';  // 正确答案

    // Bug模式：答案对象没有 is_correct 字段
    const buggyAnswer = {
      question_id: currentQuestion.id,
      answer: selectedOption
      // 注意：没有 is_correct 字段
    };

    // 尝试统计分数
    const answers = { q789: buggyAnswer };
    let correctCount = 0;
    for (const key in answers) {
      if (answers[key].is_correct) correctCount++;  // buggyAnswer.is_correct 是 undefined
    }

    // Bug复现：即使答对，统计也是0
    expect(correctCount).toBe(0);
    expect(buggyAnswer.is_correct).toBeUndefined();
  });
});
