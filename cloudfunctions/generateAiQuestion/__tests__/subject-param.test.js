/**
 * 科目参数测试
 * 验证不同科目的提示词生成
 */

const { buildSystemPrompt } = require('../index');
const { buildPersonalizedPrompt } = require('../prompt-templates');

describe('科目参数测试', () => {
  describe('buildSystemPrompt', () => {
    it('应该生成数学科目的System Prompt', () => {
      const prompt = buildSystemPrompt('数学');
      expect(prompt).toContain('数学题目生成助手');
      expect(prompt).toContain('难度控制原则');
    });

    it('应该生成英语科目的System Prompt', () => {
      const prompt = buildSystemPrompt('英语');
      expect(prompt).toContain('英语题目生成助手');
      expect(prompt).toContain('难度控制原则');
    });

    it('应该默认使用数学', () => {
      const prompt = buildSystemPrompt();
      expect(prompt).toContain('数学题目生成助手');
    });

    it('应该支持所有科目', () => {
      const subjects = ['数学', '语文', '英语', '物理', '化学', '生物', '地理', '历史', '政治'];
      subjects.forEach(subject => {
        const prompt = buildSystemPrompt(subject);
        expect(prompt).toContain(`${subject}题目生成助手`);
      });
    });
  });

  describe('buildPersonalizedPrompt', () => {
    it('应该包含科目信息', () => {
      const params = {
        kp_name: '勾股定理',
        difficulty: 'medium',
        subject: '数学',
        student_profile: {}
      };
      const prompt = buildPersonalizedPrompt(params);
      expect(prompt).toContain('专业的数学学习导师');
    });

    it('应该默认使用数学', () => {
      const params = {
        kp_name: '牛顿第二定律',
        difficulty: 'medium',
        student_profile: {}
      };
      const prompt = buildPersonalizedPrompt(params);
      expect(prompt).toContain('专业的数学学习导师');
    });

    it('应该支持物理科目', () => {
      const params = {
        kp_name: '牛顿第二定律',
        difficulty: 'medium',
        subject: '物理',
        student_profile: {}
      };
      const prompt = buildPersonalizedPrompt(params);
      expect(prompt).toContain('专业的物理学习导师');
    });

    it('应该为不同科目生成相应的符号格式要求', () => {
      const mathParams = {
        kp_name: '勾股定理',
        difficulty: 'medium',
        subject: '数学',
        question_type: 'choice',
        student_profile: {}
      };
      const mathPrompt = buildPersonalizedPrompt(mathParams);
      expect(mathPrompt).toContain('数学符号格式');

      const physicsParams = {
        kp_name: '牛顿第二定律',
        difficulty: 'medium',
        subject: '物理',
        question_type: 'choice',
        student_profile: {}
      };
      const physicsPrompt = buildPersonalizedPrompt(physicsParams);
      expect(physicsPrompt).toContain('物理单位格式');
    });
  });
});
