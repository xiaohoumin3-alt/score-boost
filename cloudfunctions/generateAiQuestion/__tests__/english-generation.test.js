/**
 * 英语题目生成测试
 */

const { buildSystemPrompt } = require('../index');
const { buildPersonalizedPrompt } = require('../prompt-templates');

describe('英语题目生成测试', () => {
  describe('buildSystemPrompt', () => {
    it('应该生成英语科目的System Prompt', () => {
      const prompt = buildSystemPrompt('英语');
      expect(prompt).toContain('英语题目生成助手');
      expect(prompt).toContain('难度控制原则');
    });

    it('应该默认使用数学', () => {
      const prompt = buildSystemPrompt();
      expect(prompt).toContain('数学题目生成助手');
    });
  });

  describe('buildPersonalizedPrompt', () => {
    it('应该为英语科目生成包含英语符号格式的提示词', () => {
      const params = {
        kp_name: '一般现在时',
        difficulty: 'medium',
        subject: '英语',
        question_type: 'choice',
        student_profile: {}
      };
      const prompt = buildPersonalizedPrompt(params);
      expect(prompt).toContain('专业的英语学习导师');
      expect(prompt).toContain('一般现在时');
      // 英语科目使用默认格式，不需要特殊符号
      expect(prompt).toContain('选择题要求');
    });

    it('应该支持一年级英语知识点', () => {
      const params = {
        kp_name: 'Hello与Goodbye',
        difficulty: 'easy',
        subject: '英语',
        grade: '1',
        question_type: 'choice',
        student_profile: {}
      };
      const prompt = buildPersonalizedPrompt(params);
      expect(prompt).toContain('专业的英语学习导师');
      expect(prompt).toContain('Hello与Goodbye');
    });

    it('应该支持九年级英语知识点', () => {
      const params = {
        kp_name: '定语从句',
        difficulty: 'medium',
        subject: '英语',
        grade: '9',
        question_type: 'choice',
        student_profile: {}
      };
      const prompt = buildPersonalizedPrompt(params);
      expect(prompt).toContain('专业的英语学习导师');
      expect(prompt).toContain('定语从句');
    });
  });
});
