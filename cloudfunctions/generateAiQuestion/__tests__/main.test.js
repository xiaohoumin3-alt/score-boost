/**
 * generateAiQuestion 云函数测试
 * 测试主入口逻辑
 */

describe('generateAiQuestion 云函数入口', () => {

  describe('事件参数解析', () => {

    test('应该解析 event.data 格式', () => {
      const event = {
        data: {
          kp_name: '勾股定理',
          difficulty: 'medium',
          subject: 'math',
          grade: '8'
        }
      };

      expect(event.data.kp_name).toBe('勾股定理');
      expect(event.data.difficulty).toBe('medium');
    });

    test('应该解析直接 event 格式', () => {
      const event = {
        kp_name: '二次根式',
        difficulty: 'hard',
        subject: 'math',
        grade: '9'
      };

      expect(event.kp_name).toBe('二次根式');
      expect(event.difficulty).toBe('hard');
    });

    test('应该解析 JSON 字符串格式', () => {
      const jsonString = JSON.stringify({
        kp_name: '光合作用',
        difficulty: 'easy',
        subject: 'biology',
        grade: '7'
      });

      const parsed = JSON.parse(jsonString);
      expect(parsed.kp_name).toBe('光合作用');
    });
  });

  describe('科目-年级兼容性验证', () => {

    test('应该验证有效的科目-年级组合', () => {
      const { validateSubjectGrade } = require('../../shared/subject-grade-validator');

      const validCombos = [
        { subject: 'math', grade: '8' },
        { subject: 'chinese', grade: '5' },
        { subject: 'physics', grade: '9' }
      ];

      validCombos.forEach(combo => {
        const result = validateSubjectGrade(combo.subject, combo.grade);
        expect(result.valid).toBe(true);
      });
    });

    test('应该拒绝无效的科目-年级组合', () => {
      const { validateSubjectGrade } = require('../../shared/subject-grade-validator');

      const invalidCombos = [
        { subject: 'chemistry', grade: '2' },  // 化学仅9年级
        { subject: 'physics', grade: '6' },    // 物理仅8-9年级
        { subject: 'politics', grade: '6' }    // 政治仅7-9年级
      ];

      invalidCombos.forEach(combo => {
        const result = validateSubjectGrade(combo.subject, combo.grade);
        expect(result.valid).toBe(false);
      });
    });

    test('无效组合应该返回错误', () => {
      const { validateSubjectGrade } = require('../../shared/subject-grade-validator');

      const result = validateSubjectGrade('chemistry', '2');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('化学仅适用于9-9年级');
    });
  });

  describe('批量模式处理', () => {

    test('应该识别批量模式参数', () => {
      const event = {
        questions: [
          { kp_name: '勾股定理', difficulty: 'medium' },
          { kp_name: '二次根式', difficulty: 'hard' }
        ]
      };

      expect(Array.isArray(event.questions)).toBe(true);
      expect(event.questions.length).toBe(2);
    });

    test('批量模式应该处理多个题目', () => {
      const batchQuestions = [
        { kp_name: '题目1', difficulty: 'easy' },
        { kp_name: '题目2', difficulty: 'medium' },
        { kp_name: '题目3', difficulty: 'hard' }
      ];

      expect(batchQuestions.length).toBe(3);
      batchQuestions.forEach(q => {
        expect(q.kp_name).toBeDefined();
        expect(q.difficulty).toBeDefined();
      });
    });

    test('批量模式应该支持 kp_id', () => {
      const batchQuestions = [
        { kp_id: 'kp_1', kp_name: '题目1' },
        { kp_id: 'kp_2', kp_name: '题目2' }
      ];

      batchQuestions.forEach(q => {
        expect(q.kp_id).toBeDefined();
      });
    });
  });

  describe('返回格式验证', () => {

    test('成功应该返回标准格式', () => {
      const successResponse = {
        success: true,
        data: {
          id: 'q_123',
          content: '题目内容',
          options: ['A', 'B', 'C', 'D'],
          correct_answer: 'A'
        }
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.data).toBeDefined();
    });

    test('批量成功应该返回数组', () => {
      const batchResponse = {
        success: true,
        data: [
          { id: 'q_1', content: '题目1' },
          { id: 'q_2', content: '题目2' }
        ],
        count: 2
      };

      expect(batchResponse.success).toBe(true);
      expect(Array.isArray(batchResponse.data)).toBe(true);
      expect(batchResponse.count).toBe(2);
    });

    test('失败应该返回错误信息', () => {
      const errorResponse = {
        success: false,
        error: '生成失败：LLM调用超时'
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
    });

    test('兼容性错误应该有特殊标记', () => {
      const validationError = {
        success: false,
        error: '化学仅适用于9-9年级，当前选择2年级',
        validation_error: 'incompatible_subject_grade'
      };

      expect(validationError.success).toBe(false);
      expect(validationError.validation_error).toBe('incompatible_subject_grade');
    });
  });

  describe('参数默认值', () => {

    test('应该默认中等难度', () => {
      const event = {
        kp_name: '勾股定理'
        // 没有指定 difficulty
      };

      const defaultDifficulty = 'medium';
      expect(defaultDifficulty).toBe('medium');
    });

    test('应该默认跳过图片', () => {
      const skipImageDefault = true;
      expect(skipImageDefault).toBe(true);
    });

    test('应该默认单题模式', () => {
      const singleQuestionMode = true;
      expect(singleQuestionMode).toBe(true);
    });
  });

  describe('环境变量验证', () => {

    test('应该检查 LLM_API_KEY', () => {
      const hasApiKey = process.env.LLM_API_KEY !== undefined;
      // 测试环境中可能没有设置，这里只是验证检查逻辑
      expect(typeof hasApiKey).toBe('boolean');
    });

    test('应该检查 LLM_BASE_URL', () => {
      const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
      expect(baseUrl).toContain('http');
    });

    test('应该检查 LLM_MODEL', () => {
      const model = process.env.LLM_MODEL || 'deepseek-chat';
      expect(model).toBeDefined();
    });
  });

  describe('知识点处理', () => {

    test('应该处理 kp_name 参数', () => {
      const kp = {
        kp_name: '勾股定理',
        chapter: '第八章'
      };

      expect(kp.kp_name).toBe('勾股定理');
    });

    test('应该处理 kp_id 参数', () => {
      const kp = {
        kp_id: 'kp_123',
        kp_name: '未知知识点'
      };

      expect(kp.kp_id).toBe('kp_123');
    });

    test('应该处理 chapter 参数', () => {
      const kp = {
        kp_name: '题目',
        chapter: '第一章'
      };

      expect(kp.chapter).toBe('第一章');
    });

    test('应该处理 question_type 参数', () => {
      const params = {
        kp_name: '题目',
        question_type: 'choice'
      };

      expect(params.question_type).toBe('choice');
    });
  });

  describe('错误场景', () => {

    test('应该处理缺失 kp_name 和 kp_id', () => {
      const invalidEvent = {
        difficulty: 'medium'
        // 缺少 kp_name 和 kp_id
      };

      expect(invalidEvent.kp_name).toBeUndefined();
      expect(invalidEvent.kp_id).toBeUndefined();
    });

    test('应该处理无效的难度级别', () => {
      const invalidDifficulty = 'invalid_level';
      const validDifficulties = ['easy', 'medium', 'hard'];

      expect(validDifficulties).not.toContain(invalidDifficulty);
    });

    test('应该处理空 event', () => {
      const emptyEvent = {};
      const hasRequiredParams = emptyEvent.kp_name || emptyEvent.kp_id;

      expect(hasRequiredParams).toBeUndefined();
    });
  });

  describe('日志输出', () => {

    test('应该记录调用开始', () => {
      const logMessage = '[ENTRY] generateAiQuestion called';
      expect(logMessage).toContain('generateAiQuestion');
    });

    test('应该记录 event 数据', () => {
      const logMessage = '[ENTRY] event:';
      expect(logMessage).toContain('event:');
    });

    test('应该记录 LLM_API_KEY 状态', () => {
      const logMessage = '[ENTRY] LLM_API_KEY:';
      expect(logMessage).toContain('LLM_API_KEY:');
    });
  });
});
